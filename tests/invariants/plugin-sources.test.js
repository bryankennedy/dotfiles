// The plugin marketplace and plugins that activation and the fleet bootstrap
// merge into ~/.claude/settings.json. Claude Code cannot pin a marketplace to a
// commit, so the one registered here is an accepted risk in
// docs/security-baseline.md; this holds it to exactly what was accepted.
// docs/decisions/DOT-24.md explains why.
import { test, expect, describe } from "bun:test";
import { join } from "node:path";
import { ROOT, read, unacceptedPluginSources } from "../lib/repo.js";

// Change these only together with the baseline entry "The official plugin
// marketplace is registered without a commit pin".
export const ACCEPTED = {
  marketplaces: {
    "claude-plugins-official": "{ source: { source: 'github', repo: 'anthropics/claude-plugins-official' } }",
  },
  plugins: ["frontend-design@claude-plugins-official"],
};

describe("plugin sources merged into ~/.claude/settings.json", () => {
  for (const file of ["nix-darwin/flake.nix", "remote/install.sh"]) {
    test(`${file} registers only the accepted marketplace and plugins`, () => {
      expect(unacceptedPluginSources(read(join(ROOT, file)), ACCEPTED)).toEqual([]);
    });
  }
});
