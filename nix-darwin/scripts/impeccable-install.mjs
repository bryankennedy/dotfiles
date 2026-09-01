#!/usr/bin/env node
// Installs/updates the impeccable design skills (impeccable.style) into
// ~/.claude/skills/impeccable. Run during nix-darwin postActivation as the
// user (sudo -Hu bk), executed with bun.
//
// This wraps `bun x impeccable install` instead of calling it directly
// because the CLI's own bundle downloader (impeccable 3.6.0) follows only
// ONE redirect, but the bundle URL now redirects twice:
//   impeccable.style/api/download/bundle/universal
//     -> github.com/pbakaus/impeccable/releases/download/<tag>/universal.zip
//     -> release-assets.githubusercontent.com/...
// so the CLI writes GitHub's second 302 response to disk and dies with
// "Download failed: invalid zip data". fetch() follows the full chain, so we
// download the bundle ourselves and hand it to the CLI via its documented
// IMPECCABLE_BUNDLE_PATH escape hatch, which skips its broken downloader.
// Once upstream fixes the redirect handling this wrapper can collapse back
// to a plain `bun x impeccable install` line in flake.nix.
import { writeFileSync, rmSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';

const BUNDLE_URL = 'https://impeccable.style/api/download/bundle/universal';

const res = await fetch(BUNDLE_URL);
if (!res.ok) {
  console.error(`impeccable-install: bundle download failed: HTTP ${res.status}`);
  process.exit(1);
}
const zip = Buffer.from(await res.arrayBuffer());
// Cheap sanity check so a proxy error page never reaches the installer:
// every zip starts with "PK".
if (zip.length < 4 || zip[0] !== 0x50 || zip[1] !== 0x4b) {
  console.error('impeccable-install: downloaded bundle is not a zip, aborting');
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
    ['x', 'impeccable', 'install', '--providers=claude', '--scope=global', '--yes', '--no-hooks'],
    {
      stdio: 'inherit',
      env: { ...process.env, IMPECCABLE_BUNDLE_PATH: bundlePath },
    },
  );
  process.exit(result.status ?? 1);
} finally {
  rmSync(bundlePath, { force: true });
}
