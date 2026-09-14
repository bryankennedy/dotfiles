// Canaries: the bad shapes the Forgejo CI rules exist for, fed through the same
// predicates the real rules use.
//
// The point is falsifiability. Every test in forgejo-ci.test.js passes today,
// which on its own is equally consistent with "the workflows are sound" and "the
// rule matches nothing". These assert the rules still bite, so a refactor that
// quietly defangs a predicate fails here rather than going unnoticed.
import { test, expect, describe } from "bun:test";
import {
  workflowSteps, secretsOnPullRequest, unpinnedUses, credentialedCheckouts, runsTouchingPr,
  symlinkStripStep, unverifiedDownloads, codeownersRules, deadCodeownersRules,
} from "../lib/repo.js";

describe("canary: the Forgejo CI rules reject the shapes they exist for", () => {
  test("a secret on pull_request is caught; the same job on pull_request_target is not", () => {
    const jobs = { r: { steps: [{ name: "x", env: { T: "${{ secrets.T }}" }, run: "echo" }] } };
    expect(secretsOnPullRequest({ on: { pull_request: {} }, jobs })).toEqual(["pull_request"]);
    expect(secretsOnPullRequest({ on: ["push", "pull_request"], jobs })).toEqual(["pull_request"]);
    expect(secretsOnPullRequest({ on: { pull_request_target: {} }, jobs })).toEqual([]);
    expect(secretsOnPullRequest({ on: { pull_request: {} }, jobs: { t: { steps: [{ run: "bun test tests/" }] } } })).toEqual([]);
  });

  test("a tag-pinned action and a checkout that keeps its token", () => {
    const wf = { jobs: { j: { steps: [
      { uses: "actions/checkout@v4" },
      { uses: "actions/checkout@11d5960a326750d5838078e36cf38b85af677262", with: { "persist-credentials": false } },
      { uses: "./.forgejo/actions/local" },
    ] } } };
    expect(unpinnedUses(wf)).toEqual(["actions/checkout@v4"]);
    expect(credentialedCheckouts(wf).map((s) => s.index)).toEqual([0]);
  });

  test("run lines that execute or enter the PR checkout", () => {
    for (const bad of [
      "bun pr/scripts/forgejo-review.mjs post", "cd pr && bun test", "make -C pr test",
      "sh ./pr/.forgejo/ci/install-tools.sh", "git --git-dir=pr/.git log",
    ]) {
      expect(runsTouchingPr(bad).length, bad).toBe(1);
    }
    expect(runsTouchingPr("git fetch --quiet --no-tags ./pr HEAD\nbun scripts/forgejo-review.mjs prompt > .review/prompt.md")).toEqual([]);
    // The two strip steps name pr/ without entering it or running anything from it.
    expect(runsTouchingPr("find pr -type l -delete\nfind pr \\( -name CLAUDE.md \\) -prune -exec rm -rf {} +")).toEqual([]);
  });

  test("a symlink strip that is commented out, narrowed or only listing is not counted", () => {
    const steps = (run) => workflowSteps({ jobs: { r: { steps: [{ name: "Strip", run }, { name: "Review", run: "claude -p" }] } } });
    expect(symlinkStripStep(steps("find pr -type l -delete\nif find pr -type l | grep -q .; then exit 1; fi\n"))).toBe(0);
    for (const bad of [
      "# find pr -type l -delete", "find pr/nix-darwin -type l -delete", "find pr -maxdepth 1 -type l -delete",
      "find pr -type l -print", "find pr -type l -delete || true",
    ]) {
      expect(symlinkStripStep(steps(bad)), bad).toBe(-1);
    }
  });

  test("downloads that skip a literal digest", () => {
    const fetchFn = 'fetch() {\n  curl -fsSL --retry 3 -o "$3" "$1"\n  echo "$2  $3" | sha256sum -c --quiet -\n}\n';
    const good = `X_SHA256=${"a".repeat(64)}\n${fetchFn}fetch "https://x/y.zip" \\\n  "$X_SHA256" "$tmp/y.zip"\n`;
    expect(unverifiedDownloads(good)).toEqual([]);
    expect(unverifiedDownloads(good.replace("a".repeat(64), "latest")).length).toBe(1);
    expect(unverifiedDownloads(good + "curl -fsSL https://get.example.sh | sh\n").length).toBe(2);
    expect(unverifiedDownloads(good + 'fetch "https://x/z.zip" "$X_VERSION" "$tmp/z.zip"\n').length).toBe(1);
    expect(unverifiedDownloads(good.replace("sha256sum -c", "true")).length).toBe(1);
  });

  test("a gitignore-style CODEOWNERS glob, a broken regex, and an ownerless rule", () => {
    const rules = codeownersRules("# c\n/nix-darwin/ @bkennedy\n^nix-darwin/.*$ @bkennedy\n^(unclosed @bkennedy\n^CLAUDE\\.md$\n");
    expect(deadCodeownersRules(rules, ["nix-darwin/flake.nix", "CLAUDE.md"]).map((r) => r.line)).toEqual([2, 4, 5]);
  });
});
