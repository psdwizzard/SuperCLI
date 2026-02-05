const { clipboard } = require('electron');
const state = require('./state');
const api = require('./api');
const tabs = require('./tabs');
const { getXtermTheme } = require('./themes');

let Terminal, FitAddon;
try {
  Terminal = require('@xterm/xterm').Terminal;
  FitAddon = require('@xterm/addon-fit').FitAddon;
  console.log('XTerm modules loaded successfully');
} catch (error) {
  console.error('Error loading XTerm modules:', error);
}

let terminalContainer = null;
let inputInfo = null;

// Callbacks set by index.js
let onCloseTerminalCb = null;
let onActivateTerminalCb = null;
let onShowCliModalCb = null;

function init(callbacks) {
  terminalContainer = document.getElementById('terminalContainer');
  inputInfo = document.getElementById('inputInfo');
  if (callbacks) {
    onCloseTerminalCb = callbacks.onClose;
    onActivateTerminalCb = callbacks.onActivate;
    onShowCliModalCb = callbacks.onShowCliModal;
  }
}

function setupTerminalClipboardShortcuts(xterm, terminalId) {
  if (!xterm || typeof xterm.attachCustomKeyEventHandler !== 'function') {
    return;
  }

  xterm.attachCustomKeyEventHandler((event) => {
    if (!event || event.type !== 'keydown') {
      return true;
    }

    const key = event.key || '';
    const code = event.code || '';
    const keyLower = key.toLowerCase();
    const ctrlOrCmd = event.ctrlKey || event.metaKey;
    const isCopyShortcut = (ctrlOrCmd && keyLower === 'c') || (event.ctrlKey && key === 'Insert');
    const isPasteShortcut = (ctrlOrCmd && keyLower === 'v') || (event.shiftKey && key === 'Insert');

    if (isCopyShortcut) {
      if (typeof xterm.hasSelection === 'function' && xterm.hasSelection()) {
        try {
          clipboard.writeText(xterm.getSelection() || '');
        } catch (error) {
          console.error('Failed to copy terminal selection:', error);
        }
        event.preventDefault?.();
        return false;
      }
      return true;
    }

    if (isPasteShortcut) {
      const terminal = state.terminals.get(terminalId);
      if (!terminal || terminal.mode !== 'embedded') {
        return true;
      }

      try {
        const text = clipboard.readText();
        if (text) {
          const normalized = text.replace(/\r\n/g, '\r').replace(/\n/g, '\r');
          api.writeToTerminal(terminalId, normalized);
        }
      } catch (error) {
        console.error('Failed to paste into terminal:', error);
      }
      event.preventDefault?.();
      return false;
    }

    if (code === 'PageUp' || key === 'PageUp') {
      const lines = Math.max(1, (xterm.rows || 24) - 1);
      xterm.scrollLines(-lines);
      event.preventDefault?.();
      return false;
    }
    if (code === 'PageDown' || key === 'PageDown') {
      const lines = Math.max(1, (xterm.rows || 24) - 1);
      xterm.scrollLines(lines);
      event.preventDefault?.();
      return false;
    }

    if ((code === 'Home' || key === 'Home') && ctrlOrCmd) {
      xterm.scrollToTop();
      event.preventDefault?.();
      return false;
    }
    if ((code === 'End' || key === 'End') && ctrlOrCmd) {
      xterm.scrollToBottom();
      event.preventDefault?.();
      return false;
    }

    return true;
  });
}

