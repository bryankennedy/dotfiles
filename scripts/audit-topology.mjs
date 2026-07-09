#!/usr/bin/env node
// audit-topology.mjs — build the exposure pass's deny-list, and refuse to hand
// back a list that cannot do its job.
//
// Pass 1b searches this public repo for every private hostname and login account
// in the fleet. Those strings are the private data, so they are not written here;
// they are derived at run time from the private ansible inventory.
//
// The derivation used to be implicit: whatever `ansible_user` / `herdr_user` /
// `gh_host` keys happened to exist. That failed silently. `ansible_user` named a
// person rather than the account the fleet actually logs in as — the hosting
// edge maps any SSH username to a single service account — so the deny-list was
// searching for a name that is not an account anywhere. The real account appeared
// only because two hosts carried a `herdr_user` the herdr role never needed.
// Deleting that redundancy as dead config would have stopped this pass looking
// for the fleet's actual login name, while printing exactly what a clean run
// prints.
//
// So the inventory now declares `fleet_login_accounts` as a contract, and this
// script enforces it. A contract nobody checks is just a comment.
//
//   node scripts/audit-topology.mjs            # terms to stdout, diagnostics to stderr
//
// Exit 1 means the deny-list is untrustworthy. Do not proceed with pass 1b.

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";

const INV = `${homedir()}/src/ansible/inventory`;
const HOSTS = `${INV}/hosts.yml`;
const ALL = `${INV}/group_vars/all.yml`;

const die = (msg) => { console.error(`audit-topology: ${msg}`); process.exit(1); };

for (const f of [HOSTS, ALL]) if (!existsSync(f)) die(`cannot read ${f} — the private inventory is the deny-list's only source`);

// Values that identify the fleet: hostnames, accounts, proxy hostnames.
const hosts = readFileSync(HOSTS, "utf8");
const terms = new Set();
for (const m of hosts.matchAll(/^\s*(?:ansible_host|ansible_user|herdr_user|gh_host):\s*(\S+)/gm)) terms.add(m[1]);
for (const v of [...terms]) { const p = v.split("."); if (p.length > 2) terms.add(p.slice(-2).join(".")); }

// The contract: accounts that exist anywhere on the fleet.
const all = readFileSync(ALL, "utf8");
const block = all.match(/^fleet_login_accounts:\s*\n((?:\s*-\s*\S+\s*\n)+)/m);
if (!block) {
  die(`fleet_login_accounts is not declared in ${ALL}.\n` +
      `  Without it this pass cannot tell a deny-list that is complete from one\n` +
      `  that silently lost the fleet's login account. Declare every account that\n` +
      `  can log in to any managed host, then re-run.`);
}
const accounts = [...block[1].matchAll(/-\s*(\S+)/g)].map((m) => m[1]);
if (!accounts.length) die(`fleet_login_accounts is declared but empty in ${ALL}`);

// Every declared account must survive into the deny-list. If one does not, the
// inventory keys this script reads no longer carry it, and pass 1b would stop
// searching for it without saying so.
const missing = accounts.filter((a) => !terms.has(a));
if (missing.length) {
  die(`${missing.length} declared login account(s) are absent from the derived deny-list.\n` +
      `  The inventory declares them in fleet_login_accounts but no ansible_user /\n` +
      `  herdr_user key carries them, so pass 1b would never search for them.\n` +
      `  Fix the inventory, not this script.`);
}

// A count of zero and a scan of zero things are not the same claim, so say what
// we found. Values go to stdout; everything a human reads goes to stderr, so the
// caller can pipe stdout into the search loop.
const hostCount = (hosts.match(/^\s*ansible_host:/gm) ?? []).length;
console.error(`audit-topology: ${terms.size} terms from ${hostCount} hosts; ` +
              `${accounts.length} declared login account(s), all present in the deny-list`);

[...terms].filter(Boolean).forEach((t) => console.log(t));
