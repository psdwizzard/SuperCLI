console.log('Renderer loading...');

const path = require('path');
const state = require('./state');
const api = require('./api');
const { applyTheme } = require('./themes');
const tabs = require('./tabs');
const terminal = require('./terminal');
const explorer = require('./explorer');
const todoPanel = require('./todo-panel');
const settings = require('./settings');
const input = require('./input');
const cliModal = require('./cli-modal');
const shortcuts = require('./shortcuts');
const snippets = require('./snippets');
const templates = require('./templates');
const themeCreator = require('./theme-creator');

// DOM refs
let projectPathElement, projectSelector, inputField, sendBtn, debugBtn, inputInfo;
let newTabBtn, settingsBtn, todoBtn, todoCloseBtn, snippetsBtn, shortcutsBtn;
let explorerRefreshBtn;

// --- Project management ---

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
  ensureProject(projectPath);
  state.activeProjectPath = projectPath;
  if (projectPathElement) {
    projectPathElement.textContent = projectPath || 'No project selected';
    projectPathElement.title = projectPath || '';
  }
  if (projectPath && !state.userPrefsByProject.has(projectPath)) {
    loadUserPreferencesForProject(projectPath);
  }
  updateProjectSelector();
  tabs.refreshTabsForActiveProject({
    onActivate: terminal.activateTerminal,
    onClose: terminal.closeTerminal,
    updateInputInfoForTerminal: terminal.updateInputInfoForTerminal
  });
  explorer.loadExplorerTree();
  todoPanel.applyGithubControlsForProject(projectPath);
  todoPanel.renderGithubIssues();
  try {
    const prefs = state.userPrefsByProject.get(projectPath);
    const theme = prefs?.defaults?.ui?.theme || 'dark';
    applyTheme(theme);
  } catch (_) { /* noop */ }
  const todoPanelEl = document.getElementById('todoPanel');
  if (todoPanelEl && todoPanelEl.classList.contains('active')) {
    todoPanel.ensureTodoLoadedForProject(projectPath).then(() => todoPanel.renderTodoList());
    todoPanel.applyGithubControlsForProject(projectPath);
    todoPanel.ensureGithubIssuesLoadedForProject(projectPath);
  }
}

async function loadUserPreferencesForProject(projectPath) {
  if (!projectPath) return;
  const res = await api.loadUserPreferences(projectPath);
  if (res?.success) {
    state.userPrefsByProject.set(projectPath, res.preferences);
    if (projectPath === state.activeProjectPath) {
      settings.populateSettingsForm(res.preferences);
      const settingsUserJson = document.getElementById('settingsUserJson');
      if (settingsUserJson) settingsUserJson.value = JSON.stringify(res.preferences, null, 2);
      todoPanel.applyGithubControlsForProject(projectPath);
      const todoPanelEl = document.getElementById('todoPanel');
      if (todoPanelEl && todoPanelEl.classList.contains('active')) {
        todoPanel.ensureGithubIssuesLoadedForProject(projectPath, true);
      }
    }
  }
}

