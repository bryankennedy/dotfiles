// INFRA-320: forge repos on the Mac run bin/bin/forge-ssh. For the forge, it
// runs the nix OpenSSH with BatchMode and sets bin/bin/fido-touch-notify as
// SSH_ASKPASS. ssh then runs the notifier each time the FIDO key waits for a
// touch. Another remote goes straight to the nix OpenSSH. Ansible on the Mac
// runs bin/bin/fido-ssh, which sets the notifier with no BatchMode
// (INFRA-320b).
// Addresses here are from the documentation range 192.0.2.0/24.
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT } from "../lib/repo.js";

const BIN = join(ROOT, "bin/bin");
const notifier = join(BIN, "fido-touch-notify");
const SSH_LINE = "ssh=/run/current-system/sw/bin/ssh";
const wrappers = ["forge-ssh", "fido-ssh"];

// Each wrapper names the nix OpenSSH by its full path (INFRA-321), so the
// tests run copies whose only change is that path, pointed at a stub. The
// stub prints what the real ssh would get.
let dir;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "fido-ssh-"));
  const stub = join(dir, "ssh-stub");
  writeFileSync(
    stub,
    // `ssh -G` prints the config that the test gives in STUB_G (INFRA-381).
    '#!/bin/sh\n[ "$1" = -G ] && { printf "%s\\n" "$STUB_G"; exit 0; }\nfor v in SSH_ASKPASS SSH_ASKPASS_REQUIRE SSH_ASKPASS_PROMPT FIDO_SSH_DEST FIDO_SSH_MODE WAYLAND_DISPLAY DISPLAY; do eval "printf \\"%s=%s\\\\n\\" $v \\"\\${$v-unset}\\""; done\nfor a in "$@"; do printf "ARG=%s\\n" "$a"; done\n',
  );
  chmodSync(stub, 0o755);
  // The wrapper runs ssh-keygen from the directory of its ssh. This one
  // finds a host key only for the name in STUB_KNOWN, in the file given. It
  // opens each key file with an empty passphrase except STUB_ENCRYPTED.
  const keygen = join(dir, "ssh-keygen");
  writeFileSync(
    keygen,
    '#!/bin/sh\n[ "$1" = -y ] && { [ "$5" != "$STUB_ENCRYPTED" ]; exit; }\n[ "$1" = -F ] && [ "$2" = "$STUB_KNOWN" ] && [ "$4" = "$STUB_KNOWN_FILE" ]\n',
  );
  chmodSync(keygen, 0o755);
  for (const w of wrappers) {
    const text = readFileSync(join(BIN, w), "utf8");
    writeFileSync(join(dir, w), text.replace(SSH_LINE, `ssh=${stub}`));
    chmodSync(join(dir, w), 0o755);
  }
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const run = (wrapper, args, extraEnv = {}) => {
  const r = spawnSync(join(dir, wrapper), args, { env: { PATH: process.env.PATH, ...extraEnv }, encoding: "utf8" });
  expect(r.status, r.stderr).toBe(0);
  const out = r.stdout.trim().split("\n");
  const val = (k) => out.find((l) => l.startsWith(`${k}=`)).slice(k.length + 1);
  return {
    askpass: val("SSH_ASKPASS"),
    require: val("SSH_ASKPASS_REQUIRE"),
    prompt: val("SSH_ASKPASS_PROMPT"),
    dest: val("FIDO_SSH_DEST"),
    wayland: val("WAYLAND_DISPLAY"),
    display: val("DISPLAY"),
    mode: val("FIDO_SSH_MODE"),
    args: out.filter((l) => l.startsWith("ARG=")).map((l) => l.slice(4)),
  };
};

for (const w of wrappers) {
  test(`${w} is an executable sh script with valid syntax, and names the nix OpenSSH once`, () => {
    const p = join(BIN, w);
    expect(statSync(p).mode & 0o111).not.toBe(0);
    const r = spawnSync("sh", ["-n", p], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(p, "utf8").split(SSH_LINE).length).toBe(2);
  });
}

