// The Claude Code status line: one script, claude/.claude/statusline.mjs, that
// the Mac's activation and the fleet bootstrap both point statusLine at.
import { test, expect, describe } from "bun:test";
import { join } from "node:path";
import { ROOT, read } from "../lib/repo.js";
import { render } from "../../claude/.claude/statusline.mjs";

const SCRIPT = join(ROOT, "claude/.claude/statusline.mjs");
// Removes the colour codes and the OSC 8 link escapes.
const plain = (s) => s.replace(/\x1b\[[0-9;]*m|\x1b\]8;;[^\x07]*\x07/g, "");

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
    expect(plain(render(session))).toBe("🦊 Fable 5.2 · project · 🧠 ▓▓░░░ 31% 63k/200k");
  });

  test("adds a bar for each rate limit behind an icon for its window when the session has them", () => {
    const five = { ...session, rate_limits: { five_hour: { used_percentage: 23.5 } } };
    expect(plain(render(five))).toEndWith(" · ⏳ 5h ▓░░░░ 24%");
    const both = { ...session, rate_limits: { five_hour: { used_percentage: 23.5 }, seven_day: { used_percentage: 41 } } };
    expect(plain(render(both))).toEndWith(" · ⏳ 5h ▓░░░░ 24% · 📅 7d ▓▓░░░ 41%");
    const weekOnly = { ...session, rate_limits: { seven_day: { used_percentage: 41 } } };
    expect(plain(render(weekOnly))).toEndWith(" · 📅 7d ▓▓░░░ 41%");
  });

  test("shows the time left in each window in place of the window length", () => {
    const now = Date.UTC(2026, 10, 12, 12, 0, 0);
    const inMins = (m) => now / 1000 + m * 60;
    const at = (five, seven) =>
      plain(
        render(
          {
            rate_limits: {
              five_hour: { used_percentage: 24, resets_at: five },
              seven_day: { used_percentage: 41, resets_at: seven },
            },
          },
          0,
          now
        )
      );
    expect(at(inMins(112), inMins(26 * 60))).toEndWith("⏳ 2h ▓░░░░ 24% · 📅 1d ▓▓░░░ 41%");
    expect(at(inMins(45), inMins(5 * 24 * 60))).toEndWith("⏳ 45m ▓░░░░ 24% · 📅 5d ▓▓░░░ 41%");
    expect(at(inMins(59.6), inMins(23.6 * 60))).toEndWith("⏳ 1h ▓░░░░ 24% · 📅 1d ▓▓░░░ 41%");
    expect(at(inMins(0.2), inMins(20 * 60))).toEndWith("⏳ 5h ▓░░░░ 24% · 📅 20h ▓▓░░░ 41%");
    // A reset time in the past, or none, gives the window length.
    expect(at(inMins(-5), undefined)).toEndWith("⏳ 5h ▓░░░░ 24% · 📅 7d ▓▓░░░ 41%");
    expect(at("soon", null)).toEndWith("⏳ 5h ▓░░░░ 24% · 📅 7d ▓▓░░░ 41%");
  });

  test("the usage part is one link to the usage page, and nothing else is", () => {
    const both = { ...session, rate_limits: { five_hour: { used_percentage: 23.5 }, seven_day: { used_percentage: 41 } } };
    const open = "\x1b]8;;https://claude.ai/settings/usage\x07";
    const close = "\x1b]8;;\x07";
    for (const line of [render(both), render(both, 110)]) {
      expect(line.split("\x1b]8;;").length - 1).toBe(2);
      expect(line.indexOf(open)).toBe(line.indexOf("⏳") - open.length);
      expect(line).toEndWith(close);
    }
    expect(render(session)).not.toContain("\x1b]8");
    expect(render(session, 110)).not.toContain("\x1b]8");
  });

  test("each usage bar takes its colour from its own percent", () => {
    const at = (five, seven) =>
      render({ rate_limits: { five_hour: { used_percentage: five }, seven_day: { used_percentage: seven } } });
    expect(at(69, 95)).toContain("5h \x1b[32m▓▓▓░░\x1b[0m 69% · 📅 7d \x1b[31m▓▓▓▓▓\x1b[0m 95%");
    expect(at(70, 0)).toContain("5h \x1b[33m▓▓▓▓░\x1b[0m 70% · 📅 7d \x1b[32m░░░░░\x1b[0m 0%");
    expect(plain(at(140, 0))).toContain("5h ▓▓▓▓▓ 140%");
    // The colour follows the rounded percent that the line shows.
    expect(at(69.6, 89.6)).toContain("5h \x1b[33m▓▓▓▓░\x1b[0m 70% · 📅 7d \x1b[31m▓▓▓▓▓\x1b[0m 90%");
    expect(at(69.4, 89.4)).toContain("5h \x1b[32m▓▓▓░░\x1b[0m 69% · 📅 7d \x1b[33m▓▓▓▓░\x1b[0m 89%");
  });

  test("places the three parts across the terminal width", () => {
    const both = { ...session, rate_limits: { five_hour: { used_percentage: 23.5 }, seven_day: { used_percentage: 41 } } };
    const centre = "project · 🧠 ▓▓░░░ 31% 63k/200k";
    const line = plain(render(both, 110));
    expect(line).toStartWith("🦊 Fable 5.2 ");
    expect(line).toEndWith("     ⏳ 5h ▓░░░░ 24% · 📅 7d ▓▓░░░ 41%");
    // The row is 106 columns after the margin; the centre part is 31 wide.
    expect(Bun.stringWidth(line.slice(0, line.indexOf(centre)))).toBe(37);
    expect(Bun.stringWidth(line)).toBe(106);
    expect(Bun.stringWidth(render(both, 110))).toBe(106);
  });

  test("centres the directory and the bar when the session has no usage", () => {
    const line = plain(render(session, 100));
    expect(line).toStartWith("🦊 Fable 5.2 ");
    expect(line).toEndWith("project · 🧠 ▓▓░░░ 31% 63k/200k");
    expect(Bun.stringWidth(line)).toBe(63);
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
    const joined = "🦊 Fable 5.2 · project · 🧠 ▓▓░░░ 31% 63k/200k · ⏳ 5h ▓░░░░ 24% · 📅 7d ▓▓░░░ 41%";
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
    expect(plain(render({ context_window: { used_percentage: null, current_usage: null } }))).toBe("🧠 ░░░░░ 0% 0k/0k");
    expect(plain(render({}))).toBe("🧠 ░░░░░ 0% 0k/0k");
  });

  test("a percent above 100 does not overflow the bar", () => {
    expect(plain(render({ context_window: { used_percentage: 140 } }))).toStartWith("🧠 ▓▓▓▓▓ 140%");
  });

  test("as a command it prints one line and exits 0", () => {
    const { COLUMNS: _, ...env } = process.env;
    const run = Bun.spawnSync([process.execPath, SCRIPT], { stdin: Buffer.from(JSON.stringify(session)), env });
    expect(run.exitCode).toBe(0);
    expect(plain(run.stdout.toString())).toBe("🦊 Fable 5.2 · project · 🧠 ▓▓░░░ 31% 63k/200k\n");
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
