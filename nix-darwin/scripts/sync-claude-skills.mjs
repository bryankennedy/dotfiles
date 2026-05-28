#!/usr/bin/env node
// Keeps claude/.claude/commands/ in sync with _agent/skills/.
// Run during nix-darwin postActivation as the user (sudo -Hu bk).
import { readdirSync, symlinkSync, unlinkSync, lstatSync, existsSync } from 'fs';
import { join } from 'path';

const home = process.env.HOME;
const skillsDir  = join(home, 'src/dotfiles/_agent/skills');
const commandsDir = join(home, 'src/dotfiles/claude/.claude/commands');

if (!existsSync(skillsDir) || !existsSync(commandsDir)) process.exit(0);

const skills = new Set(readdirSync(skillsDir).filter(f => f.endsWith('.md')));

// Add links for any skill that doesn't have one yet
for (const skill of skills) {
  const linkPath = join(commandsDir, skill);
  if (!existsSync(linkPath)) {
    symlinkSync(`../../../_agent/skills/${skill}`, linkPath);
    console.log(`claude-skills: linked ${skill}`);
  }
}

// Remove links whose skill file no longer exists
for (const entry of readdirSync(commandsDir).filter(f => f.endsWith('.md'))) {
  const linkPath = join(commandsDir, entry);
  if (lstatSync(linkPath).isSymbolicLink() && !skills.has(entry)) {
    unlinkSync(linkPath);
    console.log(`claude-skills: removed stale link ${entry}`);
  }
}