describe("bin/bin/forge-ssh", () => {
  for (const host of ["git@git.bck.dev", "git.bck.dev"]) {
    test(`gives the forge BatchMode and the notifier: ${host}`, () => {
      const args = ["-o", "SendEnv=GIT_PROTOCOL", "-p", "2222", host, "git-upload-pack '/bkennedy/x.git'"];
      const r = run("forge-ssh", args, { SSH_ASKPASS_PROMPT: "none" });
      expect(r.args).toEqual(["-o", "BatchMode=yes", ...args]);
      expect(r.askpass).toBe(join(dir, "fido-touch-notify"));
      expect(r.require).toBe("force");
      // An inherited value would let a passphrase or PIN request through.
      expect(r.prompt).toBe("unset");
      expect(r.dest).toBe(host);
    });
  }

  for (const args of [
    ["-o", "SendEnv=GIT_PROTOCOL", "git@github.com", "git-upload-pack 'owner/repo.git'"],
    // A repo path that holds the host name is not a connection to the forge.
    ["git@github.com", "git-upload-pack 'owner/git.bck.dev.git'"],
  ]) {
    test(`passes another remote straight through: ${args.join(" ")}`, () => {
      const r = run("forge-ssh", args);
      expect(r.args).toEqual(args);
      expect(r.askpass).toBe("unset");
      expect(r.require).toBe("unset");
      expect(r.dest).toBe("unset");
    });
  }
});

describe("bin/bin/fido-ssh", () => {
  // The shape of an Ansible connection: options with values, then the host,
  // then the remote command.
  const ansibleArgs = ["-C", "-o", "ControlMaster=auto", "-o", "ControlPath=/tmp/cp", "-l", "bkennedy", "192.0.2.10", "/bin/sh -c 'echo ok'"];

  test("sets the notifier and a display name, and adds no BatchMode and no SSH_ASKPASS_REQUIRE", () => {
    const r = run("fido-ssh", ansibleArgs, { SSH_ASKPASS_PROMPT: "none" });
    // A password, passphrase or host key question must still reach the terminal.
    expect(r.args).toEqual(ansibleArgs);
    expect(r.askpass).toBe(join(dir, "fido-touch-notify"));
    expect(r.require).toBe("unset");
    expect(r.prompt).toBe("unset");
    expect(r.wayland).toBe("fido-ssh");
    expect(r.dest).toBe("192.0.2.10");
  });

  test("keeps a display that is already set", () => {
    const r = run("fido-ssh", ansibleArgs, { DISPLAY: ":0" });
    expect(r.display).toBe(":0");
    expect(r.wayland).toBe("unset");
  });

  test("leaves another tool's askpass alone, such as Ansible's password helper", () => {
    const r = run("fido-ssh", ansibleArgs, { SSH_ASKPASS: "/opt/other-askpass" });
    expect(r.args).toEqual(ansibleArgs);
    expect(r.askpass).toBe("/opt/other-askpass");
    expect(r.wayland).toBe("unset");
    expect(r.dest).toBe("unset");
  });

  for (const [args, dest] of [
    [["-tt", "-p2222", "user@192.0.2.11", "true"], "user@192.0.2.11"],
    [["-vvv", "-i", "/tmp/key", "-J", "jump.example", "host.example"], "host.example"],
    [["-T", "-W", "192.0.2.12:22", "-p", "22", "relay.example"], "relay.example"],
    [["-vp", "2222", "host.example"], "host.example"],
    [["-Cl", "bkennedy", "192.0.2.13", "true"], "192.0.2.13"],
    [["-oUser=bob", "-oControlMaster=no", "host.example"], "host.example"],
    [["ssh://192.0.2.14:2222"], "192.0.2.14:2222"],
    // A value attached inside a cluster skips nothing.
    [["-vE/tmp/log", "host.example", "true"], "host.example"],
    [["-4i/tmp/key", "host.example"], "host.example"],
    [["-o", "User=bob", "host.example"], "host.example"],
  ]) {
    test(`finds the host in: ${args.join(" ")}`, () => {
      expect(run("fido-ssh", args).dest).toBe(dest);
    });
  }
});

describe("zsh/profile.zsh", () => {
  test("points Ansible at fido-ssh, only where the wrapper is linked", () => {
    const text = readFileSync(join(ROOT, "zsh/profile.zsh"), "utf8");
    expect(text).toContain('-x "$HOME/bin/fido-ssh"');
    expect(text).toContain('export ANSIBLE_SSH_EXECUTABLE="$HOME/bin/fido-ssh"');
  });
});

