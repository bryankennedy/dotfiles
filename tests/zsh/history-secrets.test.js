// zsh/history-secrets.zsh: the zshaddhistory hook that keeps a command line
// with a token in it out of the history file (docs/decisions/INFRA-320.md,
// INFRA-320f).
//
// The test checks the patterns twice. A JavaScript check runs everywhere, CI
// included. It builds the same expression that the file builds, and it
// refuses any pattern syntax that has a different meaning in POSIX ERE. A zsh
// check runs the real hook wherever zsh is installed, which is the Mac. The CI
// image has no zsh. Set DOTFILES_TEST_ZSH to point the test at a zsh binary
// that is not on PATH.
import { test, expect, describe, beforeAll } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeFileSync, rmSync } from "node:fs";
import { ROOT, read } from "../lib/repo.js";

const FILE = join(ROOT, "zsh", "history-secrets.zsh");
const ZSHRC = join(ROOT, "zsh", ".zshrc");
const ZSH = process.env.DOTFILES_TEST_ZSH || Bun.which("zsh");
const BOUNDARY = "(^|[^A-Za-z0-9_])";
const NOTICE = "zsh: this line is not in the history, because it holds a token";

/**
 * The entries of DOTFILES_HISTORY_SECRET_PATTERNS, plus every line in the
 * array that is not a single-quoted entry, a comment or blank. zsh would use
 * such a line, but this parser would skip it, so the test refuses it.
 */
