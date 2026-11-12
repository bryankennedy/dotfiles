#!/usr/bin/env bun
// statusline.mjs: the Claude Code status line for the Mac and the VMs.
//
// Claude Code sends the session data as JSON on stdin and shows what this
// prints. One line in three parts: the model on the left behind an icon for
// its name, with a face for the effort level after it; the directory and a bar
// for the context window behind a 🧠 mark in the centre; and a bar for each
// rate limit on the right when the session has them. Each usage bar sits
// behind an icon for its window and the time left before the window resets.
// Each bar takes its colour from its own percent. The right part is a link to
// the usage page on claude.ai, in a terminal that supports OSC 8 links.
//
//   🦊 Fable 5.2 🤔 high     dotfiles · 🧠 ▓▓░░░ 31% 62k/200k     ⏳ 2h ▓░░░░ 24% · 📅 1d ▓▓░░░ 41%
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

// The three bars have one width, so the line fits a 110-column row.
const WIDTH = 5;
// Claude Code indents the row, and a line that reaches the edge wraps. Four
// columns of margin keeps the usage short of the edge.
const MARGIN = 4;
const SEP = " · ";
const RESET = "\x1b[0m";
// The usage page on claude.ai, where the two rate limits come from.
const USAGE_URL = "https://claude.ai/settings/usage";
// An OSC 8 hyperlink. A terminal without OSC 8 shows the text alone, and
// Bun.stringWidth gives the escapes no width.
const link = (url, s) => `\x1b]8;;${url}\x07${s}\x1b]8;;\x07`;
// Green below 70 percent, yellow from 70, red from 90.
const colour = (pct) => (pct >= 90 ? "\x1b[31m" : pct >= 70 ? "\x1b[33m" : "\x1b[32m");
const k = (n) => `${Math.round((n ?? 0) / 1000)}k`;
/** A bar of `width` cells in the colour for `pct`. A percent above 100 fills it. */
function bar(pct, width) {
  const filled = Math.max(0, Math.min(width, Math.round((pct * width) / 100)));
  return `${colour(pct)}${"▓".repeat(filled)}${"░".repeat(width - filled)}${RESET}`;
}

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

/**
 * The time from `now` to `resetsAt`, in one rounded unit: "45m", "2h" or
 * "1d". resets_at is in Unix epoch seconds and `now` is in milliseconds.
 * Without a reset time in the future, the result is `size`, the window length.
 */
function left(resetsAt, now, size) {
  const mins = Math.round((resetsAt - now / 1000) / 60);
  if (!Number.isFinite(mins) || resetsAt == null || mins <= 0) return size;
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

/**
 * The rate-limit windows the session has, shortest first:
 * "⏳ 2h ▓░░░░ 24% · 📅 1d ▓▓░░░ 41%". The hourglass marks the 5-hour session
 * window and the calendar marks the 7-day window. The time after each icon is
 * the time left before that window resets. Each icon is a single code point
 * with no variation selector, as the model icons are.
 */
function usage(d, now) {
  const windows = [
    ["⏳", "5h", d?.rate_limits?.five_hour],
    ["📅", "7d", d?.rate_limits?.seven_day],
  ].map(([mark, size, w]) => [`${mark} ${left(w?.resets_at, now, size)}`, w?.used_percentage]);
  // rate_limits is absent without a subscription and before the first
  // response, and each window drops out once its reset time passes.
  // One rounded value gives the bar, its colour and the number, so the colour
  // always agrees with the percent on the line.
  return windows
    .filter(([, pct]) => pct != null)
    .map(([name, pct]) => [name, Math.round(pct)])
    .map(([name, pct]) => `${name} ${bar(pct, WIDTH)} ${pct}%`);
}

export function render(d, columns = 0, now = Date.now()) {
  const cw = d?.context_window ?? {};
  // used_percentage is null early in a session and after /compact.
  const pct = Math.max(0, Math.floor(cw.used_percentage ?? 0));

  const model = d?.model?.display_name;
  const lead = [model ? `${icon(model)} ${model}` : "", effort(d?.effort?.level)].filter(Boolean).join(" ");
  const centre = [
    basename(d?.workspace?.current_dir ?? d?.cwd ?? ""),
    // The percent alone hides the window size, which is 200k or 1M by model.
    `🧠 ${bar(pct, WIDTH)} ${pct}% ${k(cw.total_input_tokens)}/${k(cw.context_window_size)}`,
  ]
    .filter(Boolean)
    .join(SEP);
  const limits = usage(d, now);
  const right = limits.length ? link(USAGE_URL, limits.join(SEP)) : "";

  // Bun.stringWidth skips the colour codes and counts the emoji as two cells.
  const [wLeft, wCentre, wRight] = [lead, centre, right].map((s) => Bun.stringWidth(s));
  const row = columns - MARGIN;
  // The centre part sits in the middle of the row, whatever the two ends hold.
  const before = Math.floor((row - wCentre) / 2) - wLeft;
  const after = row - wLeft - before - wCentre - wRight;
  const fits = (gap, part) => part === "" || gap >= SEP.length;
  if (fits(before, lead) && fits(after, right)) {
    const pad = (gap, part) => (part === "" ? "" : " ".repeat(Math.max(0, gap)));
    return `${lead}${pad(before, lead)}${centre}${pad(after, right)}${right}`;
  }
  return [lead, centre, right].filter(Boolean).join(SEP);
}

if (import.meta.main) {
  try {
    console.log(render(JSON.parse(await text(process.stdin)), Number(process.env.COLUMNS) || 0));
  } catch {
    // Bad or empty input: print nothing.
  }
}
