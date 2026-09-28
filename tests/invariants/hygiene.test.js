// Repo hygiene: the house .gitignore rule, held in place.
//
// Copied from the infrastructure repo's tests/invariants/hygiene.test.js
// (INFRA-164). The rule: exactly one .gitignore, at the root; it ignores the
// local env files that hold secrets; every entry sits under a comment saying
// why. Static, no network, no secrets.
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// The house rule's three entries, written literally.
const ENV_PATTERNS = [".env", ".env.local", ".env.*.local"];
// Concrete names those entries must cover, checked against git itself so a
// later `!` negation cannot quietly re-include one.
const ENV_FILES = [".env", ".env.local", ".env.production.local"];

/** Patterns with no `#` comment in the contiguous (blank-line-bounded) block above them. */
function undocumentedPatterns(text) {
  const out = [];
  let commented = false;
  for (const raw of text.split("\n")) {
    const l = raw.trim();
    if (!l) { commented = false; continue; }
    if (l.startsWith("#")) { commented = true; continue; }
    if (!commented) out.push(l);
  }
  return out;
}

/** Patterns listed more than once: the later copy is dead weight and drifts. */
function duplicatePatterns(patterns) {
  return [...new Set(patterns.filter((p, i) => patterns.indexOf(p) !== i))];
}

const git = (...args) => Bun.spawnSync(["git", ...args], { cwd: ROOT });

describe("gitignore", () => {
  const gi = readFileSync(join(ROOT, ".gitignore"), "utf8");
  const patterns = gi.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

  for (const need of ENV_PATTERNS) {
    test(`lists ${need}`, () => {
      expect(patterns, `.gitignore no longer lists ${need}`).toContain(need);
    });
  }

  for (const f of ENV_FILES) {
    test(`git ignores ${f}`, () => {
      expect(git("check-ignore", "-q", "--no-index", f).exitCode, `${f} is not ignored`).toBe(0);
    });
  }

  test("every pattern is documented with a preceding comment", () => {
    expect(undocumentedPatterns(gi)).toEqual([]);
  });

  test("no pattern is listed twice", () => {
    expect(duplicatePatterns(patterns)).toEqual([]);
  });

  test("there is exactly one .gitignore in the repo", () => {
    const found = git("ls-files", "*.gitignore", ".gitignore").stdout.toString().split("\n").filter(Boolean);
    expect(found).toEqual([".gitignore"]);
  });
});

describe("canary: the gitignore rule still bites", () => {
  test("an entry with no comment above it is caught", () => {
    expect(undocumentedPatterns("# why\n.env\n\nstray.log\n")).toEqual(["stray.log"]);
    expect(undocumentedPatterns("# why\n# more\n.env\n.env.local\n")).toEqual([]);
  });

  test("a pattern listed twice is caught", () => {
    expect(duplicatePatterns(["outputs/*", ".env", "outputs/*"])).toEqual(["outputs/*"]);
    expect(duplicatePatterns(["outputs/*", "!outputs/README.md"])).toEqual([]);
  });
});
