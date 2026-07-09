#!/usr/bin/env node
// audit-mcp.mjs — enumerate every MCP server that can reach an agent's context.
//
// An MCP server's *tool descriptions* are injected into the model's context, so a
// hostile or compromised server is a direct prompt-injection vector — it does not
// need the model to call a tool, only to read one.
//
// The obvious check, `grep mcpServers ~/.claude/settings.json`, is the wrong one.
// Nothing is declared there on this machine, and the audit concluded "no MCP
// servers" for months while five remote servers were live. They arrive through
// `enabledPlugins`: a plugin ships its own .mcp.json, and enabling the plugin
// enables its servers. Enumerate both sources.
//
//   node scripts/audit-mcp.mjs

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const H = homedir();
const read = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const describe = (c) => (c.url ? `remote  ${c.url}` : `local   ${c.command ?? "?"}`);

const found = [];

// 1. Declared directly, in user or project config.
for (const p of [`${H}/.claude/settings.json`, `${H}/.claude/settings.local.json`, `${H}/.claude.json`, `${H}/.mcp.json`, ".mcp.json"]) {
  const j = read(p);
  for (const [server, cfg] of Object.entries(j?.mcpServers ?? {}))
    found.push({ src: p.replace(H, "~"), server, transport: describe(cfg) });
}

// 2. Contributed by enabled plugins. This is the source the old check missed.
const settings = read(`${H}/.claude/settings.json`) ?? {};
const enabled = Object.entries(settings.enabledPlugins ?? {}).filter(([, on]) => on).map(([spec]) => spec);

for (const spec of enabled) {
  const [plugin, marketplace] = spec.split("@");
  // cache/<marketplace>/<plugin>/<version>/.mcp.json, and the marketplace checkout itself
  const roots = [`${H}/.claude/plugins/cache/${marketplace}/${plugin}`, `${H}/.claude/plugins/marketplaces/${marketplace}`];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const candidates = [path.join(root, ".mcp.json")];
    try { for (const v of readdirSync(root)) candidates.push(path.join(root, v, ".mcp.json")); } catch {}
    for (const c of candidates) {
      const j = read(c);
      for (const [server, cfg] of Object.entries(j?.mcpServers ?? {}))
        found.push({ src: `plugin ${spec}`, server, transport: describe(cfg) });
    }
  }
}

const seen = new Set();
const uniq = found.filter((f) => { const k = f.src + f.server; if (seen.has(k)) return false; seen.add(k); return true; });

console.log(`enabled plugins: ${enabled.length ? enabled.join(", ") : "none"}`);
console.log(`declared mcpServers in settings: ${found.filter((f) => f.src.startsWith("~") || f.src === ".mcp.json").length}`);
console.log("");

if (!uniq.length) { console.log("no MCP servers reachable by agents on this machine"); process.exit(0); }

console.log(`MCP servers reachable by agents on this machine: ${uniq.length}`);
for (const f of uniq) console.log(`  ${f.server.padEnd(26)} ${f.transport.padEnd(50)} via ${f.src}`);
console.log("");
console.log("Each remote server is a third party whose tool descriptions enter the model's");
console.log("context on every session. Judge them as you would a dependency, not as config:");
console.log("who controls the endpoint, and what would a malicious description make an agent do?");
