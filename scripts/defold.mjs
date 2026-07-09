#!/usr/bin/env node
// defold.mjs — one-time migration off GNU Stow's tree-folding.
//
// Stow "folds" a directory when the target doesn't exist yet: instead of making
// a real directory and symlinking each file, it symlinks the whole directory
// into the package. ~/.cursor/skills, ~/.gemini and ~/.claude/commands were all
// folds pointing into this repo. Anything an app wrote there — Cursor and Gemini
// auto-install plugin skills, agents write command files — landed in the working
// tree of a PUBLIC repo, held back only by hand-written .gitignore rules.
//
// flake.nix now passes `stow -R --no-folding`, which prevents this going forward.
// But two things it cannot do on its own:
//
//   1. `--no-folding` alone will not undo a fold that already exists. `-R`
//      (restow) does, which is why flake.nix uses it.
//   2. Restowing does not EVICT the files an app already wrote into the repo.
//      It leaves them there and symlinks them back out, one link per file.
//
// So this script unstows, moves the ignored app-written content out of the repo
// and into $HOME where it belongs, then restows with folding disabled.
//
// Idempotent: with nothing to evict it is a no-op. Dry-run unless --apply.
//
//   node scripts/defold.mjs            # show the plan
//   node scripts/defold.mjs --apply    # do it

import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, renameSync, realpathSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const REPO = path.resolve(import.meta.dirname, "..");
const HOME = homedir();

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: REPO, encoding: "utf8", ...opts });

const say = (s = "") => console.log(s);
const act = (s) => say(`  ${APPLY ? "" : "[dry-run] "}${s}`);

// The stow package list lives in flake.nix and nowhere else. Parse it rather
// than duplicating it — a second copy is a second thing to forget to update.
function packages() {
  const flake = sh("cat", ["nix-darwin/flake.nix"]);
  const m = flake.match(/stow -R --no-folding -v -d \S+ -t \S+ ([a-z0-9 ]+?) \|\| true/);
  if (!m) throw new Error("could not find the stow package list in nix-darwin/flake.nix");
  return m[1].trim().split(/\s+/);
}

// Directory symlinks under $HOME that resolve into this repo. These are the folds.
function folds() {
  const roots = [HOME, `${HOME}/.config`, `${HOME}/.claude`, `${HOME}/.cursor`, `${HOME}/.gemini`, `${HOME}/.gemini/antigravity`];
  const out = [];
  for (const root of roots) {
    let entries;
    try { entries = readdirSync(root); } catch { continue; }
    for (const name of entries) {
      const p = path.join(root, name);
      let st;
      try { st = lstatSync(p); } catch { continue; }
      if (!st.isSymbolicLink()) continue;
      let real;
      try { real = realpathSync(p); } catch { continue; }
      if (!real.startsWith(REPO + path.sep)) continue;
      let isDir = false;
      try { isDir = statSync(p).isDirectory(); } catch {}
      if (isDir) out.push({ link: p, target: real });
    }
  }
  return out;
}

// App-written content that git ignores but that physically lives inside a stow
// package. `<pkg>/.cursor/skills/cloudflare` must end up at `~/.cursor/skills/cloudflare`.
function evictions(pkgs) {
  const out = [];
  for (const pkg of pkgs) {
    if (!existsSync(path.join(REPO, pkg))) continue;
    let listed;
    try {
      listed = sh("git", ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "--", pkg]);
    } catch { continue; }
    for (const line of listed.split("\n").filter(Boolean)) {
      const rel = line.replace(/\/$/, "");                 // strip stow package name
      const inHome = rel.split(path.sep).slice(1).join(path.sep);
      out.push({ from: path.join(REPO, rel), to: path.join(HOME, inHome) });
    }
  }
  return out;
}

// Does this path already exist in $HOME *in its own right*? While a fold is
// still in place, `~/.cursor/skills/cloudflare` resolves THROUGH the symlink
// into the repo, so a naive existsSync() says yes and we would report SKIP for
// a path we are in fact about to move. Anything that resolves back into the
// repo is the repo, not $HOME.
function existsInHome(target) {
  if (!existsSync(target)) return false;
  try { return !realpathSync(target).startsWith(REPO + path.sep); } catch { return false; }
}

function main() {
  // A dirty tracked tree means a mistake here is hard to unpick. Only blocks
  // --apply: a dry run mutates nothing, so refusing it would be pure friction,
  // and inspecting the plan is exactly what you want to do before committing.
  // Ignored files are what we are moving, so they do not count as dirty.
  if (APPLY) {
    const dirty = sh("git", ["status", "--porcelain", "--untracked-files=no"]).trim();
    if (dirty) {
      console.error("refusing to apply: tracked files are modified. Commit or stash first.\n" + dirty);
      process.exit(1);
    }
  }

  const pkgs = packages();
  const f = folds();
  const ev = evictions(pkgs);

  say(`repo:     ${REPO}`);
  say(`packages: ${pkgs.join(" ")}`);
  say("");

  say(`folds into the repo (${f.length}):`);
  f.length ? f.forEach((x) => say(`  ${x.link}`)) : say("  none — already de-folded");
  say("");

  const totalFiles = ev.reduce((n, e) => {
    try { return n + Number(sh("bash", ["-c", `find ${JSON.stringify(e.from)} -type f 2>/dev/null | wc -l`]).trim()); }
    catch { return n; }
  }, 0);
  say(`app-written paths to evict from the repo (${ev.length}, ~${totalFiles} files):`);
  ev.length ? ev.forEach((e) => say(`  ${path.relative(REPO, e.from)}  ->  ${e.to.replace(HOME, "~")}`)) : say("  none");
  say("");

  if (!f.length && !ev.length) { say("nothing to do."); return; }

  say("plan:");
  act(`stow -D  ${pkgs.join(" ")}          # unstow: removes the fold symlinks, repo untouched`);
  if (APPLY) { try { sh("stow", ["-D", "-d", REPO, "-t", HOME, ...pkgs]); } catch (e) { say(`  (stow -D reported: ${e.message.split("\n")[0]})`); } }

  for (const e of ev) {
    if (!existsSync(e.from)) continue;
    if (existsInHome(e.to)) { act(`SKIP ${e.to.replace(HOME, "~")} — already exists in $HOME`); continue; }
    act(`move ${path.relative(REPO, e.from)} -> ${e.to.replace(HOME, "~")}`);
    if (APPLY) { mkdirSync(path.dirname(e.to), { recursive: true }); renameSync(e.from, e.to); }
  }

  act(`stow -R --no-folding  ${pkgs.join(" ")}   # real dirs, leaf-file symlinks`);
  if (APPLY) { try { sh("stow", ["-R", "--no-folding", "-d", REPO, "-t", HOME, ...pkgs]); } catch (e) { say(`  (stow reported: ${e.message.split("\n")[0]})`); } }

  if (!APPLY) { say("\nre-run with --apply to execute."); return; }

  say("\nverifying:");
  const after = folds();
  say(after.length ? `  FAIL — ${after.length} fold(s) remain:\n${after.map((x) => "    " + x.link).join("\n")}`
                   : "  no directory symlinks into the repo remain");
  const left = evictions(pkgs);
  say(left.length ? `  FAIL — ${left.length} app-written path(s) still inside the repo`
                  : "  no app-written content left inside the repo");
  process.exitCode = after.length || left.length ? 1 : 0;
}

main();
