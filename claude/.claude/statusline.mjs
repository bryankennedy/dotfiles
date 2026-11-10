#!/usr/bin/env bun
// statusline.mjs: the Claude Code status line for the Mac and the VMs.
//
// Claude Code sends the session data as JSON on stdin and shows what this
// prints. One line in three parts: the model on the left behind an icon for
// its name, with a face for the effort level after it; the directory and a bar
// for the context window in the centre; and the rate limits on the right
// behind a 📈 mark when the session has them.
//
//   🦊 Fable 5.2 🤔 high     dotfiles · ▓▓▓░░░░░░░ 31% 62k/200k     📈 5h 24% · 7d 41%
//
// Claude Code sets COLUMNS to the terminal width before it runs the script
// (its stdout is a pipe, so nothing else can read the width). Spaces place the
// centre part in the middle of the row and the usage at the right edge. Without
// COLUMNS, or when the line does not fit, the parts join with a dot instead.
//
// This file is the one copy. Stow links it into ~/.claude on the Mac
// (nix-darwin/flake.nix) and remote/install.sh links it on the VMs. Both set
// the same statusLine value; tests/claude/statusline.test.js holds them equal.
//
// Claude Code shows a blank row when this exits non-zero, so bad input prints
// nothing and still exits 0.
import { text } from "node:stream/consumers";
import { basename } from "node:path";

const WIDTH = 10;
// Claude Code indents the row, and a line that reaches the edge wraps. Four
// columns of margin keeps the usage short of the edge.
const MARGIN = 4;
const SEP = " · ";
const RESET = "\x1b[0m";
// Green below 70 percent, yellow from 70, red from 90.
const colour = (pct) => (pct >= 90 ? "\x1b[31m" : pct >= 70 ? "\x1b[33m" : "\x1b[32m");
const k = (n) => `${Math.round((n ?? 0) / 1000)}k`;

// One icon per model family, from what the name means. Each is a single code
// point with no variation selector, so every terminal gives it two cells.
const ICONS = [
  [/fable/i, "🦊"], // a fable: a short tale with a moral, and the fox is its usual lead
  [/mythos/i, "🐉"], // a mythos: the legends of a people, and the dragon is their creature
  [/opus/i, "🎼"], // an opus: a composed work, numbered like a score
  [/sonnet/i, "🪶"], // a sonnet: fourteen lines from a quill
  [/haiku/i, "🌸"], // a haiku: three lines on a season, and spring is the first
];
const icon = (name) => ICONS.find(([re]) => re.test(name))?.[1] ?? "🤖";

// One face per effort level: how hard the model thinks. effort.level is absent
// when the model takes no effort parameter.
const FACES = { low: "😴", medium: "🙂", high: "🤔", xhigh: "🧐", max: "🤯" };
const effort = (level) => (level ? `${FACES[level] ?? "😐"} ${level}` : "");

/** The rate-limit windows the session has, oldest first: "5h 24% · 7d 41%". */
function usage(d) {
  const windows = [
    ["5h", d?.rate_limits?.five_hour?.used_percentage],
    ["7d", d?.rate_limits?.seven_day?.used_percentage],
  ];
  // rate_limits is absent without a subscription and before the first
  // response, and each window drops out once its reset time passes.
  return windows.filter(([, pct]) => pct != null).map(([name, pct]) => `${name} ${Math.round(pct)}%`);
}

export function render(d, columns = 0) {
  const cw = d?.context_window ?? {};
  // used_percentage is null early in a session and after /compact.
  const pct = Math.max(0, Math.floor(cw.used_percentage ?? 0));
  const filled = Math.min(WIDTH, Math.round((pct * WIDTH) / 100));
  const bar = `${colour(pct)}${"▓".repeat(filled)}${"░".repeat(WIDTH - filled)}${RESET}`;

  const model = d?.model?.display_name;
  const left = [model ? `${icon(model)} ${model}` : "", effort(d?.effort?.level)].filter(Boolean).join(" ");
  const centre = [
    basename(d?.workspace?.current_dir ?? d?.cwd ?? ""),
    // The percent alone hides the window size, which is 200k or 1M by model.
    `${bar} ${pct}% ${k(cw.total_input_tokens)}/${k(cw.context_window_size)}`,
  ]
    .filter(Boolean)
    .join(SEP);
  const limits = usage(d);
  const right = limits.length ? `📈 ${limits.join(SEP)}` : "";

  // Bun.stringWidth skips the colour codes and counts the emoji as two cells.
  const [wLeft, wCentre, wRight] = [left, centre, right].map((s) => Bun.stringWidth(s));
  const row = columns - MARGIN;
  // The centre part sits in the middle of the row, whatever the two ends hold.
  const before = Math.floor((row - wCentre) / 2) - wLeft;
  const after = row - wLeft - before - wCentre - wRight;
  const fits = (gap, part) => part === "" || gap >= SEP.length;
  if (fits(before, left) && fits(after, right)) {
    const pad = (gap, part) => (part === "" ? "" : " ".repeat(Math.max(0, gap)));
    return `${left}${pad(before, left)}${centre}${pad(after, right)}${right}`;
  }
  return [left, centre, right].filter(Boolean).join(SEP);
}

if (import.meta.main) {
  try {
    console.log(render(JSON.parse(await text(process.stdin)), Number(process.env.COLUMNS) || 0));
  } catch {
    // Bad or empty input: print nothing.
  }
}
