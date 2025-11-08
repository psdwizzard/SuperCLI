const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
let pty = null;

try {
  pty = require('@lydell/node-pty');
} catch (error) {
  console.warn('Embedded PTY dependency (@lydell/node-pty) not available, falling back to external terminals:', error.message);
}

// Store active terminal sessions
const terminals = new Map();
let mainWindow;
// Track file watchers for TODO.md per project
const todoWatchers = new Map();

// Load user preferences from project-level `.user` and home-level fallback
function loadUserPreferences(projectPath) {
  const prefs = { version: 1, defaults: {}, language_prefs: {} };
  try {
    // Project-level .user
    if (projectPath) {
      const projectUserPath = path.join(projectPath, '.user');
      if (fs.existsSync(projectUserPath)) {
        const raw = fs.readFileSync(projectUserPath, 'utf8');
        Object.assign(prefs, JSON.parse(raw));
      }
    }
  } catch (e) {
    console.warn('Failed to parse project .user:', e.message);
  }

  try {
    // Home-level fallback (e.g., ~/.supercli.user)
    const homeUserPath = path.join(os.homedir(), '.supercli.user');
    if (fs.existsSync(homeUserPath)) {
      const rawHome = fs.readFileSync(homeUserPath, 'utf8');
      const homePrefs = JSON.parse(rawHome);
      // Merge only missing keys from home into prefs (project has precedence)
      for (const [k, v] of Object.entries(homePrefs)) {
        if (prefs[k] === undefined) prefs[k] = v;
      }
    }
  } catch (e) {
    console.warn('Failed to parse home .supercli.user:', e.message);
  }

  return prefs;
}

function escapePowerShellSingleQuotes(value = '') {
  return String(value).replace(/'/g, "''");
}

function escapePosixSingleQuotes(value = '') {
  return String(value).replace(/'/g, `'"'"'`);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      nodeIntegration: true
    }
  });

  mainWindow.loadFile('index.html');
}

// Create project folder structure
function createProjectStructure(projectPath) {
  const tempDir = path.join(projectPath, '.supercli', 'temp');
  const imagesDir = path.join(projectPath, '.supercli', 'images');

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  // Create project metadata file
  const metadataPath = path.join(projectPath, '.supercli', 'project.json');
  if (!fs.existsSync(metadataPath)) {
    const metadata = {
      created: new Date().toISOString(),
      sessions: []
    };
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }

  // Ensure a root-level TODO.md exists with usage instructions
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

// Handle project folder selection
ipcMain.handle('select-project-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const projectPath = result.filePaths[0];
    const structure = createProjectStructure(projectPath);
    const userPrefs = loadUserPreferences(projectPath);
    return { projectPath, ...structure, userPrefs };
  }

  return null;
});

