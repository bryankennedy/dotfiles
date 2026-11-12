#!/usr/bin/env bun
// Claude Code PR review on Forgejo: the trusted glue around one headless
// `claude -p` run. Design and trust boundaries: docs/forge-ci.md in
// bkennedy/infrastructure, the kit's canonical home, which syncs this file
// verbatim to every repository that carries the review. Where each
// subcommand runs: .forgejo/workflows/argus-verdict.yml.
//
//   bun scripts/forgejo-review.mjs schema
//       The JSON Schema Claude's structured output has to satisfy.
//   bun scripts/forgejo-review.mjs decide
//       Exit 0 when the event in $GITHUB_EVENT_PATH gets a review, else print
//       why not ("no verdict: draft") and exit 1. The job then fails; it is
//       never skipped, because Forgejo maps a skipped job to success (INFRA-289).
//   bun scripts/forgejo-review.mjs prompt
//       The review prompt for the pull request in $GITHUB_EVENT_PATH.
//   bun scripts/forgejo-review.mjs post <result.json> <pr.diff> --binding <file> [--dry-run] [--timings <file>]
//       Turn Claude's result into one Forgejo review: inline comments where a
//       finding lands on a line in the diff, everything else in the body, and
//       one argus-verdict marker as the body's last line. Post it as the
//       reviewer account. Exit 0 for clean and human, 1 for blocked and
//       incomplete (INFRA-289e). --binding names
//       the file the diff step wrote: the SHAs, trees and patch-id that were
//       reviewed. --dry-run prints the payload instead of posting it.
//       --timings names the file the workflow's steps append "<phase> <epoch>"
//       marks to; the split goes in the footer and a "timing:" log line
//       (INFRA-185).
//
// Runs from the BASE branch checkout. It reads the PR's diff as text and never
// executes anything from the PR.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// The re-review label of the retired claude-review.yml. No workflow reads it
// now (INFRA-289); scripts/review-pipeline-metrics.mjs still counts it in old
// timelines, and scripts/forgejo-review-setup.mjs still provisions it.
export const REVIEW_LABEL = "claude-review";
// Past this many inline comments the review stops being readable; the rest go
// in the body.
export const MAX_INLINE = 25;
const MAX_DESCRIPTION = 4000;
const SEVERITIES = ["critical", "high", "medium", "low"];

export const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "blast_radius", "high_risk_reasons", "findings"],
  properties: {
    summary: { type: "string" },
    blast_radius: { type: "string", enum: ["high", "standard", "low"] },
    high_risk_reasons: { type: "array", items: { type: "string" } },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "line", "severity", "title", "body"],
        properties: {
          path: { type: "string" },
          line: { type: "integer", minimum: 0 },
          severity: { type: "string", enum: SEVERITIES },
          title: { type: "string" },
          body: { type: "string" },
        },
      },
    },
  },
};

const oneLine = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

// A prompt injection's cheapest move is to get the model to echo its own
// credential into a comment. The reviewer cannot read its environment
// (--restricted, env -i), but a comment is public to everyone with repo access,
// so strip the one credential shape that could be in play anyway.
export const redact = (s) => String(s).replace(/sk-ant-[A-Za-z0-9_-]{8,}/g, "[redacted credential]");