function updateProjectSelector() {
  if (!projectSelector) return;
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

// --- Debug ---

async function handleDebugButton() {
  try {
    const result = await api.openDevTools();
    if (!inputInfo) return;
    if (result?.success) {
      inputInfo.textContent = result.alreadyOpen ? 'DevTools already open' : 'DevTools opened in a separate window';
      inputInfo.style.color = '#4ec9b0';
    } else {
      inputInfo.textContent = 'Unable to open DevTools';
      inputInfo.style.color = '#f48771';
    }
    setTimeout(() => {
      terminal.updateInputInfoForTerminal(state.terminals.get(state.activeTerminalId) || null);
    }, 2500);
  } catch (error) {
    if (inputInfo) {
      inputInfo.textContent = 'Error opening DevTools';
      inputInfo.style.color = '#f48771';
    }
  }
}

// --- Event wiring ---

function setupEventListeners() {
  newTabBtn.addEventListener('click', () => cliModal.showCliModal());
  sendBtn.addEventListener('click', terminal.sendCommand);
  if (debugBtn) {
    debugBtn.addEventListener('click', handleDebugButton);
  }
  if (settingsBtn) {
    settingsBtn.addEventListener('click', settings.openSettingsModal);
  }
  const numberedListBtn = document.getElementById('numberedListBtn');
  if (numberedListBtn) {
    numberedListBtn.addEventListener('click', input.toggleNumberedListMode);
  }
  if (todoBtn) {
    todoBtn.addEventListener('click', todoPanel.toggleTodoPanel);
  }
  const todoCloseBtn = document.getElementById('todoCloseBtn');
  if (todoCloseBtn) {
    todoCloseBtn.addEventListener('click', () => todoPanel.setTodoPanelVisible(false));
  }
  const todoAddBtn = document.getElementById('todoAddBtn');
  if (todoAddBtn) {
    todoAddBtn.addEventListener('click', todoPanel.handleTodoAdd);
  }
  const todoAddInput = document.getElementById('todoAddInput');
  if (todoAddInput) {
    todoAddInput.addEventListener('keydown', (e) => {
      const key = e.key || '';
      const code = e.code || '';
      if ((key === 'Enter' || code === 'Enter' || code === 'NumpadEnter') && !e.shiftKey) {
        e.preventDefault();
        todoPanel.handleTodoAdd();
      }
    });
  }
  const todoSaveBtn = document.getElementById('todoSaveBtn');
  if (todoSaveBtn) {
    todoSaveBtn.addEventListener('click', todoPanel.saveTodoToDisk);
  }
  const todoReloadBtn = document.getElementById('todoReloadBtn');
  if (todoReloadBtn) {
    todoReloadBtn.addEventListener('click', async () => {
      if (!state.activeProjectPath) return;
      await todoPanel.ensureTodoLoadedForProject(state.activeProjectPath, true);
      todoPanel.renderTodoList();
    });
  }
  const ghIssueReloadBtn = document.getElementById('ghIssueReloadBtn');
  if (ghIssueReloadBtn) {
    ghIssueReloadBtn.addEventListener('click', () => {
      todoPanel.ensureGithubIssuesLoadedForProject(state.activeProjectPath, true);
    });
  }
  const ghIssueStateSelect = document.getElementById('ghIssueState');
  if (ghIssueStateSelect) {
    ghIssueStateSelect.addEventListener('change', () => {
      todoPanel.ensureGithubIssuesLoadedForProject(state.activeProjectPath, true);
    });
  }
  const ghIssueLabelsInput = document.getElementById('ghIssueLabels');
  if (ghIssueLabelsInput) {
    ghIssueLabelsInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        todoPanel.ensureGithubIssuesLoadedForProject(state.activeProjectPath, true);
      }
    });
  }
  const settingsClose = document.getElementById('settingsClose');
  if (settingsClose) {
    settingsClose.addEventListener('click', () => document.getElementById('settingsModal').classList.remove('active'));
  }
  const settingsReload = document.getElementById('settingsReload');
  if (settingsReload) {
    settingsReload.addEventListener('click', settings.reloadSettingsFromDisk);
  }
  const settingsSave = document.getElementById('settingsSave');
  if (settingsSave) {
    settingsSave.addEventListener('click', settings.saveSettingsToDisk);
  }
  const settingsGenDefaultsBtn = document.getElementById('settingsGenDefaults');
  if (settingsGenDefaultsBtn) {
    settingsGenDefaultsBtn.addEventListener('click', () => {
      const { install_bat, run_bat } = settings.getDefaultPythonTemplates();
      const venvDir = (document.getElementById('pyVenvDir').value || '.venv');
      const pythonExe = (document.getElementById('pyExe').value || 'python');
      const entry = (document.getElementById('pyEntrypoint').value || 'main.py');
      document.getElementById('pyInstallBat').value = install_bat
        .replaceAll('{{VENV_DIR}}', venvDir)
        .replaceAll('{{PYTHON}}', pythonExe);
      document.getElementById('pyRunBat').value = run_bat
        .replaceAll('{{VENV_DIR}}', venvDir)
        .replaceAll('{{ENTRYPOINT}}', entry);
    });
  }
  const settingsShowJsonChk = document.getElementById('settingsShowJson');
  if (settingsShowJsonChk) {
    settingsShowJsonChk.addEventListener('change', () => {
      document.getElementById('settingsUserJson').style.display = settingsShowJsonChk.checked ? 'block' : 'none';
    });
  }
  const themeSelectEl = document.getElementById('themeSelect');
  if (themeSelectEl) {
    themeSelectEl.addEventListener('change', () => {
      applyTheme(themeSelectEl.value || 'dark');
    });
  }
  const createThemeBtn = document.getElementById('createThemeBtn');
  if (createThemeBtn) {
    createThemeBtn.addEventListener('click', () => themeCreator.showThemeCreator());
  }
  if (projectSelector) {
    projectSelector.addEventListener('change', () => {
      const newPath = projectSelector.value;
      if (newPath && newPath !== state.activeProjectPath) {
        setActiveProject(newPath);
      }
    });
  }
  if (explorerRefreshBtn) {
    explorerRefreshBtn.addEventListener('click', () => {
      explorer.loadExplorerTree();
    });
  }

  // Modal event listeners
  const modalCancel = document.getElementById('modalCancel');
  const modalConfirm = document.getElementById('modalConfirm');
  modalCancel.addEventListener('click', cliModal.hideCliModal);
  modalConfirm.addEventListener('click', cliModal.handleCliConfirm);

  // Global keyboard handler for terminal scrolling
  window.addEventListener('keydown', input.handleGlobalTerminalScroll);

  // CLI option selection
  const cliOptions = document.querySelectorAll('.cli-option');
  cliOptions.forEach(option => {
    option.addEventListener('click', () => {
      cliOptions.forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');
      state.selectedCli = option.dataset.cli;

      if (state.selectedCli === 'custom') {
        document.getElementById('customCliInput').style.display = 'block';
        document.getElementById('customCliCommand').focus();
      } else {
        document.getElementById('customCliInput').style.display = 'none';
      }
    });
  });

  // Input field keyboard shortcuts
  inputField.addEventListener('keydown', input.handleInputFieldKeyDown);

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
          const result = await api.saveImage(state.activeProjectPath, imageData);
          if (result.success) {
            const cursorPos = inputField.selectionStart;
            const textBefore = inputField.value.substring(0, cursorPos);
            const textAfter = inputField.value.substring(inputField.selectionEnd);
            inputField.value = textBefore + result.filepath + textAfter;
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
    if (state.activeTerminalId) {
      const term = state.terminals.get(state.activeTerminalId);
      if (term) {
        requestAnimationFrame(() => {
          term.fitAddon.fit();
          api.resizeTerminal(state.activeTerminalId, term.xterm.cols, term.xterm.rows);
        });
      }
    }
  });

  // Snippets button
  if (snippetsBtn) {
    snippetsBtn.addEventListener('click', snippets.toggleSnippetPanel);
  }

  // Shortcuts button
  if (shortcutsBtn) {
    shortcutsBtn.addEventListener('click', shortcuts.showShortcutsModal);
  }

  // New project checkbox toggles template selector
  const newProjectCheckbox = document.getElementById('newProjectCheckbox');
  if (newProjectCheckbox) {
    newProjectCheckbox.addEventListener('change', () => {
      templates.toggleTemplateSelector(newProjectCheckbox.checked);
    });
  }
}

