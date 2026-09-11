#!/usr/bin/env node
// audit-pins.mjs — tell me when a pinned network install has fallen behind.
//
// Three files pin code that is fetched over the network and run or unpacked
// into an agent's path:
//
//   remote/install.sh (the fleet) pins bun to an exact release tag and zoxide
//   to the commit sha of its installer script (finding 3).
//
//   nix-darwin/flake.nix (the Mac) pins its bun globals — claude-code, wrangler,
//   vite — to exact npm versions, and ghostty-font to a commit of its GitHub
//   mirror.
//
//   nix-darwin/scripts/impeccable-install.mjs pins the impeccable skill bundle
//   to a GitHub release tag (with the asset's SHA-256 checked in the script)
//   and the impeccable CLI to an npm version.
//
// Pinning stops an unreviewed install from running on every bootstrap or
// rebuild — but it also means a security fix upstream does not reach a machine
// until someone bumps the pin. A pin is a promise to watch it; this script is
// the watching. Without it, pinning just trades one blind spot for another.
//
//   node scripts/audit-pins.mjs        # status to stdout, diagnostics to stderr
//
// This does NOT judge whether a newer version fixes a CVE — osv-scanner and vulnix
// (pass 3c) answer that. This answers the prior question: are we even current? A
// pin can be both un-vulnerable today and months stale; both facts matter.
//
// herdr is deliberately absent. It cannot be version-pinned (no version arg, vendor
// URL, no git ref), so there is no pin here to drift — that residual is tracked in
// the private findings, not measured here.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const die = (m) => { console.error(`audit-pins: ${m}`); process.exit(1); };

// Extract the pins from the files that use them rather than duplicating them
// here — a second copy is a second thing to forget to update. If a shape
// changes, fail loudly instead of silently reporting a stale pin as current.
const sh = read("remote/install.sh");
const bunPin = sh.match(/bash\s+-s\s+"bun-v([0-9]+\.[0-9]+\.[0-9]+)"/)?.[1];
const zoxidePin = sh.match(/zoxide\/([0-9a-f]{40})\/install\.sh/)?.[1];
if (!bunPin) die(`could not find the bun version pin in remote/install.sh — did the install line change shape?`);
if (!zoxidePin) die(`could not find the zoxide installer-sha pin in remote/install.sh — did the install line change shape?`);

