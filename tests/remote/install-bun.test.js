// remote/install.sh and ~/.bun/bin/bun: the script replaces the bun it owns
// when that bun is not BUN_VERSION, and leaves a bun it does not own alone
// (INFRA-260).
//
// Same harness as install-gitconfig.test.js: the real installer against a
// throwaway $HOME, with curl and sudo stubbed to fail the run. So these cover
// the paths that keep a bun, and the paths that reach the download to replace
// one. A replace that reaches curl fails there, and the test reads that as
// "the script tried to replace it". unzip is stubbed as present, so the suite
// does not depend on the host having it. The replace tests need an x86_64 or
// aarch64 glibc host, which has a pinned build.
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT } from "../lib/repo.js";

const PIN = readFileSync(join(ROOT, "remote/install.sh"), "utf8").match(/^\s*BUN_VERSION=(\S+)\s*$/m)[1];

let home, env;

const script = (path, body) => {
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
};

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "dotfiles-install-bun-"));
  const stubs = join(home, ".stubs");
  mkdirSync(stubs);
  script(join(stubs, "zoxide"), "exit 0");
  script(join(stubs, "infocmp"), "exit 0");
  script(join(stubs, "unzip"), "exit 0");
  script(join(stubs, "curl"), 'echo "test stub: install.sh reached for curl" >&2; exit 1');
  script(join(stubs, "sudo"), 'echo "test stub: install.sh reached for sudo" >&2; exit 1');
  env = { HOME: home, DOTFILES_DIR: ROOT, PATH: `${stubs}:${process.env.PATH}` };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const install = () => spawnSync("bash", [join(ROOT, "remote/install.sh")], { env, encoding: "utf8" });

/** A stand-in ~/.bun/bin/bun whose --version prints `version`, or fails when it is null. */
const ownedBun = (version) => {
  mkdirSync(join(home, ".bun", "bin"), { recursive: true });
  const path = join(home, ".bun", "bin", "bun");
  script(path, version == null ? "exit 1" : `echo ${version}`);
  return path;
};

describe("remote/install.sh keeps ~/.bun/bin/bun at BUN_VERSION", () => {
  test("a bun at the pin is kept, with no download", () => {
    const path = ownedBun(PIN);
    const before = readFileSync(path, "utf8");
    const r = install();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(`bun ${PIN} already installed`);
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  test("a bun off the pin is replaced, and a failed replace keeps it and fails the run", () => {
    const path = ownedBun("1.3.13");
    const before = readFileSync(path, "utf8");
    const r = install();
    expect(r.stdout).toContain(`replacing bun 1.3.13 with ${PIN}`);
    expect(r.stderr).toContain("install.sh reached for curl");
    expect(r.status).toBe(1);
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  test("a bun that does not run is replaced", () => {
    ownedBun(null);
    const r = install();
    expect(r.stdout).toContain(`replacing bun unrunnable with ${PIN}`);
    expect(r.stderr).toContain("install.sh reached for curl");
    expect(r.status).toBe(1);
  });

  test("a bun that prints no version is replaced, not taken for absent", () => {
    // Another bun is on PATH, so reading "" as absent would keep this one.
    ownedBun("");
    const r = install();
    expect(r.stdout).toContain(`replacing bun unrunnable with ${PIN}`);
    expect(r.stdout).not.toContain("outside ~/.bun/bin");
    expect(r.status).toBe(1);
  });

  test("a bun on PATH outside ~/.bun/bin is left alone", () => {
    // The bun running this suite is on PATH; $HOME/.bun/bin does not exist.
    const r = install();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("outside ~/.bun/bin");
    expect(r.stderr).not.toContain("install.sh reached for curl");
  });
});
