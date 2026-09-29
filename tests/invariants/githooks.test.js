// The commit-time secret check that CLAUDE.md's review criteria rely on:
// .githooks/pre-commit runs gitleaks over the staged change and refuses the
// commit when gitleaks is missing, and nix-darwin activation points this
// checkout's core.hooksPath at it. docs/decisions/DOT-22.md explains why.
import { test, expect, describe } from "bun:test";
import { join } from "node:path";
import { ROOT, read, exists, hookFailsOpen, hooksPathActivation } from "../lib/repo.js";

const HOOK = ".githooks/pre-commit";

describe("commit-time secret check", () => {
  test(`${HOOK} exists and is executable in git`, () => {
    expect(exists(join(ROOT, HOOK)), `${HOOK} is missing`).toBe(true);
    const mode = Bun.spawnSync(["git", "ls-files", "-s", "--", HOOK], { cwd: ROOT }).stdout.toString().split(" ")[0];
    expect(mode, `${HOOK} is not tracked as 100755; git would not run it`).toBe("100755");
  });

  test(`${HOOK} fails closed`, () => {
    expect(hookFailsOpen(read(join(ROOT, HOOK)))).toEqual([]);
  });

  test("activation installs gitleaks and points core.hooksPath at .githooks", () => {
    expect(hooksPathActivation(read(join(ROOT, "nix-darwin", "flake.nix")))).toEqual([]);
  });
});
