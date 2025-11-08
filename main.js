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
    return { projectPath, ...structure };
  }

  return null;
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
  const shellArgs = isWindows ? ['-NoLogo'] : ['-l'];

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
      `Start-Process PowerShell -ArgumentList '-NoExit','-NoLogo','-Command','& { ${escapedCommandScript} }' -WorkingDirectory '${safeCwd}'`;

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

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
