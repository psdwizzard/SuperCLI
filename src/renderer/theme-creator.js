const state = require('./state');
const api = require('./api');
const { registerCustomTheme, getXtermTheme, applyTheme, BUILTIN_THEMES } = require('./themes');
const { refreshThemeDropdown } = require('./settings');

let themeCreatorModal = null;

const DEFAULT_COLORS = {
  bg: '#1e1e1e',
  bgSecondary: '#252525',
  text: '#d4d4d4',
  textMuted: '#6e6e6e',
  accent: '#007acc',
  accentHover: '#005a9e',
  border: '#333333',
  terminalBg: '#1e1e1e',
  terminalFg: '#d4d4d4',
  terminalCursor: '#ffffff',
  ansiBlack: '#000000',
  ansiRed: '#cd3131',
  ansiGreen: '#0dbc79',
  ansiYellow: '#e5e510',
  ansiBlue: '#2472c8',
  ansiMagenta: '#bc3fbc',
  ansiCyan: '#11a8cd',
  ansiWhite: '#e5e5e5'
};

const COLOR_LABELS = {
  bg: 'Background',
  bgSecondary: 'Secondary BG',
  text: 'Text',
  textMuted: 'Muted Text',
  accent: 'Accent',
  accentHover: 'Accent Hover',
  border: 'Border',
  terminalBg: 'Terminal BG',
  terminalFg: 'Terminal FG',
  terminalCursor: 'Terminal Cursor',
  ansiBlack: 'ANSI Black',
  ansiRed: 'ANSI Red',
  ansiGreen: 'ANSI Green',
  ansiYellow: 'ANSI Yellow',
  ansiBlue: 'ANSI Blue',
  ansiMagenta: 'ANSI Magenta',
  ansiCyan: 'ANSI Cyan',
  ansiWhite: 'ANSI White'
};

const BUILTIN_UI_COLORS = {
  'dark': {
    bg: '#1e1e1e', bgSecondary: '#2d2d2d', text: '#d4d4d4', textMuted: '#6e6e6e',
    accent: '#007acc', accentHover: '#005a9e', border: '#3e3e3e'
  },
  'light': {
    bg: '#ffffff', bgSecondary: '#f2f2f2', text: '#1e1e1e', textMuted: '#666666',
    accent: '#2472c8', accentHover: '#1d5ea4', border: '#dddddd'
  },
  'deep-blue': {
    bg: '#0e1b2e', bgSecondary: '#10253f', text: '#d7e7ff', textMuted: '#9fb7d1',
    accent: '#3b8eea', accentHover: '#2e6fba', border: '#1c3d66'
  },
  'light-grey': {
    bg: '#f5f5f5', bgSecondary: '#e9e9e9', text: '#333333', textMuted: '#666666',
    accent: '#2472c8', accentHover: '#1d5ea4', border: '#d0d0d0'
  },
  'end-times': {
    bg: '#000000', bgSecondary: '#0a0a0a', text: '#d4d4d4', textMuted: '#c8c86b',
    accent: '#b3a800', accentHover: '#d6ca00', border: '#333333'
  },
  'matrix': {
    bg: '#050a05', bgSecondary: '#0b140b', text: '#f6fff6', textMuted: '#6aa56a',
    accent: '#0cfd00', accentHover: '#32ff2a', border: '#1f3b1f'
  }
};

let currentColors = { ...DEFAULT_COLORS };

function init() {
  themeCreatorModal = document.getElementById('themeCreatorModal');
}

function showThemeCreator(basedOn) {
  if (!themeCreatorModal) return;

  // Pre-fill colors from a base theme if specified
  if (basedOn) {
    const existing = state.customThemes.find(t => t.name === basedOn);
    if (existing && existing.colors) {
      currentColors = { ...DEFAULT_COLORS, ...existing.colors };
    }
  } else {
    currentColors = { ...DEFAULT_COLORS };
  }

  renderThemeCreator();
  themeCreatorModal.classList.add('active');
}

function hideThemeCreator() {
  if (themeCreatorModal) {
    themeCreatorModal.classList.remove('active');
  }
}

