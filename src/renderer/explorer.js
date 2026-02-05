const path = require('path');
const state = require('./state');
const api = require('./api');

let explorerTree = null;
let explorerEmpty = null;
let explorerMeta = null;

// Set by index.js
let createNewTerminalCb = null;

function init(callbacks) {
  explorerTree = document.getElementById('explorerTree');
  explorerEmpty = document.getElementById('explorerEmpty');
  explorerMeta = document.getElementById('explorerMeta');
  if (callbacks) {
    createNewTerminalCb = callbacks.createNewTerminal;
  }
}

async function loadExplorerTree() {
  if (!explorerTree || !explorerEmpty) return;

  if (!state.activeProjectPath) {
    explorerTree.innerHTML = '';
    explorerEmpty.textContent = 'Select a project to see files.';
    explorerEmpty.style.display = 'block';
    if (explorerMeta) explorerMeta.textContent = '';
    return;
  }

  explorerTree.innerHTML = '';
  explorerEmpty.textContent = 'Loading...';
  explorerEmpty.style.display = 'block';
  if (explorerMeta) explorerMeta.textContent = '';

  const result = await api.readProjectTree(state.activeProjectPath, {
    maxDepth: 6,
    maxEntries: 2000
  });

  if (!result || !result.success) {
    explorerEmpty.textContent = result?.error || 'Unable to load files';
    return;
  }

  renderExplorerNodes(result.tree || [], explorerTree, 0);
  explorerEmpty.style.display = (result.tree && result.tree.length > 0) ? 'none' : 'block';
  if (explorerMeta) {
    let meta = `${result.nodeCount || 0} items`;
    if (result.truncated) meta += ' (truncated)';
    explorerMeta.textContent = meta;
  }
}

function renderExplorerNodes(nodes, container, depth) {
  nodes.forEach((node) => {
    const row = document.createElement('div');
    row.className = `explorer-item ${node.type}`;
    row.style.paddingLeft = `${10 + depth * 12}px`;

    if (node.type === 'dir') {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'explorer-toggle';

      const hasChildren = Array.isArray(node.children) && node.children.length > 0;
      const isExpanded = depth < 1;
      toggle.textContent = hasChildren ? (isExpanded ? '-' : '+') : '';
      toggle.disabled = !hasChildren;

      const name = document.createElement('span');
      name.className = 'explorer-name';
      name.textContent = node.name;

      row.appendChild(toggle);
      row.appendChild(name);
      container.appendChild(row);

      const children = document.createElement('div');
      children.className = 'explorer-children';
      if (hasChildren && isExpanded) {
        children.classList.add('expanded');
      }
      container.appendChild(children);

      if (hasChildren) {
        renderExplorerNodes(node.children, children, depth + 1);
      }

      const toggleFolder = () => {
        if (!hasChildren) return;
        const willExpand = !children.classList.contains('expanded');
        children.classList.toggle('expanded', willExpand);
        toggle.textContent = willExpand ? '-' : '+';
      };

      toggle.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleFolder();
      });
      row.addEventListener('click', () => {
        toggleFolder();
      });
    } else {
      const name = document.createElement('span');
      name.className = 'explorer-name';
      name.textContent = node.name;
      row.appendChild(name);

      const isBat = /\.bat$/i.test(node.name || '');
      if (isBat) {
        const runBtn = document.createElement('button');
        runBtn.type = 'button';
        runBtn.className = 'explorer-run';
        runBtn.textContent = 'Run';
        runBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          runBatFile(node.path);
        });
        row.appendChild(runBtn);
        row.addEventListener('dblclick', () => {
          runBatFile(node.path);
        });
      }

      container.appendChild(row);
    }
  });
}

function runBatFile(filePath) {
  if (!filePath) return;
  const inputInfo = document.getElementById('inputInfo');
  if (!state.activeProjectPath) {
    if (inputInfo) {
      inputInfo.textContent = 'Select a project before running a file';
      inputInfo.style.color = '#f48771';
    }
    return;
  }
  if (process.platform !== 'win32') {
    if (inputInfo) {
      inputInfo.textContent = 'BAT files can only run on Windows terminals';
      inputInfo.style.color = '#f48771';
    }
    return;
  }

  const label = path.basename(filePath);
  const escapedPath = String(filePath).replace(/\"/g, '\"\"');
  const command = `& \"${escapedPath}\"`;
  if (createNewTerminalCb) createNewTerminalCb(command, label);
}

module.exports = {
  init,
  loadExplorerTree,
  renderExplorerNodes,
  runBatFile
};
