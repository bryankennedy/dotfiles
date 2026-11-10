// The Claude Code status line: one script, claude/.claude/statusline.mjs, that
// the Mac's activation and the fleet bootstrap both point statusLine at.
import { test, expect, describe } from "bun:test";
import { join } from "node:path";
import { ROOT, read } from "../lib/repo.js";
import { render } from "../../claude/.claude/statusline.mjs";

const SCRIPT = join(ROOT, "claude/.claude/statusline.mjs");
const plain = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

/** The statusLine value a settings-merge script writes, from uncommented lines. */
const statusLineValues = (body) =>
  body
    .split("\n")
    .filter((l) => !/^\s*(\/\/|#)/.test(l))
    .map((l) => /^\s*cfg\.statusLine\s*=\s*(\{.*\});\s*$/.exec(l)?.[1])
    .filter(Boolean);

describe("statusline.mjs output", () => {
  const session = {
    model: { display_name: "Fable 5.2" },
    workspace: { current_dir: "/home/user/project" },
    context_window: { used_percentage: 31.4, total_input_tokens: 62800, context_window_size: 200000 },
  };

  test("shows the model, the directory, the bar, the percent and the tokens", () => {
    expect(plain(render(session))).toBe("Fable 5.2 · project · ▓▓▓░░░░░░░ 31% 63k/200k");
  });

  test("adds the 5-hour rate limit when the session has one", () => {
    const withLimit = { ...session, rate_limits: { five_hour: { used_percentage: 23.5 } } };
    expect(plain(render(withLimit))).toEndWith(" · 5h 24%");
  });

  test("the bar colour follows the 70 and 90 percent thresholds", () => {
    const at = (pct) => render({ context_window: { used_percentage: pct } });
    expect(at(69)).toContain("\x1b[32m");
    expect(at(70)).toContain("\x1b[33m");
    expect(at(90)).toContain("\x1b[31m");
  });

  test("null and absent fields give an empty bar, not an error", () => {
    expect(plain(render({ context_window: { used_percentage: null, current_usage: null } }))).toBe("░░░░░░░░░░ 0% 0k/0k");
    expect(plain(render({}))).toBe("░░░░░░░░░░ 0% 0k/0k");
  });

  test("a percent above 100 does not overflow the bar", () => {
    expect(plain(render({ context_window: { used_percentage: 140 } }))).toStartWith("▓▓▓▓▓▓▓▓▓▓ 140%");
  });

  test("as a command it prints one line and exits 0", () => {
    const run = Bun.spawnSync([process.execPath, SCRIPT], { stdin: Buffer.from(JSON.stringify(session)) });
    expect(run.exitCode).toBe(0);
    expect(plain(run.stdout.toString())).toBe("Fable 5.2 · project · ▓▓▓░░░░░░░ 31% 63k/200k\n");
  });

  test("as a command it exits 0 with no output on bad input", () => {
    const run = Bun.spawnSync([process.execPath, SCRIPT], { stdin: Buffer.from("not json") });
    expect(run.exitCode).toBe(0);
    expect(run.stdout.toString()).toBe("");
  });
});

describe("statusLine merged into ~/.claude/settings.json", () => {
  const EXPECTED = "{ type: 'command', command: 'bun ~/.claude/statusline.mjs' }";

  for (const file of ["nix-darwin/flake.nix", "remote/install.sh"]) {
    test(`${file} sets statusLine once, to the shared script`, () => {
      expect(statusLineValues(read(join(ROOT, file)))).toEqual([EXPECTED]);
    });
  }

  test("remote/install.sh links the script that the Mac stows", () => {
    expect(read(join(ROOT, "remote/install.sh"))).toContain(
      'ln -sf "$DOTFILES_DIR/claude/.claude/statusline.mjs" "$HOME/.claude/statusline.mjs"'
    );
  });
});
