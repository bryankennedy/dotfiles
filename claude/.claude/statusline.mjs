#!/usr/bin/env bun
// statusline.mjs: the Claude Code status line for the Mac and the VMs.
//
// Claude Code sends the session data as JSON on stdin and shows what this
// prints. One line: model, directory, a bar for the context window, and the
// 5-hour rate limit when the session has one.
//
//   Fable 5.2 · dotfiles · ▓▓▓░░░░░░░ 31% 62k/200k · 5h 24%
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
const RESET = "\x1b[0m";
// Green below 70 percent, yellow from 70, red from 90.
const colour = (pct) => (pct >= 90 ? "\x1b[31m" : pct >= 70 ? "\x1b[33m" : "\x1b[32m");
const k = (n) => `${Math.round((n ?? 0) / 1000)}k`;

export function render(d) {
  const cw = d?.context_window ?? {};
  // used_percentage is null early in a session and after /compact.
  const pct = Math.max(0, Math.floor(cw.used_percentage ?? 0));
  const filled = Math.min(WIDTH, Math.round((pct * WIDTH) / 100));
  const bar = `${colour(pct)}${"▓".repeat(filled)}${"░".repeat(WIDTH - filled)}${RESET}`;

  const parts = [
    d?.model?.display_name,
    basename(d?.workspace?.current_dir ?? d?.cwd ?? ""),
    // The percent alone hides the window size, which is 200k or 1M by model.
    `${bar} ${pct}% ${k(cw.total_input_tokens)}/${k(cw.context_window_size)}`,
  ];
  // rate_limits is absent without a subscription and before the first response.
  const fiveHour = d?.rate_limits?.five_hour?.used_percentage;
  if (fiveHour != null) parts.push(`5h ${Math.round(fiveHour)}%`);
  return parts.filter(Boolean).join(" · ");
}

if (import.meta.main) {
  try {
    console.log(render(JSON.parse(await text(process.stdin))));
  } catch {
    // Bad or empty input: print nothing.
  }
}
