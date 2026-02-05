const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { normalizeToForwardSlashes, ensureDir, timestampString, compressFolderToZip } = require('./utils');

const backupSchedulers = new Map();

function getBackupConfig(preferences = {}, projectPath) {
  const backup = preferences?.backup || {};
  const targetDir = backup.target_dir || path.join('.supercli', 'backups');
  const excludeDefaults = [
    '.supercli/backups/**'
  ];
  const include = Array.isArray(backup.include_globs) && backup.include_globs.length > 0
    ? backup.include_globs
    : ['.supercli/**', 'TODO.md'];
  const exclude = Array.isArray(backup.exclude_globs) && backup.exclude_globs.length > 0
    ? Array.from(new Set([...backup.exclude_globs, ...excludeDefaults]))
    : excludeDefaults;
  return {
    enabled: Boolean(backup.enabled),
    interval_minutes: Number(backup.interval_minutes || 60),
    retention_count: Number(backup.retention_count || 4),
    target_dir: targetDir,
    compress: Boolean(backup.compress),
    include_globs: include,
    exclude_globs: exclude,
    verify: Boolean(backup.verify),
    schedule: backup.schedule || null,
    max_backup_size_mb: backup.max_backup_size_mb ? Number(backup.max_backup_size_mb) : null,
    pause_on_battery: Boolean(backup.pause_on_battery),
    on_success_cmd: backup.on_success_cmd || '',
    on_error_cmd: backup.on_error_cmd || ''
  };
}

