// DOT-48: bin/bin/clip ends each block that the owner runs and pastes back.
// On the Mac outside SSH it runs pbcopy. Over SSH it writes an OSC 52
// sequence to the terminal. CLIP_TTY points that write at a file here, and
// stubs stand in for pbcopy and tmux.
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT } from "../lib/repo.js";

const CLIP = join(ROOT, "bin/bin/clip");
const osc = (text) => `\x1b]52;c;${Buffer.from(text).toString("base64")}\x07`;

let dir, n = 0;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "clip-")); });
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// A fresh case directory: a terminal file, and a bin directory for stubs.
function setup({ pbcopy = false, pbcopyFails = false, tmux = null } = {}) {
  const c = join(dir, String(n++));
  const bin = join(c, "bin");
  mkdirSync(bin, { recursive: true });
  const stub = (name, body) => { writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`); chmodSync(join(bin, name), 0o755); };
  if (pbcopy) stub("pbcopy", pbcopyFails ? "cat >/dev/null; exit 1" : `cat > "${join(c, "pasteboard")}"`);
  // tmux: "fail" stands for a lookup that fails, as on a server it cannot reach.
  if (tmux === "fail") stub("tmux", "exit 1");
  else if (tmux !== null) stub("tmux", `[ "$*" = "show-options -sv set-clipboard" ] && echo ${tmux}`);
  const tty = join(c, "tty");
  writeFileSync(tty, "");
  return { c, bin, tty };
}

// Only a regular file is read back. A device such as /dev/full never ends,
// so reading it takes memory until the machine stops.
const ttyText = (p) => (existsSync(p) && statSync(p).isFile() ? readFileSync(p, "utf8") : null);

// Standard error is a file, as a terminal would be for tee: a socket cannot
// be opened again through /dev/stderr.
function run(input, { c, bin, tty, env = {} }) {
  const errPath = join(c, "stderr");
  const err = openSync(errPath, "a");
  const r = spawnSync(CLIP, [], {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", err],
    env: { PATH: `${bin}:${process.env.PATH}`, HOME: dir, CLIP_TTY: tty, ...env },
  });
  closeSync(err);
  return { status: r.status, stderr: readFileSync(errPath, "utf8"), stdout: r.stdout, tty: ttyText(tty) };
}

const SSH = { SSH_CONNECTION: "192.0.2.1 50000 192.0.2.2 22" };

test("clip is an executable sh script with valid syntax", () => {
  expect(statSync(CLIP).mode & 0o111).not.toBe(0);
  const r = spawnSync("sh", ["-n", CLIP], { encoding: "utf8" });
  expect(r.status, r.stderr).toBe(0);
});

describe("over SSH", () => {
  test("writes one OSC 52 sequence, shows the text, and prints the byte count", () => {
    const s = setup();
    const r = run("hello\n", { ...s, env: SSH });
    expect(r.status, r.stderr).toBe(0);
    expect(r.tty).toBe(osc("hello\n"));
    expect(r.stdout).toBe("");
    expect(r.stderr).toStartWith("hello\n");
    expect(r.stderr).toContain("clip: sent 6 bytes");
  });

  // base64 on Linux wraps at 76 columns. A newline inside the sequence ends it.
  test("keeps a long input in one line, and counts its bytes", () => {
    const s = setup();
    const text = `${"### ask-1: a long line | host | 2026-11-18T16:00:00Z\n".repeat(40)}last`;
    const r = run(text, { ...s, env: SSH });
    expect(r.status, r.stderr).toBe(0);
    expect(r.tty).toBe(osc(text));
    expect(r.stderr).toContain(`clip: sent ${Buffer.byteLength(text)} bytes`);
  });

  for (const len of [1, 2, 3]) {
    test(`counts the bytes of a ${len}-byte input`, () => {
      const s = setup();
      const r = run("x".repeat(len), { ...s, env: SSH });
      expect(r.stderr).toContain(`clip: sent ${len} bytes`);
    });
  }

  test("uses OSC 52, not pbcopy, on a Mac reached over SSH", () => {
    const s = setup({ pbcopy: true });
    const r = run("over ssh\n", { ...s, env: { SSH_TTY: "/dev/pts/1" } });
    expect(r.status, r.stderr).toBe(0);
    expect(r.tty).toBe(osc("over ssh\n"));
    expect(existsSync(join(s.c, "pasteboard"))).toBe(false);
  });

  test("says so and exits 1 when the write of the sequence fails", () => {
    const s = setup();
    // /dev/full takes the open, then fails each write.
    const r = run("lost\n", { ...s, tty: "/dev/full", env: SSH });
    expect(r.status).toBe(1);
    expect(r.stderr).toStartWith("lost\n");
    expect(r.stderr).toContain("clip: the write to /dev/full failed");
    expect(r.stderr).not.toContain("clip: sent");
  });

  test("exits 1 on no input and leaves the clipboard alone", () => {
    const s = setup();
    const r = run("", { ...s, env: SSH });
    expect(r.status).toBe(1);
    expect(r.tty).toBe("");
    expect(r.stderr).toContain("clip: no input");
  });

  test("still shows the text and exits 1 when it cannot write to the terminal", () => {
    const s = setup();
    const r = run("kept\n", { ...s, tty: join(s.c, "no-dir", "tty"), env: SSH });
    expect(r.status).toBe(1);
    expect(r.stderr).toStartWith("kept\n");
    expect(r.stderr).toContain("tee ~/cx.out");
  });
});

describe("inside tmux", () => {
  test("sends the sequence when set-clipboard is on", () => {
    const s = setup({ tmux: "on" });
    const r = run("in tmux\n", { ...s, env: { ...SSH, TMUX: "/tmp/tmux-1/default,1,0" } });
    expect(r.status, r.stderr).toBe(0);
    expect(r.tty).toBe(osc("in tmux\n"));
  });

  for (const [mode, shown] of [["external", "external"], ["off", "off"], ["fail", "unknown"]]) {
    test(`copies nothing and says how to fix it when set-clipboard is ${mode}`, () => {
      const s = setup({ tmux: mode });
      const r = run("in tmux\n", { ...s, env: { ...SSH, TMUX: "/tmp/tmux-1/default,1,0" } });
      expect(r.status).toBe(1);
      expect(r.tty).toBe("");
      expect(r.stderr).toStartWith("in tmux\n");
      expect(r.stderr).toContain(`set-clipboard is '${shown}'`);
      expect(r.stderr).toContain("tmux set -s set-clipboard on");
    });
  }
});

describe("on the Mac", () => {
  test("runs pbcopy outside SSH, shows the text, and writes no sequence", () => {
    const s = setup({ pbcopy: true });
    const r = run("local\n", s);
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(join(s.c, "pasteboard"), "utf8")).toBe("local\n");
    expect(r.tty).toBe("");
    expect(r.stderr).toStartWith("local\n");
    expect(r.stderr).toContain("clip: copied with pbcopy");
  });
});

describe("on the Mac, failures", () => {
  test("exits 1 on no input and does not run pbcopy, so the clipboard keeps its text", () => {
    const s = setup({ pbcopy: true });
    const r = run("", s);
    expect(r.status).toBe(1);
    expect(existsSync(join(s.c, "pasteboard"))).toBe(false);
    expect(r.stderr).toContain("clip: no input");
  });

  test("keeps trailing newlines", () => {
    const s = setup({ pbcopy: true });
    const r = run("two\n\n", s);
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(join(s.c, "pasteboard"), "utf8")).toBe("two\n\n");
  });

  test("exits 1 and says so when pbcopy fails", () => {
    const s = setup({ pbcopy: true, pbcopyFails: true });
    const r = run("text\n", s);
    expect(r.status).toBe(1);
    expect(r.stderr).toStartWith("text\n");
    expect(r.stderr).toContain("clip: pbcopy failed");
    expect(r.stderr).not.toContain("copied with pbcopy");
  });
});

describe("delivery", () => {

  test("remote/install.sh links clip into ~/bin, which remote/bashrc puts on PATH", () => {
    const install = readFileSync(join(ROOT, "remote/install.sh"), "utf8");
    expect(install).toContain('backup_and_link "$DOTFILES_DIR/bin/bin/clip" "$HOME/bin/clip"');
    expect(readFileSync(join(ROOT, "remote/bashrc"), "utf8")).toMatch(/export PATH="\$HOME\/bin:/);
  });

  test("section 9 of the agent rules names clip as the copy step, and no old c52 function", () => {
    const rules = readFileSync(join(ROOT, "_agent/rules/global.md"), "utf8");
    expect(rules).toContain("**The copy step is `| clip` on every machine.**");
    expect(rules).not.toMatch(/\bc52\b/);
  });
});
