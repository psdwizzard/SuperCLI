console.log('Renderer.js loading...');

const { ipcRenderer, clipboard } = require('electron');

let Terminal, FitAddon;

try {
  Terminal = require('@xterm/xterm').Terminal;
  FitAddon = require('@xterm/addon-fit').FitAddon;
  console.log('XTerm modules loaded successfully');
} catch (error) {
  console.error('Error loading XTerm modules:', error);
}

// Create electronAPI wrapper
window.electronAPI = {
  selectProjectFolder: () => ipcRenderer.invoke('select-project-folder'),
  createTerminal: (id, cwd, cliCommand) => ipcRenderer.invoke('create-terminal', id, cwd, cliCommand),
  writeToTerminal: (id, data) => ipcRenderer.invoke('write-to-terminal', id, data),
  resizeTerminal: (id, cols, rows) => ipcRenderer.invoke('resize-terminal', id, cols, rows),
  closeTerminal: (id) => ipcRenderer.invoke('close-terminal', id),
  openDevTools: () => ipcRenderer.invoke('open-devtools'),
  onTerminalData: (callback) => {
    ipcRenderer.on('terminal-data', (event, id, data) => callback(id, data));
  },
  onTerminalExit: (callback) => {
    ipcRenderer.on('terminal-exit', (event, id) => callback(id));
  },
  saveImage: (projectPath, imageData) => ipcRenderer.invoke('save-image', projectPath, imageData)
};

console.log('electronAPI created');

// Application state
const state = {
  projectPath: null,
  projectInfo: null,
  terminals: new Map(),
  activeTerminalId: null,
  terminalCounter: 0,
  selectedCli: null
};

function setupTerminalClipboardShortcuts(xterm, terminalId) {
  if (!xterm || typeof xterm.attachCustomKeyEventHandler !== 'function') {
    return;
  }

  xterm.attachCustomKeyEventHandler((event) => {
    if (!event || event.type !== 'keydown') {
      return true;
    }

    const key = event.key || '';
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
          window.electronAPI.writeToTerminal(terminalId, normalized);
        }
      } catch (error) {
        console.error('Failed to paste into terminal:', error);
      }
      event.preventDefault?.();
      return false;
    }

    return true;
  });
}

// DOM elements
let tabsContainer, terminalContainer, newTabBtn, debugBtn;
let projectPathElement, inputField, sendBtn, inputInfo;
let cliModal, cliOptions, customCliInput, customCliCommand, modalCancel, modalConfirm, newProjectCheckbox;

// Initialize
async function init() {
  console.log('Init function called');

  try {
    // Get DOM elements
    tabsContainer = document.getElementById('tabs');
    terminalContainer = document.getElementById('terminalContainer');
    newTabBtn = document.getElementById('newTabBtn');
    debugBtn = document.getElementById('debugBtn');
    projectPathElement = document.getElementById('projectPath');
    inputField = document.getElementById('inputField');
    sendBtn = document.getElementById('sendBtn');
    inputInfo = document.getElementById('inputInfo');

    // Modal elements
    cliModal = document.getElementById('cliModal');
    cliOptions = document.querySelectorAll('.cli-option');
    customCliInput = document.getElementById('customCliInput');
    customCliCommand = document.getElementById('customCliCommand');
    modalCancel = document.getElementById('modalCancel');
    modalConfirm = document.getElementById('modalConfirm');
    newProjectCheckbox = document.getElementById('newProjectCheckbox');

    console.log('DOM elements loaded');

    setupEventListeners();
    setupTerminalListeners();

    // Show modal to create first CLI tab
    console.log('Showing CLI selection modal...');
    showCliModal();
  } catch (error) {
    console.error('Error in init:', error);
  }
}

