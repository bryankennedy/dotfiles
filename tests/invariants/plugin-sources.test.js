// The plugin marketplace and plugins that activation and the fleet bootstrap
// merge into ~/.claude/settings.json. Both register only this repo's own
// marketplace, and every plugin in it is pinned to an upstream commit.
// docs/decisions/DOT-36.md explains why.
import { test, expect, describe } from "bun:test";
import { join } from "node:path";
import { ROOT, read, unexpectedPluginSources, unpinnedMarketplaceEntries } from "../lib/repo.js";

const MARKETPLACE = "_agent/marketplace/.claude-plugin/marketplace.json";
const PLUGINS = ["frontend-design@dotfiles"];
// The unpinned id earlier runs enabled; each script removes it.
const RETIRED = ["frontend-design@claude-plugins-official"];

export const EXPECTED = {
  "nix-darwin/flake.nix": {
    marketplaces: { dotfiles: "{ source: { source: 'directory', path: '/Users/bk/src/dotfiles/_agent/marketplace' } }" },
    plugins: PLUGINS,
    retired: RETIRED,
  },
  "remote/install.sh": {
    marketplaces: { dotfiles: "{ source: { source: 'directory', path: process.env.DOTFILES_DIR + '/_agent/marketplace' } }" },
    plugins: PLUGINS,
    retired: RETIRED,
  },
};

describe("plugin sources merged into ~/.claude/settings.json", () => {
  for (const [file, expected] of Object.entries(EXPECTED)) {
    test(`${file} registers only this repo's marketplace and its plugins`, () => {
      expect(unexpectedPluginSources(read(join(ROOT, file)), expected)).toEqual([]);
    });
  }

  test("every plugin in the marketplace is pinned to a commit", () => {
    expect(unpinnedMarketplaceEntries(read(join(ROOT, MARKETPLACE)))).toEqual([]);
  });

  test("every enabled plugin is listed in the marketplace", () => {
    const names = JSON.parse(read(join(ROOT, MARKETPLACE))).plugins.map((p) => `${p.name}@dotfiles`);
    expect(PLUGINS.filter((p) => !names.includes(p))).toEqual([]);
  });
});
