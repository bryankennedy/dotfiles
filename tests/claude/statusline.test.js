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
    expect(plain(render(session))).toBe("🦊 Fable 5.2 · project · ▓▓▓░░░░░░░ 31% 63k/200k");
  });

  test("adds the rate limits behind a 📈 mark when the session has them", () => {
    const five = { ...session, rate_limits: { five_hour: { used_percentage: 23.5 } } };
    expect(plain(render(five))).toEndWith(" · 📈 5h 24%");
    const both = { ...session, rate_limits: { five_hour: { used_percentage: 23.5 }, seven_day: { used_percentage: 41 } } };
    expect(plain(render(both))).toEndWith(" · 📈 5h 24% · 7d 41%");
    const weekOnly = { ...session, rate_limits: { seven_day: { used_percentage: 41 } } };
    expect(plain(render(weekOnly))).toEndWith(" · 📈 7d 41%");
  });

  test("places the three parts across the terminal width", () => {
    const both = { ...session, rate_limits: { five_hour: { used_percentage: 23.5 }, seven_day: { used_percentage: 41 } } };
    const centre = "project · ▓▓▓░░░░░░░ 31% 63k/200k";
    const line = plain(render(both, 100));
    expect(line).toStartWith("🦊 Fable 5.2 ");
    expect(line).toEndWith("  📈 5h 24% · 7d 41%");
    // The row is 96 columns after the margin; the centre part is 33 wide.
    expect(Bun.stringWidth(line.slice(0, line.indexOf(centre)))).toBe(31);
    expect(Bun.stringWidth(line)).toBe(96);
    expect(Bun.stringWidth(render(both, 100))).toBe(96);
  });

  test("centres the directory and the bar when the session has no usage", () => {
    const line = plain(render(session, 100));
    expect(line).toStartWith("🦊 Fable 5.2 ");
    expect(line).toEndWith("project · ▓▓▓░░░░░░░ 31% 63k/200k");
    expect(Bun.stringWidth(line)).toBe(64);
  });

  test("puts an icon for the model family before the model name", () => {
    const icons = { "Fable 5.2": "🦊", "Mythos 5.1": "🐉", "Claude Opus 4.5": "🎼", "Sonnet 4.5": "🪶", "Haiku 4.5": "🌸", "Other 1": "🤖" };
    for (const [name, mark] of Object.entries(icons)) {
      expect(plain(render({ model: { display_name: name } }))).toStartWith(`${mark} ${name} · `);
    }
    expect(plain(render({}))).not.toContain("🤖");
  });

  test("puts a face for the effort level after the model name", () => {
    const faces = { low: "😴", medium: "🙂", high: "🤔", xhigh: "🧐", max: "🤯", other: "😐" };
    for (const [level, face] of Object.entries(faces)) {
      expect(plain(render({ ...session, effort: { level } }))).toStartWith(`🦊 Fable 5.2 ${face} ${level} · project`);
    }
    expect(plain(render({ ...session, effort: { level: null } }))).toStartWith("🦊 Fable 5.2 · project");
  });

  test("joins the usage with a dot when the line does not fit", () => {
    const both = { ...session, rate_limits: { five_hour: { used_percentage: 23.5 }, seven_day: { used_percentage: 41 } } };
    const joined = "🦊 Fable 5.2 · project · ▓▓▓░░░░░░░ 31% 63k/200k · 📈 5h 24% · 7d 41%";
    expect(plain(render(both, 0))).toBe(joined);
    expect(plain(render(both, 60))).toBe(joined);
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
    const { COLUMNS: _, ...env } = process.env;
    const run = Bun.spawnSync([process.execPath, SCRIPT], { stdin: Buffer.from(JSON.stringify(session)), env });
    expect(run.exitCode).toBe(0);
    expect(plain(run.stdout.toString())).toBe("🦊 Fable 5.2 · project · ▓▓▓░░░░░░░ 31% 63k/200k\n");
  });

  test("as a command it reads the terminal width from COLUMNS", () => {
    const both = { ...session, rate_limits: { five_hour: { used_percentage: 23.5 } } };
    const run = Bun.spawnSync([process.execPath, SCRIPT], {
      stdin: Buffer.from(JSON.stringify(both)),
      env: { ...process.env, COLUMNS: "80" },
    });
    expect(run.exitCode).toBe(0);
    expect(Bun.stringWidth(run.stdout.toString().trimEnd())).toBe(76);
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