// Expose an explicit loader for preferences
ipcMain.handle('load-user-preferences', async (event, projectPath) => {
  try {
    return { success: true, preferences: loadUserPreferences(projectPath) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Load project TODO list from root-level TODO.md (fallback to legacy .supercli/.todo)
ipcMain.handle('load-todo', async (event, projectPath) => {
  try {
    if (!projectPath) throw new Error('Missing projectPath');
    const rootTodo = path.join(projectPath, 'TODO.md');
    const rootTodoLower = path.join(projectPath, 'todo.md');
    const legacyJson = path.join(projectPath, '.supercli', '.todo');

    let items = [];
    let sections = [];
    if (fs.existsSync(rootTodo)) {
      const md = fs.readFileSync(rootTodo, 'utf8');
      ({ items, sections } = parseTodoMarkdown(md));
    } else if (fs.existsSync(rootTodoLower)) {
      const md = fs.readFileSync(rootTodoLower, 'utf8');
      ({ items, sections } = parseTodoMarkdown(md));
    } else if (fs.existsSync(legacyJson)) {
      // Legacy support: convert JSON to items
      const raw = fs.readFileSync(legacyJson, 'utf8').trim();
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          items = Array.isArray(parsed) ? parsed : (parsed.items || []);
        } catch (e) {
          items = raw.split(/\r?\n/).filter(Boolean).map(t => ({ text: t, done: false }));
        }
      }
    } else {
      // Initialize an empty TODO.md
      const initial = '# TODO\n\n';
      fs.writeFileSync(rootTodo, initial, 'utf8');
      items = [];
    }

    // If sections not populated (legacy paths), create a default section
    if (!sections || sections.length === 0) {
      sections = [];
      if (items.length > 0) {
        sections.push({ title: 'Uncategorized', items });
      }
    }

    return { success: true, items, sections };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Save project TODO list to root-level TODO.md
ipcMain.handle('save-todo', async (event, projectPath, items) => {
  try {
    if (!projectPath) throw new Error('Missing projectPath');
    const rootTodo = path.join(projectPath, 'TODO.md');
    let md;
    if (Array.isArray(items)) {
      // Back-compat: items array only (no sections)
      md = serializeTodoMarkdown({ items, sections: [] });
    } else if (items && typeof items === 'object') {
      // Expecting shape { items?, sections? }
      md = serializeTodoMarkdown(items);
    } else {
      md = serializeTodoMarkdown({ items: [], sections: [] });
    }
    fs.writeFileSync(rootTodo, md, 'utf8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Helpers: parse/serialize TODO markdown with sections
function parseTodoMarkdown(md = '') {
  const lines = String(md).split(/\r?\n/);
  const sections = [];
  let current = null;
  const items = [];
  for (const line of lines) {
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (heading) {
      const title = (heading[2] || '').trim();
      if (title.length === 0) continue;
      current = { title, items: [] };
      sections.push(current);
      continue;
    }
    const m = line.match(/^\s*[-*]\s*\[( |x|X)\]\s*(.*)$/);
    if (m) {
      const done = m[1].toLowerCase() === 'x';
      const text = (m[2] || '').trim();
      const item = { text, done };
      items.push(item);
      if (!current) {
        // Lazily create default section if first items before any heading
        current = sections.find(s => s.title === 'Uncategorized');
        if (!current) {
          current = { title: 'Uncategorized', items: [] };
          sections.push(current);
        }
      }
      current.items.push(item);
    }
  }
  return { items, sections };
}

function serializeTodoMarkdown(model) {
  // model: { sections?: [{title, items:[]}] , items?: [] }
  const header = '# TODO\n\n';
  const sections = Array.isArray(model?.sections) && model.sections.length > 0
    ? model.sections
    : [{ title: null, items: Array.isArray(model?.items) ? model.items : [] }];
  let body = '';
  for (const sec of sections) {
    if (sec.title) {
      body += `## ${sec.title}\n`;
    }
    for (const it of (sec.items || [])) {
      body += `- [${it.done ? 'x' : ' '}] ${it.text || ''}\n`;
    }
    if (sec.title) body += '\n';
  }
  return header + body;
}

// Watch/unwatch TODO.md for external changes and notify renderer
ipcMain.handle('watch-todo', async (event, projectPath) => {
  try {
    if (!projectPath) throw new Error('Missing projectPath');
    const rootTodo = path.join(projectPath, 'TODO.md');
    // Ensure file exists
    if (!fs.existsSync(rootTodo)) fs.writeFileSync(rootTodo, '# TODO\n\n', 'utf8');
    // Avoid duplicate watcher
    if (todoWatchers.has(projectPath)) {
      return { success: true, watching: true };
    }
    let debounceTimer = null;
    const watcher = fs.watch(rootTodo, { persistent: true }, (eventType) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        try {
          const md = fs.readFileSync(rootTodo, 'utf8');
          const parsed = parseTodoMarkdown(md);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('todo-updated-from-disk', projectPath, { items: parsed.items, sections: parsed.sections });
          }
        } catch (_) { /* ignore */ }
      }, 150);
    });
    todoWatchers.set(projectPath, watcher);
    return { success: true, watching: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('unwatch-todo', async (event, projectPath) => {
  try {
    const watcher = todoWatchers.get(projectPath);
    if (watcher) {
      try { watcher.close(); } catch (_) {}
      todoWatchers.delete(projectPath);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Save preferences to project-level `.user`
ipcMain.handle('save-user-preferences', async (event, projectPath, preferences) => {
  try {
    if (!projectPath) throw new Error('Missing projectPath');
    const targetPath = path.join(projectPath, '.user');

    // If renderer passed a string, try to parse
    let prefsObject = preferences;
    if (typeof prefsObject === 'string') {
      prefsObject = JSON.parse(prefsObject);
    }
    if (typeof prefsObject !== 'object' || prefsObject === null) {
      throw new Error('Preferences must be an object');
    }

    // Basic normalization
    if (!prefsObject.version) {
      prefsObject.version = 1;
    }

    fs.writeFileSync(targetPath, JSON.stringify(prefsObject, null, 2), 'utf8');
    return { success: true, path: targetPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Create a new terminal session (embedded when @lydell/node-pty is available)
ipcMain.handle('create-terminal', (event, id, cwd, cliCommand) => {
  console.log(`Creating terminal ${id} with CLI: ${cliCommand} in ${cwd}`);

  try {
    if (pty) {
      try {
        return createEmbeddedTerminal(id, cwd, cliCommand);
      } catch (embeddedError) {
        console.error('Embedded terminal failed, falling back to external window:', embeddedError);

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('terminal-data', id,
            `\x1b[31m[error]\x1b[0m Unable to initialize embedded terminal\r\n${embeddedError.message}\r\n` +
            `\x1b[33m[warn]\x1b[0m Falling back to an external terminal window...\r\n`
          );
        }
      }
    }

    return createExternalTerminal(id, cwd, cliCommand);
  } catch (error) {
    console.error('Error creating terminal:', error);
    return { success: false, error: error.message };
  }
});

function createEmbeddedTerminal(id, cwd, cliCommand) {
  if (!pty) {
    throw new Error('@lydell/node-pty is not installed');
  }

  const isWindows = os.platform() === 'win32';
  const shell = isWindows ? 'powershell.exe' : process.env.SHELL || '/bin/bash';
  const shellArgs = isWindows ? ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass'] : ['-l'];

  const ptyProcess = pty.spawn(shell, shellArgs, {
    name: 'xterm-color',
    cols: 80,
    rows: 30,
    cwd,
    env: {
      ...process.env,
      SUPERCLI_ACTIVE_CLI: cliCommand || ''
    }
  });

  terminals.set(id, {
    mode: 'embedded',
    cliCommand,
    cwd,
    ptyProcess
  });

  ptyProcess.on('data', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal-data', id, data);
    }
  });

  ptyProcess.on('exit', () => {
    terminals.delete(id);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal-exit', id);
    }
  });

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('terminal-data', id,
      `\x1b[32m[ok]\x1b[0m Embedded terminal ready (${isWindows ? 'PowerShell' : shell})\r\n` +
      `Working directory: ${cwd}\r\n`
    );
  }

  const initCommands = [];
  const cliLabel = cliCommand && cliCommand.trim().length > 0 ? cliCommand : 'shell';

  if (isWindows) {
    initCommands.push(`Set-Location -LiteralPath '${escapePowerShellSingleQuotes(cwd)}'`);
    initCommands.push(`Write-Host 'SuperCLI: ${escapePowerShellSingleQuotes(cliLabel)}' -ForegroundColor Green`);
  } else {
    initCommands.push(`cd '${escapePosixSingleQuotes(cwd)}'`);
    initCommands.push(`printf '\\033[32mSuperCLI: ${cliLabel}\\033[0m\\n'`);
  }

  if (cliCommand && cliCommand.trim().length > 0) {
    initCommands.push(cliCommand);
  }

  const separator = isWindows ? '; ' : ' && ';
  ptyProcess.write(initCommands.join(separator) + '\r');

  return { success: true, mode: 'embedded' };
}

function createExternalTerminal(id, cwd, cliCommand) {
  const cliLabel = cliCommand && cliCommand.trim().length > 0 ? cliCommand : 'shell';

  if (os.platform() === 'win32') {
    const safeCwd = escapePowerShellSingleQuotes(cwd);
    const safeCliLabel = escapePowerShellSingleQuotes(cliLabel);
    const safeWindowTitle = escapePowerShellSingleQuotes(`SuperCLI - ${cliLabel}`);
    const safeCliCommand = escapePowerShellSingleQuotes(cliCommand || '');
    const cliInvocation = cliCommand && cliCommand.trim().length > 0
      ? `Invoke-Expression '${safeCliCommand}'`
      : '';

    const scriptParts = [
      `$host.ui.RawUI.WindowTitle = '${safeWindowTitle}'`,
      `Set-Location -LiteralPath '${safeCwd}'`,
      `Write-Host 'SuperCLI: ${safeCliLabel}' -ForegroundColor Green`
    ];

    if (cliInvocation) {
      scriptParts.push(cliInvocation);
    }

    const commandScript = scriptParts.join('; ');
    const escapedCommandScript = commandScript.replace(/'/g, "''");
    const startProcessCommand =
      `Start-Process PowerShell -ArgumentList '-NoExit','-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-Command','& { ${escapedCommandScript} }' -WorkingDirectory '${safeCwd}'`;

    const powershellArgs = [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command',
      startProcessCommand
    ];

    console.log('Launching PowerShell window with args:', powershellArgs.join(' '));

    const launcher = spawn('powershell.exe', powershellArgs, {
      detached: false,
      stdio: 'ignore',
      windowsHide: true
    });

    launcher.on('error', (error) => {
      console.error('Failed to launch external terminal:', error);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal-data', id,
          `\x1b[31m[error]\x1b[0m Unable to open PowerShell window\r\n${error.message}\r\n`
        );
      }
    });

    launcher.unref();

    terminals.set(id, { mode: 'external', external: true, cliCommand, cwd, process: launcher });

    if (mainWindow && !mainWindow.isDestroyed()) {
      setTimeout(() => {
        mainWindow.webContents.send('terminal-data', id,
          `\x1b[32m[ok]\x1b[0m Launched ${cliLabel} in an external PowerShell window\r\n` +
          `Working directory: ${cwd}\r\n\r\n` +
          `\x1b[90mThe CLI is running in a separate PowerShell window.\r\n` +
          `Switch to that window to interact with the CLI directly.\x1b[0m\r\n`
        );
      }, 100);
    }

    return { success: true, mode: 'external' };
  }

  const commandParts = [
    `cd '${escapePosixSingleQuotes(cwd)}'`,
    `echo 'SuperCLI: ${escapePosixSingleQuotes(cliLabel)}'`
  ];

  if (cliCommand && cliCommand.trim().length > 0) {
    commandParts.push(cliCommand);
  }

  commandParts.push('exec bash');
  const command = commandParts.join(' && ');

  let launcher;
  if (os.platform() === 'darwin') {
    launcher = spawn('osascript', ['-e', `tell application "Terminal" to do script "${command}"`], {
      detached: true,
      stdio: 'ignore'
    });
  } else {
    launcher = spawn('x-terminal-emulator', ['-e', `bash -c "${command}"`], {
      detached: true,
      stdio: 'ignore'
    });
  }

  if (launcher) {
    launcher.unref();
  }

  terminals.set(id, { mode: 'external', external: true, cliCommand, cwd, process: launcher });

  if (mainWindow && !mainWindow.isDestroyed()) {
    setTimeout(() => {
      mainWindow.webContents.send('terminal-data', id,
        `\x1b[32m[ok]\x1b[0m Launched ${cliLabel} in external terminal\x1b[0m\r\n`
      );
    }, 100);
  }

  return { success: true, mode: 'external' };
}

// Write to terminal (for external terminals, just echo to display)
ipcMain.handle('write-to-terminal', (event, id, data) => {
  const terminal = terminals.get(id);

  if (terminal && terminal.ptyProcess) {
    console.log(`Writing to embedded PTY ${id}:`, JSON.stringify(data));
    terminal.ptyProcess.write(data);
    return { success: true, external: false };
  }

  if (terminal && terminal.external) {
    // Can't write to external terminal, but echo the command for reference
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal-data', id,
        `\x1b[90m> ${data.replace(/\r$/, '')}\x1b[0m\r\n` +
        `\x1b[33m[warn]\x1b[0m Type this command in the external ${terminal.cliCommand} window\x1b[0m\r\n`
      );
    }
    return { success: true, external: true };
  }

  return { success: false };
});

// Resize terminal (supported for embedded PTYs)
ipcMain.handle('resize-terminal', (event, id, cols, rows) => {
  const terminal = terminals.get(id);

  if (terminal && terminal.ptyProcess && cols && rows) {
    try {
      terminal.ptyProcess.resize(Math.max(cols, 1), Math.max(rows, 1));
    } catch (error) {
      console.warn(`Unable to resize terminal ${id}:`, error.message);
    }
  }

  return { success: true };
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

// Close terminal
ipcMain.handle('close-terminal', (event, id) => {
  const terminal = terminals.get(id);
  if (terminal) {
    if (terminal.ptyProcess && typeof terminal.ptyProcess.kill === 'function') {
      try {
        terminal.ptyProcess.kill();
      } catch (error) {
        console.warn(`Unable to kill embedded terminal for ${id}:`, error.message);
      }
    }
    if (terminal.process && typeof terminal.process.kill === 'function') {
      try {
        terminal.process.kill();
      } catch (error) {
        console.warn(`Unable to kill terminal process for ${id}:`, error.message);
      }
    }
    terminals.delete(id);
    return { success: true };
  }
  return { success: false };
});

// Save image from clipboard
ipcMain.handle('save-image', async (event, projectPath, imageData) => {
  try {
    const imagesDir = path.join(projectPath, '.supercli', 'images');
    const timestamp = Date.now();
    const filename = `image_${timestamp}.png`;
    const filepath = path.join(imagesDir, filename);

    // Remove data URL prefix if present
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    fs.writeFileSync(filepath, buffer);

    return { success: true, filepath, filename };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // Clean up all terminals
  terminals.forEach((terminal, id) => {
    if (terminal.ptyProcess && typeof terminal.ptyProcess.kill === 'function') {
      try {
        terminal.ptyProcess.kill();
      } catch (error) {
        console.warn(`Unable to kill embedded terminal for ${id}:`, error.message);
      }
    }
    if (terminal.process && typeof terminal.process.kill === 'function') {
      try {
        terminal.process.kill();
      } catch (error) {
        console.warn(`Unable to kill terminal process for ${id}:`, error.message);
      }
    }
  });
  terminals.clear();

  // Clean up TODO watchers
  todoWatchers.forEach((watcher, proj) => {
    try { watcher.close(); } catch (_) {}
  });
  todoWatchers.clear();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