// Setup event listeners
function setupEventListeners() {
  newTabBtn.addEventListener('click', () => showCliModal());
  sendBtn.addEventListener('click', sendCommand);
  if (debugBtn) {
    debugBtn.addEventListener('click', handleDebugButton);
  }

  // Modal event listeners
  modalCancel.addEventListener('click', hideCliModal);
  modalConfirm.addEventListener('click', handleCliConfirm);

  // CLI option selection
  cliOptions.forEach(option => {
    option.addEventListener('click', () => {
      cliOptions.forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');
      state.selectedCli = option.dataset.cli;

      // Show/hide custom input
      if (state.selectedCli === 'custom') {
        customCliInput.style.display = 'block';
        customCliCommand.focus();
      } else {
        customCliInput.style.display = 'none';
      }
    });
  });

  // Input field keyboard shortcuts
  inputField.addEventListener('keydown', handleInputFieldKeyDown);

  // Handle paste events for images
  inputField.addEventListener('paste', async (e) => {
    const items = e.clipboardData.items;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();

        if (!state.projectPath) {
          inputInfo.textContent = 'Please select a project folder first to paste images';
          inputInfo.style.color = '#f48771';
          setTimeout(() => {
            inputInfo.textContent = 'Ready';
            inputInfo.style.color = '#858585';
          }, 3000);
          return;
        }

        const blob = items[i].getAsFile();
        const reader = new FileReader();

        reader.onload = async (event) => {
          const imageData = event.target.result;
          const result = await window.electronAPI.saveImage(state.projectPath, imageData);

          if (result.success) {
            // Insert the file path at cursor position
            const cursorPos = inputField.selectionStart;
            const textBefore = inputField.value.substring(0, cursorPos);
            const textAfter = inputField.value.substring(inputField.selectionEnd);
            inputField.value = textBefore + result.filepath + textAfter;

            // Move cursor after inserted path
            const newPos = cursorPos + result.filepath.length;
            inputField.setSelectionRange(newPos, newPos);

            inputInfo.textContent = `Image saved: ${result.filename}`;
            inputInfo.style.color = '#4ec9b0';
            setTimeout(() => {
              inputInfo.textContent = 'Ready';
              inputInfo.style.color = '#858585';
            }, 3000);
          } else {
            inputInfo.textContent = `Error saving image: ${result.error}`;
            inputInfo.style.color = '#f48771';
          }
        };

        reader.readAsDataURL(blob);
      }
    }
  });

  // Auto-resize textarea
  inputField.addEventListener('input', () => {
    inputField.style.height = 'auto';
    inputField.style.height = Math.min(inputField.scrollHeight, 200) + 'px';
  });

  // Handle window resize
  window.addEventListener('resize', () => {
    // Resize the active terminal when window is resized
    if (state.activeTerminalId) {
      const terminal = state.terminals.get(state.activeTerminalId);
      if (terminal) {
        requestAnimationFrame(() => {
          terminal.fitAddon.fit();
          window.electronAPI.resizeTerminal(state.activeTerminalId, terminal.xterm.cols, terminal.xterm.rows);
        });
      }
    }
  });
}

function handleInputFieldKeyDown(e) {
  const key = e.key || '';
  const code = e.code || '';
  const isEnterKey = key === 'Enter' || code === 'Enter' || code === 'NumpadEnter';
  const hasModifier = e.shiftKey || e.altKey || e.metaKey || e.ctrlKey || e.isComposing;

  if (!isEnterKey || hasModifier) {
    return;
  }

  e.preventDefault();

  // Some keyboard layouts insert the newline before preventDefault fires; trim it back just in case
  if (inputField && /\r?\n$/.test(inputField.value)) {
    inputField.value = inputField.value.replace(/\r?\n$/, '');
  }

  sendCommand();
}

