#!/usr/bin/env node
// Installs/updates the impeccable design skills (impeccable.style) into
// ~/.claude/skills/impeccable. Run during nix-darwin postActivation as the
// user (sudo -Hu bk), executed with bun.
//
// Why a wrapper and not a bare `bun x impeccable install`:
//
// 1. Trust. The bundle is unpacked into ~/.claude/skills and becomes agent
//    instructions on every switch. The CLI fetches "latest" from
//    impeccable.style with no verification, so whatever that endpoint served
//    at rebuild time ran as Claude's design guidance. This script fetches a
//    specific GitHub release asset instead and refuses to install unless its
//    SHA-256 matches the value recorded here — the same tag-plus-digest shape
//    the herdr Ansible role uses (docs/security-baseline.md, finding 3). The
//    CLI is pinned too, so the unpacker is the reviewed one as well.
//
// 2. Mechanics. The CLI's own downloader (observed on impeccable 3.6.0)
//    follows only ONE redirect, but the vendor bundle URL redirects twice
//    (impeccable.style -> github.com/.../releases/download/<tag>/universal.zip
//    -> release-assets.githubusercontent.com/...), so it wrote GitHub's second
//    302 to disk and died with "Download failed: invalid zip data". fetch()
//    follows the full chain, and the CLI's documented IMPECCABLE_BUNDLE_PATH
//    escape hatch lets us hand it a file we already have.
//
// Bumping: pick the tag at github.com/pbakaus/impeccable/releases (skill
// bundles are tagged skill-v*, the CLI cli-v* — they version independently),
// download universal.zip for that tag, read its diff against the installed
// ~/.claude/skills/impeccable, then update SKILL_TAG and BUNDLE_SHA256 together
// (`shasum -a 256 universal.zip`). scripts/audit-pins.mjs reports when the tag
// falls behind; it reads the constants below, so keep their shape.
import { writeFileSync, rmSync } from 'fs';
import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';

const SKILL_TAG = 'skill-v4.2.2';
const BUNDLE_SHA256 = 'b9734b7538ccdb9177ff1b0cc8f0f52c0078dc430c6b7888d09e77a98de66ea5';
const CLI_VERSION = '4.0.4';

const BUNDLE_URL = `https://github.com/pbakaus/impeccable/releases/download/${SKILL_TAG}/universal.zip`;

const res = await fetch(BUNDLE_URL);
if (!res.ok) {
  console.error(`impeccable-install: bundle download failed: HTTP ${res.status} for ${BUNDLE_URL}`);
  process.exit(1);
}
const zip = Buffer.from(await res.arrayBuffer());

// The digest is the gate. A mismatch is not a retry case: either the tag was
// bumped without its hash, or the asset is not the one that was reviewed.
// Either way nothing gets unpacked into ~/.claude until a person looks.
const actual = createHash('sha256').update(zip).digest('hex');
if (actual !== BUNDLE_SHA256) {
  console.error(`impeccable-install: ${SKILL_TAG} universal.zip SHA-256 mismatch`);
  console.error(`  expected ${BUNDLE_SHA256}`);
  console.error(`  got      ${actual}`);
  console.error('  Refusing to install. If the tag was bumped on purpose, update BUNDLE_SHA256 to match.');
  process.exit(1);
}

const bundlePath = join(tmpdir(), `impeccable-bundle-${process.pid}.zip`);
writeFileSync(bundlePath, zip);

try {
  // process.execPath is the bun that is running this script, so the flake's
  // pinned bun is reused instead of whatever is first on PATH. Flags make the
  // normally-interactive installer deterministic: --providers=claude skips
  // harness detection (it would otherwise also target ~/.cursor and ~/.gemini),
  // --scope=global targets ~/.claude instead of whatever cwd activation runs
  // from, and --no-hooks skips the project-level hook sidecar, which would
  // land in that same arbitrary cwd. Re-running is an update check (no-op
  // when the installed version matches the bundle).
  const result = spawnSync(
    process.execPath,
    ['x', `impeccable@${CLI_VERSION}`, 'install', '--providers=claude', '--scope=global', '--yes', '--no-hooks'],
    {
      stdio: 'inherit',
      env: { ...process.env, IMPECCABLE_BUNDLE_PATH: bundlePath },
    },
  );
  process.exit(result.status ?? 1);
} finally {
  rmSync(bundlePath, { force: true });
}
