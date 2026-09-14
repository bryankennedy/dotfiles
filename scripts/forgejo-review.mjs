#!/usr/bin/env bun
// Claude Code PR review on Forgejo: the trusted glue around one headless
// `claude -p` run. Design and trust boundaries: docs/claude-review.md. Where each
// subcommand runs: .forgejo/workflows/claude-review.yml.
//
//   bun scripts/forgejo-review.mjs schema
//       The JSON Schema Claude's structured output has to satisfy.
//   bun scripts/forgejo-review.mjs prompt
//       The review prompt for the pull request in $GITHUB_EVENT_PATH.
//   bun scripts/forgejo-review.mjs post <result.json> <pr.diff> [--dry-run]
//       Turn Claude's result into one Forgejo review: inline comments where a
//       finding lands on a line in the diff, everything else in the body. Post
//       it as the reviewer account, then clear the re-review label. --dry-run
//       prints the payload instead of posting it.
//
// Runs from the BASE branch checkout. It reads the PR's diff as text and never
// executes anything from the PR.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
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
      ? " It ran out of turns: split the PR, or raise --max-turns in .forgejo/workflows/claude-review.yml."
      : "";
    return { failure: `Claude stopped with \`${r.subtype}\` after ${r.num_turns ?? "?"} turns.${hint}`, meta: r };
  }
  if (!isReview(r.structured_output)) {
    return { failure: "Claude finished, but its structured output does not match the review schema.", meta: r };
  }
  return { review: r.structured_output, meta: r };
}

const bySeverity = (a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity);

export const renderFinding = (f) => `**${f.severity}** · ${oneLine(f.title)}\n\n${String(f.body).trim()}`;

const footer = (headSha, meta) =>
  `<sub>Claude Code review of ${String(headSha ?? "").slice(0, 10)}` +
  (meta?.num_turns ? ` · ${meta.num_turns} turns` : "") +
  " · advisory only: owner sign-off comes from CODEOWNERS and branch protection, not from this review</sub>";

/**
 * The Forgejo review payload (POST /repos/{owner}/{repo}/pulls/{index}/reviews).
 * With inline: false every finding goes in the body, which is the fallback
 * when Forgejo rejects an inline anchor.
 */
export function buildReview({ review, commentable, headSha, meta = {}, inline = true }) {
  const attached = [];
  const loose = [];
  for (const raw of [...review.findings].sort(bySeverity)) {
    const f = { ...raw, path: normalizePath(raw.path), line: Number(raw.line) };
    const anchorable = f.line > 0 && commentable.get(f.path)?.has(f.line);
    if (inline && anchorable && attached.length < MAX_INLINE) attached.push(f);
    else loose.push(f);
  }

  const out = ["### Claude review", ""];
  if (review.blast_radius === "high") {
    out.push("> **High blast radius: needs the owner's sign-off before merge.**");
    for (const reason of review.high_risk_reasons) out.push(`> - ${oneLine(reason)}`);
    out.push("");
  }
  out.push(oneLine(review.summary) || "(no summary)", "");
  if (review.findings.length === 0) {
    out.push("No issues found.", "");
  } else if (attached.length) {
    out.push(`${attached.length} finding${attached.length === 1 ? " is" : "s are"} attached to lines in the diff.`, "");
  }
  if (loose.length) {
    out.push(attached.length ? "**Findings not on a line in the diff**" : "**Findings**", "");
    for (const f of loose) {
      const where = f.line > 0 ? `${f.path}:${f.line}` : f.path;
      out.push(`- \`${where}\` · **${f.severity}** · ${oneLine(f.title)}`);
      for (const l of String(f.body).trim().split("\n")) out.push(`  ${l}`);
    }
    out.push("");
  }
  out.push(footer(headSha, meta));

  return {
    event: "COMMENT",
    commit_id: headSha,
    body: redact(out.join("\n")),
    comments: attached.map((f) => ({ path: f.path, new_position: f.line, body: redact(renderFinding(f)) })),
  };
}

/** The review posted when Claude did not produce a usable result. */
export function failureReview({ failure, headSha, stderrTail = "" }) {
  const out = [
    "### Claude review did not complete",
    "",
    failure,
    "",
    `Nothing was reviewed, so this is not an approval. Add the \`${REVIEW_LABEL}\` label to try again.`,
  ];
  if (stderrTail.trim()) {
    out.push("", "<details><summary>Last lines of Claude's stderr</summary>", "", "```", stderrTail.trim(), "```", "", "</details>");
  }
  out.push("", footer(headSha));
  return { event: "COMMENT", commit_id: headSha, body: redact(out.join("\n")), comments: [] };
}

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

async function post(resultPath, diffPath, dryRun) {
  const pr = pullRequest();
  const { review, failure, meta } = readResult(existsSync(resultPath) ? readFileSync(resultPath, "utf8") : "");
  const commentable = commentableLines(existsSync(diffPath) ? readFileSync(diffPath, "utf8") : "");
  const build = (inline) =>
    failure
      ? failureReview({ failure, headSha: pr.head.sha, stderrTail: tail(join(dirname(resultPath), "claude.stderr")) })
      : buildReview({ review, commentable, headSha: pr.head.sha, meta, inline });

  let payload = build(true);
  if (dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    return failure ? 1 : 0;
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

  if ((pr.labels ?? []).some((l) => l?.name === REVIEW_LABEL)) {
    const labelToken = process.env.LABEL_TOKEN;
    const del = labelToken
      ? await forgejo("DELETE", `/repos/${repoPath()}/issues/${pr.number}/labels/${encodeURIComponent(REVIEW_LABEL)}`, labelToken)
      : { ok: false, status: "no LABEL_TOKEN", text: "" };
    if (!del.ok) console.error(`warning: could not remove the ${REVIEW_LABEL} label (${del.status}); remove it by hand to request another review`);
  }
  return failure ? 1 : 0;
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === "schema") {
    console.log(JSON.stringify(REVIEW_SCHEMA));
    return 0;
  }
  if (cmd === "prompt") {
    process.stdout.write(renderPrompt(readFileSync(join(ROOT, ".forgejo", "review", "prompt.md"), "utf8"), pullRequest()));
    return 0;
  }
  if (cmd === "post" && rest.length >= 2) {
    return post(rest[0], rest[1], rest.includes("--dry-run"));
  }
  console.error("usage: forgejo-review.mjs schema | prompt | post <result.json> <pr.diff> [--dry-run]");
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
