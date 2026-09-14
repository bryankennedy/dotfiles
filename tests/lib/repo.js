// Shared helpers for the invariant tests: static analysis of this repo's own
// workflow files and scripts, never a network call and never a secret.
//
// Ported from the private infrastructure repo's tests/lib/repo.js, keeping only
// the Forgejo Actions and PR-review predicates (docs/claude-review.md). They
// live here rather than inline in the tests so that canary.test.js can feed
// them the bad shapes and prove each rule still rejects what it claims to.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const read = (p) => readFileSync(p, "utf8");
export const exists = existsSync;

/** Every file under dir, recursively. Returns [] if dir does not exist. */
export function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// --- Forgejo Actions and the PR reviewer -----------------------------------

/** Trigger names of a parsed workflow, whichever shape `on:` was written in. */
export function workflowTriggers(wf) {
  const on = wf?.on ?? wf?.true;
  if (typeof on === "string") return [on];
  if (Array.isArray(on)) return on;
  return Object.keys(on ?? {});
}

/** Every step of every job in a parsed workflow, as {job, index, step}. */
export const workflowSteps = (wf) =>
  Object.entries(wf?.jobs ?? {}).flatMap(([job, j]) =>
    (j?.steps ?? []).map((step, index) => ({ job, index, step }))
  );

/** Steps that mention secrets.<name> anywhere: env, with, or run. */
export const stepsUsingSecret = (wf, name) =>
  workflowSteps(wf).filter(({ step }) => new RegExp(String.raw`\bsecrets\.${name}\b`).test(JSON.stringify(step)));

/**
 * A workflow that reads any secret must not run on pull_request. There, a
 * branch runs its OWN copy of the workflow file, so a PR can rewrite the file
 * to print the secret. Returns the offending triggers.
 */
export const secretsOnPullRequest = (wf) =>
  /\bsecrets\./.test(JSON.stringify(wf?.jobs ?? {}))
    ? workflowTriggers(wf).filter((t) => t === "pull_request")
    : [];

/** `uses:` refs not pinned to a 40-hex commit; a tag can be moved. Local ./ actions are exempt. */
export const unpinnedUses = (wf) =>
  workflowSteps(wf)
    .map(({ step }) => step.uses)
    .filter((u) => u && !u.startsWith("./") && !/@[0-9a-f]{40}$/.test(u));

/** actions/checkout steps that leave the job token behind in .git/config. */
export const credentialedCheckouts = (wf) =>
  workflowSteps(wf).filter(
    ({ step }) => /(^|\/)checkout@/.test(step.uses ?? "") && String(step.with?.["persist-credentials"]) !== "false"
  );

/**
 * Lines of a `run:` that operate inside the untrusted pr/ checkout: a path
 * under pr/, or changing into it. The review job may only read pr/ through
 * Claude's confined tools and one `git fetch ./pr`.
 */
export const runsTouchingPr = (run) =>
  String(run ?? "")
    .split("\n")
    .filter(
      (l) =>
        /(^|[\s;&|("'=])(\.\/)?pr\//.test(l) ||
        /(^|[\s;&|])(cd|pushd)\s+(\.\/)?pr\b/.test(l) ||
        /\s-C\s*(\.\/)?pr\b|--(chdir|git-dir|work-tree)[=\s]+(\.\/)?pr\b/.test(l)
    );

/**
 * The index of the step whose `run:` deletes every symlink from pr/, or -1.
 * A link under pr/ can name a target outside the workspace while its own path
 * stays inside, which is the one thing a path-based confinement cannot see.
 */
export const symlinkStripStep = (steps) =>
  steps.findIndex(({ step }) =>
    String(step.run ?? "").split("\n").some((l) => /^\s*find pr -type l -delete\s*$/.test(l))
  );

/**
 * Problems with how a CI install script downloads things: a digest that is not
 * a literal, a download that bypasses fetch(), or a pipe into a shell.
 */
export function unverifiedDownloads(body) {
  const bad = [];
  const pins = Object.fromEntries([...body.matchAll(/^([A-Z0-9_]+_SHA256)=(.*)$/gm)].map((m) => [m[1], m[2].trim()]));
  for (const [k, v] of Object.entries(pins)) {
    if (!/^[0-9a-f]{64}$/.test(v)) bad.push(`${k} is not a literal 64-hex digest: ${v}`);
  }
  // Join backslash continuations so a fetch call split over two lines is read whole.
  const logical = body.replace(/\\\n\s*/g, " ").split("\n").filter((x) => !/^\s*#/.test(x));
  for (const l of logical) {
    if (/\|\s*(ba)?sh\b/.test(l)) bad.push(`pipes a download into a shell: ${l.trim()}`);
    if (/\b(curl|wget)\b/.test(l) && !/^\s*curl -fsSL --retry 3 -o "\$3" "\$1"\s*$/.test(l)) {
      bad.push(`downloads outside fetch(): ${l.trim()}`);
    }
    if (/^\s*fetch\s/.test(l)) {
      const call = /^\s*fetch\s+("[^"]*"|\S+)\s+"?\$\{?([A-Za-z0-9_]+)\}?"?\s/.exec(l);
      if (!(call && pins[call[2]])) bad.push(`fetch() without a pinned digest: ${l.trim()}`);
    }
  }
  if (!/sha256sum -c/.test(body)) bad.push("fetch() no longer verifies with sha256sum -c");
  return bad;
}

/** CODEOWNERS rules as {line, pattern, negative, owners}; comments and blanks dropped. */
export const codeownersRules = (body) =>
  body
    .split("\n")
    .map((l, i) => ({ text: l.trim(), line: i + 1 }))
    .filter(({ text }) => text && !text.startsWith("#"))
    .map(({ text, line }) => {
      const [pattern, ...owners] = text.split(/\s+/);
      return { line, pattern: pattern.replace(/^!/, ""), negative: pattern.startsWith("!"), owners };
    });

/**
 * Rules that cannot do their job: the pattern does not compile, names no
 * owner, or matches none of `files`. Forgejo patterns are Go regular
 * expressions over the whole path; a gitignore-style glob such as `/nix-darwin/`
 * compiles fine and matches nothing, which is exactly the silent failure.
 */
export function deadCodeownersRules(rules, files) {
  return rules.filter((r) => {
    let re;
    try {
      re = new RegExp(`^(?:${r.pattern})$`);
    } catch {
      return true;
    }
    return r.owners.length === 0 || !files.some((f) => re.test(f));
  });
}