async function createNewTerminal(cliCommand, displayLabel = null) {
  console.log('createNewTerminal called with CLI:', cliCommand);

  if (!Terminal || !FitAddon) {
    console.error('Terminal or FitAddon not loaded!');
    return;
  }

  const id = `terminal-${state.terminalCounter++}`;
  const cwd = state.activeProjectPath || undefined;

  const xterm = new Terminal({
    cursorBlink: true,
    theme: getXtermTheme((state.userPrefsByProject.get(state.activeProjectPath)?.defaults?.ui?.theme) || 'dark'),
    fontSize: 14,
    fontFamily: 'Consolas, "Courier New", monospace',
    scrollback: 10000,
    scrollOnUserInput: true
  });

  const fitAddon = new FitAddon();
  xterm.loadAddon(fitAddon);

  const wrapper = document.createElement('div');
  wrapper.className = 'terminal-wrapper';
  wrapper.id = `wrapper-${id}`;

  const terminalDiv = document.createElement('div');
  terminalDiv.className = 'terminal-instance';
  wrapper.appendChild(terminalDiv);
  terminalContainer.appendChild(wrapper);

  xterm.open(terminalDiv);
  fitAddon.fit();
  setupTerminalClipboardShortcuts(xterm, id);

  const creationResult = await api.createTerminal(id, cwd, cliCommand, displayLabel);

  if (!creationResult || !creationResult.success) {
    console.error('Failed to create terminal', creationResult?.error);
    xterm.dispose();
    wrapper.remove();
    if (inputInfo) {
      inputInfo.textContent = creationResult?.error || 'Unable to start terminal session';
      inputInfo.style.color = '#f48771';
      setTimeout(() => {
        inputInfo.textContent = 'Ready';
        inputInfo.style.color = '#858585';
      }, 4000);
    }
    return;
  }

  const terminalMode = creationResult.mode === 'embedded' ? 'embedded' : 'external';

  if (terminalMode === 'embedded') {
    xterm.onData((data) => {
      console.log('xterm onData (embedded input):', JSON.stringify(data));
      api.writeToTerminal(id, data);
    });
  }

  const resizeObserver = new ResizeObserver(() => {
    if (!wrapper.classList.contains('active')) {
      return;
    }
    fitAddon.fit();
    api.resizeTerminal(id, xterm.cols, xterm.rows);
  });
  resizeObserver.observe(terminalDiv);

  state.terminals.set(id, {
    xterm,
    fitAddon,
    wrapper,
    resizeObserver,
    cliCommand,
    displayLabel: displayLabel || tabs.formatCliLabel(cliCommand),
    mode: terminalMode,
    projectPath: state.activeProjectPath || null,
    hasSentCommand: false
  });

  if (state.activeProjectPath) {
    const proj = state.projects.get(state.activeProjectPath);
    if (proj) {
      if (!proj.tabIds.includes(id)) proj.tabIds.push(id);
      tabs.refreshTabsForActiveProject({
        onActivate: onActivateTerminalCb,
        onClose: onCloseTerminalCb,
        updateInputInfoForTerminal
      });
    }
  } else {
    tabs.createTab(id, cliCommand, displayLabel || tabs.formatCliLabel(cliCommand), {
      onActivate: onActivateTerminalCb,
      onClose: onCloseTerminalCb
    });
  }

  activateTerminal(id);
}

function activateTerminal(id) {
  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.terminal-wrapper').forEach(wrapper => wrapper.classList.remove('active'));

  const tab = document.querySelector(`[data-terminal-id="${id}"]`);
  const terminal = state.terminals.get(id);

  if (tab && terminal) {
    tab.classList.add('active');
    terminal.wrapper.classList.add('active');
    state.activeTerminalId = id;
    updateInputInfoForTerminal(terminal);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        terminal.fitAddon.fit();
        api.resizeTerminal(id, terminal.xterm.cols, terminal.xterm.rows);
      });
    });

    terminal.xterm.focus();
  } else {
    updateInputInfoForTerminal(null);
  }
}

async function closeTerminal(id) {
  const terminal = state.terminals.get(id);
  const tab = document.querySelector(`[data-terminal-id="${id}"]`);

  if (terminal) {
    await api.closeTerminal(id);
    terminal.resizeObserver.disconnect();
    terminal.xterm.dispose();
    terminal.wrapper.remove();
    state.terminals.delete(id);
  }

  if (tab) {
    tab.remove();
  }

  if (terminal?.projectPath && state.projects.has(terminal.projectPath)) {
    const proj = state.projects.get(terminal.projectPath);
    proj.tabIds = proj.tabIds.filter(tid => tid !== id);
  }

  if (state.activeTerminalId === id) {
    const proj = state.projects.get(state.activeProjectPath);
    const remaining = proj?.tabIds || [];
    if (remaining.length > 0) {
      activateTerminal(remaining[0]);
    } else {
      state.activeTerminalId = null;
      tabs.refreshTabsForActiveProject({
        onActivate: onActivateTerminalCb,
        onClose: onCloseTerminalCb,
        updateInputInfoForTerminal
      });
      if (onShowCliModalCb) onShowCliModalCb();
    }
  }
}