// INFRA-381: an ssh typed in an interactive zsh runs fido-ssh in shell mode.
// The wrapper adds BatchMode and the notifier only when ssh needs no prompt
// that BatchMode stops. Otherwise the arguments and environment stay as they
// are.
describe("bin/bin/fido-ssh in shell mode", () => {
  // Made at collection time, because the case table below names these paths.
  const keys = mkdtempSync(join(tmpdir(), "fido-keys-"));
  writeFileSync(join(keys, "sk.pub"), "sk-ssh-ed25519@openssh.com AAAA test\n");
  writeFileSync(join(keys, "plain.pub"), "ssh-ed25519 AAAA test\n");
  writeFileSync(join(keys, "known_hosts"), "");
  afterAll(() => rmSync(keys, { recursive: true, force: true }));

  // The shape of `ssh -G` output for a host with one FIDO key.
  const config = (over = {}) => {
    const lines = {
      hostname: "lab.example",
      port: "22",
      batchmode: "no",
      proxycommand: "none",
      identityfile: [join(keys, "sk")],
      globalknownhostsfile: "/nonexistent/ssh_known_hosts",
      userknownhostsfile: join(keys, "known_hosts"),
      ...over,
    };
    return Object.entries(lines)
      .flatMap(([k, v]) => (v === undefined ? [] : [v].flat().map((x) => `${k} ${x}`)))
      .join("\n");
  };
  const shell = (args, { g = config(), known = "lab.example", knownFile, encrypted = "", env = {} } = {}) =>
    run("fido-ssh", args, {
      FIDO_SSH_MODE: "shell",
      SSH_ASKPASS_PROMPT: "none",
      STUB_G: g,
      STUB_KNOWN: known,
      STUB_KNOWN_FILE: knownFile ?? join(keys, "known_hosts"),
      STUB_ENCRYPTED: encrypted,
      ...env,
    });

  test("adds BatchMode and the notifier for a FIDO-only host with a known host key", () => {
    const args = ["-t", "bk@lab", "uptime"];
    const r = shell(args);
    expect(r.args).toEqual(["-o", "BatchMode=yes", ...args]);
    expect(r.askpass).toBe(join(dir, "fido-touch-notify"));
    expect(r.require).toBe("force");
    expect(r.prompt).toBe("unset");
    expect(r.dest).toBe("bk@lab");
    expect(r.mode).toBe("unset");
    expect(r.wayland).toBe("unset");
  });

  test("looks up a host key on another port as [host]:port", () => {
    expect(shell(["lab"], { g: config({ port: "2222" }), known: "[lab.example]:2222" }).args[1]).toBe("BatchMode=yes");
  });

  test("looks up the host key by HostKeyAlias when set", () => {
    expect(shell(["lab"], { g: config({ hostkeyalias: "alias.example" }), known: "alias.example" }).args[1]).toBe("BatchMode=yes");
  });

  test("looks up a HostKeyAlias with no port, as ssh does", () => {
    const g = config({ hostkeyalias: "alias.example", port: "2222" });
    expect(shell(["lab"], { g, known: "alias.example" }).args[1]).toBe("BatchMode=yes");
  });

  test("does not pass the mode on when another askpass is set", () => {
    const r = shell(["lab"], { env: { SSH_ASKPASS: "/opt/other-askpass" } });
    expect(r.args).toEqual(["lab"]);
    expect(r.askpass).toBe("/opt/other-askpass");
    expect(r.mode).toBe("unset");
  });

  test("reads a user known_hosts file that starts with ~/", () => {
    const g = config({ userknownhostsfile: "~/known_hosts" });
    const r = spawnSync(join(dir, "fido-ssh"), ["lab"], {
      env: { PATH: process.env.PATH, HOME: keys, FIDO_SSH_MODE: "shell", STUB_G: g, STUB_KNOWN: "lab.example", STUB_KNOWN_FILE: join(keys, "known_hosts") },
      encoding: "utf8",
    });
    expect(r.stdout).toContain("ARG=BatchMode=yes");
  });

  for (const [why, args, opts] of [
    ["a key that is not a FIDO key", ["lab"], { g: config({ identityfile: [join(keys, "sk"), join(keys, "plain")] }) }],
    ["a key with no .pub file", ["lab"], { g: config({ identityfile: join(keys, "missing") }) }],
    ["no identity file", ["lab"], { g: config({ identityfile: undefined }) }],
    ["an unknown host key", ["lab"], { known: "other.example" }],
    ["a jump host", ["-J", "jump", "lab"], { g: config({ proxyjump: "jump" }) }],
    ["a proxy command", ["lab"], { g: config({ proxycommand: "nc %h %p" }) }],
    ["BatchMode from the config", ["lab"], { g: config({ batchmode: "yes" }) }],
    ["BatchMode on the command line", ["-o", "batchmode=no", "lab"], {}],
    ["a key handle file with a passphrase", ["lab"], { encrypted: join(keys, "sk") }],
    ["no host", ["-V"], {}],
    // -v first, so the stub prints what it got and does not answer as -G.
    ["a config query", ["-v", "-G", "lab"], {}],
    ["a control command", ["-O", "exit", "lab"], {}],
    ["-G in a flag cluster", ["-NG", "lab"], {}],
  ]) {
    test(`runs ssh with no change for ${why}`, () => {
      const r = shell(args, opts);
      expect(r.args).toEqual(args);
      expect(r.askpass).toBe("unset");
      expect(r.require).toBe("unset");
      expect(r.dest).toBe("unset");
      expect(r.mode).toBe("unset");
      expect(r.wayland).toBe("unset");
    });
  }

  test("zsh/aliases-macos.zsh sends ssh to fido-ssh in shell mode, only where the wrapper is linked", () => {
    const text = readFileSync(join(ROOT, "zsh/aliases-macos.zsh"), "utf8");
    expect(text).toContain('if [[ -x "$HOME/bin/fido-ssh" && -x /run/current-system/sw/bin/ssh ]]; then\n  ssh() { FIDO_SSH_MODE=shell "$HOME/bin/fido-ssh" "$@"; }\nfi');
  });
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
  // the parent ssh, or else the host that fido-ssh exported. Off macOS,
  // afplay and osascript are absent, so the run stops after the terminal
  // line. On the Mac this would open a dialog, so it is skipped there.
  const canParse = process.platform !== "darwin" && existsSync("/bin/ps") && existsSync("/usr/bin/sed");
  // The host text needs tr only: with no ps, the notifier still reads the
  // exported host.
  const canName = process.platform !== "darwin" && existsSync("/usr/bin/sed") && existsSync("/usr/bin/tr");
  const lineFor = (sshArgs, extraEnv = {}) => {
    // The parent is "sh -c <notifier>; : ssh <args>". The ":" stops sh from
    // exec'ing the notifier, so the notifier's parent shows these arguments,
    // with "ssh" as $0, as the real ssh parent would.
    const r = spawnSync("sh", ["-c", `"${notifier}"; :`, "ssh", ...sshArgs], {
      env: { PATH: process.env.PATH, SSH_ASKPASS_PROMPT: "none", ...extraEnv },
      encoding: "utf8",
    });
    return r.stderr;
  };

  test.skipIf(!canParse)("names a push and its repo", () => {
    expect(lineFor(["-p", "2222", "git@git.bck.dev", "git-receive-pack '/bkennedy/infrastructure.git'"])).toContain(
      ">>> git push bkennedy/infrastructure waits for a touch.",
    );
  });

  test.skipIf(!canParse)("names a fetch in the short URL form", () => {
    expect(lineFor(["git@git.bck.dev", "git-upload-pack 'bkennedy/dotfiles.git'"])).toContain(
      ">>> git fetch bkennedy/dotfiles waits for a touch.",
    );
  });

  test.skipIf(!canName)("names the host that fido-ssh exported, without the user", () => {
    expect(lineFor(["-l", "bkennedy", "192.0.2.10", "/bin/sh -c 'true'"], { FIDO_SSH_DEST: "bkennedy@192.0.2.10" })).toContain(
      ">>> ssh to 192.0.2.10 waits for a touch.",
    );
  });

  test.skipIf(!canName)("keeps only host-name characters from the exported host", () => {
    // tr drops "$", "(", ")", " " and "/", so nothing in the value can act as code.
    expect(lineFor(["x"], { FIDO_SSH_DEST: "evil$(touch /tmp/x)host" })).toContain(">>> ssh to eviltouchtmpxhost waits for a touch.");
  });

  test.skipIf(!canName)("falls back to a plain text with no host", () => {
    expect(lineFor(["-T", "x"])).toContain(">>> An SSH login waits for a touch.");
  });
});
