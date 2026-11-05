// The Mac's Homebrew taps are pinned in nix-darwin/flake.lock and put in place
// read-only (DOT-41). "The Homebrew taps are pinned in flake.lock" in
// docs/security-baseline.md explains why. This fails if a tap is declared
// outside that shape.
import { test, expect, describe } from "bun:test";
import { join } from "node:path";
import { ROOT, read, tapPinProblems } from "../lib/repo.js";

const FLAKE = read(join(ROOT, "nix-darwin/flake.nix"));
const LOCK = read(join(ROOT, "nix-darwin/flake.lock"));
const BASELINE = read(join(ROOT, "docs/security-baseline.md"));

describe("Homebrew taps", () => {
  test("every tap is a pinned, read-only flake input", () => {
    const [bad, names] = tapPinProblems(FLAKE, LOCK);
    expect(bad).toEqual([]);
    expect(names.length).toBeGreaterThan(0);
  });

  test("the baseline's pin table names every tap", () => {
    const [, names] = tapPinProblems(FLAKE, LOCK);
    const entry = BASELINE.split("### The Homebrew taps are pinned in `flake.lock`")[1]?.split("\n### ")[0] ?? "";
    const lower = entry.toLowerCase();
    for (const n of names) expect(lower, n).toContain("`" + n.replace("/homebrew-", "/") + "`");
  });
});

describe("canary: the tap rule rejects the shapes it exists for", () => {
  const input = (name, url, flakeLine = "flake = false;") => `    ${name} = {\n      url = "github:${url}";\n      ${flakeLine}\n    };\n`;
  const flake = (extra = {}) => [
    extra.input ?? input("homebrew-x-tap", "x/homebrew-tap"),
    extra.mutable ?? "        mutableTaps = false;",
    "        taps = {",
    extra.key ?? '          "x/homebrew-tap" = inputs.homebrew-x-tap;',
    "        };",
    extra.list ?? "        taps = builtins.attrNames config.nix-homebrew.taps;",
    extra.item ?? '          "x/tap/thing"',
  ].join("\n");
  const lockWith = (node) => JSON.stringify({ nodes: { root: { inputs: { "homebrew-x-tap": "homebrew-x-tap" } }, "homebrew-x-tap": node } });
  const lock = (locked = {}) => JSON.stringify({ nodes: { root: { inputs: { "homebrew-x-tap": "homebrew-x-tap" } }, "homebrew-x-tap": {
    flake: false,
    locked: { owner: "x", repo: "homebrew-tap", type: "github", rev: "a".repeat(40), narHash: "sha256-" + "A".repeat(43) + "=", ...locked },
  } } });

  test("the good shape passes", () => {
    expect(tapPinProblems(flake(), lock())[0]).toEqual([]);
  });

  // Each bad shape must fail with the one problem that names it, so a
  // removed check fails its own canary.
  const only = (bad, re) => { expect(bad.length, bad.join("; ")).toBe(1); expect(bad[0]).toMatch(re); };
  test("each bad shape is caught by its own check", () => {
    only(tapPinProblems(flake({ mutable: "        mutableTaps = true;" }), lock())[0], /mutableTaps must be set once/);
    only(tapPinProblems(flake({ list: "        taps = builtins.attrNames config.nix-homebrew.taps;\n        homebrew.taps = [ \"x/tap\" ];" }), lock())[0], /declares a tap outside/);
    only(tapPinProblems(flake({ key: '          "x/homebrew-tap" = inputs.homebrew-x-tap;\n          "x/tap" = inputs.homebrew-x-tap;' }), lock())[0], /not a "<owner>\/homebrew-<repo>"/);
    only(tapPinProblems(flake({ key: '          "X/homebrew-tap" = inputs.homebrew-x-tap;' }), lock())[0], /not lower case/);
    only(tapPinProblems(flake({ input: input("homebrew-x-tap", "y/homebrew-tap") }), lock())[0], /points at y\/homebrew-tap/);
    only(tapPinProblems(flake({ input: input("homebrew-x-tap", "x/homebrew-tap", "flake = true;") }), lock())[0], /is not \{ url/);
    only(tapPinProblems(flake({ item: '          "evil/tap/thing"' }), lock())[0], /evil\/tap, which nix-homebrew.taps does not pin/);
    only(tapPinProblems(flake(), lock({ rev: undefined }))[0], /no commit/);
    only(tapPinProblems(flake(), lock({ narHash: "sha256-short" }))[0], /no narHash/);
    only(tapPinProblems(flake(), lock({ repo: "homebrew-other" }))[0], /pins homebrew-x-tap to x\/homebrew-other/);
    only(tapPinProblems(flake({ list: "" }), lock())[0], /homebrew.taps is not builtins.attrNames/);
    only(tapPinProblems(flake().replace(/\n\s*taps = \{[\s\S]*?\};/, ""), lock())[0], /no nix-homebrew.taps = \{/);
    only(tapPinProblems(flake(), "{")[0], /flake.lock is not JSON/);
    only(tapPinProblems(flake({ key: "", item: "" }), lock())[0], /nix-homebrew.taps is empty/);
    only(tapPinProblems(flake(), lockWith({ flake: true, locked: JSON.parse(lock()).nodes["homebrew-x-tap"].locked }))[0], /no flake = false github node/);
  });
});
