// DOT-29: Claude Code appends `**/.claude/settings.local.json` to the file that
// core.excludesfile names when two checks fail. The first check is
// `git check-ignore -- .claude/settings.local.json`. The second check is a
// search of that file for the exact line. On a VM the file is a symlink into
// the dotfiles checkout, so an append changes a tracked file.
// This runs the real git/.gitignore_global through git, so both checks pass.
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT } from "../lib/repo.js";

const IGNORE_FILE = join(ROOT, "git/.gitignore_global");
const LINE = "**/.claude/settings.local.json";

let home, repo, env;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "dotfiles-gitignore-"));
  writeFileSync(join(home, ".gitconfig"), `[core]\n\texcludesfile = ${IGNORE_FILE}\n`);
  env = { HOME: home, PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: "1" };
  repo = join(home, "repo");
  mkdirSync(repo);
  expect(spawnSync("git", ["-C", repo, "init", "-q"], { env }).status).toBe(0);
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const ignored = (path) =>
  spawnSync("git", ["-C", repo, "check-ignore", "--", path], { env, encoding: "utf8" }).status === 0;

describe("git/.gitignore_global leaves Claude Code nothing to append", () => {
  test("it holds the exact line that Claude Code searches for", () => {
    expect(readFileSync(IGNORE_FILE, "utf8").split("\n")).toContain(LINE);
  });

  test("it ends with a newline, so an append cannot join a line", () => {
    expect(readFileSync(IGNORE_FILE, "utf8").endsWith("\n")).toBe(true);
  });

  for (const path of [".claude/settings.local.json", "packages/app/.claude/settings.local.json"]) {
    test(`git ignores ${path}`, () => {
      expect(ignored(path)).toBe(true);
    });
  }

  test("git does not ignore the shared settings file", () => {
    expect(ignored(".claude/settings.json")).toBe(false);
  });
});
