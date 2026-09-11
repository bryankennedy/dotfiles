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
// The inventory's layout has moved under this script once already: group
// variables went from group_vars/all.yml to group_vars/all/vars.yml, and the
// script stopped at the missing file. That was the right failure, since it said
// so, but pass 1b could not run at all until someone noticed. So every source is
// checked, and a layout the script cannot parse is an exit 1, never a short list.
//
//   node scripts/audit-topology.mjs            # terms to stdout, diagnostics to stderr
//
// Exit 1 means the deny-list is untrustworthy. Do not proceed with pass 1b.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";

// The private inventory, inside the infrastructure monorepo. Overridable with
// HERDR_FLEET_ANSIBLE_DIR — the same variable `hf` reads — so a future move of
// that repo is one export away rather than an edit in several repos.
const ANSIBLE_DIR =
  process.env.HERDR_FLEET_ANSIBLE_DIR || `${homedir()}/src/infrastructure/ansible`;
const INV = `${ANSIBLE_DIR}/inventory`;
const HOSTS = `${INV}/hosts.yml`;
const ALL = `${INV}/group_vars/all/vars.yml`;
const HOST_VARS = `${INV}/host_vars`;

const die = (msg) => { console.error(`audit-topology: ${msg}`); process.exit(1); };

for (const f of [HOSTS, ALL]) if (!existsSync(f)) die(`cannot read ${f} — the private inventory is the deny-list's only source`);

// Per-host variables can live in host_vars/<host>.yml or host_vars/<host>/*.yml.
// None carries the keys below today, but a value moved there would otherwise drop
// out of the deny-list without a word.
const hosts = readFileSync(HOSTS, "utf8");
const hostVarFiles = existsSync(HOST_VARS)
  ? readdirSync(HOST_VARS, { recursive: true }).filter((f) => /\.ya?ml$/.test(f))
  : [];
const sources = [hosts, ...hostVarFiles.map((f) => readFileSync(`${HOST_VARS}/${f}`, "utf8"))];

// Values that identify the fleet: hostnames, accounts, proxy hostnames. A
// multi-label name also adds its registrable domain; an IP address does not,
// because its last two octets are not a name anyone would search for.
const values = new Set();
for (const src of sources)
  for (const m of src.matchAll(/^\s*(?:ansible_host|ansible_user|herdr_user|gh_host):\s*["']?([^\s"'#]+)/gm))
    values.add(m[1]);
for (const v of [...values]) {
  const p = v.split(".");
  if (p.length > 2 && !/^\d+$/.test(p.at(-1))) values.add(p.slice(-2).join("."));
}

// Inventory host names: the keys directly under each `hosts:` block. They are
// how the lab names its machines, and most never appear as a value above, so a
// search built from values alone would miss a host name in a commit. Keys are
// read at the first indentation below `hosts:`, which skips the variables
// nested inside each host.
const names = new Set();
const lines = hosts.split("\n");
const indent = (l) => l.match(/^ */)[0].length;
for (let i = 0; i < lines.length; i++) {
  if (!/^\s*hosts:\s*(#.*)?$/.test(lines[i])) continue;
  const base = indent(lines[i]);
  let child = -1;
  for (let j = i + 1; j < lines.length; j++) {
    const l = lines[j];
    if (!l.trim() || l.trim().startsWith("#")) continue;
    const d = indent(l);
    if (d <= base) break;
    if (child < 0) child = d;
    const key = d === child && l.match(/^\s*([A-Za-z0-9_.-]+):/);
    if (key) names.add(key[1]);
  }
}
if (!names.size) die(`found no host names under any \`hosts:\` block in ${HOSTS} — the inventory layout is not what this script parses`);

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

// Every declared account must survive into the deny-list through an account key.
// Checked against the values alone, so a host that happens to share an account's
// name cannot stand in for the key that should carry it.
const missing = accounts.filter((a) => !values.has(a));
if (missing.length) {
  die(`${missing.length} declared login account(s) are absent from the derived deny-list.\n` +
      `  The inventory declares them in fleet_login_accounts but no ansible_user /\n` +
      `  herdr_user key carries them, so pass 1b would never search for them.\n` +
      `  Fix the inventory, not this script.`);
}

const terms = new Set([...values, ...names]);

// A count of zero and a scan of zero things are not the same claim, so say what
// we found. Values go to stdout; everything a human reads goes to stderr, so the
// caller can pipe stdout into the search loop.
const hostCount = (hosts.match(/^\s*ansible_host:/gm) ?? []).length;
console.error(`audit-topology: ${terms.size} terms (${values.size} from inventory values, ` +
              `${names.size} inventory host names) from ${hostCount} hosts and ` +
              `${hostVarFiles.length} host_vars file(s); ${accounts.length} declared login ` +
              `account(s), all present in the deny-list`);

[...terms].filter(Boolean).forEach((t) => console.log(t));
