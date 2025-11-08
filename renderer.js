console.log('Renderer.js loading...');

const { ipcRenderer, clipboard } = require('electron');
const path = require('path');

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
  loadUserPreferences: (projectPath) => ipcRenderer.invoke('load-user-preferences', projectPath),
  saveUserPreferences: (projectPath, prefs) => ipcRenderer.invoke('save-user-preferences', projectPath, prefs),
  loadTodo: (projectPath) => ipcRenderer.invoke('load-todo', projectPath),
  saveTodo: (projectPath, items) => ipcRenderer.invoke('save-todo', projectPath, items),
  watchTodo: (projectPath) => ipcRenderer.invoke('watch-todo', projectPath),
  unwatchTodo: (projectPath) => ipcRenderer.invoke('unwatch-todo', projectPath),
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

// External TODO updates
ipcRenderer.on('todo-updated-from-disk', (event, projectPath, payload) => {
  if (projectPath !== state.activeProjectPath) return;
  state.todoByProject.set(projectPath, { sections: payload.sections || [], items: payload.items || [] });
  renderTodoList();
});

console.log('electronAPI created');

// Application state
const state = {
  // Multi-project support
  projects: new Map(), // key: projectPath, value: { id, path, name, tabIds: [] }
  activeProjectPath: null,
  // Metadata of last-selected/active project from dialog
  projectInfo: null,
  userPrefsByProject: new Map(),
  todoByProject: new Map(),
  terminals: new Map(),
  activeTerminalId: null,
  terminalCounter: 0,
  selectedCli: null
};

function ensureProject(projectPath) {
  if (!projectPath) return null;
  if (!state.projects.has(projectPath)) {
    state.projects.set(projectPath, {
      id: `proj-${state.projects.size + 1}`,
      path: projectPath,
      name: path.basename(projectPath),
      tabIds: []
    });
    updateProjectSelector();
  }
  return state.projects.get(projectPath);
}

function setActiveProject(projectPath) {
  const proj = ensureProject(projectPath);
  state.activeProjectPath = projectPath;
  if (projectPathElement) {
    projectPathElement.textContent = projectPath || 'No project selected';
    projectPathElement.title = projectPath || '';
  }
  updateProjectSelector();
  refreshTabsForActiveProject();
  // Apply theme from project preferences (if available)
  try {
    const prefs = state.userPrefsByProject.get(projectPath);
    const theme = prefs?.defaults?.ui?.theme || 'dark';
    applyTheme(theme);
  } catch (_) { /* noop */ }
  // Refresh TODO for active project if panel visible
  if (todoPanel && todoPanel.classList.contains('active')) {
    ensureTodoLoadedForProject(projectPath).then(() => renderTodoList());
  }
  return proj;
}

function updateProjectSelector() {
  if (!projectSelector) return;
  // Build options list from projects map
  const options = Array.from(state.projects.values()).map(p => ({ value: p.path, label: p.name }));
  projectSelector.innerHTML = '';
  options.forEach(opt => {
    const el = document.createElement('option');
    el.value = opt.value;
    el.textContent = opt.label;
    if (opt.value === state.activeProjectPath) el.selected = true;
    projectSelector.appendChild(el);
  });
  projectSelector.disabled = options.length <= 1;
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
          window.electronAPI.writeToTerminal(terminalId, normalized);
        }
      } catch (error) {
        console.error('Failed to paste into terminal:', error);
      }
      event.preventDefault?.();
      return false;
    }

    // Scrolling/navigation shortcuts for better history browsing
    // PageUp/PageDown scroll roughly a terminal page
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

    // Ctrl+Home / Ctrl+End jump to top/bottom
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

