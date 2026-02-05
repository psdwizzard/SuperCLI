const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

function escapePowerShellSingleQuotes(value = '') {
  return String(value).replace(/'/g, "''");
}

function escapePosixSingleQuotes(value = '') {
  return String(value).replace(/'/g, `'"'"'`);
}

function normalizeToForwardSlashes(p) {
  return String(p).replace(/\\/g, '/');
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function timestampString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${y}${m}${d}-${hh}${mm}${ss}`;
}

function runShellCommand(cmd, args, options) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { ...options, stdio: 'ignore' });
    child.on('error', (err) => resolve({ success: false, error: err.message }));
    child.on('exit', (code) => resolve({ success: code === 0, code }));
    try { child.unref?.(); } catch (_) {}
  });
}

async function compressFolderToZip(folderPath, zipPath) {
  const isWin = os.platform() === 'win32';
  if (isWin) {
    const ps = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell.exe';
    const script = `Compress-Archive -Path \"${folderPath}/*\" -DestinationPath \"${zipPath}\" -Force`;
    return await runShellCommand(ps, ['-NoLogo', '-NoProfile', '-Command', script]);
  }
  return await runShellCommand('zip', ['-r', zipPath, path.basename(folderPath)], { cwd: path.dirname(folderPath) });
}

module.exports = {
  escapePowerShellSingleQuotes,
  escapePosixSingleQuotes,
  normalizeToForwardSlashes,
  ensureDir,
  timestampString,
  runShellCommand,
  compressFolderToZip
};
