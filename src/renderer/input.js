const state = require('./state');

let inputField = null;
let numberedListBtn = null;
let sendCommandCb = null;

function init(callbacks) {
  inputField = document.getElementById('inputField');
  numberedListBtn = document.getElementById('numberedListBtn');
  if (callbacks) {
    sendCommandCb = callbacks.sendCommand;
  }
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

  if (state.numberedListMode) {
    insertNumberedListLine();
    return;
  }

  if (inputField && /\r?\n$/.test(inputField.value)) {
    inputField.value = inputField.value.replace(/\r?\n$/, '');
  }

  if (sendCommandCb) sendCommandCb();
}

function toggleNumberedListMode() {
  setNumberedListMode(!state.numberedListMode);
  inputField?.focus();
}

function setNumberedListMode(enabled) {
  state.numberedListMode = Boolean(enabled);
  if (numberedListBtn) {
    numberedListBtn.classList.toggle('active', state.numberedListMode);
  }
  if (state.numberedListMode) {
    seedNumberedListAtCursor();
  }
}

function seedNumberedListAtCursor() {
  if (!inputField) return;
  const value = inputField.value || '';
  const start = inputField.selectionStart ?? value.length;
  const { lineText } = getLineAtPosition(value, start);
  if (/^\s*\d+\.\s/.test(lineText)) {
    return;
  }

  const nextIndex = getNextNumberedListIndex(value, start);
  const trimmedLine = lineText.trim();
  const insertText = trimmedLine.length === 0 ? `${nextIndex}. ` : `\n${nextIndex}. `;
  const newValue = value.slice(0, start) + insertText + value.slice(start);
  inputField.value = newValue;
  const newPos = start + insertText.length;
  inputField.setSelectionRange(newPos, newPos);
  inputField.dispatchEvent(new Event('input'));
}

function insertNumberedListLine() {
  if (!inputField) return;
  const value = inputField.value || '';
  const start = inputField.selectionStart ?? value.length;
  const end = inputField.selectionEnd ?? start;
  const nextIndex = getNextNumberedListIndex(value, start);
  const insertText = `\n${nextIndex}. `;
  const newValue = value.slice(0, start) + insertText + value.slice(end);
  inputField.value = newValue;
  const newPos = start + insertText.length;
  inputField.setSelectionRange(newPos, newPos);
  inputField.dispatchEvent(new Event('input'));
}

function getNextNumberedListIndex(text, position) {
  const before = text.slice(0, position);
  const lines = before.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const match = lines[i].match(/^\s*(\d+)\.\s/);
    if (match) {
      return Number(match[1]) + 1;
    }
  }
  return 1;
}

function getLineAtPosition(text, position) {
  const start = text.lastIndexOf('\n', Math.max(0, position - 1)) + 1;
  const end = text.indexOf('\n', position);
  const lineEnd = end === -1 ? text.length : end;
  return {
    start,
    end: lineEnd,
    lineText: text.slice(start, lineEnd)
  };
}

function isEditableTarget(target) {
  if (!target) return false;
  const tag = (target.tagName || '').toLowerCase();
  if (tag === 'textarea' || tag === 'input') return true;
  if (target.isContentEditable) return true;
  return false;
}

function handleGlobalTerminalScroll(event) {
  const key = event.key || '';
  const code = event.code || '';
  const ctrlOrCmd = event.ctrlKey || event.metaKey;

  const isScrollKey = (
    code === 'PageUp' || key === 'PageUp' ||
    code === 'PageDown' || key === 'PageDown' ||
    ((code === 'Home' || key === 'Home') && ctrlOrCmd) ||
    ((code === 'End' || key === 'End') && ctrlOrCmd)
  );

  if (isEditableTarget(event.target) && !isScrollKey) {
    return;
  }

  const terminal = state.terminals.get(state.activeTerminalId);
  if (!terminal || !terminal.xterm) return;

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
}

module.exports = {
  init,
  handleInputFieldKeyDown,
  toggleNumberedListMode,
  setNumberedListMode,
  handleGlobalTerminalScroll
};