// DOM elements
let tabsContainer, terminalContainer, newTabBtn, debugBtn;
let projectPathElement, inputField, sendBtn, inputInfo;
let projectSelector;
let cliModal, cliOptions, customCliInput, customCliCommand, modalCancel, modalConfirm, newProjectCheckbox;
let settingsBtn, settingsModal, settingsProjectName, settingsUserJson, settingsSave, settingsClose, settingsReload;
let todoBtn, todoPanel, todoCloseBtn, todoList, todoAddInput, todoAddBtn, todoEmptyState, todoSaveBtn, todoReloadBtn, todoAddSection;
// Settings form elements (General)
let profileNameInput, profileNotesInput, restoreOnLaunchChk, rememberWindowBoundsChk, themeSelectEl, fontSizeInput;
// Settings form elements (Python)
let pyDepThresholdInput, pyVenvDirInput, pyExeInput, pyUseReqChk, pyEntrypointInput, pyIncludeTemplatesChk, pyInstallBatText, pyRunBatText, settingsGenDefaultsBtn, settingsShowJsonChk;

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
    projectSelector = document.getElementById('projectSelector');
    inputField = document.getElementById('inputField');
    sendBtn = document.getElementById('sendBtn');
    inputInfo = document.getElementById('inputInfo');
    settingsBtn = document.getElementById('settingsBtn');
    todoBtn = document.getElementById('todoBtn');
    settingsModal = document.getElementById('settingsModal');
    settingsProjectName = document.getElementById('settingsProjectName');
    settingsUserJson = document.getElementById('settingsUserJson');
    settingsSave = document.getElementById('settingsSave');
    settingsClose = document.getElementById('settingsClose');
    settingsReload = document.getElementById('settingsReload');
    // Todo controls
    todoPanel = document.getElementById('todoPanel');
    todoCloseBtn = document.getElementById('todoCloseBtn');
    todoList = document.getElementById('todoList');
    todoAddInput = document.getElementById('todoAddInput');
    todoAddBtn = document.getElementById('todoAddBtn');
    todoEmptyState = document.getElementById('todoEmptyState');
    todoSaveBtn = document.getElementById('todoSaveBtn');
    todoReloadBtn = document.getElementById('todoReloadBtn');
    todoAddSection = document.getElementById('todoAddSection');
    // Settings form inputs
    profileNameInput = document.getElementById('profileName');
    profileNotesInput = document.getElementById('profileNotes');
    restoreOnLaunchChk = document.getElementById('restoreOnLaunch');
    rememberWindowBoundsChk = document.getElementById('rememberWindowBounds');
    themeSelectEl = document.getElementById('themeSelect');
    fontSizeInput = document.getElementById('fontSize');
    pyDepThresholdInput = document.getElementById('pyDepThreshold');
    pyVenvDirInput = document.getElementById('pyVenvDir');
    pyExeInput = document.getElementById('pyExe');
    pyUseReqChk = document.getElementById('pyUseReq');
    pyEntrypointInput = document.getElementById('pyEntrypoint');
    pyIncludeTemplatesChk = document.getElementById('pyIncludeTemplates');
    pyInstallBatText = document.getElementById('pyInstallBat');
    pyRunBatText = document.getElementById('pyRunBat');
    settingsGenDefaultsBtn = document.getElementById('settingsGenDefaults');
    settingsShowJsonChk = document.getElementById('settingsShowJson');

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

  if (settingsBtn) {
    settingsBtn.addEventListener('click', openSettingsModal);
  }
  if (todoBtn) {
    todoBtn.addEventListener('click', toggleTodoPanel);
  }
  if (todoCloseBtn) {
    todoCloseBtn.addEventListener('click', () => setTodoPanelVisible(false));
  }
  if (todoAddBtn) {
    todoAddBtn.addEventListener('click', handleTodoAdd);
  }
  if (todoAddInput) {
    todoAddInput.addEventListener('keydown', (e) => {
      const key = e.key || '';
      const code = e.code || '';
      if ((key === 'Enter' || code === 'Enter' || code === 'NumpadEnter') && !e.shiftKey) {
        e.preventDefault();
        handleTodoAdd();
      }
    });
  }
  if (todoSaveBtn) {
    todoSaveBtn.addEventListener('click', saveTodoToDisk);
  }
  if (todoReloadBtn) {
    todoReloadBtn.addEventListener('click', async () => {
      if (!state.activeProjectPath) return;
      await ensureTodoLoadedForProject(state.activeProjectPath, true);
      renderTodoList();
    });
  }
  if (settingsClose) {
    settingsClose.addEventListener('click', () => settingsModal.classList.remove('active'));
  }
  if (settingsReload) {
    settingsReload.addEventListener('click', reloadSettingsFromDisk);
  }
  if (settingsSave) {
    settingsSave.addEventListener('click', saveSettingsToDisk);
  }
  if (settingsGenDefaultsBtn) {
    settingsGenDefaultsBtn.addEventListener('click', () => {
      const { install_bat, run_bat } = getDefaultPythonTemplates();
      const venvDir = (pyVenvDirInput.value || '.venv');
      const pythonExe = (pyExeInput.value || 'python');
      const entry = (pyEntrypointInput.value || 'main.py');
      pyInstallBatText.value = install_bat
        .replaceAll('{{VENV_DIR}}', venvDir)
        .replaceAll('{{PYTHON}}', pythonExe);
      pyRunBatText.value = run_bat
        .replaceAll('{{VENV_DIR}}', venvDir)
        .replaceAll('{{ENTRYPOINT}}', entry);
    });
  }
  if (settingsShowJsonChk) {
    settingsShowJsonChk.addEventListener('change', () => {
      settingsUserJson.style.display = settingsShowJsonChk.checked ? 'block' : 'none';
    });
  }
  if (themeSelectEl) {
    themeSelectEl.addEventListener('change', () => {
      // Live preview theme when selection changes
      applyTheme(themeSelectEl.value || 'dark');
    });
  }

  if (projectSelector) {
    projectSelector.addEventListener('change', () => {
      const newPath = projectSelector.value;
      if (newPath && newPath !== state.activeProjectPath) {
        setActiveProject(newPath);
      }
    });
  }

  // Modal event listeners
  modalCancel.addEventListener('click', hideCliModal);
  modalConfirm.addEventListener('click', handleCliConfirm);

  // Global keyboard handler for terminal scrolling on active tab
  window.addEventListener('keydown', handleGlobalTerminalScroll);

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

        if (!state.activeProjectPath) {
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
          const result = await window.electronAPI.saveImage(state.activeProjectPath, imageData);

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

function isEditableTarget(target) {
  if (!target) return false;
  const tag = (target.tagName || '').toLowerCase();
  if (tag === 'textarea' || tag === 'input') return true;
  if (target.isContentEditable) return true;
  return false;
}

function handleGlobalTerminalScroll(event) {
  // Avoid interfering with typing inside inputs/textareas
  if (isEditableTarget(event.target)) {
    return;
  }

  const terminal = state.terminals.get(state.activeTerminalId);
  if (!terminal || !terminal.xterm) return;

  const key = event.key || '';
  const code = event.code || '';
  const ctrlOrCmd = event.ctrlKey || event.metaKey;

  // Mirror per-instance shortcuts for consistency across tabs
  if (code === 'PageUp' || key === 'PageUp') {
    const lines = Math.max(1, (terminal.xterm.rows || 24) - 1);
    terminal.xterm.scrollLines(-lines);
    event.preventDefault?.();
    return;
  }
  if (code === 'PageDown' || key === 'PageDown') {
    const lines = Math.max(1, (terminal.xterm.rows || 24) - 1);
    terminal.xterm.scrollLines(lines);
    event.preventDefault?.();
    return;
  }
  if ((code === 'Home' || key === 'Home') && ctrlOrCmd) {
    terminal.xterm.scrollToTop();
    event.preventDefault?.();
    return;
  }
  if ((code === 'End' || key === 'End') && ctrlOrCmd) {
    terminal.xterm.scrollToBottom();
    event.preventDefault?.();
    return;
  }

  // Initialize TODO visibility on load (hidden by default)
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

  // Select folder if not already selected or creating new project
  if (!state.activeProjectPath || requestNewProject) {
    console.log('Selecting project folder...', {
      hasExistingPath: Boolean(state.activeProjectPath),
      requestNewProject
    });
    const result = await window.electronAPI.selectProjectFolder();
    console.log('Folder selection result:', result);
    if (result) {
      state.projectInfo = result;
      if (result.userPrefs) {
        state.userPrefsByProject.set(result.projectPath, result.userPrefs);
      }
      setActiveProject(result.projectPath);
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
    state.projectInfo = result;
    if (result.userPrefs) {
      state.userPrefsByProject.set(result.projectPath, result.userPrefs);
    }
    setActiveProject(result.projectPath);
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
  const cwd = state.activeProjectPath || undefined;

  console.log('Creating terminal with id:', id, 'for CLI:', cliCommand);

  // Create XTerm instance
  const xterm = new Terminal({
    cursorBlink: true,
    theme: getXtermTheme((state.userPrefsByProject.get(state.activeProjectPath)?.defaults?.ui?.theme) || 'dark'),
    fontSize: 14,
    fontFamily: 'Consolas, "Courier New", monospace',
    // Allow much deeper history for scrolling back
    scrollback: 10000,
    // Keep view pinned when user types
    scrollOnUserInput: true
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
    mode: terminalMode,
    projectPath: state.activeProjectPath || null
  });

  // Create tab with CLI name (filtered per active project)
  if (state.activeProjectPath) {
    const proj = ensureProject(state.activeProjectPath);
    if (!proj.tabIds.includes(id)) proj.tabIds.push(id);
    refreshTabsForActiveProject();
  } else {
    createTab(id, cliCommand);
  }

  // Activate this terminal
  activateTerminal(id);
}

function openSettingsModal() {
  if (!state.activeProjectPath) {
    if (inputInfo) {
      inputInfo.textContent = 'Select a project to edit settings';
      inputInfo.style.color = '#f48771';
      setTimeout(() => {
        inputInfo.textContent = 'Ready';
        inputInfo.style.color = '#858585';
      }, 2500);
    }
    return;
  }
  const proj = state.projects.get(state.activeProjectPath);
  settingsProjectName.textContent = proj ? proj.name : state.activeProjectPath;

  // Populate textarea with cached prefs or fetch
  const cached = state.userPrefsByProject.get(state.activeProjectPath);
  if (cached) {
    settingsUserJson.value = JSON.stringify(cached, null, 2);
  } else {
    // Load then open
    reloadSettingsFromDisk().then(() => {
      // no-op
    });
  }

  settingsModal.classList.add('active');
}

// TODO panel logic and persistence
function toggleTodoPanel() {
  const visible = todoPanel?.classList.contains('active');
  setTodoPanelVisible(!visible);
}

function setTodoPanelVisible(visible) {
  if (!todoPanel) return;
  if (visible) {
    todoPanel.classList.add('active');
    if (state.activeProjectPath) {
      ensureTodoLoadedForProject(state.activeProjectPath).then(() => renderTodoList());
    }
  } else {
    todoPanel.classList.remove('active');
  }
}

async function ensureTodoLoadedForProject(projectPath, forceReload = false) {
  if (!projectPath) return;
  if (!forceReload && state.todoByProject.has(projectPath)) return;
  const res = await window.electronAPI.loadTodo(projectPath);
  if (res?.success) {
    state.todoByProject.set(projectPath, { sections: res.sections || [], items: res.items || [] });
  } else {
    state.todoByProject.set(projectPath, { sections: [], items: [] });
  }
}

function renderTodoList() {
  if (!todoList) return;
  const projectPath = state.activeProjectPath;
  const data = state.todoByProject.get(projectPath) || { sections: [] };
  const sections = data.sections || [];

  todoList.innerHTML = '';
  const total = sections.reduce((sum, s) => sum + (s.items?.length || 0), 0);
  if (todoEmptyState) todoEmptyState.style.display = total === 0 ? 'block' : 'none';

  sections.forEach((section, sIdx) => {
    if (section.title) {
      const sTitle = document.createElement('div');
      sTitle.className = 'todo-section-title';
      sTitle.textContent = section.title;
      todoList.appendChild(sTitle);
    }
    (section.items || []).forEach((item, iIdx) => {
      const row = document.createElement('div');
      row.className = 'todo-item';
      row.tabIndex = 0;
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'todo-checkbox';
      cb.checked = Boolean(item.done);
      cb.addEventListener('change', () => {
        item.done = Boolean(cb.checked);
        row.classList.toggle('done', item.done);
        saveTodoToDisk();
      });
      const text = document.createElement('span');
      text.className = 'todo-text';
      text.textContent = item.text || '';
      const actions = document.createElement('div');
      actions.className = 'todo-actions';
      const up = document.createElement('button'); up.className='todo-btn'; up.title='Move up'; up.textContent='↑'; up.addEventListener('click',()=>moveTodoItem(sIdx,iIdx,-1));
      const dn = document.createElement('button'); dn.className='todo-btn'; dn.title='Move down'; dn.textContent='↓'; dn.addEventListener('click',()=>moveTodoItem(sIdx,iIdx,1));
      const del = document.createElement('button'); del.className='todo-btn danger'; del.title='Delete'; del.textContent='✕'; del.addEventListener('click',()=>deleteTodoItem(sIdx,iIdx));
      actions.appendChild(up); actions.appendChild(dn); actions.appendChild(del);
      row.addEventListener('keydown', (e)=>handleTodoRowKeydown(e,sIdx,iIdx));
      row.appendChild(cb); row.appendChild(text); row.appendChild(actions);
      if (item.done) row.classList.add('done');
      todoList.appendChild(row);
    });
  });
}

function handleTodoAdd() {
  const text = (todoAddInput?.value || '').trim();
  if (!text) return;
  const projectPath = state.activeProjectPath;
  if (!projectPath) return;
  const data = state.todoByProject.get(projectPath) || { sections: [] };
  let sectionName = (todoAddSection?.value || '').trim();
  if (!sectionName) sectionName = 'Uncategorized';
  let section = data.sections.find(s => s.title === sectionName);
  if (!section) { section = { title: sectionName, items: [] }; data.sections.push(section); }
  section.items.push({ text, done: false });
  state.todoByProject.set(projectPath, data);
  todoAddInput.value = '';
  renderTodoList();
  saveTodoToDisk();
}

async function saveTodoToDisk() {
  const projectPath = state.activeProjectPath;
  if (!projectPath) return;
  const data = state.todoByProject.get(projectPath) || { sections: [] };
  await window.electronAPI.saveTodo(projectPath, { sections: data.sections });
}

function moveTodoItem(sIdx, iIdx, delta) {
  const projectPath = state.activeProjectPath; if (!projectPath) return;
  const data = state.todoByProject.get(projectPath); if (!data) return;
  const sec = data.sections[sIdx]; if (!sec) return;
  const ni = iIdx + delta; if (ni < 0 || ni >= sec.items.length) return;
  const [item] = sec.items.splice(iIdx,1); sec.items.splice(ni,0,item);
  renderTodoList(); saveTodoToDisk();
}

function deleteTodoItem(sIdx, iIdx) {
  const projectPath = state.activeProjectPath; if (!projectPath) return;
  const data = state.todoByProject.get(projectPath); if (!data) return;
  const sec = data.sections[sIdx]; if (!sec) return;
  sec.items.splice(iIdx,1);
  renderTodoList(); saveTodoToDisk();
}

function handleTodoRowKeydown(e, sIdx, iIdx) {
  const key = e.key || ''; const code = e.code || '';
  if (key === 'Delete') { e.preventDefault(); deleteTodoItem(sIdx,iIdx); return; }
  if ((e.altKey || e.metaKey) && (code === 'ArrowUp' || key === 'ArrowUp')) { e.preventDefault(); moveTodoItem(sIdx,iIdx,-1); return; }
  if ((e.altKey || e.metaKey) && (code === 'ArrowDown' || key === 'ArrowDown')) { e.preventDefault(); moveTodoItem(sIdx,iIdx,1); return; }
}

async function reloadSettingsFromDisk() {
  if (!state.activeProjectPath) return;
  const res = await window.electronAPI.loadUserPreferences(state.activeProjectPath);
  if (res?.success) {
    state.userPrefsByProject.set(state.activeProjectPath, res.preferences);
    populateSettingsForm(res.preferences);
    settingsUserJson.value = JSON.stringify(res.preferences, null, 2);
    inputInfo.textContent = 'Preferences loaded';
    inputInfo.style.color = '#4ec9b0';
    setTimeout(() => {
      updateInputInfoForTerminal(state.terminals.get(state.activeTerminalId) || null);
    }, 1500);
  } else {
    inputInfo.textContent = `Failed to load preferences: ${res?.error || 'unknown error'}`;
    inputInfo.style.color = '#f48771';
  }
}

async function saveSettingsToDisk() {
  if (!state.activeProjectPath) return;
  // Build preferences from form fields
  const prefs = buildPreferencesFromForm();
  // Keep JSON textarea in sync (for advanced view)
  settingsUserJson.value = JSON.stringify(prefs, null, 2);

  const res = await window.electronAPI.saveUserPreferences(state.activeProjectPath, prefs);
  if (res?.success) {
    state.userPrefsByProject.set(state.activeProjectPath, prefs);
    inputInfo.textContent = 'Preferences saved';
    inputInfo.style.color = '#4ec9b0';
    // Apply theme immediately
    applyTheme(prefs?.defaults?.ui?.theme || 'dark');
    setTimeout(() => {
      updateInputInfoForTerminal(state.terminals.get(state.activeTerminalId) || null);
    }, 1500);
  } else {
    inputInfo.textContent = `Failed to save: ${res?.error || 'unknown error'}`;
    inputInfo.style.color = '#f48771';
  }
}

// Theme management
const THEME_CLASSNAMES = ['theme-dark','theme-light','theme-deep-blue','theme-light-grey','theme-end-times'];

function applyTheme(themeName) {
  const body = document.body;
  // Normalize to class name
  let cls = 'theme-dark';
  switch ((themeName || '').toLowerCase()) {
    case 'light': cls = 'theme-light'; break;
    case 'deep-blue': cls = 'theme-deep-blue'; break;
    case 'light-grey': cls = 'theme-light-grey'; break;
    case 'end-times': cls = 'theme-end-times'; break;
    default: cls = 'theme-dark';
  }
  // Remove any previous theme classes
  THEME_CLASSNAMES.forEach(c => body.classList.remove(c));
  body.classList.add(cls);

  // Update xterm theme for all terminals
  const xtermTheme = getXtermTheme(themeName);
  state.terminals.forEach(t => {
    try {
      if (t?.xterm) {
        t.xterm.options.theme = xtermTheme;
      }
    } catch (e) { /* ignore */ }
  });
}

function getXtermTheme(themeName) {
  const name = (themeName || 'dark').toLowerCase();
  if (name === 'light' || name === 'light-grey') {
    return {
      background: '#ffffff',
      foreground: '#1e1e1e',
      cursor: '#1e1e1e',
      black: '#000000',
      red: '#cd3131',
      green: '#0dbc79',
      yellow: '#e5e510',
      blue: '#2472c8',
      magenta: '#bc3fbc',
      cyan: '#11a8cd',
      white: '#e5e5e5',
      brightBlack: '#666666',
      brightRed: '#f14c4c',
      brightGreen: '#23d18b',
      brightYellow: '#f5f543',
      brightBlue: '#3b8eea',
      brightMagenta: '#d670d6',
      brightCyan: '#29b8db',
      brightWhite: '#1e1e1e'
    };
  }
  if (name === 'deep-blue') {
    return {
      background: '#0b1626',
      foreground: '#d7e7ff',
      cursor: '#d7e7ff',
      black: '#0b1626',
      red: '#ff6b6b',
      green: '#23d18b',
      yellow: '#f5f543',
      blue: '#3b8eea',
      magenta: '#d670d6',
      cyan: '#29b8db',
      white: '#d7e7ff',
      brightBlack: '#2a3d5e',
      brightRed: '#ff8c8c',
      brightGreen: '#45f0a8',
      brightYellow: '#fff36a',
      brightBlue: '#66a9ff',
      brightMagenta: '#e08ae0',
      brightCyan: '#5fd0ff',
      brightWhite: '#ffffff'
    };
  }
  if (name === 'end-times') {
    return {
      background: '#000000',
      foreground: '#f5f543',
      cursor: '#f5f543',
      black: '#000000',
      red: '#c8b400',
      green: '#c8c800',
      yellow: '#f5f543',
      blue: '#bfbf00',
      magenta: '#ffff66',
      cyan: '#e5e510',
      white: '#f5f543',
      brightBlack: '#333333',
      brightRed: '#d6ca00',
      brightGreen: '#e1e100',
      brightYellow: '#ffff80',
      brightBlue: '#e0e000',
      brightMagenta: '#ffff99',
      brightCyan: '#ffff66',
      brightWhite: '#ffffaa'
    };
  }
  // Default dark
  return {
    background: '#1e1e1e',
    foreground: '#d4d4d4',
    cursor: '#d4d4d4',
    black: '#000000',
    red: '#cd3131',
    green: '#0dbc79',
    yellow: '#e5e510',
    blue: '#2472c8',
    magenta: '#bc3fbc',
    cyan: '#11a8cd',
    white: '#e5e5e5',
    brightBlack: '#666666',
    brightRed: '#f14c4c',
    brightGreen: '#23d18b',
    brightYellow: '#f5f543',
    brightBlue: '#3b8eea',
    brightMagenta: '#d670d6',
    brightCyan: '#29b8db',
    brightWhite: '#e5e5e5'
  };
}

function getDefaultPythonTemplates() {
  return {
    install_bat: "@echo off\r\nsetlocal enabledelayedexpansion\r\nif not exist \"{{VENV_DIR}}\\Scripts\\python.exe\" (\r\n  echo Creating virtual environment in {{VENV_DIR}}...\r\n  {{PYTHON}} -m venv {{VENV_DIR}}\r\n) else (\r\n  echo Using existing virtual environment in {{VENV_DIR}}\r\n)\r\ncall \"{{VENV_DIR}}\\Scripts\\activate.bat\"\r\nif exist requirements.txt (\r\n  echo Installing from requirements.txt...\r\n  pip install -r requirements.txt\r\n) else (\r\n  echo No requirements.txt found. Add your dependencies there.\r\n)\r\necho Done.\r\n",
    run_bat: "@echo off\r\nsetlocal\r\nif not exist \"{{VENV_DIR}}\\Scripts\\python.exe\" (\r\n  echo Virtual environment not found in {{VENV_DIR}}. Run install.bat first.\r\n  exit /b 1\r\n)\r\ncall \"{{VENV_DIR}}\\Scripts\\activate.bat\"\r\npython {{ENTRYPOINT}}\r\n"
  };
}

function populateSettingsForm(prefs) {
  const profile = prefs?.profile || {};
  profileNameInput.value = profile.name || '';
  profileNotesInput.value = profile.notes || '';

  const session = prefs?.defaults?.session || {};
  restoreOnLaunchChk.checked = Boolean(session.restore_on_launch);
  rememberWindowBoundsChk.checked = Boolean(session.remember_window_bounds);

  const ui = prefs?.defaults?.ui || {};
  themeSelectEl.value = ui.theme || 'dark';
  fontSizeInput.value = ui.font_size != null ? ui.font_size : 14;

  const py = prefs?.language_prefs?.python || {};
  const venv = py.venv || {};
  pyDepThresholdInput.value = venv.auto_enable_when_dependency_count_gte != null ? venv.auto_enable_when_dependency_count_gte : 2;
  pyVenvDirInput.value = venv.venv_dir || '.venv';
  pyExeInput.value = venv.python_executable || 'python';
  pyUseReqChk.checked = Boolean(venv.use_requirements_txt);
  pyEntrypointInput.value = py.entrypoint || 'main.py';

  const scripts = py.scripts || {};
  const defaults = getDefaultPythonTemplates();
  const hasTemplates = scripts.install_bat || scripts.run_bat;
  pyIncludeTemplatesChk.checked = Boolean(hasTemplates);
  pyInstallBatText.value = scripts.install_bat || defaults.install_bat
    .replaceAll('{{VENV_DIR}}', pyVenvDirInput.value || '.venv')
    .replaceAll('{{PYTHON}}', pyExeInput.value || 'python');
  pyRunBatText.value = scripts.run_bat || defaults.run_bat
    .replaceAll('{{VENV_DIR}}', pyVenvDirInput.value || '.venv')
    .replaceAll('{{ENTRYPOINT}}', pyEntrypointInput.value || 'main.py');
}

function buildPreferencesFromForm() {
  const prefs = {
    version: 1,
    profile: {
      name: profileNameInput.value || 'Default User',
      notes: profileNotesInput.value || ''
    },
    defaults: {
      session: {
        restore_on_launch: Boolean(restoreOnLaunchChk.checked),
        remember_window_bounds: Boolean(rememberWindowBoundsChk.checked)
      },
      ui: {
        theme: themeSelectEl.value || 'dark',
        font_size: Number(fontSizeInput.value || 14)
      }
    },
    language_prefs: {
      python: {
        venv: {
          auto_enable_when_dependency_count_gte: Number(pyDepThresholdInput.value || 2),
          venv_dir: pyVenvDirInput.value || '.venv',
          python_executable: pyExeInput.value || 'python',
          use_requirements_txt: Boolean(pyUseReqChk.checked)
        },
        entrypoint: pyEntrypointInput.value || 'main.py'
      }
    }
  };

  if (pyIncludeTemplatesChk.checked) {
    prefs.language_prefs.python.scripts = {
      install_bat: pyInstallBatText.value || getDefaultPythonTemplates().install_bat,
      run_bat: pyRunBatText.value || getDefaultPythonTemplates().run_bat
    };
  }

  return prefs;
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

function refreshTabsForActiveProject() {
  // Clear all and rebuild list for active project
  tabsContainer.innerHTML = '';
  const proj = state.projects.get(state.activeProjectPath);
  const tabIds = proj?.tabIds || [];
  tabIds.forEach(tid => {
    const t = state.terminals.get(tid);
    if (t) createTab(tid, t.cliCommand);
  });

  // Ensure an active terminal belongs to the active project
  if (!proj) {
    return;
  }
  if (!proj.tabIds.includes(state.activeTerminalId)) {
    if (proj.tabIds.length > 0) {
      activateTerminal(proj.tabIds[0]);
    } else {
      // Nothing to activate
      state.activeTerminalId = null;
      updateInputInfoForTerminal(null);
    }
  }
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
    const proj = state.projects.get(state.activeProjectPath);
    inputInfo.textContent = proj ? `Project: ${proj.name}` : 'Ready';
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

  // Remove from project list and refresh tabs if necessary
  if (terminal?.projectPath && state.projects.has(terminal.projectPath)) {
    const proj = state.projects.get(terminal.projectPath);
    proj.tabIds = proj.tabIds.filter(tid => tid !== id);
  }

  // If this was the active terminal, activate another
  if (state.activeTerminalId === id) {
    const proj = state.projects.get(state.activeProjectPath);
    const remaining = proj?.tabIds || [];
    if (remaining.length > 0) {
      activateTerminal(remaining[0]);
    } else {
      state.activeTerminalId = null;
      refreshTabsForActiveProject();
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