function renderThemeCreator() {
  const content = themeCreatorModal?.querySelector('.theme-creator-content');
  if (!content) return;
  content.innerHTML = '';

  // Name input
  const nameRow = document.createElement('div');
  nameRow.className = 'theme-creator-name-row';
  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Theme Name:';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.id = 'themeCreatorName';
  nameInput.className = 'settings-input';
  nameInput.placeholder = 'My Custom Theme';
  nameRow.appendChild(nameLabel);
  nameRow.appendChild(nameInput);
  content.appendChild(nameRow);

  // Based on dropdown
  const basedRow = document.createElement('div');
  basedRow.className = 'theme-creator-name-row';
  const basedLabel = document.createElement('label');
  basedLabel.textContent = 'Based on:';
  const basedSelect = document.createElement('select');
  basedSelect.className = 'settings-select';

  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = 'Default Dark';
  basedSelect.appendChild(noneOpt);

  Object.entries(BUILTIN_THEMES).forEach(([value, label]) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    basedSelect.appendChild(opt);
  });

  basedSelect.addEventListener('change', () => {
    const theme = basedSelect.value;
    if (theme) {
      // Apply UI colors from the built-in theme
      const uiColors = BUILTIN_UI_COLORS[theme];
      if (uiColors) {
        currentColors.bg = uiColors.bg;
        currentColors.bgSecondary = uiColors.bgSecondary;
        currentColors.text = uiColors.text;
        currentColors.textMuted = uiColors.textMuted;
        currentColors.accent = uiColors.accent;
        currentColors.accentHover = uiColors.accentHover;
        currentColors.border = uiColors.border;
      }
      // Apply terminal/ANSI colors
      const xtermColors = getXtermTheme(theme);
      currentColors.terminalBg = xtermColors.background || DEFAULT_COLORS.terminalBg;
      currentColors.terminalFg = xtermColors.foreground || DEFAULT_COLORS.terminalFg;
      currentColors.terminalCursor = xtermColors.cursor || DEFAULT_COLORS.terminalCursor;
      currentColors.ansiBlack = xtermColors.black || DEFAULT_COLORS.ansiBlack;
      currentColors.ansiRed = xtermColors.red || DEFAULT_COLORS.ansiRed;
      currentColors.ansiGreen = xtermColors.green || DEFAULT_COLORS.ansiGreen;
      currentColors.ansiYellow = xtermColors.yellow || DEFAULT_COLORS.ansiYellow;
      currentColors.ansiBlue = xtermColors.blue || DEFAULT_COLORS.ansiBlue;
      currentColors.ansiMagenta = xtermColors.magenta || DEFAULT_COLORS.ansiMagenta;
      currentColors.ansiCyan = xtermColors.cyan || DEFAULT_COLORS.ansiCyan;
      currentColors.ansiWhite = xtermColors.white || DEFAULT_COLORS.ansiWhite;
    } else {
      // Reset to defaults when "Default Dark" is selected
      currentColors = { ...DEFAULT_COLORS };
    }
    renderColorPickers(content);
    renderThemePreview(currentColors);
  });

  basedRow.appendChild(basedLabel);
  basedRow.appendChild(basedSelect);
  content.appendChild(basedRow);

  // Color picker grid
  renderColorPickers(content);

  // Preview
  const previewLabel = document.createElement('div');
  previewLabel.className = 'theme-creator-section-label';
  previewLabel.textContent = 'Preview';
  content.appendChild(previewLabel);

  const previewStrip = document.createElement('div');
  previewStrip.className = 'theme-preview-strip';
  previewStrip.id = 'themePreviewStrip';
  content.appendChild(previewStrip);
  renderThemePreview(currentColors);

  // Actions
  const actionsRow = document.createElement('div');
  actionsRow.className = 'modal-actions';

  const importBtn = document.createElement('button');
  importBtn.className = 'modal-btn';
  importBtn.textContent = 'Import JSON';
  importBtn.addEventListener('click', handleImport);

  const exportBtn = document.createElement('button');
  exportBtn.className = 'modal-btn';
  exportBtn.textContent = 'Export JSON';
  exportBtn.addEventListener('click', handleExport);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'modal-btn modal-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', hideThemeCreator);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'modal-btn modal-confirm';
  saveBtn.textContent = 'Save Theme';
  saveBtn.addEventListener('click', handleSave);

  actionsRow.appendChild(importBtn);
  actionsRow.appendChild(exportBtn);
  actionsRow.appendChild(cancelBtn);
  actionsRow.appendChild(saveBtn);
  content.appendChild(actionsRow);
}

