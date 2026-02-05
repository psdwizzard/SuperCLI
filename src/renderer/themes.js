const state = require('./state');

const THEME_CLASSNAMES = ['theme-dark','theme-light','theme-deep-blue','theme-light-grey','theme-end-times','theme-matrix'];

const BUILTIN_THEMES = {
  'dark': 'Dark',
  'light': 'Light',
  'deep-blue': 'Deep Blue',
  'light-grey': 'Light Grey',
  'end-times': 'End Times',
  'matrix': 'Green Matrix'
};

const customThemeStyles = new Map();

function applyTheme(themeName) {
  const body = document.body;
  let cls = 'theme-dark';
  const name = (themeName || '').toLowerCase();

  // Check built-in themes
  switch (name) {
    case 'light': cls = 'theme-light'; break;
    case 'deep-blue': cls = 'theme-deep-blue'; break;
    case 'light-grey': cls = 'theme-light-grey'; break;
    case 'end-times': cls = 'theme-end-times'; break;
    case 'matrix': cls = 'theme-matrix'; break;
    default:
      // Check custom themes
      if (name.startsWith('custom-')) {
        cls = `theme-${name}`;
      } else {
        cls = 'theme-dark';
      }
  }

  // Remove any previous theme classes
  THEME_CLASSNAMES.forEach(c => body.classList.remove(c));
  // Remove custom theme classes
  customThemeStyles.forEach((_, key) => body.classList.remove(`theme-custom-${key}`));
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

  // Check custom themes first
  const custom = state.customThemes.find(t => `custom-${t.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}` === name || t.name === themeName);
  if (custom && custom.colors) {
    return {
      background: custom.colors.terminalBg || custom.colors.bg || '#1e1e1e',
      foreground: custom.colors.terminalFg || custom.colors.text || '#d4d4d4',
      cursor: custom.colors.terminalCursor || '#d4d4d4',
      black: custom.colors.ansiBlack || '#000000',
      red: custom.colors.ansiRed || '#cd3131',
      green: custom.colors.ansiGreen || '#0dbc79',
      yellow: custom.colors.ansiYellow || '#e5e510',
      blue: custom.colors.ansiBlue || '#2472c8',
      magenta: custom.colors.ansiMagenta || '#bc3fbc',
      cyan: custom.colors.ansiCyan || '#11a8cd',
      white: custom.colors.ansiWhite || '#e5e5e5'
    };
  }

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
      foreground: '#d4d4d4',
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
  if (name === 'matrix') {
    return {
      background: '#050a05',
      foreground: '#f6fff6',
      cursor: '#0cfd00',
      black: '#050a05',
      red: '#7bff9a',
      green: '#0cfd00',
      yellow: '#d6ffad',
      blue: '#4cff9a',
      magenta: '#7bffba',
      cyan: '#55ffd8',
      white: '#f6fff6',
      brightBlack: '#1f3b1f',
      brightRed: '#aaffc8',
      brightGreen: '#6bff9a',
      brightYellow: '#eaffc8',
      brightBlue: '#8bffd0',
      brightMagenta: '#b3ffe0',
      brightCyan: '#8dffef',
      brightWhite: '#ffffff'
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

function hexToRgb(hex) {
  const h = (hex || '#000000').replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16) || 0,
    g: parseInt(h.substring(2, 4), 16) || 0,
    b: parseInt(h.substring(4, 6), 16) || 0
  };
}

function isDark(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (r * 0.299 + g * 0.587 + b * 0.114) < 128;
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function registerCustomTheme(name, colors) {
  const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const cls = `theme-custom-${safeName}`;

  // Create dynamic style block
  let styleEl = customThemeStyles.get(safeName);
  if (!styleEl) {
    styleEl = document.createElement('style');
    document.head.appendChild(styleEl);
    customThemeStyles.set(safeName, styleEl);
  }

  const bg = colors.bg || '#1e1e1e';
  const bg2 = colors.bgSecondary || '#2d2d2d';
  const text = colors.text || '#d4d4d4';
  const muted = colors.textMuted || '#6e6e6e';
  const accent = colors.accent || '#007acc';
  const accentHover = colors.accentHover || '#005a9e';
  const border = colors.border || '#3e3e3e';
  const tBg = colors.terminalBg || bg;
  const tFg = colors.terminalFg || text;
  const dark = isDark(bg);
  // Contrast color for accent buttons (white on dark accent, dark on bright accent)
  const accentText = isDark(accent) ? '#ffffff' : '#000000';
  const accentHoverText = isDark(accentHover) ? '#ffffff' : '#000000';
  // A slightly lighter/darker shade of bg2 for hover states
  const hoverBg = dark ? lighten(bg2, 12) : darken(bg2, 8);
  // Checkbox accent
  const checkboxAccent = accent;

  let css = `
/* === Custom Theme: ${name} === */

/* Body + app-container */
body.${cls} { background-color: ${bg}; color: ${text}; }

/* Glow effects for dark themes */
${dark ? `
body.${cls} .app-container {
  position: relative;
  text-shadow: 0 0 12px ${rgba(accent, 0.3)};
}
body.${cls} .app-container::before {
  content: "";
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    to bottom,
    ${rgba(bg, 0.0)} 0px,
    ${rgba(bg, 0.0)} 2px,
    ${rgba(darken(bg, 10), 0.3)} 3px,
    ${rgba(darken(bg, 10), 0.3)} 4px
  );
  mix-blend-mode: multiply;
  opacity: 0.35;
  pointer-events: none;
  z-index: 2;
  animation: ${cls}-scan 10s linear infinite;
}
body.${cls} .app-container::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
    radial-gradient(120% 120% at 50% 0%, ${rgba(accent, 0.06)}, ${rgba(bg, 0.0)} 55%),
    radial-gradient(140% 140% at 50% 100%, ${rgba(bg, 0.0)}, rgba(0,0,0,0.4) 75%);
  pointer-events: none;
  z-index: 1;
}
@keyframes ${cls}-scan {
  0% { transform: translateY(-20px); }
  100% { transform: translateY(20px); }
}
` : ''}

/* Header */
body.${cls} .header { background-color: ${bg2}; border-bottom-color: ${border}; }
body.${cls} #projectSelector { background-color: ${bg}; color: ${text}; border-color: ${border}; }
body.${cls} .project-path { color: ${muted}; }

/* Tabs */
body.${cls} .tab { background-color: ${bg2}; border-color: ${border}; }
body.${cls} .tab:hover { background-color: ${hoverBg}; }
body.${cls} .tab.active { background-color: ${bg}; border-bottom-color: ${accent}; }
body.${cls} .new-tab-btn { background-color: ${bg2}; border-color: ${border}; color: ${text}; }

/* Terminal */
body.${cls} .terminal-container { background-color: ${tBg}; }
body.${cls} .xterm .xterm-viewport,
body.${cls} .xterm .xterm-screen { background-color: ${tBg}; }

/* Input area */
body.${cls} .input-toolbar { background-color: ${bg2}; border-top-color: ${border}; }
body.${cls} .input-tool-btn { background-color: ${hoverBg}; border-color: ${border}; color: ${text}; }
body.${cls} .input-tool-btn:hover { background-color: ${hoverBg}; border-color: ${accent}; }
body.${cls} .input-tool-btn.active { background-color: ${accent}; border-color: ${accent}; color: ${accentText}; }
body.${cls} .input-container { background-color: ${bg2}; border-top-color: ${border}; }
body.${cls} .input-field { background-color: ${bg}; color: ${text}; border-color: ${border}; }
body.${cls} .input-field::placeholder { color: ${muted}; }

/* Explorer */
body.${cls} .explorer-panel { background-color: ${bg2}; border-right-color: ${border}; }
body.${cls} .explorer-header { border-bottom-color: ${border}; color: ${muted}; }
body.${cls} .explorer-item { color: ${text}; }
body.${cls} .explorer-item:hover { background-color: ${hoverBg}; }
body.${cls} .explorer-btn { background-color: ${hoverBg}; border-color: ${border}; color: ${text}; }
body.${cls} .explorer-btn:hover { background-color: ${bg2}; }
body.${cls} .explorer-run { background-color: ${accent}; color: ${accentText}; }
body.${cls} .explorer-run:hover { background-color: ${accentHover}; color: ${accentHoverText}; }

/* Buttons */
body.${cls} .modal-confirm,
body.${cls} .project-btn,
body.${cls} .send-btn,
body.${cls} .debug-btn,
body.${cls} .todo-add-btn { background-color: ${accent}; color: ${accentText}; }
body.${cls} .modal-confirm:hover,
body.${cls} .project-btn:hover,
body.${cls} .send-btn:hover,
body.${cls} .debug-btn:hover,
body.${cls} .todo-add-btn:hover { background-color: ${accentHover}; color: ${accentHoverText}; }
body.${cls} .modal-cancel { background-color: ${border}; color: ${text}; }

/* Modal */
body.${cls} .modal-content { background-color: ${bg2}; }
body.${cls} .cli-option { background-color: ${bg}; border-color: ${border}; }
body.${cls} .cli-option:hover { background-color: ${hoverBg}; border-color: ${accent}; }
body.${cls} .cli-option.selected { background-color: ${bg}; border-color: ${accent}; box-shadow: 0 0 0 2px ${rgba(accent, 0.3)}; }
body.${cls} .custom-cli-input input { background-color: ${bg}; color: ${text}; border-color: ${border}; }
body.${cls} .custom-cli-input input:focus { outline: none; border-color: ${accent}; }
body.${cls} .new-project-toggle { background-color: ${bg}; border-color: ${border}; }
body.${cls} .new-project-toggle input { accent-color: ${checkboxAccent}; }

/* Settings inputs */
body.${cls} .settings-input,
body.${cls} .settings-select { background-color: ${bg}; border-color: ${border}; color: ${text}; }
body.${cls} .settings-textarea { background-color: ${bg}; border-color: ${border}; color: ${text}; }
body.${cls} .settings-textarea:focus { border-color: ${accent}; }
body.${cls} .settings-checkbox { accent-color: ${checkboxAccent}; }

/* Todo panel */
body.${cls} .todo-panel { background-color: ${bg2}; border-color: ${border}; }
body.${cls} .todo-header { border-bottom-color: ${border}; }
body.${cls} .todo-title,
body.${cls} .todo-text { color: ${text}; }
body.${cls} .todo-input { background-color: ${bg}; color: ${text}; border-color: ${border}; }
body.${cls} .todo-input:focus { outline: none; border-color: ${accent}; }
body.${cls} .todo-empty { color: ${muted}; }
body.${cls} .gh-issue-meta { color: ${muted}; }
body.${cls} .todo-checkbox { accent-color: ${checkboxAccent}; }
body.${cls} .todo-btn { background-color: ${hoverBg}; border-color: ${border}; color: ${text}; }
body.${cls} .todo-btn:hover { background-color: ${bg2}; }
body.${cls} .todo-btn.danger { background-color: ${dark ? '#6b2e2e' : '#e57373'}; border-color: ${dark ? '#8a3b3b' : '#c85c5c'}; }

/* Snippet panel */
body.${cls} .snippet-panel { background-color: ${bg2}; border-color: ${border}; }
body.${cls} .snippet-header { border-bottom-color: ${border}; }
body.${cls} .snippet-title { color: ${text}; }
body.${cls} .snippet-item { background-color: ${bg}; border-color: ${border}; }
body.${cls} .snippet-item-name { color: ${text}; }
body.${cls} .snippet-item-preview { color: ${muted}; }
body.${cls} .snippet-empty { color: ${muted}; }
body.${cls} .snippet-footer { border-top-color: ${border}; }

/* Shortcuts modal */
body.${cls} .shortcut-category { color: ${muted}; border-bottom-color: ${border}; }
body.${cls} .shortcut-label { color: ${text}; }
body.${cls} .shortcut-key { background-color: ${hoverBg}; border-color: ${border}; color: ${text}; }
body.${cls} .shortcut-key.shortcut-recording { background-color: ${accent}; color: ${accentText}; border-color: ${accent}; }
body.${cls} .shortcut-rebind-btn { background-color: ${hoverBg}; border-color: ${border}; color: ${text}; }

/* Focus + glow effects */
body.${cls} .input-field:focus,
body.${cls} .settings-input:focus,
body.${cls} .settings-select:focus,
body.${cls} #projectSelector:focus,
body.${cls} .custom-cli-input input:focus,
body.${cls} .todo-input:focus {
  border-color: ${accent};
  ${dark ? `box-shadow: 0 0 0 1px ${rgba(accent, 0.8)}, 0 0 16px ${rgba(accent, 0.4)};` : ''}
}

${dark ? `
/* Glow on active/accent elements */
body.${cls} .header,
body.${cls} .input-toolbar,
body.${cls} .input-container,
body.${cls} .explorer-panel,
body.${cls} .todo-panel,
body.${cls} .snippet-panel,
body.${cls} .modal-content,
body.${cls} .terminal-container {
  box-shadow: 0 0 0 1px ${rgba(accent, 0.06)}, 0 0 14px ${rgba(darken(bg, 20), 0.5)};
}

body.${cls} .tab.active,
body.${cls} .input-tool-btn.active,
body.${cls} .project-btn,
body.${cls} .send-btn,
body.${cls} .debug-btn,
body.${cls} .todo-add-btn,
body.${cls} .explorer-run {
  box-shadow: 0 0 10px ${rgba(accent, 0.6)}, 0 0 24px ${rgba(accent, 0.35)};
}

body.${cls} .tab,
body.${cls} .new-tab-btn,
body.${cls} .input-tool-btn,
body.${cls} .explorer-btn,
body.${cls} .todo-btn,
body.${cls} .modal-btn {
  text-shadow: 0 0 8px ${rgba(accent, 0.35)};
}
` : ''}
`;

  styleEl.textContent = css;

  // Add theme class to the THEME_CLASSNAMES tracking if not already present
  if (!THEME_CLASSNAMES.includes(cls)) {
    THEME_CLASSNAMES.push(cls);
  }
}

function lighten(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const clamp = v => Math.min(255, Math.max(0, v));
  return '#' + [clamp(r + amount), clamp(g + amount), clamp(b + amount)]
    .map(v => v.toString(16).padStart(2, '0')).join('');
}

function darken(hex, amount) {
  return lighten(hex, -amount);
}

function getAvailableThemes() {
  const themes = Object.entries(BUILTIN_THEMES).map(([value, label]) => ({ value, label, builtin: true }));
  for (const ct of state.customThemes) {
    const safeName = ct.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    themes.push({ value: `custom-${safeName}`, label: ct.name, builtin: false });
  }
  return themes;
}

module.exports = {
  THEME_CLASSNAMES,
  BUILTIN_THEMES,
  applyTheme,
  getXtermTheme,
  registerCustomTheme,
  getAvailableThemes
};
