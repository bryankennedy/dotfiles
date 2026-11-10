// The Claude Code managed settings that nix-darwin writes on the Mac
// (DOT-43): the claude.ai connectors a session there does not use, denied by
// server name, by URL and by tool prefix, in a root-owned file that the
// user's and the project's settings cannot override. The entries follow the
// private infrastructure repo (INFRA-320e).
// docs/decisions/DOT-43.md explains the choice.
import { test, expect, describe } from "bun:test";
import { join } from "node:path";
import { ROOT, read, managedSettingsProblems } from "../lib/repo.js";

const FLAKE = "nix-darwin/flake.nix";

export const EXPECTED = {
  connectors: [
    { server: "claude.ai Gmail", url: "https://gmailmcp.googleapis.com/*", prefix: "mcp__claude_ai_Gmail" },
    { server: "claude.ai Google Drive", url: "https://drivemcp.googleapis.com/*", prefix: "mcp__claude_ai_Google_Drive" },
    { server: "claude.ai Google Calendar", url: "https://calendarmcp.googleapis.com/*", prefix: "mcp__claude_ai_Google_Calendar" },
    { server: "claude.ai Cloudflare Developer Platform", url: "https://bindings.mcp.cloudflare.com/*", prefix: "mcp__claude_ai_Cloudflare_Developer_Platform" },
  ],
  // Connectors that stay keep one tool closed each.
  extraDeny: ["mcp__claude_ai_Claude_Docs__delete"],
};

describe("Claude Code managed settings on the Mac", () => {
  test(`${FLAKE} denies the expected connectors and installs the file root-owned`, () => {
    expect(managedSettingsProblems(read(join(ROOT, FLAKE)), EXPECTED)).toEqual([]);
  });
});