async function handleDebugButton() {
  try {
    const result = await window.electronAPI.openDevTools();
    if (!inputInfo) {
      return;
    }
    if (result?.success) {
      inputInfo.textContent = result.alreadyOpen ? 'DevTools already open' : 'DevTools opened in a separate window';
      inputInfo.style.color = '#4ec9b0';
    } else {
      inputInfo.textContent = 'Unable to open DevTools';
      inputInfo.style.color = '#f48771';
    }
    setTimeout(() => {
      const terminal = state.terminals.get(state.activeTerminalId);
      updateInputInfoForTerminal(terminal || null);
    }, 2500);
  } catch (error) {
    if (inputInfo) {
      inputInfo.textContent = 'Error opening DevTools';
      inputInfo.style.color = '#f48771';
    }
  }
}

// Setup terminal data listeners
function setupTerminalListeners() {
  window.electronAPI.onTerminalData((id, data) => {
    console.log(`Received data for terminal ${id}:`, data.substring(0, 100));
    const terminal = state.terminals.get(id);
    if (terminal) {
      terminal.xterm.write(data);
    } else {
      console.warn(`Terminal ${id} not found in state`);
    }
  });

  window.electronAPI.onTerminalExit((id) => {
    const terminal = state.terminals.get(id);
    if (terminal) {
      terminal.xterm.write('\r\n\x1b[31mTerminal session ended\x1b[0m\r\n');
    }
  });
}

// Show CLI selection modal
function showCliModal() {
  // Reset selection
  cliOptions.forEach(opt => opt.classList.remove('selected'));
  state.selectedCli = null;
  customCliInput.style.display = 'none';
  customCliCommand.value = '';
  if (newProjectCheckbox) {
    newProjectCheckbox.checked = false;
  }

  cliModal.classList.add('active');
}

// Hide CLI selection modal
function hideCliModal() {
  cliModal.classList.remove('active');
}

// Handle CLI confirm
async function handleCliConfirm() {
  console.log('handleCliConfirm called, selectedCli:', state.selectedCli);

  if (!state.selectedCli) {
    inputInfo.textContent = 'Please select a CLI';
    inputInfo.style.color = '#f48771';
    setTimeout(() => {
      inputInfo.textContent = 'Ready';
      inputInfo.style.color = '#858585';
    }, 3000);
    return;
  }

  let cliCommand;
  if (state.selectedCli === 'custom') {
    cliCommand = customCliCommand.value.trim();
    if (!cliCommand) {
      inputInfo.textContent = 'Please enter a custom CLI command';
      inputInfo.style.color = '#f48771';
      return;
    }
  } else {
    cliCommand = state.selectedCli;
  }

  console.log('CLI command:', cliCommand);
  const requestNewProject = newProjectCheckbox ? newProjectCheckbox.checked : false;

  hideCliModal();

  // Select folder if not already selected
  if (!state.projectPath || requestNewProject) {
    console.log('Selecting project folder...', {
      hasExistingPath: Boolean(state.projectPath),
      requestNewProject
    });
    const result = await window.electronAPI.selectProjectFolder();
    console.log('Folder selection result:', result);
    if (result) {
      state.projectPath = result.projectPath;
      state.projectInfo = result;
      projectPathElement.textContent = result.projectPath;
      projectPathElement.title = result.projectPath;
    } else {
      // User cancelled folder selection
      console.log('User cancelled folder selection');
      return;
    }
  }

  // Create terminal with selected CLI
  console.log('Creating terminal with CLI:', cliCommand);
  try {
    await createNewTerminal(cliCommand);
    console.log('Terminal created successfully');
  } catch (error) {
    console.error('Error creating terminal:', error);
  }
}

// Select project folder
async function selectProjectFolder() {
  const result = await window.electronAPI.selectProjectFolder();

  if (result) {
    state.projectPath = result.projectPath;
    state.projectInfo = result;
    projectPathElement.textContent = result.projectPath;
    projectPathElement.title = result.projectPath;
    inputInfo.textContent = 'Project folder selected';
    inputInfo.style.color = '#4ec9b0';
    setTimeout(() => {
      inputInfo.textContent = 'Ready';
      inputInfo.style.color = '#858585';
    }, 3000);
  }
}

