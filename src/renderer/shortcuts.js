const state = require('./state');
const api = require('./api');

const DEFAULT_SHORTCUTS = [
  { id: 'new-tab',          label: 'New Tab',             category: 'Tabs',       keys: 'Ctrl+T' },
  { id: 'close-tab',        label: 'Close Tab',           category: 'Tabs',       keys: 'Ctrl+W' },
  { id: 'next-tab',         label: 'Next Tab',            category: 'Tabs',       keys: 'Ctrl+Tab' },
  { id: 'prev-tab',         label: 'Previous Tab',        category: 'Tabs',       keys: 'Ctrl+Shift+Tab' },
  { id: 'tab-1',            label: 'Go to Tab 1',         category: 'Tabs',       keys: 'Ctrl+1' },
  { id: 'tab-2',            label: 'Go to Tab 2',         category: 'Tabs',       keys: 'Ctrl+2' },
  { id: 'tab-3',            label: 'Go to Tab 3',         category: 'Tabs',       keys: 'Ctrl+3' },
  { id: 'tab-4',            label: 'Go to Tab 4',         category: 'Tabs',       keys: 'Ctrl+4' },
  { id: 'tab-5',            label: 'Go to Tab 5',         category: 'Tabs',       keys: 'Ctrl+5' },
  { id: 'tab-6',            label: 'Go to Tab 6',         category: 'Tabs',       keys: 'Ctrl+6' },
  { id: 'tab-7',            label: 'Go to Tab 7',         category: 'Tabs',       keys: 'Ctrl+7' },
  { id: 'tab-8',            label: 'Go to Tab 8',         category: 'Tabs',       keys: 'Ctrl+8' },
  { id: 'tab-9',            label: 'Go to Tab 9',         category: 'Tabs',       keys: 'Ctrl+9' },
  { id: 'settings',         label: 'Settings',            category: 'Navigation', keys: 'Ctrl+,' },
  { id: 'shortcuts',        label: 'Keyboard Shortcuts',  category: 'Navigation', keys: 'Ctrl+/' },
  { id: 'toggle-explorer',  label: 'Toggle Explorer',     category: 'Panels',     keys: 'Ctrl+B' },
  { id: 'toggle-todo',      label: 'Toggle TODO Panel',   category: 'Panels',     keys: 'Ctrl+J' },
  { id: 'toggle-snippets',  label: 'Toggle Snippets',     category: 'Panels',     keys: 'Ctrl+Shift+S' },
  { id: 'focus-input',      label: 'Focus Input',         category: 'Terminal',   keys: 'Ctrl+L' },
  { id: 'focus-terminal',   label: 'Focus Terminal',      category: 'Terminal',   keys: 'Escape' },
];

const actions = {};
let rebindingId = null;
let shortcutsModal = null;

function getShortcuts() {
  return DEFAULT_SHORTCUTS.map(s => ({
    ...s,
    keys: state.shortcuts[s.id] || s.keys
  }));
}

function registerAction(id, fn) {
  actions[id] = fn;
}