/** A finding's path as a repo-relative path: no ./, no pr/ checkout prefix. */
export const normalizePath = (p) =>
  String(p ?? "").trim().replace(/^"(.*)"$/, "$1").replace(/^\.\//, "").replace(/^pr\//, "");

/**
 * Map of path -> Set of line numbers in the NEW file that sit inside a hunk
 * (added or context lines): the lines Forgejo can anchor a review comment to.
 *
 * Hunk-aware on purpose. A removed SQL comment line ("-- foo") appears in a
 * diff as "--- foo", which a line-prefix parser would read as a file header.
 */
export function commentableLines(diff) {
  const files = new Map();
  let lines = null;
  let oldLeft = 0;
  let newLeft = 0;
  let next = 0;
  for (const line of String(diff).split("\n")) {
    if (oldLeft > 0 || newLeft > 0) {
      const tag = line[0];
      if (tag === "\\") continue; // "\ No newline at end of file"
      if (tag === "+") {
        lines?.add(next++);
        newLeft--;
      } else if (tag === "-") {
        oldLeft--;
      } else {
        lines?.add(next++);
        oldLeft--;
        newLeft--;
      }
      continue;
    }
    if (line.startsWith("diff --git ")) {
      lines = null;
    } else if (line.startsWith("+++ ")) {
      const target = line.slice(4).trim().replace(/^"(.*)"$/, "$1");
      if (target === "/dev/null") {
        lines = null;
      } else {
        const path = normalizePath(target.replace(/^b\//, ""));
        if (!files.has(path)) files.set(path, new Set());
        lines = files.get(path);
      }
    } else {
      const hunk = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (hunk) {
        oldLeft = hunk[1] === undefined ? 1 : Number(hunk[1]);
        next = Number(hunk[2]);
        newLeft = hunk[3] === undefined ? 1 : Number(hunk[3]);
      }
    }
  }
  return files;
}

const isReview = (r) =>
  r && typeof r === "object" &&
  typeof r.summary === "string" &&
  ["high", "standard", "low"].includes(r.blast_radius) &&
  Array.isArray(r.high_risk_reasons) &&
  Array.isArray(r.findings) &&
  r.findings.every((f) => f && typeof f.path === "string" && Number.isInteger(f.line) &&
    SEVERITIES.includes(f.severity) && typeof f.title === "string" && typeof f.body === "string");

/** Claude's `--output-format json` result -> {review, meta} or {failure, meta}. */
export function readResult(text) {
  let r;
  try {
    r = JSON.parse(text);
  } catch {
    return { failure: "Claude produced no JSON result. It crashed, was cancelled, or failed to authenticate; see the job log.", meta: {} };
  }
  if (r?.type !== "result") return { failure: `Claude's output was not a result (type: ${r?.type}).`, meta: {} };
  if (r.subtype !== "success" || r.is_error) {
    const hint = r.subtype === "error_max_turns"
      ? " It ran out of turns: split the PR, or raise --max-turns in .forgejo/workflows/argus-verdict.yml."
      : "";
    return { failure: `Claude stopped with \`${r.subtype}\` after ${r.num_turns ?? "?"} turns.${hint}`, meta: r };
  }
  if (!isReview(r.structured_output)) {
    return { failure: "Claude finished, but its structured output does not match the review schema.", meta: r };
  }
  return { review: r.structured_output, meta: r };
}

const bySeverity = (a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity);

// --- timings ----------------------------------------------------------------
//
// The workflow appends "<phase> <unix seconds>" when a phase ends: start (the
// job began), checkout, install, prepare (diff, prompt, strips), review. Each
// phase's length is its mark minus the previous one; post is now minus review.
export const PHASES = ["checkout", "install", "prepare", "review", "post"];

/** Marks file text -> {checkout, install, prepare, review, post, total} in whole seconds, or null. */
export function readTimings(text, now = Date.now() / 1000) {
  const marks = {};
  for (const line of String(text ?? "").split("\n")) {
    const m = /^(\w+)\s+(\d+)\s*$/.exec(line);
    if (m) marks[m[1]] = Number(m[2]);
  }
  if (!Number.isFinite(marks.start)) return null;
  const out = {};
  let prev = marks.start;
  for (const phase of PHASES) {
    const at = phase === "post" ? Math.floor(now) : marks[phase];
    if (!Number.isFinite(at) || at < prev) return null;
    out[phase] = at - prev;
    prev = at;
  }
  out.total = prev - marks.start;
  return out;
}

export const fmtSeconds = (s) => {
  const n = Math.max(0, Math.round(Number(s) || 0));
  return n < 60 ? `${n}s` : `${Math.floor(n / 60)}m${String(n % 60).padStart(2, "0")}s`;
};

/** The one-line, greppable record of where a review's time went. */
export const timingLog = (timings, meta = {}) =>
  "timing: " + [
    ...(timings ? ["total", ...PHASES].map((k) => `${k}=${timings[k]}s`) : ["total=?"]),
    `claude=${meta?.duration_ms != null ? Math.round(meta.duration_ms / 1000) : "?"}s`,
    `api=${meta?.duration_api_ms != null ? Math.round(meta.duration_api_ms / 1000) : "?"}s`,
    `turns=${meta?.num_turns ?? "?"}`,
  ].join(" ");

const timingFooter = (timings, meta) => {
  const parts = [];
  if (meta?.num_turns) parts.push(`${meta.num_turns} turns`);
  if (meta?.duration_ms != null) parts.push(`model ${fmtSeconds(meta.duration_ms / 1000)}`);
  if (timings) {
    parts.push(`job ${fmtSeconds(timings.total)} (${PHASES.map((k) => `${k} ${fmtSeconds(timings[k])}`).join(", ")})`);
  }
  return parts.map((p) => ` · ${p}`).join("");
};

// A model title is wrapped in bold, so an asterisk in it must not end the run.
const headline = (title) => oneLine(title).replace(/\*/g, "\\*") || "(untitled)";

export const renderFinding = (f) => `**${headline(f.title)}** · ${f.severity}\n\n${String(f.body).trim()}`;

// The review body leads with the verdict, then lists every finding under the
// section that says whether it blocks the merge (INFRA-238). Medium blocks:
// the owner ships a PR only once no medium-or-worse finding remains. A finding
// anchored to a diff line shows its headline here and its body inline.
export const MUST_FIX = ["critical", "high", "medium"];

const footer = (headSha, meta, timings) =>
  `<sub>Claude Code review of ${String(headSha ?? "").slice(0, 10)}` +
  timingFooter(timings, meta) +
  " · advisory only: owner sign-off comes from CODEOWNERS and branch protection, not from this review</sub>";

/**
 * The Forgejo review payload (POST /repos/{owner}/{repo}/pulls/{index}/reviews).
 * With inline: false every finding goes in the body, which is the fallback
 * when Forgejo rejects an inline anchor.
 */
export function buildReview({ review, commentable, headSha, meta = {}, timings = null, inline = true }) {
  const attached = new Set();
  const sorted = [];
  for (const raw of [...review.findings].sort(bySeverity)) {
    const f = { ...raw, path: normalizePath(raw.path), line: Number(raw.line) };
    const anchorable = f.line > 0 && commentable.get(f.path)?.has(f.line);
    if (inline && anchorable && attached.size < MAX_INLINE) attached.add(f);
    sorted.push(f);
  }

  const out = ["### Claude review", ""];
  if (review.blast_radius === "high") {
    out.push("> **High blast radius: needs the owner's sign-off before merge.**");
    for (const reason of review.high_risk_reasons) out.push(`> - ${oneLine(reason)}`);
    out.push("");
  }
  out.push(`**TL;DR:** ${oneLine(review.summary) || "(no summary)"}`, "");
  if (sorted.length === 0) out.push("No findings.", "");
  for (const [heading, inSection] of [
    ["Must fix", (f) => MUST_FIX.includes(f.severity)],
    ["Should fix", (f) => !MUST_FIX.includes(f.severity)],
  ]) {
    const items = sorted.filter(inSection);
    if (!items.length) continue;
    out.push(`**${heading}**`, "");
    for (const f of items) {
      const where = f.line > 0 ? `${f.path}:${f.line}` : f.path;
      const isInline = attached.has(f);
      out.push(`- **${headline(f.title)}** · \`${where}\` · ${f.severity}${isInline ? " · inline" : ""}`);
      if (!isInline) for (const l of String(f.body).trim().split("\n")) out.push(`  ${l}`);
    }
    out.push("");
  }
  out.push(footer(headSha, meta, timings));

  return {
    event: "COMMENT",
    commit_id: headSha,
    body: redact(out.join("\n")),
    comments: [...attached].map((f) => ({ path: f.path, new_position: f.line, body: redact(renderFinding(f)) })),
  };
}

/** The review posted when Claude did not produce a usable result. */
export function failureReview({ failure, headSha, stderrTail = "", meta = {}, timings = null }) {
  const out = [
    "### Claude review did not complete",
    "",
    failure,
    "",
    "Nothing was reviewed, so this is not an approval. The verdict for this change stays incomplete until the change itself changes: push a commit that changes the diff.",
  ];
  if (stderrTail.trim()) {
    out.push("", "<details><summary>Last lines of Claude's stderr</summary>", "", "```", stderrTail.trim(), "```", "", "</details>");
  }
  out.push("", footer(headSha, meta, timings));
  return { event: "COMMENT", commit_id: headSha, body: redact(out.join("\n")), comments: [] };
}

// --- the verdict marker (INFRA-289) ------------------------------------------
//
// The verdict is not a commit status: any write token can post a status, and
// Forgejo maps a skipped job to success. The verdict is one marker, on the
// last line of a review that the engine's own account posted (argus for
// Claude), on the commit it names. docs/review-pipeline.md, decision 2, holds
// the rules the gate applies to it; docs/decisions/INFRA-289.md holds the
// format. The gate imports parseMarker() and textHash() from here, so the
// writer and the reader cannot drift apart.

// The engine comes from this script, never from model output or the event.
export const ENGINE = "claude";
export const MARKER_NAME = "argus-verdict";
export const MARKER_VERSION = 1;
// The gate account. Its edits (the escalation title prefix) get no review.
export const GATE_ACCOUNT = "minos";
// The gate's escalation title prefix. The draft check and the text hash
// ignore it, so an escalation changes neither.
export const GATE_TITLE_PREFIX = "⛔ REVIEW:";
// The events that get a review. Forgejo's payload spells the push event
// "synchronized"; the workflow's trigger list spells it "synchronize".
export const REVIEW_ACTIONS = ["opened", "reopened", "synchronize", "edited"];
// Forgejo's default WORK_IN_PROGRESS_PREFIXES, matched ignoring case.
export const DRAFT_PREFIXES = ["WIP:", "[WIP]"];
export const VERDICTS = ["clean", "blocked", "human", "incomplete"];

// Anything that reads as the marker's name: "argus-verdict", "Argus Verdict",
// "argus\u200bverdict". Model text must never hold one, so only the post step's
// own marker line can.
const MARKER_TEXT = /argus[\W_]*verdict/gi;

/**
 * Model text with every marker-shaped word removed, and every HTML comment
 * opener escaped: an unclosed "<!--" in a finding would hide the rest of the
 * review from people, though not from the gate, which reads the raw text.
 */
export const stripMarkerText = (s) => String(s ?? "").replace(MARKER_TEXT, "[marker text removed]").replace(/<!--/g, "&lt;!--");

/** A title without the gate's escalation prefix. */
export const withoutGatePrefix = (title) => {
  const t = String(title ?? "").trimStart();
  return t.startsWith(GATE_TITLE_PREFIX) ? t.slice(GATE_TITLE_PREFIX.length).trimStart() : t;
};

export const isDraftTitle = (title) => {
  const t = withoutGatePrefix(title).toLowerCase();
  return DRAFT_PREFIXES.some((p) => t.startsWith(p.toLowerCase()));
};

/**
 * sha256 hex of the PR text the review saw: the UTF-8 bytes of the JSON
 * array [title, description], with the gate prefix taken off the title and
 * line ends normalized to \n. JSON keeps the boundary between the two fixed.
 */
export function textHash(title, body) {
  const norm = (s) => String(s ?? "").replace(/\r\n?/g, "\n");
  return createHash("sha256").update(JSON.stringify([norm(withoutGatePrefix(title)), norm(body)]), "utf8").digest("hex");
}

/**
 * Whether a pull_request_target event gets a review. {review: true}, or
 * {review: false, reason} with a reason that starts "no verdict:".
 */
export function decideEvent(event, { gate = GATE_ACCOUNT } = {}) {
  const pr = event?.pull_request;
  if (!pr?.number || !pr?.head?.sha) throw new Error("the event is not a pull_request event");
  const action = event.action === "synchronized" ? "synchronize" : String(event.action ?? "");
  if (!REVIEW_ACTIONS.includes(action)) return { review: false, reason: `no verdict: a ${action || "unnamed"} event gets no review` };
  if (pr.state && pr.state !== "open") return { review: false, reason: `no verdict: the PR is ${pr.state}` };
  if (action === "edited" && event.sender?.login === gate) {
    return { review: false, reason: `no verdict: an edit by the gate (${gate}); the review of this head stands` };
  }
  if (isDraftTitle(pr.title)) return { review: false, reason: "no verdict: draft" };
  return { review: true };
}

const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
export const BINDING_KEYS = ["head", "base", "merge_base", "base_tree", "head_tree", "patch_id"];

/**
 * The binding file the diff step writes: one "<key> <value>" line per key in
 * BINDING_KEYS. patch_id is "none" for an empty diff. Throws on anything else.
 */
export function readBinding(text) {
  const out = {};
  for (const line of String(text ?? "").split("\n")) {
    if (!line.trim()) continue;
    const m = /^(\w+) (\S+)$/.exec(line.trim());
    if (!m || !BINDING_KEYS.includes(m[1]) || m[1] in out) throw new Error(`binding: unexpected line ${JSON.stringify(line)}`);
    out[m[1]] = m[2];
  }
  for (const k of BINDING_KEYS) {
    const v = out[k];
    if (v === undefined) throw new Error(`binding: ${k} is missing`);
    if (!(OID.test(v) || (k === "patch_id" && v === "none"))) throw new Error(`binding: ${k} is not an object id: ${JSON.stringify(v)}`);
  }
  return out;
}

/**
 * The verdict for one run. clean: the review completed, no finding is medium
 * or worse, and blast_radius is not high. human: no such finding, but
 * blast_radius is high, so the PR goes to the owner (C1); it is not a block.
 * blocked: a medium or worse finding. incomplete: no usable review.
 */
export function verdictOf({ review, failure }) {
  if (failure || !review) return "incomplete";
  if (review.findings.some((f) => MUST_FIX.includes(f.severity))) return "blocked";
  if (review.blast_radius === "high") return "human";
  return "clean";
}

/**
 * The post step's exit code. Red means a reviewer found a defect, or no
 * review completed. human is not a defect: the PR goes to the owner through
 * the gate's own alert (P1.5), so the check stays green (INFRA-289e). The
 * gate never reads this status; it reads the marker (C5).
 */
export const exitCodeFor = (verdict) => (verdict === "clean" || verdict === "human" ? 0 : 1);

/** The marker line. Every value is checked; nothing in it comes from the model. */
export function renderMarker({ verdict, blast, binding, text, engine = ENGINE }) {
  if (!VERDICTS.includes(verdict)) throw new Error(`marker: bad verdict ${verdict}`);
  if (!["high", "standard", "low", "none"].includes(blast)) throw new Error(`marker: bad blast ${blast}`);
  if (!/^[0-9a-f]{64}$/.test(String(text))) throw new Error("marker: bad text hash");
  const b = readBinding(BINDING_KEYS.map((k) => `${k} ${binding?.[k]}`).join("\n"));
  const fields = [`v=${MARKER_VERSION}`, `engine=${engine}`, `verdict=${verdict}`, `blast=${blast}`,
    ...BINDING_KEYS.map((k) => `${k}=${b[k]}`), `text=${text}`];
  return `<!-- ${MARKER_NAME} ${fields.join(" ")} -->`;
}

const MARKER_LINE = new RegExp(
  "^<!-- argus-verdict v=1 engine=(claude|codex) verdict=(clean|blocked|human|incomplete) blast=(high|standard|low|none)" +
  BINDING_KEYS.map((k) => ` ${k}=(${k === "patch_id" ? "none|" : ""}[0-9a-f]{40}|[0-9a-f]{64})`).join("") +
  " text=([0-9a-f]{64}) -->$"
);

/**
 * A review body -> the marker's fields, or null. Null unless the body holds
 * the marker name exactly once, and that once is a well-formed marker on the
 * last line. The caller still checks the review's author and commit_id.
 */
export function parseMarker(body) {
  const text = String(body ?? "").replace(/\r\n?/g, "\n").trimEnd();
  if ((text.match(MARKER_TEXT) ?? []).length !== 1) return null;
  const m = MARKER_LINE.exec(text.slice(text.lastIndexOf("\n") + 1));
  if (!m) return null;
  const [, engine, verdict, blast, ...rest] = m;
  const out = { v: MARKER_VERSION, engine, verdict, blast };
  BINDING_KEYS.forEach((k, i) => (out[k] = rest[i]));
  out.text = rest[BINDING_KEYS.length];
  return out;
}

/**
 * A review payload with marker-shaped text stripped from the body and every
 * inline comment body, and the marker appended as the body's last line. A
 * comment's path stays as it is: buildReview() anchors a comment only on a
 * path in the diff, and the gate reads only the review body. A stripped path
 * breaks every inline comment on argus-verdict.yml.
 */
export const sealReview = (payload, marker) => ({
  ...payload,
  body: `${stripMarkerText(payload.body).trimEnd()}\n\n${marker}`,
  comments: payload.comments.map((c) => ({ ...c, body: stripMarkerText(c.body) })),
});

/** Fill {{placeholders}} in the prompt template. Values are never re-scanned. */
export function renderPrompt(template, pr) {
  const description = String(pr?.body ?? "").slice(0, MAX_DESCRIPTION).trim();
  const vars = {
    number: pr?.number,
    title: oneLine(pr?.title),
    author: pr?.user?.login ?? "unknown",
    base_ref: pr?.base?.ref,
    head_ref: pr?.head?.ref,
    head_sha: pr?.head?.sha,
    // A closing tag in the description must not end the untrusted block early.
    description: (description || "(none)").replace(/<\/?pr-description>/gi, "[pr-description tag removed]"),
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in vars ? String(vars[k] ?? "") : m));
}

// --- I/O -------------------------------------------------------------------

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

const pullRequest = () => {
  const pr = JSON.parse(readFileSync(need("GITHUB_EVENT_PATH"), "utf8")).pull_request;
  if (!pr?.number || !pr?.head?.sha) throw new Error("GITHUB_EVENT_PATH is not a pull_request event");
  return pr;
};

async function forgejo(method, path, token, body) {
  const base = need("GITHUB_SERVER_URL").replace(/\/+$/, "");
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { authorization: `token ${token}`, "content-type": "application/json", accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, text: await res.text() };
}

const repoPath = () => need("GITHUB_REPOSITORY").split("/").map(encodeURIComponent).join("/");

const tail = (path, n = 20) =>
  existsSync(path) ? readFileSync(path, "utf8").trimEnd().split("\n").slice(-n).join("\n") : "";

async function post(resultPath, diffPath, { dryRun = false, timingsPath = null, bindingPath = null } = {}) {
  const pr = pullRequest();
  if (!bindingPath) throw new Error("--binding is required: the marker needs what the diff step reviewed");
  const binding = readBinding(readFileSync(bindingPath, "utf8"));
  // The diff step checked out and diffed the event's head SHA. If the two
  // ever differ, the review is of some other commit: post nothing.
  if (binding.head !== pr.head.sha) {
    throw new Error(`the diffed head ${binding.head} is not the event head ${pr.head.sha}; no review posted`);
  }
  const { review, failure, meta } = readResult(existsSync(resultPath) ? readFileSync(resultPath, "utf8") : "");
  const verdict = verdictOf({ review, failure });
  const marker = renderMarker({
    verdict,
    blast: review ? review.blast_radius : "none",
    binding,
    text: textHash(pr.title, pr.body),
  });
  const commentable = commentableLines(existsSync(diffPath) ? readFileSync(diffPath, "utf8") : "");
  const timings = readTimings(timingsPath && existsSync(timingsPath) ? readFileSync(timingsPath, "utf8") : "");
  console.log(timingLog(timings, meta));
  const build = (inline) => sealReview(
    failure
      ? failureReview({ failure, headSha: pr.head.sha, stderrTail: tail(join(dirname(resultPath), "claude.stderr")), meta, timings })
      : buildReview({ review, commentable, headSha: pr.head.sha, meta, timings, inline }),
    marker
  );

  let payload = build(true);
  if (dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    return exitCodeFor(verdict);
  }

  const token = need("CLAUDE_REVIEW_TOKEN");
  const reviews = `/repos/${repoPath()}/pulls/${pr.number}/reviews`;
  let res = await forgejo("POST", reviews, token, payload);
  if (!res.ok && payload.comments.length) {
    console.error(`inline review rejected (${res.status}): ${res.text.slice(0, 300)}; retrying with every finding in the body`);
    payload = build(false);
    res = await forgejo("POST", reviews, token, payload);
  }
  if (!res.ok) {
    console.error(`posting the review failed (${res.status}): ${res.text.slice(0, 500)}`);
    return 1;
  }
  console.log(
    failure
      ? `posted a did-not-complete notice on #${pr.number}: ${failure}`
      : `posted review on #${pr.number}: ${review.findings.length} finding(s), ${payload.comments.length} inline, blast radius ${review.blast_radius}`
  );
  // The job's status is only for people to look at; the gate reads the marker.
  console.log(`verdict: ${verdict} on ${pr.head.sha}`);
  return exitCodeFor(verdict);
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === "schema") {
    console.log(JSON.stringify(REVIEW_SCHEMA));
    return 0;
  }
  if (cmd === "decide") {
    const decision = decideEvent(JSON.parse(readFileSync(need("GITHUB_EVENT_PATH"), "utf8")));
    if (decision.review) {
      console.log("this event gets a review");
      return 0;
    }
    console.error(decision.reason);
    return 1;
  }
  if (cmd === "prompt") {
    process.stdout.write(renderPrompt(readFileSync(join(ROOT, ".forgejo", "review", "prompt.md"), "utf8"), pullRequest()));
    return 0;
  }
  if (cmd === "post" && rest.length >= 2) {
    const opt = (name) => (rest.indexOf(name) >= 0 ? rest[rest.indexOf(name) + 1] ?? null : null);
    return post(rest[0], rest[1], { dryRun: rest.includes("--dry-run"), timingsPath: opt("--timings"), bindingPath: opt("--binding") });
  }
  console.error("usage: forgejo-review.mjs schema | decide | prompt | post <result.json> <pr.diff> --binding <file> [--dry-run] [--timings <file>]");
  return 2;
}

if (import.meta.main) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(`forgejo-review: ${err.message}`);
      process.exit(1);
    }
  );
}
