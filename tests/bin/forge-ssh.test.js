// INFRA-320: forge repos on the Mac run bin/bin/forge-ssh. For the forge, it
// runs the nix OpenSSH with BatchMode and sets bin/bin/fido-touch-notify as
// SSH_ASKPASS. ssh then runs the notifier each time the FIDO key waits for a
// touch. Another remote goes straight to the nix OpenSSH.
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT } from "../lib/repo.js";

const wrapper = join(ROOT, "bin/bin/forge-ssh");
const notifier = join(ROOT, "bin/bin/fido-touch-notify");
const SSH_LINE = "ssh=/run/current-system/sw/bin/ssh";

describe("bin/bin/forge-ssh", () => {
  const text = readFileSync(wrapper, "utf8");
  let dir;

  // The wrapper names the nix OpenSSH by its full path (INFRA-321), so the
  // test runs a copy whose only change is that path, pointed at a stub. The
  // stub prints what the real ssh would get.
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "forge-ssh-"));
    const stub = join(dir, "ssh-stub");
    writeFileSync(
      stub,
      '#!/bin/sh\nprintf "ASKPASS=%s\\nREQUIRE=%s\\nPROMPT=%s\\n" "${SSH_ASKPASS-unset}" "${SSH_ASKPASS_REQUIRE-unset}" "${SSH_ASKPASS_PROMPT-unset}"\nfor a in "$@"; do printf "ARG=%s\\n" "$a"; done\n',
    );
    chmodSync(stub, 0o755);
    writeFileSync(join(dir, "forge-ssh"), text.replace(SSH_LINE, `ssh=${stub}`));
    chmodSync(join(dir, "forge-ssh"), 0o755);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const run = (args, extraEnv = {}) => {
    const r = spawnSync(join(dir, "forge-ssh"), args, {
      env: { PATH: process.env.PATH, ...extraEnv },
      encoding: "utf8",
    });
    expect(r.status, r.stderr).toBe(0);
    const out = r.stdout.trim().split("\n");
    const val = (k) => out.find((l) => l.startsWith(`${k}=`)).slice(k.length + 1);
    return { askpass: val("ASKPASS"), require: val("REQUIRE"), prompt: val("PROMPT"), args: out.filter((l) => l.startsWith("ARG=")).map((l) => l.slice(4)) };
  };

  test("is an executable sh script with valid syntax, and names the nix OpenSSH once", () => {
    expect(statSync(wrapper).mode & 0o111).not.toBe(0);
    const r = spawnSync("sh", ["-n", wrapper], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    expect(text.split(SSH_LINE).length).toBe(2);
  });

  for (const host of ["git@git.bck.dev", "git.bck.dev"]) {
    test(`gives the forge BatchMode and the notifier: ${host}`, () => {
      const args = ["-o", "SendEnv=GIT_PROTOCOL", "-p", "2222", host, "git-upload-pack '/bkennedy/x.git'"];
      const r = run(args, { SSH_ASKPASS_PROMPT: "none" });
      expect(r.args).toEqual(["-o", "BatchMode=yes", ...args]);
      expect(r.askpass).toBe(join(dir, "fido-touch-notify"));
      expect(r.require).toBe("force");
      // An inherited value would let a passphrase or PIN request through.
      expect(r.prompt).toBe("unset");
    });
  }

  for (const args of [
    ["-o", "SendEnv=GIT_PROTOCOL", "git@github.com", "git-upload-pack 'owner/repo.git'"],
    // A repo path that holds the host name is not a connection to the forge.
    ["git@github.com", "git-upload-pack 'owner/git.bck.dev.git'"],
  ]) {
    test(`passes another remote straight through: ${args.join(" ")}`, () => {
      const r = run(args);
      expect(r.args).toEqual(args);
      expect(r.askpass).toBe("unset");
      expect(r.require).toBe("unset");
    });
  }
});

describe("bin/bin/fido-touch-notify", () => {
  const text = readFileSync(notifier, "utf8");

  test("is an executable sh script with valid syntax", () => {
    expect(statSync(notifier).mode & 0o111).not.toBe(0);
    const r = spawnSync("sh", ["-n", notifier], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
  });

  // macOS ps cuts its output to 79 columns with no terminal unless -ww is
  // given, and Linux ps does not, so the parse tests below cannot catch it.
  test("reads the parent's full command line", () => {
    expect(text).toContain('/bin/ps -ww -o command= -p "$PPID"');
  });

  // A passphrase or yes/no request must fail, not get an empty answer. The
  // script exits before any sound or dialog, so this is safe on the Mac too.
  for (const prompt of [undefined, "", "confirm"]) {
    test(`refuses a request that is not a touch notice: SSH_ASKPASS_PROMPT=${prompt}`, () => {
      const env = { PATH: process.env.PATH };
      if (prompt !== undefined) env.SSH_ASKPASS_PROMPT = prompt;
      const r = spawnSync(notifier, ["Enter passphrase"], { env, encoding: "utf8" });
      expect(r.status).toBe(1);
      expect(r.stderr).toBe("");
    });
  }

  // The message names the git command and the repo, from the command line of
  // the parent ssh. Off macOS, afplay and osascript are absent, so the run
  // stops after the terminal line. On the Mac this would open a dialog, so
  // it is skipped there.
  const canParse = process.platform !== "darwin" && existsSync("/bin/ps") && existsSync("/usr/bin/sed");
  const lineFor = (...sshArgs) => {
    // The parent is "sh -c <notifier>; : ssh <args>". The ":" stops sh from
    // exec'ing the notifier, so the notifier's parent shows these arguments,
    // with "ssh" as $0, as the real ssh parent would.
    const r = spawnSync("sh", ["-c", `"${notifier}"; :`, "ssh", ...sshArgs], {
      env: { PATH: process.env.PATH, SSH_ASKPASS_PROMPT: "none" },
      encoding: "utf8",
    });
    return r.stderr;
  };

  test.skipIf(!canParse)("names a push and its repo", () => {
    expect(lineFor("-p", "2222", "git@git.bck.dev", "git-receive-pack '/bkennedy/infrastructure.git'")).toContain(
      ">>> git push bkennedy/infrastructure waits for a touch.",
    );
  });

  test.skipIf(!canParse)("names a fetch in the short URL form", () => {
    expect(lineFor("git@git.bck.dev", "git-upload-pack 'bkennedy/dotfiles.git'")).toContain(
      ">>> git fetch bkennedy/dotfiles waits for a touch.",
    );
  });

  test.skipIf(!canParse)("falls back to the host for a plain ssh", () => {
    expect(lineFor("-T", "git@git.bck.dev")).toContain(">>> ssh git.bck.dev waits for a touch.");
  });
});