// --- External TODO updates ---
api.onTodoUpdatedFromDisk((projectPath, payload) => {
  if (projectPath !== state.activeProjectPath) return;
  state.todoByProject.set(projectPath, { sections: payload.sections || [], items: payload.items || [] });
  todoPanel.renderTodoList();
});

// --- Init ---

async function init() {
  console.log('Init function called');

  try {
    // Get DOM elements
    projectPathElement = document.getElementById('projectPath');
    projectSelector = document.getElementById('projectSelector');
    inputField = document.getElementById('inputField');
    sendBtn = document.getElementById('sendBtn');
    debugBtn = document.getElementById('debugBtn');
    inputInfo = document.getElementById('inputInfo');
    newTabBtn = document.getElementById('newTabBtn');
    settingsBtn = document.getElementById('settingsBtn');
    todoBtn = document.getElementById('todoBtn');
    snippetsBtn = document.getElementById('snippetsBtn');
    shortcutsBtn = document.getElementById('shortcutsBtn');
    explorerRefreshBtn = document.getElementById('explorerRefreshBtn');

    console.log('DOM elements loaded');

    // Initialize all modules
    tabs.init();
    terminal.init({
      onClose: terminal.closeTerminal,
      onActivate: terminal.activateTerminal,
      onShowCliModal: cliModal.showCliModal
    });
    explorer.init({ createNewTerminal: terminal.createNewTerminal });
    todoPanel.init();
    settings.init();
    input.init({ sendCommand: terminal.sendCommand });
    cliModal.init({
      setActiveProject,
      createNewTerminal: terminal.createNewTerminal
    });

    // Initialize new features
    shortcuts.initShortcuts({
      createNewTerminal: terminal.createNewTerminal,
      showCliModal: cliModal.showCliModal,
      closeTerminal: terminal.closeTerminal,
      activateTerminal: terminal.activateTerminal,
      openSettingsModal: settings.openSettingsModal,
      toggleTodoPanel: todoPanel.toggleTodoPanel,
      toggleSnippetPanel: snippets.toggleSnippetPanel,
      sendCommand: terminal.sendCommand
    });

    snippets.init();
    templates.init();
    themeCreator.init();

    setupEventListeners();
    terminal.setupTerminalListeners();

    // Load custom themes
    await themeCreator.loadCustomThemes();

    const startup = await api.getStartupProject();
    if (startup && startup.projectPath) {
      state.projectInfo = startup;
      if (startup.userPrefs) {
        state.userPrefsByProject.set(startup.projectPath, startup.userPrefs);
      }
      setActiveProject(startup.projectPath);
      // Load shortcuts from user prefs
      shortcuts.loadUserShortcuts(startup.userPrefs);
    }

    // Show modal to create first CLI tab
    console.log('Showing CLI selection modal...');
    cliModal.showCliModal();
  } catch (error) {
    console.error('Error in init:', error);
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