// Create new terminal
async function createNewTerminal(cliCommand) {
  console.log('createNewTerminal called with CLI:', cliCommand);

  if (!Terminal || !FitAddon) {
    console.error('Terminal or FitAddon not loaded!');
    return;
  }

  const id = `terminal-${state.terminalCounter++}`;
  const cwd = state.projectPath || undefined;

  console.log('Creating terminal with id:', id, 'for CLI:', cliCommand);

  // Create XTerm instance
  const xterm = new Terminal({
    cursorBlink: true,
    theme: {
      background: '#1e1e1e',
      foreground: '#d4d4d4',
      cursor: '#d4d4d4',
      black: '#000000',
      brightBlack: '#666666',
      red: '#cd3131',
      brightRed: '#f14c4c',
      green: '#0dbc79',
      brightGreen: '#23d18b',
      yellow: '#e5e510',
      brightYellow: '#f5f543',
      blue: '#2472c8',
      brightBlue: '#3b8eea',
      magenta: '#bc3fbc',
      brightMagenta: '#d670d6',
      cyan: '#11a8cd',
      brightCyan: '#29b8db',
      white: '#e5e5e5',
      brightWhite: '#e5e5e5'
    },
    fontSize: 14,
    fontFamily: 'Consolas, "Courier New", monospace',
    scrollback: 1000
  });

  const fitAddon = new FitAddon();
  xterm.loadAddon(fitAddon);

  // Create terminal wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'terminal-wrapper';
  wrapper.id = `wrapper-${id}`;

  const terminalDiv = document.createElement('div');
  terminalDiv.className = 'terminal-instance';
  wrapper.appendChild(terminalDiv);
  terminalContainer.appendChild(wrapper);

  // Open XTerm
  xterm.open(terminalDiv);
  fitAddon.fit();
  setupTerminalClipboardShortcuts(xterm, id);

  // Create backend terminal with CLI command
  const creationResult = await window.electronAPI.createTerminal(id, cwd, cliCommand);

  if (!creationResult || !creationResult.success) {
    console.error('Failed to create terminal', creationResult?.error);
    xterm.dispose();
    wrapper.remove();
    inputInfo.textContent = creationResult?.error || 'Unable to start terminal session';
    inputInfo.style.color = '#f48771';
    setTimeout(() => {
      inputInfo.textContent = 'Ready';
      inputInfo.style.color = '#858585';
    }, 4000);
    return;
  }

  const terminalMode = creationResult.mode === 'embedded' ? 'embedded' : 'external';

  // Handle terminal input (embedded terminals only)
  if (terminalMode === 'embedded') {
  xterm.onData((data) => {
    console.log('xterm onData (embedded input):', JSON.stringify(data));
    window.electronAPI.writeToTerminal(id, data);
  });
  }

  // Handle resize
  const resizeObserver = new ResizeObserver(() => {
    // Ignore resize notifications while this terminal is hidden; otherwise we
    // shrink cols/rows to 0 and the PTY re-wraps existing output.
    if (!wrapper.classList.contains('active')) {
      return;
    }

    fitAddon.fit();
    window.electronAPI.resizeTerminal(id, xterm.cols, xterm.rows);
  });
  resizeObserver.observe(terminalDiv);

  // Store terminal info
  state.terminals.set(id, {
    xterm,
    fitAddon,
    wrapper,
    resizeObserver,
    cliCommand,
    mode: terminalMode
  });

  // Create tab with CLI name
  createTab(id, cliCommand);

  // Activate this terminal
  activateTerminal(id);
}

// Create tab
function createTab(id, cliCommand) {
  const tab = document.createElement('div');
  tab.className = 'tab';
  tab.dataset.terminalId = id;

  const label = document.createElement('span');
  label.className = 'tab-label';

  // Format CLI name for display
  const cliName = cliCommand.charAt(0).toUpperCase() + cliCommand.slice(1);
  label.textContent = cliName;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'tab-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeTerminal(id);
  });

  tab.appendChild(label);
  tab.appendChild(closeBtn);

  tab.addEventListener('click', () => activateTerminal(id));

  tabsContainer.appendChild(tab);
}

