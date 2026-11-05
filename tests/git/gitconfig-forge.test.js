// INFRA-321: on the Mac, git/.gitconfig includes ~/.gitconfig-darwin, which
// sets core.sshCommand to the forge-ssh wrapper (INFRA-320), for repos with a
// forge remote only.
// This runs the real git/.gitconfig against a throwaway $HOME with a stub
// ~/.gitconfig-darwin, so a pattern that misses a URL form fails here.
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT } from "../lib/repo.js";

let home, env;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "dotfiles-gitconfig-"));
  copyFileSync(join(ROOT, "git/.gitconfig"), join(home, ".gitconfig"));
  writeFileSync(join(home, ".gitconfig-darwin"), "[core]\n\tsshCommand = FORGE-SSH\n");
  env = { HOME: home, PATH: process.env.PATH };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const sshCommandFor = (url) => {
  const repo = join(home, "repo");
  rmSync(repo, { recursive: true, force: true });
  mkdirSync(repo);
  const run = (...args) => spawnSync("git", ["-C", repo, ...args], { env, encoding: "utf8" });
  expect(run("init", "-q").status).toBe(0);
  expect(run("remote", "add", "origin", url).status).toBe(0);
  return run("config", "--get", "core.sshCommand").stdout.trim();
};

describe("git/.gitconfig scopes the Mac-only ssh to forge remotes", () => {
  for (const url of [
    "ssh://git@git.bck.dev:2222/owner/repo.git",
    "ssh://git.bck.dev:2222/owner/repo.git",
    "git@git.bck.dev:owner/repo.git",
    "git@git.bck.dev:group/sub/repo.git",
  ]) {
    test(`a forge remote includes it: ${url}`, () => {
      expect(sshCommandFor(url)).toBe("FORGE-SSH");
    });
  }

  for (const url of ["git@github.com:owner/repo.git", "https://github.com/owner/repo.git"]) {
    test(`another remote does not: ${url}`, () => {
      expect(sshCommandFor(url)).toBe("");
    });
  }

  test("a global core.sshCommand set later still wins in a forge repo", () => {
    const r = spawnSync("git", ["config", "--global", "core.sshCommand", "MINE"], { env, encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    expect(sshCommandFor("ssh://git@git.bck.dev:2222/owner/repo.git")).toBe("MINE");
  });
});

describe("git/.gitconfig-darwin itself", () => {
  const get = (key) => {
    const text = readFileSync(join(ROOT, "git/.gitconfig-darwin"), "utf8");
    const r = spawnSync("git", ["config", "--file", join(ROOT, "git/.gitconfig-darwin"), "--get", key], { encoding: "utf8" });
    expect(r.status, text).toBe(0);
    return r.stdout.trim();
  };

  // INFRA-320: the wrapper runs the nix OpenSSH (INFRA-321) and adds the
  // touch dialog. tests/bin/forge-ssh.test.js checks the wrapper itself.
  test("points git at the forge-ssh wrapper in ~/bin, by its absolute path", () => {
    expect(get("core.sshCommand")).toBe("/Users/bk/bin/forge-ssh");
  });

  test("tells git that the wrapper is OpenSSH, so a port in the URL works", () => {
    expect(get("ssh.variant")).toBe("ssh");
  });
});
