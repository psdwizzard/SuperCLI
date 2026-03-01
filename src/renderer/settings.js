const state = require('./state');
const api = require('./api');
const { applyTheme, getAvailableThemes } = require('./themes');
const { applyGithubControlsForProject, ensureGithubIssuesLoadedForProject } = require('./todo-panel');
const { updateInputInfoForTerminal } = require('./terminal');

let settingsModal, settingsProjectName, settingsUserJson, settingsSave, settingsClose, settingsReload;
let profileNameInput, profileNotesInput, restoreOnLaunchChk, rememberWindowBoundsChk, themeSelectEl, fontSizeInput;
let pyDepThresholdInput, pyVenvDirInput, pyExeInput, pyUseReqChk, pyEntrypointInput, pyIncludeTemplatesChk, pyInstallBatText, pyRunBatText, settingsGenDefaultsBtn, settingsShowJsonChk;
let backupEnabledChk, backupIntervalInput, backupRetentionInput, backupTargetDirInput, backupCompressChk;
let ghEnabledChk, ghTokenInput, ghIssueDefaultStateSelect, ghIssueDefaultLabelsInput, ghCommentOnCloseChk, ghCloseCommentInput, ghCommentOnReopenChk, ghReopenCommentInput;
let todoPanel;
let inputInfo;
let settingsTabs, settingsTabBasic, settingsTabAdvanced;

function init() {
  settingsModal = document.getElementById('settingsModal');
  settingsProjectName = document.getElementById('settingsProjectName');
  settingsUserJson = document.getElementById('settingsUserJson');
  settingsSave = document.getElementById('settingsSave');
  settingsClose = document.getElementById('settingsClose');
  settingsReload = document.getElementById('settingsReload');
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
  backupEnabledChk = document.getElementById('backupEnabled');
  backupIntervalInput = document.getElementById('backupInterval');
  backupRetentionInput = document.getElementById('backupRetention');
  backupTargetDirInput = document.getElementById('backupTargetDir');
  backupCompressChk = document.getElementById('backupCompress');
  ghEnabledChk = document.getElementById('ghEnabled');
  ghTokenInput = document.getElementById('ghToken');
  ghIssueDefaultStateSelect = document.getElementById('ghIssueDefaultState');
  ghIssueDefaultLabelsInput = document.getElementById('ghIssueDefaultLabels');
  ghCommentOnCloseChk = document.getElementById('ghCommentOnClose');
  ghCloseCommentInput = document.getElementById('ghCloseComment');
  ghCommentOnReopenChk = document.getElementById('ghCommentOnReopen');
  ghReopenCommentInput = document.getElementById('ghReopenComment');
  todoPanel = document.getElementById('todoPanel');
  inputInfo = document.getElementById('inputInfo');

  settingsTabs = document.querySelectorAll('.settings-tab');
  settingsTabBasic = document.getElementById('settingsTabBasic');
  settingsTabAdvanced = document.getElementById('settingsTabAdvanced');

  settingsTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      settingsTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.getAttribute('data-tab');
      if (target === 'basic') {
        settingsTabBasic.classList.add('active');
        settingsTabAdvanced.classList.remove('active');
      } else {
        settingsTabBasic.classList.remove('active');
        settingsTabAdvanced.classList.add('active');
      }
    });
  });

  if (settingsClose) {
    settingsClose.addEventListener('click', () => {
      settingsModal.classList.remove('active');
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && settingsModal && settingsModal.classList.contains('active')) {
      settingsModal.classList.remove('active');
    }
  });
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

  // Refresh theme dropdown to include custom themes
  refreshThemeDropdown();

  const cached = state.userPrefsByProject.get(state.activeProjectPath);
  if (cached) {
    populateSettingsForm(cached);
    settingsUserJson.value = JSON.stringify(cached, null, 2);
  } else {
    reloadSettingsFromDisk();
  }

  settingsModal.classList.add('active');
}

function refreshThemeDropdown() {
  if (!themeSelectEl) return;
  const current = themeSelectEl.value;
  themeSelectEl.innerHTML = '';
  const themes = getAvailableThemes();
  themes.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.value;
    opt.textContent = t.label;
    themeSelectEl.appendChild(opt);
  });
  themeSelectEl.value = current;
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

  const backup = prefs?.backup || {};
  backupEnabledChk.checked = Boolean(backup.enabled);
  backupIntervalInput.value = backup.interval_minutes != null ? backup.interval_minutes : 60;
  backupRetentionInput.value = backup.retention_count != null ? backup.retention_count : 4;
  backupTargetDirInput.value = backup.target_dir || '.supercli/backups';
  backupCompressChk.checked = Boolean(backup.compress);

  const gh = prefs?.integrations?.github || {};
  ghEnabledChk.checked = Boolean(gh.enabled);
  ghTokenInput.value = gh.token || '';
  ghIssueDefaultStateSelect.value = gh.issue_state || 'open';
  ghIssueDefaultLabelsInput.value = gh.labels || '';
  ghCommentOnCloseChk.checked = Boolean(gh.comment_on_close);
  ghCloseCommentInput.value = gh.close_comment || 'Closed via SuperCLI.';
  ghCommentOnReopenChk.checked = Boolean(gh.comment_on_reopen);
  ghReopenCommentInput.value = gh.reopen_comment || 'Reopened via SuperCLI.';
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

  prefs.backup = {
    enabled: Boolean(backupEnabledChk.checked),
    interval_minutes: Number(backupIntervalInput.value || 60),
    retention_count: Number(backupRetentionInput.value || 4),
    target_dir: backupTargetDirInput.value || '.supercli/backups',
    compress: Boolean(backupCompressChk.checked)
  };

  prefs.integrations = {
    github: {
      enabled: Boolean(ghEnabledChk.checked),
      token: ghTokenInput.value || '',
      issue_state: ghIssueDefaultStateSelect.value || 'open',
      labels: ghIssueDefaultLabelsInput.value || '',
      comment_on_close: Boolean(ghCommentOnCloseChk.checked),
      close_comment: ghCloseCommentInput.value || 'Closed via SuperCLI.',
      comment_on_reopen: Boolean(ghCommentOnReopenChk.checked),
      reopen_comment: ghReopenCommentInput.value || 'Reopened via SuperCLI.'
    }
  };

  return prefs;
}