function parsePatterns(src) {
  const block = src.match(/^typeset -ga DOTFILES_HISTORY_SECRET_PATTERNS=\(\n([\s\S]*?)^\)/m);
  if (!block) return { list: [], stray: ["no DOTFILES_HISTORY_SECRET_PATTERNS array"] };
  const list = [];
  const stray = [];
  for (const line of block[1].split("\n")) {
    if (/^\s*(#.*)?$/.test(line)) continue;
    const m = line.match(/^\s*'([^']+)'\s*(#.*)?$/);
    if (m) list.push(m[1]);
    else stray.push(line);
  }
  return { list, stray };
}

/** Syntax that JavaScript and POSIX ERE read in different ways. */
const NOT_PORTABLE = [
  [/\\/, "a backslash escape, such as \\d or \\w"],
  [/\(\?/, "a group with (?"],
  [/\[:/, "a POSIX class such as [:space:]"],
  [/[*+?}]\?/, "a lazy quantifier"],
];

// Each sample is built from parts, so that no whole token appears in this file
// for a secret scanner to report. Only the shape of each format matters.
const x = (n) => "x".repeat(n);
const TOKENS = {
  "Tailscale auth key": "tskey" + "-auth-k" + x(12) + "CNTRL-" + x(24),
  "Tailscale API token": "tskey" + "-api-k" + x(12) + "CNTRL-" + x(24),
  "GitHub classic token": "gh" + "p_" + x(36),
  "GitHub OAuth token": "gh" + "o_" + x(36),
  "GitHub fine-grained token": "github" + "_pat_" + x(60),
  "GitLab personal token": "glpat" + "-" + x(20),
  "GitLab runner token": "glrt" + "-" + x(20),
  "Anthropic API key": "sk-ant" + "-api03-" + x(40),
  "Claude OAuth token": "sk-ant" + "-oat01-" + x(40),
  "OpenAI project key": "sk-proj" + "-" + x(40),
  "OpenAI service account key": "sk-svcacct" + "-" + x(40),
  "Slack bot token": "xox" + "b-" + x(24),
  "Slack app token": "xapp" + "-1-" + x(24),
  "AWS access key ID": "AK" + "IA" + "Q".repeat(16),
  "AWS temporary key ID": "AS" + "IA" + "Q".repeat(16),
  "1Password service account token": "ops" + "_eyJ" + x(40),
  "npm token": "npm" + "_" + x(36),
  "Stripe live key": "sk" + "_live_" + x(24),
  "Google API key": "AI" + "za" + x(35),
};

// Each token in the two places a pasted token usually goes.
const SECRET_LINES = [
  ...Object.entries(TOKENS).flatMap(([name, t]) => [
    [name, `export VALUE=${t}`],
    [name, `curl -H "Authorization: Bearer ${t}" https://example.com/api`],
  ]),
  ["NAME=value", `export CLOUDFLARE_API_TOKEN=${x(40)}`],
  ["NAME=\"value\"", `export DB_PASSWORD="${x(16)}"`],
  ["AWS secret key by name", `aws configure set aws_secret_access_key ${x(40)}`],
];

// Lines that zsh must still save: they name a format, or look like one, but
// hold no token.
const SAVED_LINES = [
  "git push -u origin main",
  "tailscale up --auth-key=file:/etc/tailscale/key",
  "op read op://vault/item/password",
  'export GITHUB_TOKEN="$(op read op://vault/item/token)"',
  "export API_KEY=$VALUE",
  "unset GITHUB_TOKEN",
  "export GITHUB_TOKEN=",
  "export GITHUB_TOKEN=`op read op://vault/item/token`",
  "export GITHUB_TOKEN='$(op read op://vault/item/token)'",
  "echo AKIA",
  "echo AS" + "IAPACIFICREGIONSALES", // 22 capitals, so not a key ID
  "grep -c ghp notes.txt",
  "ls ~/ops",
  "ansible-playbook ops_site.yml",
  "vim docs/ops_runbook.md",
  "cd ~/src/task-ant-farm",
  "python3 drops_report.py --since " + x(8),
  "echo laughs_" + x(36),
];

describe("zsh/history-secrets.zsh", () => {
  const src = read(FILE);
  const { list, stray } = parsePatterns(src);
  const one = new RegExp(`${BOUNDARY}(${list.join("|")})`);
  // zsh hands the hook each line with its newline, so the checks do the same.
  const hit = (re, line) => re.test(line + "\n");

  test("every line of the pattern array is a single-quoted entry", () => {
    expect(stray).toEqual([]);
    expect(list.length).toBeGreaterThan(0);
  });

  test.each(NOT_PORTABLE)("no pattern uses %s", (re) => {
    expect(list.filter((p) => re.test(p))).toEqual([]);
  });

  test("each pattern is a valid expression, and a sample matches each one", () => {
    const unmatched = list.filter((p) => {
      const re = new RegExp(`${BOUNDARY}(${p})`);
      return !SECRET_LINES.some(([, line]) => hit(re, line));
    });
    expect(unmatched, "patterns with no sample in SECRET_LINES").toEqual([]);
  });

  test.each(SECRET_LINES)("the expression matches a line with a %s", (_name, line) => {
    expect(hit(one, line), line).toBe(true);
  });

  test.each(SAVED_LINES)("the expression does not match %p", (line) => {
    expect(hit(one, line), line).toBe(false);
  });

  test("the hook builds the expression and refuses on a match or an error", () => {
    // The JavaScript check above builds the same expression from these lines.
    expect(src).toContain(
      'typeset -g _dotfiles_history_secret_re="(^|[^A-Za-z0-9_])(${(j:|:)DOTFILES_HISTORY_SECRET_PATTERNS})"',
    );
    expect(src).toMatch(/^\s*\[\[ \$1 =~ \$_dotfiles_history_secret_re \]\] \|\| return 0$/m);
    expect(src).toMatch(/^\s*return 1$/m);
    expect(src).toMatch(/^\s*_dotfiles_history_secret_re='\^'$/m);
    expect(src).toMatch(/^\(\) \{\n\s*emulate -L zsh$/m);
    expect(src).toMatch(/^\s*emulate -L zsh$/m);
    expect(src).toMatch(/^\s*local MATCH MBEGIN MEND$/m);
    expect(src).toMatch(/^\s*local -a match mbegin mend$/m);
    expect(src).not.toMatch(/setopt\s+re_?match_?pcre/i);
  });

  test("it registers the hook and sets HIST_IGNORE_SPACE", () => {
    expect(src).toMatch(/^add-zsh-hook zshaddhistory _dotfiles_history_secret_guard$/m);
    expect(src).toMatch(/^setopt HIST_IGNORE_SPACE$/m);
  });

  test(".zshrc sources it, with no guard, before anything that returns early", () => {
    const rc = read(ZSHRC);
    const at = rc.search(/^source "\$DOTFILES_ZSH_DIR\/history-secrets\.zsh"$/m);
    expect(at, ".zshrc does not source history-secrets.zsh").toBeGreaterThan(-1);
    expect(rc.search(/^typeset -g DOTFILES_ZSH_DIR=/m), "DOTFILES_ZSH_DIR is set after the source line").toBeLessThan(at);
    const firstReturn = rc.search(/^\s*return\b/m);
    expect(firstReturn === -1 || firstReturn > at, "a return comes before the source line").toBe(true);
    expect(rc).not.toMatch(/\[ -f "\$DOTFILES_ZSH_DIR\/history-secrets\.zsh" \]/);
  });
});

describe.skipIf(!ZSH)("zsh/history-secrets.zsh in zsh", () => {
  // One zsh run: the hook's exit status for each argument, MATCH after the
  // loop, and the hook list and the option.
  const script = [
    `source ${JSON.stringify(FILE)}`,
    `MATCH=kept`,
    `for line in "$@"; do _dotfiles_history_secret_guard "$line"$'\\n'; print -r -- $?; done`,
    `print -r -- "match:$MATCH"`,
    `print -r -- "hooks:\${(j: :)zshaddhistory_functions}"`,
    `[[ -o histignorespace ]] && print -r -- "histignorespace:on"`,
  ].join("\n");
  // A second run, from a copy of the file with a pattern that does not compile.
  const BROKEN_FILE = join(tmpdir(), `history-secrets-broken-${process.pid}.zsh`);
  const broken = [
    `source ${JSON.stringify(BROKEN_FILE)}`,
    `_dotfiles_history_secret_guard "git status"; print -r -- $?`,
  ].join("\n");
  // A third run, with KSH_ARRAYS on before the file loads.
  const ksh = [
    "setopt KSH_ARRAYS",
    `source ${JSON.stringify(FILE)}`,
    `_dotfiles_history_secret_guard "export VALUE=gh""p_${"$"}{(l:36::x:)}"$'\\n'; print -r -- $?`,
  ].join("\n");
  const lines = [...SECRET_LINES.map(([, l]) => l), ...SAVED_LINES];
  const env = { ...process.env, HISTFILE: "" };
  // In beforeAll, not in the describe body: bun runs the body of a skipped
  // describe too, and with no zsh there is nothing to spawn.
  let run, out, err, brokenRun, kshRun;
  beforeAll(() => {
    run = Bun.spawnSync([ZSH, "-f", "-c", script, "zsh", ...lines], { env });
    out = run.stdout.toString().trim().split("\n");
    err = run.stderr.toString().trim().split("\n").filter(Boolean);
    writeFileSync(BROKEN_FILE, read(FILE).replace("'tskey-[a-z]+-'", "'('"));
    try {
      brokenRun = Bun.spawnSync([ZSH, "-f", "-c", broken, "zsh"], { env });
      kshRun = Bun.spawnSync([ZSH, "-f", "-c", ksh, "zsh"], { env });
    } finally {
      rmSync(BROKEN_FILE, { force: true });
    }
  });

  test("zsh runs the file, and stderr holds only the notices", () => {
    expect(run.exitCode).toBe(0);
    expect(err.filter((l) => l !== NOTICE)).toEqual([]);
    expect(err.length).toBe(SECRET_LINES.length);
  });

  test("the hook refuses every line with a token", () => {
    const refused = out.slice(0, SECRET_LINES.length);
    SECRET_LINES.forEach(([name, line], i) => expect(refused[i], `${name}: ${line}`).toBe("1"));
  });

  test("the hook keeps every line with no token", () => {
    const kept = out.slice(SECRET_LINES.length, lines.length);
    SAVED_LINES.forEach((line, i) => expect(kept[i], line).toBe("0"));
  });

  test("the hook does not change MATCH in the caller", () => {
    expect(out).toContain("match:kept");
  });

  test("the hook is registered, and HIST_IGNORE_SPACE is on", () => {
    expect(out).toContain("hooks:_dotfiles_history_secret_guard");
    expect(out).toContain("histignorespace:on");
  });

  test("the hook still refuses a token when KSH_ARRAYS is on", () => {
    expect(kshRun.stdout.toString().trim()).toBe("1");
  });

  test("a pattern list that does not compile refuses every line, and says so", () => {
    expect(brokenRun.stderr.toString()).toContain("the pattern list does not work");
    expect(brokenRun.stdout.toString().trim()).toBe("1");
  });
});
