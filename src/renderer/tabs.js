const state = require('./state');

let tabsContainer = null;

function init() {
  tabsContainer = document.getElementById('tabs');
}

function createTab(id, cliCommand, displayLabel, { onActivate, onClose }) {
  if (!tabsContainer) return;
  const tab = document.createElement('div');
  tab.className = 'tab';
  tab.dataset.terminalId = id;

  const label = document.createElement('span');
  label.className = 'tab-label';
  label.textContent = displayLabel || formatCliLabel(cliCommand);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'tab-close';
  closeBtn.textContent = '\u00d7';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (onClose) onClose(id);
  });

  tab.appendChild(label);
  tab.appendChild(closeBtn);
  tab.addEventListener('click', () => {
    if (onActivate) onActivate(id);
  });
  tabsContainer.appendChild(tab);
}

function refreshTabsForActiveProject({ onActivate, onClose, updateInputInfoForTerminal }) {
  if (!tabsContainer) return;
  tabsContainer.innerHTML = '';
  const proj = state.projects.get(state.activeProjectPath);
  const tabIds = proj?.tabIds || [];
  tabIds.forEach(tid => {
    const t = state.terminals.get(tid);
    if (t) createTab(tid, t.cliCommand, t.displayLabel, { onActivate, onClose });
  });

  if (!proj) return;
  if (!proj.tabIds.includes(state.activeTerminalId)) {
    if (proj.tabIds.length > 0) {
      if (onActivate) onActivate(proj.tabIds[0]);
    } else {
      state.activeTerminalId = null;
      if (updateInputInfoForTerminal) updateInputInfoForTerminal(null);
    }
  }
}

function setActiveTab(id) {
  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
  const tab = document.querySelector(`[data-terminal-id="${id}"]`);
  if (tab) tab.classList.add('active');
}

function formatCliLabel(cliCommand) {
  if (!cliCommand || !cliCommand.trim()) return 'Shell';
  const trimmed = cliCommand.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

module.exports = {
  init,
  createTab,
  refreshTabsForActiveProject,
  setActiveTab,
  formatCliLabel
};
