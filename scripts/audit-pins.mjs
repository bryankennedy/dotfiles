#!/usr/bin/env node
// audit-pins.mjs — tell me when a pinned network installer has fallen behind.
//
// remote/install.sh fetches bun and zoxide over HTTPS and pipes them to a shell.
// Both are pinned (finding 3): bun to an exact release tag, zoxide to the commit
// sha of its installer script. Pinning stops an unreviewed installer from running
// on every bootstrap — but it also means a security fix upstream does not reach
// the fleet until someone bumps the pin. A pin is a promise to watch it; this
// script is the watching. Without it, pinning just trades one blind spot for
// another.
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
const INSTALL = path.join(ROOT, "remote/install.sh");

const sh = readFileSync(INSTALL, "utf8");
const die = (m) => { console.error(`audit-pins: ${m}`); process.exit(1); };

// Extract the pins from the installer rather than duplicating them here — a second
// copy is a second thing to forget to update. If the shape changes, fail loudly
// instead of silently reporting a stale pin as current.
const bunPin = sh.match(/bash\s+-s\s+"bun-v([0-9]+\.[0-9]+\.[0-9]+)"/)?.[1];
const zoxidePin = sh.match(/zoxide\/([0-9a-f]{40})\/install\.sh/)?.[1];
if (!bunPin) die(`could not find the bun version pin in remote/install.sh — did the install line change shape?`);
if (!zoxidePin) die(`could not find the zoxide installer-sha pin in remote/install.sh — did the install line change shape?`);

const gh = async (url) => {
  const headers = { "user-agent": "audit-pins", accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
};

// Each check returns a line for stdout and whether it is behind. A network failure
// is reported as "unknown", never as "current" — an unchecked pin must not read as
// a fresh one.
const checks = [
  {
    name: "bun",
    pinned: bunPin,
    async latest() {
      const rel = await gh("https://api.github.com/repos/oven-sh/bun/releases/latest");
      return (rel.tag_name || "").replace(/^bun-v/, "");
    },
    kind: "version",
  },
  {
    name: "zoxide",
    pinned: zoxidePin.slice(0, 10),
    async latest() {
      const commits = await gh("https://api.github.com/repos/ajeetdsouza/zoxide/commits?path=install.sh&per_page=1");
      return (commits?.[0]?.sha || "").slice(0, 10);
    },
    kind: "installer-sha",
  },
];

let behind = 0, unknown = 0;
const rows = [];
for (const c of checks) {
  let latest, status;
  try {
    latest = await c.latest();
    if (!latest) { status = "unknown"; unknown++; }
    else if (c.kind === "version") status = latest === c.pinned ? "current" : "BEHIND";
    else status = latest === c.pinned ? "current" : "BEHIND"; // sha: any change = the script we run moved
    if (status === "BEHIND") behind++;
  } catch (e) {
    latest = `(${e.message})`;
    status = "unknown";
    unknown++;
  }
  rows.push({ name: c.name, kind: c.kind, pinned: c.pinned, latest, status });
}

const w = (s, n) => String(s).padEnd(n);
console.error(`audit-pins: read pins from remote/install.sh — bun ${bunPin}, zoxide ${zoxidePin.slice(0, 10)}`);
for (const r of rows) {
  console.log(`${w(r.status, 8)} ${w(r.name, 8)} ${w(r.kind, 14)} pinned=${w(r.pinned, 12)} latest=${r.latest}`);
}

if (behind) console.error(`audit-pins: ${behind} pin(s) BEHIND upstream. Read the diff, then bump in remote/install.sh.`);
if (unknown) console.error(`audit-pins: ${unknown} pin(s) could not be checked (network?). Not the same as current.`);
if (!behind && !unknown) console.error(`audit-pins: all pins current.`);

// Exit 2 == at least one pin is behind (actionable). Exit 3 == a check failed and
// the answer is genuinely unknown. Exit 0 == everything current. The audit's deps
// pass distinguishes "current" from "could not tell".
process.exit(behind ? 2 : unknown ? 3 : 0);