function parseKeyCombo(keysStr) {
  const parts = keysStr.split('+').map(p => p.trim().toLowerCase());
  return {
    ctrl: parts.includes('ctrl'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    meta: parts.includes('meta'),
    key: parts.filter(p => !['ctrl','shift','alt','meta'].includes(p))[0] || ''
  };
}

function eventMatchesCombo(e, combo) {
  const ctrlOrCmd = e.ctrlKey || e.metaKey;
  if (combo.ctrl && !ctrlOrCmd) return false;
  if (!combo.ctrl && ctrlOrCmd && combo.key !== 'escape') return false;
  if (combo.shift !== e.shiftKey) return false;
  if (combo.alt !== e.altKey) return false;

  const eventKey = (e.key || '').toLowerCase();
  const eventCode = (e.code || '').toLowerCase();

  if (combo.key === 'tab') return eventKey === 'tab';
  if (combo.key === 'escape') return eventKey === 'escape';
  if (combo.key === ',') return eventKey === ',';
  if (combo.key === '/') return eventKey === '/';
  if (/^\d$/.test(combo.key)) return eventKey === combo.key || eventCode === `digit${combo.key}`;
  return eventKey === combo.key;
}

function handleKeyEvent(e) {
  // If rebinding, capture the key and assign
  if (rebindingId) {
    e.preventDefault();
    e.stopPropagation();
    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');
    const key = e.key;
    if (!['Control','Shift','Alt','Meta'].includes(key)) {
      parts.push(key.length === 1 ? key.toUpperCase() : key);
      state.shortcuts[rebindingId] = parts.join('+');
      rebindingId = null;
      renderShortcutsGrid();
      saveUserShortcuts();
    }
    return;
  }

  // Don't intercept when typing in inputs (except for specific shortcuts)
  const tag = (e.target?.tagName || '').toLowerCase();
  const isInput = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;

  const shortcuts = getShortcuts();
  for (const sc of shortcuts) {
    const combo = parseKeyCombo(sc.keys);
    if (eventMatchesCombo(e, combo)) {
      // Allow escape even in inputs
      if (isInput && combo.key !== 'escape' && !combo.ctrl) continue;
      const fn = actions[sc.id];
      if (fn) {
        e.preventDefault();
        e.stopPropagation();
        fn();
        return;
      }
    }
  }
}

function showShortcutsModal() {
  if (!shortcutsModal) return;
  renderShortcutsGrid();
  shortcutsModal.classList.add('active');
}

function hideShortcutsModal() {
  if (!shortcutsModal) return;
  rebindingId = null;
  shortcutsModal.classList.remove('active');
}

function renderShortcutsGrid() {
  const grid = shortcutsModal?.querySelector('.shortcuts-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const shortcuts = getShortcuts();
  const categories = [...new Set(shortcuts.map(s => s.category))];

  categories.forEach(cat => {
    const catHeader = document.createElement('div');
    catHeader.className = 'shortcut-category';
    catHeader.textContent = cat;
    grid.appendChild(catHeader);

    shortcuts.filter(s => s.category === cat).forEach(sc => {
      const row = document.createElement('div');
      row.className = 'shortcut-row';

      const label = document.createElement('span');
      label.className = 'shortcut-label';
      label.textContent = sc.label;

      const keyBadge = document.createElement('span');
      keyBadge.className = 'shortcut-key';
      keyBadge.textContent = sc.keys;

      if (rebindingId === sc.id) {
        keyBadge.classList.add('shortcut-recording');
        keyBadge.textContent = 'Press a key...';
      }

      const rebindBtn = document.createElement('button');
      rebindBtn.className = 'shortcut-rebind-btn';
      rebindBtn.textContent = 'Rebind';
      rebindBtn.addEventListener('click', () => startRebind(sc.id));

      const resetBtn = document.createElement('button');
      resetBtn.className = 'shortcut-rebind-btn';
      resetBtn.textContent = 'Reset';
      resetBtn.addEventListener('click', () => {
        delete state.shortcuts[sc.id];
        renderShortcutsGrid();
        saveUserShortcuts();
      });

      row.appendChild(label);
      row.appendChild(keyBadge);
      row.appendChild(rebindBtn);
      if (state.shortcuts[sc.id]) {
        row.appendChild(resetBtn);
      }
      grid.appendChild(row);
    });
  });
}

function startRebind(shortcutId) {
  rebindingId = shortcutId;
  renderShortcutsGrid();
}

function loadUserShortcuts(prefs) {
  if (prefs?.shortcuts && typeof prefs.shortcuts === 'object') {
    Object.assign(state.shortcuts, prefs.shortcuts);
  }
}

async function saveUserShortcuts() {
  if (!state.activeProjectPath) return;
  const prefs = state.userPrefsByProject.get(state.activeProjectPath) || {};
  prefs.shortcuts = { ...state.shortcuts };
  state.userPrefsByProject.set(state.activeProjectPath, prefs);
  await api.saveUserPreferences(state.activeProjectPath, prefs);
}

function initShortcuts(callbacks) {
  shortcutsModal = document.getElementById('shortcutsModal');

  // Close button
  const closeBtn = shortcutsModal?.querySelector('.shortcuts-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', hideShortcutsModal);
  }

  // Register global key handler
  window.addEventListener('keydown', handleKeyEvent, true);

  // Register actions
  if (callbacks.showCliModal) registerAction('new-tab', callbacks.showCliModal);
  if (callbacks.closeTerminal) {
    registerAction('close-tab', () => {
      if (state.activeTerminalId) callbacks.closeTerminal(state.activeTerminalId);
    });
  }
  if (callbacks.activateTerminal) {
    registerAction('next-tab', () => {
      const proj = state.projects.get(state.activeProjectPath);
      if (!proj || proj.tabIds.length === 0) return;
      const idx = proj.tabIds.indexOf(state.activeTerminalId);
      const next = (idx + 1) % proj.tabIds.length;
      callbacks.activateTerminal(proj.tabIds[next]);
    });
    registerAction('prev-tab', () => {
      const proj = state.projects.get(state.activeProjectPath);
      if (!proj || proj.tabIds.length === 0) return;
      const idx = proj.tabIds.indexOf(state.activeTerminalId);
      const prev = (idx - 1 + proj.tabIds.length) % proj.tabIds.length;
      callbacks.activateTerminal(proj.tabIds[prev]);
    });
    // Tab 1-9
    for (let i = 1; i <= 9; i++) {
      const n = i;
      registerAction(`tab-${n}`, () => {
        const proj = state.projects.get(state.activeProjectPath);
        if (!proj || !proj.tabIds[n - 1]) return;
        callbacks.activateTerminal(proj.tabIds[n - 1]);
      });
    }
  }
  if (callbacks.openSettingsModal) registerAction('settings', callbacks.openSettingsModal);
  registerAction('shortcuts', () => showShortcutsModal());
  registerAction('toggle-explorer', () => {
    const panel = document.getElementById('explorerPanel');
    if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
  });
  if (callbacks.toggleTodoPanel) registerAction('toggle-todo', callbacks.toggleTodoPanel);
  if (callbacks.toggleSnippetPanel) registerAction('toggle-snippets', callbacks.toggleSnippetPanel);
  registerAction('focus-input', () => {
    const inputField = document.getElementById('inputField');
    if (inputField) inputField.focus();
  });
  registerAction('focus-terminal', () => {
    const term = state.terminals.get(state.activeTerminalId);
    if (term?.xterm) term.xterm.focus();
  });
}

module.exports = {
  getShortcuts,
  registerAction,
  handleKeyEvent,
  showShortcutsModal,
  hideShortcutsModal,
  startRebind,
  loadUserShortcuts,
  saveUserShortcuts,
  initShortcuts
};
