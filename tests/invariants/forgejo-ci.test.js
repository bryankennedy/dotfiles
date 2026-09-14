// Forgejo CI and the Claude PR reviewer: the security properties
// .forgejo/workflows/claude-review.yml depends on, held in place so a later
// "simplification" cannot quietly undo one. docs/claude-review.md explains each.
import { test, expect, describe } from "bun:test";
import { join } from "node:path";
import {
  ROOT, read, walk, exists, workflowTriggers, workflowSteps, stepsUsingSecret,
  secretsOnPullRequest, unpinnedUses, credentialedCheckouts, runsTouchingPr,
  symlinkStripStep, unverifiedDownloads, codeownersRules, deadCodeownersRules,
} from "../lib/repo.js";

// Tracked plus not-yet-added files, so a rule that matches only a new file
// still passes before the commit that adds it.
const files = Bun.spawnSync(["git", "ls-files", "--cached", "--others", "--exclude-standard"], { cwd: ROOT })
  .stdout.toString().split("\n").filter(Boolean);
const WORKFLOWS = join(ROOT, ".forgejo", "workflows");
const workflowFiles = walk(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f)).sort();
const rel = (f) => f.replace(ROOT + "/", "");
const parse = (f) => Bun.YAML.parse(read(f));
const matches = (pattern, path) => new RegExp(`^(?:${pattern})$`).test(path);

describe("CI lives on Forgejo", () => {
  test("nothing under .github/ is tracked", () => {
    expect(
      files.filter((f) => f.startsWith(".github/")),
      "GitHub is a push mirror of this repo. A workflow or CODEOWNERS there would\n" +
      "  run somewhere nobody watches, or be silently ignored by Forgejo."
    ).toEqual([]);
  });

  test("the test and review workflows exist", () => {
    expect(workflowFiles.map(rel)).toEqual(
      expect.arrayContaining([".forgejo/workflows/claude-review.yml", ".forgejo/workflows/test.yml"])
    );
  });
});

for (const f of workflowFiles) {
  describe(rel(f), () => {
    test("is valid YAML", () => {
      expect(() => parse(f)).not.toThrow();
    });

    test("pins every action to a commit", () => {
      expect(unpinnedUses(parse(f))).toEqual([]);
    });

    test("leaves no credentials behind in a checkout", () => {
      expect(credentialedCheckouts(parse(f)).map(({ job, index }) => `${job} step ${index}`)).toEqual([]);
    });

    test("never exposes a secret to a pull_request run", () => {
      expect(secretsOnPullRequest(parse(f))).toEqual([]);
    });
  });
}