// Activate terminal
function activateTerminal(id) {
  // Deactivate all
  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.terminal-wrapper').forEach(wrapper => wrapper.classList.remove('active'));

  // Activate selected
  const tab = document.querySelector(`[data-terminal-id="${id}"]`);
  const terminal = state.terminals.get(id);

  if (tab && terminal) {
    tab.classList.add('active');
    terminal.wrapper.classList.add('active');
    state.activeTerminalId = id;
    updateInputInfoForTerminal(terminal);

    // Fit terminal to new size - use requestAnimationFrame to ensure DOM is updated
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        terminal.fitAddon.fit();
        window.electronAPI.resizeTerminal(id, terminal.xterm.cols, terminal.xterm.rows);
      });
    });

    // Focus on the terminal
    terminal.xterm.focus();
  } else {
    updateInputInfoForTerminal(null);
  }
}

function updateInputInfoForTerminal(terminal) {
  if (!inputInfo) return;

  if (!terminal) {
    inputInfo.textContent = 'Ready';
    inputInfo.style.color = '#858585';
    return;
  }

  const cliLabel = terminal.cliCommand || 'shell';

  if (terminal.mode === 'embedded') {
    inputInfo.textContent = `Connected to ${cliLabel}. Type below or click the terminal pane to interact.`;
    inputInfo.style.color = '#4ec9b0';
  } else {
    inputInfo.textContent = `External ${cliLabel} window opened. Use that PowerShell tab to run commands; this log keeps status only.`;
    inputInfo.style.color = '#f9c97a';
  }
}

// Close terminal
async function closeTerminal(id) {
  const terminal = state.terminals.get(id);
  const tab = document.querySelector(`[data-terminal-id="${id}"]`);

  if (terminal) {
    // Close backend terminal
    await window.electronAPI.closeTerminal(id);

    // Cleanup
    terminal.resizeObserver.disconnect();
    terminal.xterm.dispose();
    terminal.wrapper.remove();
    state.terminals.delete(id);
  }

  if (tab) {
    tab.remove();
  }

  // If this was the active terminal, activate another
  if (state.activeTerminalId === id) {
    const remainingTerminals = Array.from(state.terminals.keys());
    if (remainingTerminals.length > 0) {
      activateTerminal(remainingTerminals[0]);
    } else {
      state.activeTerminalId = null;
      // Show CLI modal to create a new terminal
      showCliModal();
    }
  }
}

// Send command
function sendCommand() {
  const command = inputField.value.trim();

  if (!command) return;

  if (!state.activeTerminalId) {
    inputInfo.textContent = 'No active terminal';
    inputInfo.style.color = '#f48771';
    return;
  }

  const terminal = state.terminals.get(state.activeTerminalId);
  if (terminal) {
    console.log('Sending command:', command);

    // Write command to terminal
    const isEmbedded = terminal.mode === 'embedded';

    window.electronAPI.writeToTerminal(
      state.activeTerminalId,
      `${command}\r`
    );

    if (terminal.mode === 'embedded') {
      inputInfo.textContent = 'Command sent to embedded terminal';
      inputInfo.style.color = '#4ec9b0';
      setTimeout(() => {
        updateInputInfoForTerminal(terminal);
      }, 2500);
    } else {
      inputInfo.textContent = `Command logged — run it inside the external ${terminal.cliCommand} window`;
      inputInfo.style.color = '#f9c97a';
      setTimeout(() => {
        updateInputInfoForTerminal(terminal);
      }, 4000);
    }

    // Clear input
    inputField.value = '';
    inputField.style.height = 'auto';

    // Keep focus on input field so user can type next command
    inputField.focus();
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
