const { app, BrowserWindow, ipcMain, dialog, shell, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { loadUserPreferences, saveUserPreferences } = require('./preferences');
const { fetchIssues, setIssueState } = require('./github');
const { loadTodo, saveTodo, watchTodo, unwatchTodo, closeAllWatchers } = require('./todo');
const { startBackupScheduler, stopBackupScheduler, closeAllSchedulers } = require('./backup');
const { buildProjectTree, openProjectPath, resolveStartupProjectPath } = require('./project');
const { init: initTerminals, createTerminal, writeToTerminal, resizeTerminal, closeTerminal, closeAllTerminals, saveImage } = require('./terminals');
const { ensureDir } = require('./utils');

let mainWindow;
const startupProjectPath = resolveStartupProjectPath(app);
let startupProjectInfo = null;
let micPermissionDecision = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload.js'),
      contextIsolation: false,
      nodeIntegration: true
    }
  });

  const session = mainWindow.webContents.session;
  const allowedMediaPermissions = new Set(['media', 'audioCapture', 'microphone']);

  session.setPermissionCheckHandler((webContents, permission) => {
    if (allowedMediaPermissions.has(permission)) {
      return micPermissionDecision === true;
    }
    return false;
  });

  session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (allowedMediaPermissions.has(permission)) {
      if (micPermissionDecision === null) {
        const choice = dialog.showMessageBoxSync(mainWindow, {
          type: 'question',
          buttons: ['Allow', 'Deny'],
          defaultId: 0,
          cancelId: 1,
          title: 'Microphone Permission',
          message: 'Allow SuperCLI to access your microphone?'
        });
        micPermissionDecision = choice === 0;
      }
      callback(micPermissionDecision === true);
      return;
    }
    callback(false);
  });

  mainWindow.loadFile(path.join(__dirname, '..', '..', 'index.html'));

  // Auto-open DevTools if launched with --open-devtools
  if (process.argv.includes('--open-devtools')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Initialize terminal module with the main window reference
  initTerminals(mainWindow);
}

// --- IPC Handlers ---

ipcMain.handle('select-project-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return openProjectPath(result.filePaths[0], mainWindow);
  }
  return null;
});

ipcMain.handle('get-startup-project', async () => {
  if (!startupProjectPath) return null;
  if (!startupProjectInfo) {
    startupProjectInfo = openProjectPath(startupProjectPath, mainWindow);
  }
  return startupProjectInfo;
});

