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

// --- The commit-time secret check -----------------------------------------

/**
 * Ways .githooks/pre-commit could let a commit through unscanned: no guard
 * that refuses when gitleaks is missing, an `exit 0` or swallowed failure
 * anywhere, or a final scan that is not gitleaks over the staged change. A
 * hook that skips silently looks exactly like one that passed.
 */
export function hookFailsOpen(body) {
  const bad = [];
  const code = String(body ?? "").split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  const guard = /^\s*if\s+!\s*command\s+-v\s+gitleaks\b[^\n]*\n([\s\S]*?)^\s*fi\s*$/m.exec(code);
  if (!guard) bad.push("no `if ! command -v gitleaks` guard");
  else if (!/^\s*exit\s+[1-9]\d*\s*$/m.test(guard[1])) bad.push("the missing-gitleaks guard does not exit non-zero");
  if (/\bexit\s+0\b|\bexit\s*$/m.test(code)) bad.push("exits 0 somewhere");
  if (/\|\|\s*(true|:)\b/.test(code)) bad.push("swallows a failure with || true");
  const lines = code.split("\n").filter((l) => l.trim());
  if (!/^\s*exec\s+gitleaks\s+git\b(?=.*\s--pre-commit\b)(?=.*\s--staged\b)/.test(lines.at(-1) ?? "")) {
    bad.push("does not end by exec-ing `gitleaks git --pre-commit --staged`");
  }
  return bad;
}

/** The body of nix-darwin's postActivation script, or "" if it is not found. */
export const postActivation = (flake) =>
  /postActivation\.text\s*=\s*''\n([\s\S]*?)^\s*'';\s*$/m.exec(String(flake ?? ""))?.[1] ?? "";

/**
 * Problems with how activation arms the hook: gitleaks not installed, or
 * core.hooksPath not set for ~/src/dotfiles on an uncommented postActivation
 * line with the house `|| echo "postActivation: …" >&2` fallback. Without the
 * setting the hook sits in the tree and never runs.
 */
export function hooksPathActivation(flake) {
  const bad = [];
  const live = (text) => text.split("\n").filter((l) => !/^\s*#/.test(l));
  if (!live(String(flake ?? "")).some((l) => /^\s*pkgs\.gitleaks\s*$/.test(l))) bad.push("pkgs.gitleaks is not installed");
  const line = live(postActivation(flake)).find((l) =>
    /\bgit\b.*\s-C\s+\/Users\/bk\/src\/dotfiles\s+config\s+core\.hooksPath\s+\.githooks\b/.test(l)
  );
  if (!line) bad.push("postActivation no longer sets core.hooksPath to .githooks for ~/src/dotfiles");
  else if (!/\|\|\s*echo\s+"postActivation: [^"]+"\s*>&2\s*$/.test(line)) {
    bad.push(`core.hooksPath line lacks the || echo "postActivation: …" >&2 fallback: ${line.trim()}`);
  }
  return bad;
}

// --- Plugin marketplaces that activation registers -------------------------

/**
 * Problems with the plugin marketplaces and plugins a settings-merge script
 * writes into ~/.claude/settings.json: a marketplace or source not in
 * `accepted.marketplaces` (name -> source text, compared without whitespace),
 * a plugin not in `accepted.plugins`, or a line touching either key in a shape
 * this cannot read. Claude Code cannot pin a marketplace to a commit, so each
 * accepted entry is an accepted risk in docs/security-baseline.md, and this
 * keeps the acceptance exactly as wide as it was written (DOT-24).
 */
export function unacceptedPluginSources(body, accepted) {
  const bad = [];
  const squash = (s) => s.replace(/\s+/g, "");
  const seen = new Set();
  const lines = String(body ?? "").split("\n").filter((l) => !/^\s*(\/\/|#)/.test(l));
  for (const l of lines.filter((x) => /\b(extraKnownMarketplaces|enabledPlugins)\b/.test(x))) {
    if (/^\s*cfg\.(extraKnownMarketplaces|enabledPlugins)\s*=\s*cfg\.\1\s*\|\|\s*\{\s*\};\s*$/.test(l)) continue;
    const m = /^\s*cfg\.extraKnownMarketplaces\[['"]([^'"]+)['"]\]\s*=\s*(\{.*\});\s*$/.exec(l);
    const p = /^\s*cfg\.enabledPlugins\[['"]([^'"]+)['"]\]\s*=\s*true;\s*$/.exec(l);
    if (m) {
      seen.add(`marketplace ${m[1]}`);
      const want = accepted.marketplaces[m[1]];
      if (want === undefined) bad.push(`marketplace not accepted in the baseline: ${m[1]}`);
      else if (squash(want) !== squash(m[2])) bad.push(`marketplace ${m[1]} source differs from the accepted one: ${m[2]}`);
    } else if (p) {
      seen.add(`plugin ${p[1]}`);
      if (!accepted.plugins.includes(p[1])) bad.push(`plugin not accepted in the baseline: ${p[1]}`);
    } else {
      bad.push(`unrecognised marketplace or plugin line: ${l.trim()}`);
    }
  }
  for (const name of Object.keys(accepted.marketplaces)) {
    if (!seen.has(`marketplace ${name}`)) bad.push(`accepted marketplace ${name} not found; retire its baseline entry or fix the shape`);
  }
  for (const name of accepted.plugins) {
    if (!seen.has(`plugin ${name}`)) bad.push(`accepted plugin ${name} not found; retire its baseline entry or fix the shape`);
  }
  return bad;
}
