// remote/install.sh and ~/.gitconfig: the script owns ~/.gitconfig.dotfiles and
// nothing else (docs/decisions/DOT-28.md).
//
// These run the real installer against a throwaway $HOME, with DOTFILES_DIR
// pointed at this checkout so it never clones. The network installs are kept
// out of reach: zoxide and infocmp are stubbed as already present, bun is the
// one running this test, and curl and sudo are stubs that fail the run if the
// script ever reaches for them.
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT } from "../lib/repo.js";

const FORGE = "https://forge.example.invalid";
const HELPER = "!/usr/local/bin/tea login helper";

let home, env;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "dotfiles-install-"));
  const stubs = join(home, ".stubs");
  mkdirSync(stubs);
  for (const [name, body] of [
    ["zoxide", "exit 0"],
    ["infocmp", "exit 0"],
    ["curl", 'echo "test stub: install.sh reached for curl" >&2; exit 1'],
    ["sudo", 'echo "test stub: install.sh reached for sudo" >&2; exit 1'],
  ]) {
    writeFileSync(join(stubs, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(stubs, name), 0o755);
  }
  // A minimal environment, so a GIT_CONFIG_GLOBAL or XDG_CONFIG_HOME on the
  // machine running the suite cannot point git somewhere other than $HOME.
  env = { HOME: home, DOTFILES_DIR: ROOT, PATH: `${stubs}:${process.env.PATH}` };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const install = () => {
  const r = spawnSync("bash", [join(ROOT, "remote/install.sh")], { env, encoding: "utf8" });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout;
};
const git = (...args) => {
  const r = spawnSync("git", ["config", "--global", ...args], { env, encoding: "utf8" });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout.trim();
};
const gitconfig = () => readFileSync(join(home, ".gitconfig"), "utf8");
const managed = () => readFileSync(join(home, ".gitconfig.dotfiles"), "utf8");
const backups = () => (existsSync(join(home, ".dotfiles-backup")) ? readdirSync(join(home, ".dotfiles-backup")) : []);

/** What configuration management does after the installer: identity, then the forge helper. */
const addForeign = () => {
  git("user.name", "Test User");
  git("user.email", "test@example.invalid");
  git(`credential.${FORGE}.helper`, HELPER);
};

describe("remote/install.sh leaves ~/.gitconfig to whoever else writes there", () => {
  test("a fresh home gets an include and a managed file with no identity in it", () => {
    install();
    expect(gitconfig()).toBe("[include]\n\tpath = ~/.gitconfig.dotfiles\n");
    expect(managed()).not.toMatch(/^\[user\]/m);
    expect(managed()).toContain("path = ~/.gitconfig.local");
    expect(git("--includes", "core.editor")).toBe("vim");
    expect(backups()).toEqual([]);
  });

  test("a converged host with [user] and a foreign section: byte-identical, no backup", () => {
    install();
    addForeign();
    const before = gitconfig();
    install();
    expect(gitconfig()).toBe(before);
    expect(git("user.name")).toBe("Test User");
    expect(git(`credential.${FORGE}.helper`)).toBe(HELPER);
    expect(backups()).toEqual([]);
  });

  test("a change to the managed text rewrites only the managed file", () => {
    install();
    addForeign();
    const before = gitconfig();
    const current = managed();
    writeFileSync(join(home, ".gitconfig.dotfiles"), current.replace("editor = vim", "editor = nano"));
    install();
    expect(managed()).toBe(current);
    expect(gitconfig()).toBe(before);
    expect(backups()).toEqual([]);
  });

  test("a whole-file ~/.gitconfig from the old installer migrates once and keeps what is not ours", () => {
    // The shape on a host today: the old generated text, then what `git config
    // --global` added since, including a key put into a section we manage.
    install();
    writeFileSync(join(home, ".gitconfig"), managed());
    rmSync(join(home, ".gitconfig.dotfiles"));
    addForeign();
    git("core.pager", "less -F");
    const legacy = gitconfig();

    install();
    expect(git("user.name")).toBe("Test User");
    expect(git("user.email")).toBe("test@example.invalid");
    expect(git(`credential.${FORGE}.helper`)).toBe(HELPER);
    expect(git("core.pager")).toBe("less -F");
    // The managed lines moved out: ~/.gitconfig no longer shadows the managed file.
    expect(gitconfig().startsWith("[include]\n\tpath = ~/.gitconfig.dotfiles\n")).toBe(true);
    expect(gitconfig()).not.toContain("editor = vim");
    expect(gitconfig()).not.toContain("~/.gitconfig.local");
    expect(git("--includes", "core.editor")).toBe("vim");
    // The one rewrite is backed up, in full.
    expect(backups().length).toBe(1);
    expect(readFileSync(join(home, ".dotfiles-backup", backups()[0], ".gitconfig"), "utf8")).toBe(legacy);

    const migrated = gitconfig();
    install();
    expect(gitconfig()).toBe(migrated);
    expect(backups().length).toBe(1);
  });
});