describe("claude-review.yml", () => {
  const file = join(WORKFLOWS, "claude-review.yml");
  const wf = () => parse(file);
  const steps = () => workflowSteps(wf());
  const namesOf = (list) => list.map(({ step }) => step.name);

  test("runs only on pull_request_target", () => {
    expect(
      workflowTriggers(wf()),
      "On pull_request a branch runs its own copy of this workflow, secrets included."
    ).toEqual(["pull_request_target"]);
  });

  test("each credential reaches exactly one step, and never the same one", () => {
    expect(namesOf(stepsUsingSecret(wf(), "CLAUDE_CODE_OAUTH_TOKEN"))).toEqual(["Review"]);
    expect(namesOf(stepsUsingSecret(wf(), "CLAUDE_REVIEW_TOKEN"))).toEqual(["Post the review"]);
    const jobToken = steps().filter(({ step }) => /github\.token|secrets\.(GITHUB|FORGEJO|GITEA)_TOKEN/.test(JSON.stringify(step)));
    expect(namesOf(jobToken)).toEqual(["Post the review"]);
  });

  test("the base branch is checked out at the root, the PR only under pr/", () => {
    const checkouts = steps()
      .filter(({ step }) => /(^|\/)checkout@/.test(step.uses ?? ""))
      .map(({ step }) => step.with ?? {});
    expect(checkouts.length).toBe(2);
    expect(checkouts.filter((w) => !w.path && !w.ref).length).toBe(1);
    const pr = checkouts.find((w) => w.path);
    expect(pr?.path).toBe("pr");
    expect(String(pr?.ref)).toContain("refs/pull/");
  });

  test("agent instruction files leave pr/ before Claude starts", () => {
    // Claude Code loads nested CLAUDE.md files as instructions, so a PR could
    // otherwise add pr/nix-darwin/CLAUDE.md saying its own change is pre-approved.
    const list = steps();
    const review = list.findIndex(({ step }) => step.name === "Review");
    const strip = list.findIndex(({ step }) => {
      const run = String(step.run ?? "");
      return /\bfind pr\b/.test(run) && ["CLAUDE.md", "CLAUDE.local.md", ".claude"].every((n) => run.includes(n)) && /rm -rf/.test(run);
    });
    expect(strip, "no step removes CLAUDE.md, CLAUDE.local.md and .claude from pr/").toBeGreaterThanOrEqual(0);
    expect(strip).toBeLessThan(review);
  });

  test("symlinks leave pr/ before Claude starts", () => {
    // A link under pr/ can point at a file outside the workspace while its own
    // path stays inside, past a confinement that checks paths.
    const list = steps();
    const review = list.findIndex(({ step }) => step.name === "Review");
    const strip = symlinkStripStep(list);
    expect(strip, "no step deletes every symlink from pr/").toBeGreaterThanOrEqual(0);
    expect(strip).toBeLessThan(review);
  });

  test("no run step executes or enters the PR checkout", () => {
    const touching = steps().flatMap(({ step }) => runsTouchingPr(step.run).map((l) => `${step.name}: ${l.trim()}`));
    expect(touching).toEqual([]);
  });

  test("Claude runs restricted, in a scrubbed environment, with no way around its permissions", () => {
    const run = String(steps().find(({ step }) => step.name === "Review")?.step.run ?? "");
    expect(run).toMatch(/\benv -i\b/);
    expect(run).toContain("--restricted");
    expect(run).toContain("--json-schema");
    for (const forbidden of [
      "--dangerously-skip-permissions", "bypassPermissions", "--allowedTools", "--allowed-tools",
      "--add-dir", "--mcp-config", "--settings",
    ]) {
      expect(run.includes(forbidden), `the Review step must not pass ${forbidden}`).toBe(false);
    }
  });

  test("a review is bounded in time and does not stack", () => {
    const job = Object.values(wf().jobs)[0];
    expect(job["timeout-minutes"]).toBeLessThanOrEqual(30);
    expect(wf().concurrency?.["cancel-in-progress"]).toBe(true);
    expect(String(wf().concurrency?.group)).toContain("pull_request.number");
  });
});

describe(".forgejo/ci/install-tools.sh", () => {
  test("downloads only through fetch(), against literal digests", () => {
    expect(unverifiedDownloads(read(join(ROOT, ".forgejo", "ci", "install-tools.sh")))).toEqual([]);
  });
});

describe(".forgejo/CODEOWNERS", () => {
  const path = join(ROOT, ".forgejo", "CODEOWNERS");
  const rules = () => codeownersRules(read(path));

  test("exists, and nothing Forgejo reads first shadows it", () => {
    expect(exists(path)).toBe(true);
    // Forgejo uses the first of these it finds; .github/ is never read.
    const shadows = ["CODEOWNERS", "docs/CODEOWNERS", ".gitea/CODEOWNERS", ".github/CODEOWNERS"];
    expect(shadows.filter((p) => exists(join(ROOT, p)))).toEqual([]);
  });

  test("every rule compiles, names an owner, and still matches a file", () => {
    expect(deadCodeownersRules(rules(), files).map((r) => `line ${r.line}: ${r.pattern}`)).toEqual([]);
  });

  test("owners are the forge's own account", () => {
    expect([...new Set(rules().flatMap((r) => r.owners))]).toEqual(["@bkennedy"]);
  });

  test("the review setup and CLAUDE.md's high-risk paths are owned", () => {
    // Unlike the infrastructure repo, nothing here is left unowned on purpose:
    // the CODEOWNERS comment explains why every path is high blast radius.
    const owned = (p) => rules().some((r) => !r.negative && matches(r.pattern, p));
    for (const p of [
      ".forgejo/workflows/claude-review.yml", ".forgejo/CODEOWNERS", "CLAUDE.md", "scripts/forgejo-review.mjs",
      "tests/lib/repo.js", "nix-darwin/flake.nix", "remote/install.sh", "_agent/rules/global.md",
      "_agent/skills/security-audit.md", "docs/security-baseline.md", ".claude/settings.json", "README.md",
    ]) {
      expect(owned(p), `${p} should need owner sign-off`).toBe(true);
    }
  });
});