ipcMain.handle('read-project-tree', async (event, projectPath, options = {}) => {
  try {
    if (!projectPath) {
      return { success: false, error: 'Missing project path' };
    }
    if (!fs.existsSync(projectPath)) {
      return { success: false, error: 'Project path does not exist' };
    }
    const config = {
      maxDepth: Number(options.maxDepth ?? 5),
      maxEntries: Number(options.maxEntries ?? 1500)
    };
    const stats = { count: 0, truncated: false };
    const tree = buildProjectTree(projectPath, config, 0, stats);
    return {
      success: true,
      tree,
      nodeCount: stats.count,
      truncated: stats.truncated
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-user-preferences', async (event, projectPath) => {
  try {
    return { success: true, preferences: loadUserPreferences(projectPath) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-user-preferences', async (event, projectPath, preferences) => {
  try {
    const result = saveUserPreferences(projectPath, preferences);
    try { startBackupScheduler(projectPath, result.prefsObject, mainWindow); } catch (_) {}
    return { success: true, path: result.path };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-todo', async (event, projectPath) => {
  try {
    const result = loadTodo(projectPath);
    return { success: true, items: result.items, sections: result.sections };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-todo', async (event, projectPath, items) => {
  try {
    saveTodo(projectPath, items);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('watch-todo', async (event, projectPath) => {
  try {
    return watchTodo(projectPath, mainWindow);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('unwatch-todo', async (event, projectPath) => {
  try {
    unwatchTodo(projectPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('github-issues', async (event, projectPath, options = {}) => {
  try {
    const result = await fetchIssues(projectPath, options);
    return { success: true, repo: result.repo, issues: result.issues };
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
});

ipcMain.handle('github-issue-set-state', async (event, projectPath, issueNumber, newState, comment) => {
  try {
    await setIssueState(projectPath, issueNumber, newState, comment);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
});

ipcMain.handle('open-external', async (event, url) => {
  try {
    if (!url) throw new Error('Missing URL');
    await shell.openExternal(String(url));
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
});

ipcMain.handle('create-terminal', (event, id, cwd, cliCommand, cliLabel) => {
  return createTerminal(id, cwd, cliCommand, cliLabel);
});

ipcMain.handle('write-to-terminal', (event, id, data) => {
  return writeToTerminal(id, data);
});

ipcMain.handle('resize-terminal', (event, id, cols, rows) => {
  return resizeTerminal(id, cols, rows);
});

ipcMain.handle('close-terminal', (event, id) => {
  return closeTerminal(id);
});

ipcMain.handle('open-devtools', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { success: false, error: 'Main window unavailable' };
  }
  if (mainWindow.webContents.isDevToolsOpened()) {
    const devTools = mainWindow.webContents.devToolsWebContents;
    if (devTools && !devTools.isDestroyed()) {
      devTools.focus();
    }
    return { success: true, alreadyOpen: true };
  }
  mainWindow.webContents.openDevTools({ mode: 'detach' });
  return { success: true, opened: true };
});

ipcMain.handle('save-image', async (event, projectPath, imageData) => {
  try {
    return saveImage(projectPath, imageData);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// --- New Feature IPC Handlers ---

// Snippets
ipcMain.handle('load-snippets', async (event, projectPath) => {
  try {
    const snippets = { project: [], global: [] };
    if (projectPath) {
      const projectFile = path.join(projectPath, '.supercli', 'snippets.json');
      if (fs.existsSync(projectFile)) {
        try {
          snippets.project = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
        } catch (_) {}
      }
    }
    const globalFile = path.join(os.homedir(), '.supercli', 'snippets.json');
    if (fs.existsSync(globalFile)) {
      try {
        snippets.global = JSON.parse(fs.readFileSync(globalFile, 'utf8'));
      } catch (_) {}
    }
    return { success: true, snippets };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-snippets', async (event, projectPath, snippets) => {
  try {
    if (!projectPath) throw new Error('Missing projectPath');
    const dir = path.join(projectPath, '.supercli');
    ensureDir(dir);
    fs.writeFileSync(path.join(dir, 'snippets.json'), JSON.stringify(snippets, null, 2), 'utf8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Templates
ipcMain.handle('list-templates', async () => {
  try {
    const dir = path.join(os.homedir(), '.supercli', 'templates');
    ensureDir(dir);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    const templates = files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        return { name: data.name || f.replace('.json', ''), description: data.description || '', file: f };
      } catch (_) {
        return { name: f.replace('.json', ''), description: '', file: f };
      }
    });
    return { success: true, templates };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-template', async (event, templateName) => {
  try {
    const dir = path.join(os.homedir(), '.supercli', 'templates');
    const file = path.join(dir, `${templateName}.json`);
    if (!fs.existsSync(file)) throw new Error('Template not found');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { success: true, template: data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-template', async (event, template) => {
  try {
    const dir = path.join(os.homedir(), '.supercli', 'templates');
    ensureDir(dir);
    const name = template.name || 'Untitled';
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    fs.writeFileSync(path.join(dir, `${safeName}.json`), JSON.stringify(template, null, 2), 'utf8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('apply-template', async (event, templateName, projectPath) => {
  try {
    if (!projectPath) throw new Error('Missing projectPath');
    const dir = path.join(os.homedir(), '.supercli', 'templates');
    const file = path.join(dir, `${templateName}.json`);
    if (!fs.existsSync(file)) throw new Error('Template not found');
    const template = JSON.parse(fs.readFileSync(file, 'utf8'));

    // Apply settings
    if (template.settings) {
      const userFile = path.join(projectPath, '.user');
      fs.writeFileSync(userFile, JSON.stringify(template.settings, null, 2), 'utf8');
    }

    // Apply TODO items
    if (Array.isArray(template.todoItems) && template.todoItems.length > 0) {
      const todoPath = path.join(projectPath, 'TODO.md');
      let md = '# TODO\n\n';
      for (const item of template.todoItems) {
        md += `- [ ] ${item}\n`;
      }
      fs.writeFileSync(todoPath, md, 'utf8');
    }

    // Apply snippets
    if (Array.isArray(template.snippets) && template.snippets.length > 0) {
      const snippetDir = path.join(projectPath, '.supercli');
      ensureDir(snippetDir);
      fs.writeFileSync(path.join(snippetDir, 'snippets.json'), JSON.stringify(template.snippets, null, 2), 'utf8');
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-template', async (event, templateName) => {
  try {
    const dir = path.join(os.homedir(), '.supercli', 'templates');
    const safeName = templateName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const file = path.join(dir, `${safeName}.json`);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Custom Themes
ipcMain.handle('list-custom-themes', async () => {
  try {
    const dir = path.join(os.homedir(), '.supercli', 'themes');
    ensureDir(dir);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    const themes = files.map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      } catch (_) {
        return { name: f.replace('.json', ''), colors: {} };
      }
    });
    return { success: true, themes };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-custom-theme', async (event, theme) => {
  try {
    const dir = path.join(os.homedir(), '.supercli', 'themes');
    ensureDir(dir);
    const name = theme.name || 'Untitled';
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    fs.writeFileSync(path.join(dir, `${safeName}.json`), JSON.stringify(theme, null, 2), 'utf8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-custom-theme', async (event, themeName) => {
  try {
    const dir = path.join(os.homedir(), '.supercli', 'themes');
    const safeName = themeName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const file = path.join(dir, `${safeName}.json`);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// --- Mic Permission Check ---

ipcMain.handle('check-mic-access', async () => {
  try {
    const status = systemPreferences.getMediaAccessStatus('microphone');
    // Returns 'granted', 'denied', 'restricted', 'unknown', or 'not-determined'
    return {
      status,
      appDecision: micPermissionDecision,
      platform: process.platform
    };
  } catch (err) {
    return { status: 'unknown', error: err.message, appDecision: micPermissionDecision, platform: process.platform };
  }
});

// --- Quota IPC Handlers ---

ipcMain.handle('fetch-claude-quota', async () => {
  try {
    const scrapeWin = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    return new Promise((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          scrapeWin.destroy();
          resolve({ success: false, error: 'Timed out loading Claude usage page' });
        }
      }, 20000);

      scrapeWin.webContents.on('did-finish-load', async () => {
        try {
          const result = await scrapeWin.webContents.executeJavaScript(`
            new Promise((resolve) => {
              let attempts = 0;
              const check = () => {
                if (window.location.href.includes('/login') || window.location.href.includes('/auth')) {
                  resolve({ needsLogin: true });
                  return;
                }
                // Try multiple selectors for percentage data
                const selectors = [
                  'span.text-2xl.font-semibold',
                  '[class*="text-2xl"][class*="font-semibold"]',
                  '[class*="usage"] [class*="percent"]',
                  '[data-testid*="usage"] span',
                  '[class*="progress"] span'
                ];
                let pcts = [];
                for (const sel of selectors) {
                  try {
                    const spans = document.querySelectorAll(sel);
                    spans.forEach(s => {
                      const m = s.textContent.match(/(\\d+)\\s*%/);
                      if (m) pcts.push(parseInt(m[1], 10));
                    });
                  } catch (_) {}
                  if (pcts.length >= 1) break;
                }
                // Fallback: regex scan body text
                if (pcts.length === 0) {
                  const bodyText = document.body.innerText || '';
                  const matches = bodyText.match(/(\\d+)\\s*%/g);
                  if (matches) {
                    pcts = matches.map(m => parseInt(m, 10)).filter(n => n >= 0 && n <= 100);
                  }
                }
                if (pcts.length >= 1) {
                  resolve({ pcts });
                } else if (++attempts < 30) {
                  setTimeout(check, 500);
                } else {
                  resolve({ pcts: [], body: document.body.innerText.slice(0, 500) });
                }
              };
              check();
            });
          `);

          clearTimeout(timeout);
          if (resolved) return;
          resolved = true;
          scrapeWin.destroy();

          if (result.needsLogin) {
            resolve({ success: false, error: 'Not logged in to Claude. Click the login button in the usage popup first.' });
          } else if (result.pcts && result.pcts.length >= 2) {
            resolve({
              success: true,
              data: {
                fiveHourRemaining: result.pcts[0],
                weeklyRemaining: result.pcts[1]
              }
            });
          } else if (result.pcts && result.pcts.length === 1) {
            resolve({
              success: true,
              data: {
                fiveHourRemaining: result.pcts[0],
                weeklyRemaining: null
              }
            });
          } else {
            resolve({ success: false, error: 'Could not find usage data on page' });
          }
        } catch (err) {
          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            scrapeWin.destroy();
            resolve({ success: false, error: err.message });
          }
        }
      });

      scrapeWin.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          scrapeWin.destroy();
          resolve({ success: false, error: `Failed to load page: ${errorDescription}` });
        }
      });

      scrapeWin.loadURL('https://claude.ai/settings/usage');
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('fetch-codex-quota', async () => {
  try {
    // Use a hidden BrowserWindow to render the SPA and extract data from the DOM
    const scrapeWin = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    return new Promise((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          scrapeWin.destroy();
          resolve({ success: false, error: 'Timed out loading ChatGPT usage page' });
        }
      }, 20000);

      scrapeWin.webContents.on('did-finish-load', async () => {
        try {
          // Wait for SPA to render the usage data
          const result = await scrapeWin.webContents.executeJavaScript(`
            new Promise((resolve) => {
              let attempts = 0;
              const check = () => {
                // Check if redirected to login
                if (window.location.href.includes('/auth/') || window.location.href.includes('login')) {
                  resolve({ needsLogin: true });
                  return;
                }
                // Try multiple CSS selectors for percentage spans
                const selectors = [
                  'span.text-2xl.font-semibold',
                  '[class*="text-2xl"][class*="font-semibold"]',
                  '[class*="usage"] [class*="percent"]',
                  '[data-testid*="usage"] span'
                ];
                let pcts = [];
                for (const sel of selectors) {
                  try {
                    const spans = document.querySelectorAll(sel);
                    spans.forEach(s => {
                      const m = s.textContent.match(/(\\d+)\\s*%/);
                      if (m) pcts.push(parseInt(m[1], 10));
                    });
                  } catch (_) {}
                  if (pcts.length >= 1) break;
                }
                // Fallback: regex scan page body text for percentages near usage keywords
                if (pcts.length === 0) {
                  const bodyText = document.body.innerText || '';
                  const matches = bodyText.match(/(\\d+)\\s*%/g);
                  if (matches) {
                    pcts = matches.map(m => parseInt(m, 10)).filter(n => n >= 0 && n <= 100);
                  }
                }
                if (pcts.length >= 1) {
                  resolve({ pcts });
                } else if (++attempts < 30) {
                  setTimeout(check, 500);
                } else {
                  resolve({ pcts: [], body: document.body.innerText.slice(0, 500) });
                }
              };
              check();
            });
          `);

          clearTimeout(timeout);
          if (resolved) return;
          resolved = true;
          scrapeWin.destroy();

          if (result.needsLogin) {
            resolve({ success: false, error: 'Not logged in to ChatGPT. Click the login button in the usage popup first.' });
          } else if (result.pcts && result.pcts.length >= 2) {
            resolve({
              success: true,
              data: {
                weeklyRemaining: result.pcts[0],
                fiveHourRemaining: result.pcts[1]
              }
            });
          } else if (result.pcts && result.pcts.length === 1) {
            resolve({
              success: true,
              data: {
                weeklyRemaining: result.pcts[0],
                fiveHourRemaining: null
              }
            });
          } else {
            resolve({ success: false, error: 'Could not find usage data on page' });
          }
        } catch (err) {
          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            scrapeWin.destroy();
            resolve({ success: false, error: err.message });
          }
        }
      });

      scrapeWin.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          scrapeWin.destroy();
          resolve({ success: false, error: `Failed to load page: ${errorDescription}` });
        }
      });

      scrapeWin.loadURL('https://chatgpt.com/codex/settings/usage');
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

function createLoginWindow(url, title) {
  const loginWin = new BrowserWindow({
    width: 900,
    height: 750,
    parent: mainWindow,
    title,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Handle OAuth popups (Google, Microsoft, etc.) — redirect into the same window
  loginWin.webContents.setWindowOpenHandler(({ url: popupUrl }) => {
    loginWin.loadURL(popupUrl);
    return { action: 'deny' };
  });

  // Some OAuth flows use window.open with a blank target that Electron eats silently.
  // Also handle navigation within the window so Google sign-in completes properly.
  loginWin.webContents.on('will-navigate', (event, navUrl) => {
    // Allow all navigations within the login window
  });

  loginWin.loadURL(url);

  return new Promise((resolve) => {
    loginWin.on('closed', () => {
      resolve({ success: true });
    });
  });
}

ipcMain.handle('open-codex-login', async () => {
  return createLoginWindow('https://chatgpt.com/auth/login', 'Log in to ChatGPT — then close this window');
});

ipcMain.handle('open-claude-login', async () => {
  return createLoginWindow('https://claude.ai/login', 'Log in to Claude — then close this window');
});

// --- App Lifecycle ---

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  closeAllTerminals();
  closeAllWatchers();
  closeAllSchedulers();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