function renderColorPickers(container) {
  let grid = container.querySelector('.color-picker-grid');
  if (!grid) {
    grid = document.createElement('div');
    grid.className = 'color-picker-grid';
    // Insert before preview
    const preview = container.querySelector('.theme-preview-strip');
    if (preview) {
      container.insertBefore(grid, preview.previousElementSibling);
    } else {
      container.appendChild(grid);
    }
  }
  grid.innerHTML = '';

  Object.entries(COLOR_LABELS).forEach(([key, label]) => {
    const row = document.createElement('div');
    row.className = 'color-picker-row';

    const lbl = document.createElement('label');
    lbl.textContent = label;

    const picker = document.createElement('input');
    picker.type = 'color';
    picker.value = currentColors[key] || DEFAULT_COLORS[key];
    picker.addEventListener('input', () => {
      currentColors[key] = picker.value;
      renderThemePreview(currentColors);
    });

    const hex = document.createElement('span');
    hex.className = 'color-hex';
    hex.textContent = picker.value;
    picker.addEventListener('input', () => {
      hex.textContent = picker.value;
    });

    row.appendChild(lbl);
    row.appendChild(picker);
    row.appendChild(hex);
    grid.appendChild(row);
  });
}

function renderThemePreview(colors) {
  const strip = document.getElementById('themePreviewStrip');
  if (!strip) return;
  strip.innerHTML = '';
  strip.style.backgroundColor = colors.bg;
  strip.style.border = `1px solid ${colors.border}`;
  strip.style.padding = '12px';
  strip.style.borderRadius = '6px';

  const header = document.createElement('div');
  header.style.backgroundColor = colors.bgSecondary;
  header.style.color = colors.text;
  header.style.padding = '6px 10px';
  header.style.borderRadius = '4px';
  header.style.marginBottom = '8px';
  header.style.fontSize = '13px';
  header.textContent = 'Header / Tab Bar';
  strip.appendChild(header);

  const termPreview = document.createElement('div');
  termPreview.style.backgroundColor = colors.terminalBg;
  termPreview.style.color = colors.terminalFg;
  termPreview.style.padding = '8px';
  termPreview.style.fontFamily = 'Consolas, monospace';
  termPreview.style.fontSize = '12px';
  termPreview.style.borderRadius = '4px';
  termPreview.style.marginBottom = '8px';

  const lines = [
    { text: '$ npm install', color: colors.terminalFg },
    { text: 'added 42 packages', color: colors.ansiGreen },
    { text: 'WARN deprecated pkg@1.0', color: colors.ansiYellow },
    { text: 'ERR! missing dependency', color: colors.ansiRed },
    { text: 'info using node@18', color: colors.ansiCyan }
  ];

  lines.forEach(l => {
    const div = document.createElement('div');
    div.style.color = l.color;
    div.textContent = l.text;
    termPreview.appendChild(div);
  });
  strip.appendChild(termPreview);

  const accentBtn = document.createElement('button');
  accentBtn.style.backgroundColor = colors.accent;
  accentBtn.style.color = '#fff';
  accentBtn.style.border = 'none';
  accentBtn.style.padding = '6px 16px';
  accentBtn.style.borderRadius = '4px';
  accentBtn.style.cursor = 'pointer';
  accentBtn.textContent = 'Accent Button';
  strip.appendChild(accentBtn);
}

async function handleSave() {
  const nameInput = document.getElementById('themeCreatorName');
  const name = (nameInput?.value || '').trim();
  if (!name) {
    nameInput?.focus();
    return;
  }

  const theme = { name, colors: { ...currentColors } };

  const res = await api.saveCustomTheme(theme);
  if (res?.success) {
    // Add to runtime
    const existing = state.customThemes.findIndex(t => t.name === name);
    if (existing >= 0) {
      state.customThemes[existing] = theme;
    } else {
      state.customThemes.push(theme);
    }
    registerCustomTheme(name, currentColors);
    refreshThemeDropdown();
    hideThemeCreator();
  }
}

function handleImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.colors) {
        currentColors = { ...DEFAULT_COLORS, ...data.colors };
      }
      const nameInput = document.getElementById('themeCreatorName');
      if (nameInput && data.name) nameInput.value = data.name;
      renderThemeCreator();
    } catch (e) {
      console.error('Failed to import theme:', e);
    }
  });
  input.click();
}

function handleExport() {
  const nameInput = document.getElementById('themeCreatorName');
  const name = (nameInput?.value || 'custom-theme').trim();
  const theme = { name, colors: { ...currentColors } };
  const blob = new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function loadCustomThemes() {
  const res = await api.listCustomThemes();
  if (res?.success) {
    state.customThemes = res.themes || [];
    for (const theme of state.customThemes) {
      if (theme.name && theme.colors) {
        registerCustomTheme(theme.name, theme.colors);
      }
    }
  }
}

async function deleteCustomTheme(name) {
  await api.deleteCustomTheme(name);
  state.customThemes = state.customThemes.filter(t => t.name !== name);
  refreshThemeDropdown();
}

module.exports = {
  init,
  showThemeCreator,
  hideThemeCreator,
  loadCustomThemes,
  saveCustomTheme: handleSave,
  deleteCustomTheme,
  renderThemePreview
};
