const path = require('path');
const fs = require('fs');
const { loadUserPreferences } = require('./preferences');
const { startBackupScheduler } = require('./backup');

const explorerIgnoreNames = new Set(['.git', '.supercli', 'node_modules']);

function buildProjectTree(rootPath, options, depth, stats) {
  if (depth > options.maxDepth || stats.count >= options.maxEntries) {
    if (stats.count >= options.maxEntries) stats.truncated = true;
    return [];
  }

  let entries;
  try {
    entries = fs.readdirSync(rootPath, { withFileTypes: true });
  } catch (error) {
    return [];
  }

  entries.sort((a, b) => {
    const aDir = a.isDirectory();
    const bDir = b.isDirectory();
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    const aBat = !aDir && aName.endsWith('.bat');
    const bBat = !bDir && bName.endsWith('.bat');
    const aMd = !aDir && aName.endsWith('.md');
    const bMd = !bDir && bName.endsWith('.md');

    const aRank = aBat ? 0 : aDir ? 1 : aMd ? 2 : 3;
    const bRank = bBat ? 0 : bDir ? 1 : bMd ? 2 : 3;
    if (aRank !== bRank) return aRank - bRank;

    return a.name.localeCompare(b.name);
  });

  const nodes = [];

  for (const entry of entries) {
    if (stats.count >= options.maxEntries) {
      stats.truncated = true;
      break;
    }

    const name = entry.name;
    if (explorerIgnoreNames.has(name)) {
      continue;
    }

    const fullPath = path.join(rootPath, name);
    const isDir = entry.isDirectory();
    const node = {
      name,
      path: fullPath,
      type: isDir ? 'dir' : 'file'
    };

    stats.count += 1;

    if (isDir) {
      node.children = buildProjectTree(fullPath, options, depth + 1, stats);
    }

    nodes.push(node);
  }

  return nodes;
}

function createProjectStructure(projectPath) {
  const tempDir = path.join(projectPath, '.supercli', 'temp');
  const imagesDir = path.join(projectPath, '.supercli', 'images');

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  const metadataPath = path.join(projectPath, '.supercli', 'project.json');
  if (!fs.existsSync(metadataPath)) {
    const metadata = {
      created: new Date().toISOString(),
      sessions: []
    };
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }

  const rootTodo = path.join(projectPath, 'TODO.md');
  if (!fs.existsSync(rootTodo)) {
    const todoTemplate = `# TODO\n\n` +
      `SuperCLI reads tasks from this file. Use Markdown checkbox items so they appear in the in-app Todo panel.\n\n` +
      `How to write tasks:\n\n` +
      `- Use \"- [ ]\" for incomplete and \"- [x]\" for complete.\n` +
      `- One task per line. You can group with headings if you like.\n` +
      `- Example:\n` +
      `  - [ ] Set up virtual environment\n` +
      `  - [ ] Implement feature X\n` +
      `  - [x] Write README\n\n` +
      `Tips:\n` +
      `- Use the Todo button in SuperCLI to show/hide the panel.\n` +
      `- Ticking a box or adding an item updates this file.\n` +
      `- Click Reload in the panel to pull latest changes if you edit this file externally.\n`;
    try {
      fs.writeFileSync(rootTodo, todoTemplate, 'utf8');
    } catch (e) {
      console.warn('Unable to initialize TODO.md:', e.message);
    }
  }

  return {
    tempDir,
    imagesDir,
    metadataPath
  };
}

function openProjectPath(projectPath, mainWindow) {
  if (!projectPath) return null;
  let absPath = projectPath;
  try {
    absPath = path.resolve(projectPath);
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isDirectory()) {
      return null;
    }
  } catch (_) {
    return null;
  }

  const structure = createProjectStructure(absPath);
  const userPrefs = loadUserPreferences(absPath);
  try { startBackupScheduler(absPath, userPrefs, mainWindow); } catch (_) {}
  return { projectPath: absPath, ...structure, userPrefs };
}

function resolveStartupProjectPath(app) {
  const args = process.argv.slice(1);
  let explicit = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--project' || arg === '-p') {
      explicit = args[i + 1];
      break;
    }
    if (arg && arg.startsWith('--project=')) {
      explicit = arg.split('=').slice(1).join('=');
      break;
    }
  }

  const envProject = process.env.SUPERCLI_PROJECT;
  const candidates = [];
  if (explicit) candidates.push(explicit);
  if (envProject) candidates.push(envProject);

  if (!explicit) {
    let appPath = null;
    try {
      appPath = app.getAppPath();
    } catch (_) {
      appPath = null;
    }
    const appPathResolved = appPath ? path.resolve(appPath) : null;

    for (const arg of args) {
      if (!arg || arg.startsWith('-')) continue;
      if (arg === '.') continue;
      const abs = path.resolve(arg);
      if (appPathResolved && abs === appPathResolved) continue;
      candidates.push(arg);
    }
  }

  // Fallback: use process.cwd() if no candidates found and it isn't the app directory
  if (candidates.length === 0) {
    const cwd = process.cwd();
    let appDir = null;
    try { appDir = path.resolve(app.getAppPath()); } catch (_) {}
    if (!appDir || path.resolve(cwd) !== appDir) {
      candidates.push(cwd);
    }
  }

  for (const candidate of candidates) {
    try {
      const abs = path.resolve(candidate);
      if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
        return abs;
      }
    } catch (_) { /* ignore */ }
  }
  return null;
}

module.exports = {
  buildProjectTree,
  createProjectStructure,
  openProjectPath,
  resolveStartupProjectPath
};