function sendCommand() {
  const inputField = document.getElementById('inputField');
  if (!state.activeTerminalId) {
    if (inputInfo) {
      inputInfo.textContent = 'No active terminal';
      inputInfo.style.color = '#f48771';
    }
    return;
  }

  const terminal = state.terminals.get(state.activeTerminalId);
  if (!terminal) {
    if (inputInfo) {
      inputInfo.textContent = 'No active terminal';
      inputInfo.style.color = '#f48771';
    }
    return;
  }

  const command = inputField.value.trim();
  const cliLabel = getTerminalLabel(terminal);

  if (!command) {
    if (!terminal.hasSentCommand) return;
    api.writeToTerminal(state.activeTerminalId, '\r');
    if (terminal.mode === 'embedded') {
      inputInfo.textContent = 'Enter sent to embedded terminal';
      inputInfo.style.color = '#4ec9b0';
      setTimeout(() => { updateInputInfoForTerminal(terminal); }, 2000);
    } else {
      inputInfo.textContent = `Enter logged - press it inside the external ${cliLabel} window`;
      inputInfo.style.color = '#f9c97a';
      setTimeout(() => { updateInputInfoForTerminal(terminal); }, 3000);
    }
    inputField.focus();
    return;
  }

  console.log('Sending command:', command);

  api.writeToTerminal(state.activeTerminalId, `${command}\r`);

  if (terminal.mode === 'embedded') {
    inputInfo.textContent = 'Command sent to embedded terminal';
    inputInfo.style.color = '#4ec9b0';
    setTimeout(() => { updateInputInfoForTerminal(terminal); }, 2500);
  } else {
    inputInfo.textContent = `Command logged - run it inside the external ${cliLabel} window`;
    inputInfo.style.color = '#f9c97a';
    setTimeout(() => { updateInputInfoForTerminal(terminal); }, 4000);
  }

  terminal.hasSentCommand = true;

  inputField.value = '';
  inputField.style.height = 'auto';
  inputField.focus();
}

function updateInputInfoForTerminal(terminal) {
  if (!inputInfo) return;

  if (!terminal) {
    const proj = state.projects.get(state.activeProjectPath);
    inputInfo.textContent = proj ? `Project: ${proj.name}` : 'Ready';
    inputInfo.style.color = '#858585';
    return;
  }

  const cliLabel = getTerminalLabel(terminal);

  if (terminal.mode === 'embedded') {
    inputInfo.textContent = `Connected to ${cliLabel}. Type below or click the terminal pane to interact.`;
    inputInfo.style.color = '#4ec9b0';
  } else {
    inputInfo.textContent = `External ${cliLabel} window opened. Use that PowerShell tab to run commands; this log keeps status only.`;
    inputInfo.style.color = '#f9c97a';
  }
}

function getTerminalLabel(terminal) {
  if (!terminal) return 'Shell';
  return terminal.displayLabel || terminal.cliCommand || 'Shell';
}

function setupTerminalListeners() {
  api.onTerminalData((id, data) => {
    console.log(`Received data for terminal ${id}:`, data.substring(0, 100));
    const terminal = state.terminals.get(id);
    if (terminal) {
      terminal.xterm.write(data);
    } else {
      console.warn(`Terminal ${id} not found in state`);
    }
  });

  api.onTerminalExit((id) => {
    const terminal = state.terminals.get(id);
    if (terminal) {
      terminal.xterm.write('\r\n\x1b[31mTerminal session ended\x1b[0m\r\n');
    }
  });
}

module.exports = {
  init,
  createNewTerminal,
  activateTerminal,
  closeTerminal,
  sendCommand,
  updateInputInfoForTerminal,
  setupTerminalListeners,
  getTerminalLabel
};