function listFilesForBackup(projectPath, includeGlobs, excludeGlobs) {
  const results = [];
  const excludes = (excludeGlobs || []).map(g => normalizeToForwardSlashes(g));

  function isExcluded(relPath) {
    const rel = normalizeToForwardSlashes(relPath);
    for (const pat of excludes) {
      if (pat.endsWith('/**')) {
        const dir = pat.slice(0, -3);
        if (rel.startsWith(dir.endsWith('/') ? dir : dir + '/')) return true;
      } else if (pat.includes('*')) {
        const re = new RegExp('^' + pat.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
        if (re.test(rel)) return true;
      } else {
        if (rel === pat) return true;
      }
    }
    return false;
  }

  function addIfFile(absPath) {
    try {
      const st = fs.statSync(absPath);
      if (!st.isFile()) return;
      const rel = normalizeToForwardSlashes(path.relative(projectPath, absPath));
      if (!isExcluded(rel)) results.push({ abs: absPath, rel, size: st.size });
    } catch (_) { /* ignore */ }
  }

  function walkDir(absDir) {
    let entries = [];
    try { entries = fs.readdirSync(absDir, { withFileTypes: true }); } catch (_) { return; }
    for (const ent of entries) {
      const abs = path.join(absDir, ent.name);
      if (ent.isDirectory()) {
        walkDir(abs);
      } else if (ent.isFile()) {
        addIfFile(abs);
      }
    }
  }

  for (const inc of includeGlobs || []) {
    if (!inc) continue;
    if (inc.endsWith('/**')) {
      const dirRel = inc.slice(0, -3);
      const dirAbs = path.join(projectPath, dirRel);
      if (fs.existsSync(dirAbs)) walkDir(dirAbs);
      continue;
    }
    const abs = path.join(projectPath, inc);
    if (fs.existsSync(abs)) {
      const st = fs.statSync(abs);
      if (st.isDirectory()) {
        walkDir(abs);
      } else if (st.isFile()) {
        addIfFile(abs);
      }
    }
  }
  return results;
}

async function performBackup(projectPath, preferences, mainWindow) {
  const cfg = getBackupConfig(preferences, projectPath);
  if (!cfg.enabled) return { skipped: true };
  try {
    const files = listFilesForBackup(projectPath, cfg.include_globs, cfg.exclude_globs);
    const totalSize = files.reduce((a, f) => a + (f.size || 0), 0);
    if (cfg.max_backup_size_mb && totalSize > cfg.max_backup_size_mb * 1024 * 1024) {
      throw new Error(`Backup size ${Math.round(totalSize/1024/1024)}MB exceeds cap ${cfg.max_backup_size_mb}MB`);
    }

    const destBase = path.isAbsolute(cfg.target_dir) ? cfg.target_dir : path.join(projectPath, cfg.target_dir);
    ensureDir(destBase);
    const stamp = timestampString();
    const snapshotDir = path.join(destBase, stamp);

    ensureDir(snapshotDir);
    for (const f of files) {
      const target = path.join(snapshotDir, f.rel);
      ensureDir(path.dirname(target));
      try {
        fs.copyFileSync(f.abs, target);
      } catch (e) {
        // Best-effort
      }
    }

    if (cfg.verify) {
      for (const f of files) {
        const target = path.join(snapshotDir, f.rel);
        try {
          const st = fs.statSync(target);
          if (st.size !== f.size) {
            throw new Error(`Verify failed for ${f.rel} (expected ${f.size}, got ${st.size})`);
          }
        } catch (e) {
          throw new Error(`Verify failed for ${f.rel}`);
        }
      }
    }

    let finalPath = snapshotDir;
    if (cfg.compress) {
      const zipPath = path.join(destBase, `${stamp}.zip`);
      const res = await compressFolderToZip(snapshotDir, zipPath);
      if (res.success) {
        try {
          fs.rmSync(snapshotDir, { recursive: true, force: true });
        } catch (_) {}
        finalPath = zipPath;
      } else {
        finalPath = snapshotDir;
      }
    }

    try {
      const entries = fs.readdirSync(destBase).map(name => ({ name, full: path.join(destBase, name) }))
        .filter(e => e.name.match(/^\d{8}-\d{6}(\.zip)?$/));
      entries.sort((a, b) => a.name.localeCompare(b.name));
      const keep = Math.max(0, cfg.retention_count);
      const toDelete = entries.slice(0, Math.max(0, entries.length - keep));
      for (const e of toDelete) {
        try { fs.rmSync(e.full, { recursive: true, force: true }); } catch (_) {}
      }
    } catch (_) {}

    if (cfg.on_success_cmd) {
      try { spawn(cfg.on_success_cmd, { shell: true, stdio: 'ignore', detached: true }); } catch (_) {}
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal-data', 'system', `\x1b[32m[backup]\x1b[0m Snapshot created at ${finalPath}\r\n`);
    }
    return { success: true, path: finalPath };
  } catch (error) {
    if (preferences?.backup?.on_error_cmd) {
      try { spawn(preferences.backup.on_error_cmd, { shell: true, stdio: 'ignore', detached: true }); } catch (_) {}
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal-data', 'system', `\x1b[31m[backup-error]\x1b[0m ${error.message}\r\n`);
    }
    return { success: false, error: error.message };
  }
}

function scheduleDaily(timeStr, fn) {
  const [hh, mm] = (timeStr || '02:00').split(':').map(n => parseInt(n, 10));
  const now = new Date();
  const next = new Date();
  next.setHours(hh || 2, mm || 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const delay = next - now;
  const timeout = setTimeout(async function tick() {
    try { await fn(); } catch (_) {}
    sched.timeout = setTimeout(tick, 24 * 60 * 60 * 1000);
  }, delay);
  const sched = { timeout };
  return sched;
}

function startBackupScheduler(projectPath, preferences, mainWindow) {
  stopBackupScheduler(projectPath);
  const cfg = getBackupConfig(preferences, projectPath);
  if (!cfg.enabled) return;

  const destBase = path.isAbsolute(cfg.target_dir) ? cfg.target_dir : path.join(projectPath, cfg.target_dir);
  try { ensureDir(destBase); } catch (_) {}

  let sched = null;
  if (cfg.schedule && /^daily@\d{2}:\d{2}$/.test(cfg.schedule)) {
    const t = cfg.schedule.split('@')[1];
    sched = scheduleDaily(t, () => performBackup(projectPath, preferences, mainWindow));
  } else {
    const ms = Math.max(1, cfg.interval_minutes || 60) * 60 * 1000;
    const interval = setInterval(() => { performBackup(projectPath, preferences, mainWindow); }, ms);
    setTimeout(() => { performBackup(projectPath, preferences, mainWindow); }, 2000);
    sched = { interval };
  }
  backupSchedulers.set(projectPath, sched);
}

function stopBackupScheduler(projectPath) {
  const sched = backupSchedulers.get(projectPath);
  if (!sched) return;
  if (sched.interval) clearInterval(sched.interval);
  if (sched.timeout) clearTimeout(sched.timeout);
  backupSchedulers.delete(projectPath);
}

function closeAllSchedulers() {
  backupSchedulers.forEach((sched) => {
    try { if (sched.interval) clearInterval(sched.interval); if (sched.timeout) clearTimeout(sched.timeout); } catch (_) {}
  });
  backupSchedulers.clear();
}

module.exports = {
  getBackupConfig,
  listFilesForBackup,
  performBackup,
  startBackupScheduler,
  stopBackupScheduler,
  closeAllSchedulers
};