const flake = read("nix-darwin/flake.nix");
const npmPin = (pkg) => flake.match(new RegExp(`install -g ${pkg.replace(/[/@.-]/g, "\\$&")}@([0-9]+\\.[0-9]+\\.[0-9]+)`))?.[1];
const NPM_GLOBALS = ["@anthropic-ai/claude-code", "wrangler", "vite"];
const npmPins = Object.fromEntries(NPM_GLOBALS.map((p) => [p, npmPin(p)]));
for (const [p, v] of Object.entries(npmPins)) {
  if (!v) die(`could not find an exact-version pin for ${p} in nix-darwin/flake.nix — did the bun install -g line change shape, or lose its pin?`);
}
const ghosttyFontPin = flake.match(/install -g github:bryankennedy\/ghostty-font#([0-9a-f]{40})/)?.[1];
if (!ghosttyFontPin) die(`could not find the ghostty-font commit pin in nix-darwin/flake.nix — did the bun install -g line change shape, or pin a tag instead of a commit?`);

const imp = read("nix-darwin/scripts/impeccable-install.mjs");
const impSkillPin = imp.match(/SKILL_TAG\s*=\s*'skill-v([0-9]+\.[0-9]+\.[0-9]+)'/)?.[1];
const impCliPin = imp.match(/CLI_VERSION\s*=\s*'([0-9]+\.[0-9]+\.[0-9]+)'/)?.[1];
const impSha = imp.match(/BUNDLE_SHA256\s*=\s*'([0-9a-f]{64})'/)?.[1];
if (!impSkillPin) die(`could not find SKILL_TAG in nix-darwin/scripts/impeccable-install.mjs — did the constant change shape?`);
if (!impCliPin) die(`could not find CLI_VERSION in nix-darwin/scripts/impeccable-install.mjs — did the constant change shape?`);
if (!impSha) die(`could not find a 64-hex BUNDLE_SHA256 in nix-darwin/scripts/impeccable-install.mjs — the tag is pinned but the digest is not`);

const gh = async (url) => {
  const headers = { "user-agent": "audit-pins", accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
};

// npm's dist-tags endpoint is small and unauthenticated; `latest` is what a bare
// `bun install -g <pkg>` would have installed, which is exactly the drift to measure.
const npmLatest = async (pkg) => {
  const r = await fetch(`https://registry.npmjs.org/-/package/${pkg}/dist-tags`, { headers: { "user-agent": "audit-pins" } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return (await r.json()).latest || "";
};

// Each check returns a line for stdout and whether it is behind. A network failure
// is reported as "unknown", never as "current" — an unchecked pin must not read as
// a fresh one.
const checks = [
  {
    name: "bun",
    where: "remote/install.sh",
    pinned: bunPin,
    async latest() {
      const rel = await gh("https://api.github.com/repos/oven-sh/bun/releases/latest");
      return (rel.tag_name || "").replace(/^bun-v/, "");
    },
    kind: "version",
  },
  {
    name: "zoxide",
    where: "remote/install.sh",
    pinned: zoxidePin.slice(0, 10),
    async latest() {
      const commits = await gh("https://api.github.com/repos/ajeetdsouza/zoxide/commits?path=install.sh&per_page=1");
      return (commits?.[0]?.sha || "").slice(0, 10);
    },
    kind: "installer-sha",
  },
  ...NPM_GLOBALS.map((pkg) => ({
    name: pkg.replace(/^@anthropic-ai\//, ""),
    where: "nix-darwin/flake.nix",
    pinned: npmPins[pkg],
    latest: () => npmLatest(pkg),
    kind: "version",
  })),
  {
    name: "ghostty-font",
    where: "nix-darwin/flake.nix",
    pinned: ghosttyFontPin.slice(0, 10),
    async latest() {
      // The newest release is the highest vX.Y.Z tag; compare the commit it
      // names, since the pin is a commit. No tags yet reads as unknown.
      const tags = await gh("https://api.github.com/repos/bryankennedy/ghostty-font/tags?per_page=100");
      const semver = (t) => t.name.match(/^v(\d+)\.(\d+)\.(\d+)$/)?.slice(1).map(Number);
      const newest = tags
        .filter(semver)
        .sort((x, y) => semver(y).reduce((d, n, i) => d || n - semver(x)[i], 0))[0];
      return (newest?.commit?.sha || "").slice(0, 10);
    },
    kind: "commit",
  },
  {
    name: "impeccable-skill",
    where: "nix-darwin/scripts/impeccable-install.mjs",
    pinned: impSkillPin,
    async latest() {
      // The repo tags skill, CLI and engine releases independently, so
      // releases/latest can point at any of them; scan for the newest skill-v*.
      const rels = await gh("https://api.github.com/repos/pbakaus/impeccable/releases?per_page=30");
      const tag = rels.map((r) => r.tag_name || "").find((t) => t.startsWith("skill-v"));
      return (tag || "").replace(/^skill-v/, "");
    },
    kind: "version",
  },
  {
    name: "impeccable-cli",
    where: "nix-darwin/scripts/impeccable-install.mjs",
    pinned: impCliPin,
    latest: () => npmLatest("impeccable"),
    kind: "version",
  },
];

let behind = 0, unknown = 0;
const rows = [];
for (const c of checks) {
  let latest, status;
  try {
    latest = await c.latest();
    if (!latest) { status = "unknown"; unknown++; }
    else status = latest === c.pinned ? "current" : "BEHIND"; // sha/commit: any change = the code we run moved
    if (status === "BEHIND") behind++;
  } catch (e) {
    latest = `(${e.message})`;
    status = "unknown";
    unknown++;
  }
  rows.push({ name: c.name, where: c.where, kind: c.kind, pinned: c.pinned, latest, status });
}

const w = (s, n) => String(s).padEnd(n);
console.error(`audit-pins: read ${checks.length} pins from remote/install.sh, nix-darwin/flake.nix and nix-darwin/scripts/impeccable-install.mjs`);
for (const r of rows) {
  console.log(`${w(r.status, 8)} ${w(r.name, 17)} ${w(r.kind, 14)} pinned=${w(r.pinned, 12)} latest=${w(r.latest, 12)} ${r.where}`);
}

if (behind) console.error(`audit-pins: ${behind} pin(s) BEHIND upstream. Read the diff, then bump in the file named on the line.`);
if (unknown) console.error(`audit-pins: ${unknown} pin(s) could not be checked (network?). Not the same as current.`);
if (!behind && !unknown) console.error(`audit-pins: all pins current.`);

// Exit 2 == at least one pin is behind (actionable). Exit 3 == a check failed and
// the answer is genuinely unknown. Exit 0 == everything current. The audit's deps
// pass distinguishes "current" from "could not tell".
process.exit(behind ? 2 : unknown ? 3 : 0);