async function saveSettingsToDisk() {
  if (!state.activeProjectPath) return;
  let prefs;
  if (settingsShowJsonChk?.checked) {
    try {
      prefs = JSON.parse(settingsUserJson.value || '{}');
    } catch (e) {
      if (inputInfo) {
        inputInfo.textContent = 'Invalid JSON in advanced view';
        inputInfo.style.color = '#f48771';
      }
      return;
    }
  } else {
    prefs = buildPreferencesFromForm();
    settingsUserJson.value = JSON.stringify(prefs, null, 2);
  }

  const res = await api.saveUserPreferences(state.activeProjectPath, prefs);
  if (res?.success) {
    state.userPrefsByProject.set(state.activeProjectPath, prefs);
    if (inputInfo) {
      inputInfo.textContent = 'Preferences saved';
      inputInfo.style.color = '#4ec9b0';
    }
    applyTheme(prefs?.defaults?.ui?.theme || 'dark');
    applyGithubControlsForProject(state.activeProjectPath);
    if (todoPanel && todoPanel.classList.contains('active')) {
      ensureGithubIssuesLoadedForProject(state.activeProjectPath, true);
    }
    setTimeout(() => {
      updateInputInfoForTerminal(state.terminals.get(state.activeTerminalId) || null);
    }, 1500);
  } else {
    if (inputInfo) {
      inputInfo.textContent = `Failed to save: ${res?.error || 'unknown error'}`;
      inputInfo.style.color = '#f48771';
    }
  }
}

async function reloadSettingsFromDisk() {
  if (!state.activeProjectPath) return;
  const res = await api.loadUserPreferences(state.activeProjectPath);
  if (res?.success) {
    state.userPrefsByProject.set(state.activeProjectPath, res.preferences);
    populateSettingsForm(res.preferences);
    settingsUserJson.value = JSON.stringify(res.preferences, null, 2);
    applyGithubControlsForProject(state.activeProjectPath);
    if (todoPanel && todoPanel.classList.contains('active')) {
      ensureGithubIssuesLoadedForProject(state.activeProjectPath, true);
    }
    if (inputInfo) {
      inputInfo.textContent = 'Preferences loaded';
      inputInfo.style.color = '#4ec9b0';
      setTimeout(() => {
        updateInputInfoForTerminal(state.terminals.get(state.activeTerminalId) || null);
      }, 1500);
    }
  } else {
    if (inputInfo) {
      inputInfo.textContent = `Failed to load preferences: ${res?.error || 'unknown error'}`;
      inputInfo.style.color = '#f48771';
    }
  }
}

function getDefaultPythonTemplates() {
  return {
    install_bat: "@echo off\r\nsetlocal enabledelayedexpansion\r\nif not exist \"{{VENV_DIR}}\\Scripts\\python.exe\" (\r\n  echo Creating virtual environment in {{VENV_DIR}}...\r\n  {{PYTHON}} -m venv {{VENV_DIR}}\r\n) else (\r\n  echo Using existing virtual environment in {{VENV_DIR}}\r\n)\r\ncall \"{{VENV_DIR}}\\Scripts\\activate.bat\"\r\nif exist requirements.txt (\r\n  echo Installing from requirements.txt...\r\n  pip install -r requirements.txt\r\n) else (\r\n  echo No requirements.txt found. Add your dependencies there.\r\n)\r\necho Done.\r\n",
    run_bat: "@echo off\r\nsetlocal\r\nif not exist \"{{VENV_DIR}}\\Scripts\\python.exe\" (\r\n  echo Virtual environment not found in {{VENV_DIR}}. Run install.bat first.\r\n  exit /b 1\r\n)\r\ncall \"{{VENV_DIR}}\\Scripts\\activate.bat\"\r\npython {{ENTRYPOINT}}\r\n"
  };
}

module.exports = {
  init,
  openSettingsModal,
  populateSettingsForm,
  buildPreferencesFromForm,
  saveSettingsToDisk,
  reloadSettingsFromDisk,
  getDefaultPythonTemplates,
  refreshThemeDropdown
};
