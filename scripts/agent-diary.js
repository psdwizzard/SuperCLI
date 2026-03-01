#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

function hasFlag(name) {
  return process.argv.includes(name);
}

function getArgValue(prefix) {
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : '';
}

function resolveRepoRoot() {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) {
    return process.cwd();
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function appendEntry(filePath, entry, sourceLabel) {
  const stamp = new Date().toISOString();
  const header = `## ${stamp} (${sourceLabel})\n`;
  const body = `${entry.trim()}\n\n`;
  fs.appendFileSync(filePath, header + body, 'utf8');
}

async function promptForEntry(promptText) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(promptText, (answer) => {
      rl.close();
      resolve((answer || '').trim());
    });
  });
}

async function main() {
  if (process.env.SKIP_AGENT_DIARY === '1') {
    process.exit(0);
  }

  const requireEntry = hasFlag('--require-entry');
  const source = getArgValue('--source=') || 'manual';
  const entryFromArg = getArgValue('--entry=').trim();
  const repoRoot = resolveRepoRoot();
  const diaryDir = path.join(repoRoot, '.supercli', 'agent-private');
  const diaryPath = path.join(diaryDir, 'diary.md');

  ensureDir(diaryDir);

  let entry = entryFromArg;
  if (!entry) {
    if (!process.stdin.isTTY) {
      if (requireEntry) {
        console.error('[agent-diary] Non-interactive session and no entry provided.');
        console.error('[agent-diary] Provide --entry="..." or set SKIP_AGENT_DIARY=1 intentionally.');
        process.exit(1);
      }
      process.exit(0);
    }
    entry = await promptForEntry('Private diary entry before push (required): ');
  }

  if (!entry) {
    if (requireEntry) {
      console.error('[agent-diary] Empty entry. Push blocked.');
      process.exit(1);
    }
    process.exit(0);
  }

  appendEntry(diaryPath, entry, source);
  console.log(`[agent-diary] Entry saved to ${diaryPath}`);
}

main().catch((err) => {
  console.error('[agent-diary] Failed:', err && err.message ? err.message : String(err));
  process.exit(1);
});
