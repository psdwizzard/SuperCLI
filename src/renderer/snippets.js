const state = require('./state');
const api = require('./api');

let snippetPanel = null;

function init() {
  snippetPanel = document.getElementById('snippetPanel');
  const closeBtn = snippetPanel?.querySelector('.snippet-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => setSnippetPanelVisible(false));
  }
}

function toggleSnippetPanel() {
  const visible = snippetPanel?.classList.contains('active');
  setSnippetPanelVisible(!visible);
}

function setSnippetPanelVisible(visible) {
  if (!snippetPanel) return;
  if (visible) {
    snippetPanel.classList.add('active');
    if (state.activeProjectPath) {
      loadSnippets(state.activeProjectPath).then(() => renderSnippetList());
    }
  } else {
    snippetPanel.classList.remove('active');
  }
}

async function loadSnippets(projectPath) {
  if (!projectPath) return;
  const res = await api.loadSnippets(projectPath);
  if (res?.success) {
    const all = [...(res.snippets.project || []), ...(res.snippets.global || [])];
    state.snippetsByProject.set(projectPath, all);
  } else {
    state.snippetsByProject.set(projectPath, []);
  }
}

async function saveSnippets() {
  const projectPath = state.activeProjectPath;
  if (!projectPath) return;
  const snippets = state.snippetsByProject.get(projectPath) || [];
  // Save only project-scoped snippets
  await api.saveSnippets(projectPath, snippets);
}

function renderSnippetList() {
  const list = snippetPanel?.querySelector('.snippet-list');
  if (!list) return;

  const projectPath = state.activeProjectPath;
  const snippets = state.snippetsByProject.get(projectPath) || [];
  const searchInput = snippetPanel?.querySelector('.snippet-search');
  const filterValue = (searchInput?.value || '').toLowerCase();
  const categoryFilter = snippetPanel?.querySelector('.snippet-category-filter');
  const categoryValue = categoryFilter?.value || '';

  list.innerHTML = '';

  const filtered = snippets.filter(s => {
    const matchesSearch = !filterValue ||
      (s.name || '').toLowerCase().includes(filterValue) ||
      (s.content || '').toLowerCase().includes(filterValue);
    const matchesCategory = !categoryValue || s.category === categoryValue;
    return matchesSearch && matchesCategory;
  });

  const emptyState = snippetPanel?.querySelector('.snippet-empty');
  if (emptyState) {
    emptyState.style.display = filtered.length === 0 ? 'block' : 'none';
  }

  filtered.forEach((snippet, idx) => {
    const item = document.createElement('div');
    item.className = 'snippet-item';

    const name = document.createElement('div');
    name.className = 'snippet-item-name';
    name.textContent = snippet.name || 'Untitled';

    const preview = document.createElement('div');
    preview.className = 'snippet-item-preview';
    preview.textContent = (snippet.content || '').substring(0, 80);

    const actions = document.createElement('div');
    actions.className = 'snippet-actions';

    const insertBtn = document.createElement('button');
    insertBtn.className = 'todo-btn';
    insertBtn.textContent = 'Insert';
    insertBtn.addEventListener('click', () => insertSnippet(snippet));

    const editBtn = document.createElement('button');
    editBtn.className = 'todo-btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => editSnippet(snippet));

    const delBtn = document.createElement('button');
    delBtn.className = 'todo-btn danger';
    delBtn.textContent = '\u2715';
    delBtn.addEventListener('click', () => {
      const allSnippets = state.snippetsByProject.get(projectPath) || [];
      const realIdx = allSnippets.indexOf(snippet);
      if (realIdx >= 0) {
        allSnippets.splice(realIdx, 1);
        renderSnippetList();
        saveSnippets();
      }
    });

    actions.appendChild(insertBtn);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    item.appendChild(name);
    item.appendChild(preview);
    item.appendChild(actions);
    list.appendChild(item);
  });
}

function insertSnippet(snippet) {
  const inputField = document.getElementById('inputField');
  if (!inputField || !snippet) return;
  const cursorPos = inputField.selectionStart;
  const before = inputField.value.substring(0, cursorPos);
  const after = inputField.value.substring(inputField.selectionEnd);
  inputField.value = before + (snippet.content || '') + after;
  const newPos = cursorPos + (snippet.content || '').length;
  inputField.setSelectionRange(newPos, newPos);
  inputField.focus();
  inputField.dispatchEvent(new Event('input'));
}

function addSnippet() {
  const nameInput = snippetPanel?.querySelector('.snippet-name-input');
  const contentInput = snippetPanel?.querySelector('.snippet-content-input');
  const categoryInput = snippetPanel?.querySelector('.snippet-category-input');

  const name = (nameInput?.value || '').trim();
  const content = (contentInput?.value || '').trim();
  const category = (categoryInput?.value || '').trim() || 'General';

  if (!name || !content) return;

  const projectPath = state.activeProjectPath;
  if (!projectPath) return;

  const snippets = state.snippetsByProject.get(projectPath) || [];
  snippets.push({
    id: `snippet-${Date.now()}`,
    name,
    content,
    category
  });
  state.snippetsByProject.set(projectPath, snippets);

  if (nameInput) nameInput.value = '';
  if (contentInput) contentInput.value = '';

  renderSnippetList();
  saveSnippets();
}

function editSnippet(snippet) {
  const nameInput = snippetPanel?.querySelector('.snippet-name-input');
  const contentInput = snippetPanel?.querySelector('.snippet-content-input');
  const categoryInput = snippetPanel?.querySelector('.snippet-category-input');

  if (nameInput) nameInput.value = snippet.name || '';
  if (contentInput) contentInput.value = snippet.content || '';
  if (categoryInput) categoryInput.value = snippet.category || '';

  // Remove the old snippet and re-add on save
  const projectPath = state.activeProjectPath;
  const snippets = state.snippetsByProject.get(projectPath) || [];
  const idx = snippets.indexOf(snippet);
  if (idx >= 0) snippets.splice(idx, 1);
  renderSnippetList();
}

function setupListeners() {
  const searchInput = snippetPanel?.querySelector('.snippet-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => renderSnippetList());
  }
  const categoryFilter = snippetPanel?.querySelector('.snippet-category-filter');
  if (categoryFilter) {
    categoryFilter.addEventListener('change', () => renderSnippetList());
  }
  const addBtn = snippetPanel?.querySelector('.snippet-add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', addSnippet);
  }
}

// Call setupListeners after init
function postInit() {
  setupListeners();
}

module.exports = {
  init() {
    snippetPanel = document.getElementById('snippetPanel');
    const closeBtn = snippetPanel?.querySelector('.snippet-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => setSnippetPanelVisible(false));
    }
    postInit();
  },
  toggleSnippetPanel,
  setSnippetPanelVisible,
  loadSnippets,
  saveSnippets,
  renderSnippetList,
  insertSnippet,
  addSnippet,
  editSnippet
};
