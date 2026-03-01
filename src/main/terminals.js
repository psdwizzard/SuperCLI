const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { escapePowerShellSingleQuotes, escapePosixSingleQuotes } = require('./utils');

let pty = null;
try {
  pty = require('@lydell/node-pty');
} catch (error) {
  console.warn('Embedded PTY dependency (@lydell/node-pty) not available, falling back to external terminals:', error.message);
}

const terminals = new Map();
let mainWindowRef = null;

function init(mainWindow) {
  mainWindowRef = mainWindow;
}

function createTerminal(id, cwd, cliCommand, cliLabel) {
  // Fallback to home directory if cwd is missing
  if (!cwd) cwd = os.homedir();
  console.log(`Creating terminal ${id} with CLI: ${cliCommand} in ${cwd}`);
  try {
    if (pty) {
      try {
        return createEmbeddedTerminal(id, cwd, cliCommand, cliLabel);
      } catch (embeddedError) {
        console.error('Embedded terminal failed, falling back to external window:', embeddedError);
        if (mainWindowRef && !mainWindowRef.isDestroyed()) {
          mainWindowRef.webContents.send('terminal-data', id,
            `\x1b[31m[error]\x1b[0m Unable to initialize embedded terminal\r\n${embeddedError.message}\r\n` +
            `\x1b[33m[warn]\x1b[0m Falling back to an external terminal window...\r\n`
          );
        }
      }
    }
    return createExternalTerminal(id, cwd, cliCommand, cliLabel);
  } catch (error) {
    console.error('Error creating terminal:', error);
    return { success: false, error: error.message };
  }
}

function createEmbeddedTerminal(id, cwd, cliCommand, cliLabelOverride) {
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
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.webContents.send('terminal-data', id, data);
    }
  });

  ptyProcess.on('exit', () => {
    terminals.delete(id);
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.webContents.send('terminal-exit', id);
    }
  });

  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send('terminal-data', id,
      `\x1b[32m[ok]\x1b[0m Embedded terminal ready (${isWindows ? 'PowerShell' : shell})\r\n` +
      `Working directory: ${cwd}\r\n`
    );
  }

  const initCommands = [];
  const cliLabel = cliLabelOverride && String(cliLabelOverride).trim().length > 0
    ? cliLabelOverride
    : (cliCommand && cliCommand.trim().length > 0 ? cliCommand : 'shell');

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

function createExternalTerminal(id, cwd, cliCommand, cliLabelOverride) {
  const cliLabel = cliLabelOverride && String(cliLabelOverride).trim().length > 0
    ? cliLabelOverride
    : (cliCommand && cliCommand.trim().length > 0 ? cliCommand : 'shell');

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
      if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        mainWindowRef.webContents.send('terminal-data', id,
          `\x1b[31m[error]\x1b[0m Unable to open PowerShell window\r\n${error.message}\r\n`
        );
      }
    });

    launcher.unref();

    terminals.set(id, { mode: 'external', external: true, cliCommand, cwd, process: launcher });

    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      setTimeout(() => {
        mainWindowRef.webContents.send('terminal-data', id,
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

  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    setTimeout(() => {
      mainWindowRef.webContents.send('terminal-data', id,
        `\x1b[32m[ok]\x1b[0m Launched ${cliLabel} in external terminal\x1b[0m\r\n`
      );
    }, 100);
  }

  return { success: true, mode: 'external' };
}

function writeToTerminal(id, data) {
  const terminal = terminals.get(id);

  if (terminal && terminal.ptyProcess) {
    console.log(`Writing to embedded PTY ${id}:`, JSON.stringify(data));
    terminal.ptyProcess.write(data);
    return { success: true, external: false };
  }

  if (terminal && terminal.external) {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.webContents.send('terminal-data', id,
        `\x1b[90m> ${data.replace(/\r$/, '')}\x1b[0m\r\n` +
        `\x1b[33m[warn]\x1b[0m Type this command in the external ${terminal.cliCommand} window\x1b[0m\r\n`
      );
    }
    return { success: true, external: true };
  }

  return { success: false };
}

function resizeTerminal(id, cols, rows) {
  const terminal = terminals.get(id);
  if (terminal && terminal.ptyProcess && cols && rows) {
    try {
      terminal.ptyProcess.resize(Math.max(cols, 1), Math.max(rows, 1));
    } catch (error) {
      console.warn(`Unable to resize terminal ${id}:`, error.message);
    }
  }
  return { success: true };
}

function closeTerminal(id) {
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
}

function closeAllTerminals() {
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
}

function saveImage(projectPath, imageData) {
  const imagesDir = path.join(projectPath, '.supercli', 'images');
  const timestamp = Date.now();
  const filename = `image_${timestamp}.png`;
  const filepath = path.join(imagesDir, filename);

  const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');

  fs.writeFileSync(filepath, buffer);

  return { success: true, filepath, filename };
}

module.exports = {
  init,
  createTerminal,
  writeToTerminal,
  resizeTerminal,
  closeTerminal,
  closeAllTerminals,
  saveImage
};
