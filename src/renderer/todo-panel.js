const state = require('./state');
const api = require('./api');

let todoPanel, todoList, todoAddInput, todoAddBtn, todoEmptyState, todoSaveBtn, todoReloadBtn, todoAddSection;
let ghIssueStateSelect, ghIssueLabelsInput, ghIssueReloadBtn, ghIssueList, ghIssueEmpty, ghIssueMeta;

function init() {
  todoPanel = document.getElementById('todoPanel');
  todoList = document.getElementById('todoList');
  todoAddInput = document.getElementById('todoAddInput');
  todoAddBtn = document.getElementById('todoAddBtn');
  todoEmptyState = document.getElementById('todoEmptyState');
  todoSaveBtn = document.getElementById('todoSaveBtn');
  todoReloadBtn = document.getElementById('todoReloadBtn');
  todoAddSection = document.getElementById('todoAddSection');
  ghIssueStateSelect = document.getElementById('ghIssueState');
  ghIssueLabelsInput = document.getElementById('ghIssueLabels');
  ghIssueReloadBtn = document.getElementById('ghIssueReloadBtn');
  ghIssueList = document.getElementById('ghIssueList');
  ghIssueEmpty = document.getElementById('ghIssueEmpty');
  ghIssueMeta = document.getElementById('ghIssueMeta');
}

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
      applyGithubControlsForProject(state.activeProjectPath);
      ensureGithubIssuesLoadedForProject(state.activeProjectPath);
    }
  } else {
    todoPanel.classList.remove('active');
  }
}

async function ensureTodoLoadedForProject(projectPath, forceReload = false) {
  if (!projectPath) return;
  if (!forceReload && state.todoByProject.has(projectPath)) return;
  const res = await api.loadTodo(projectPath);
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
      const up = document.createElement('button'); up.className='todo-btn'; up.title='Move up'; up.textContent='\u2191'; up.addEventListener('click',()=>moveTodoItem(sIdx,iIdx,-1));
      const dn = document.createElement('button'); dn.className='todo-btn'; dn.title='Move down'; dn.textContent='\u2193'; dn.addEventListener('click',()=>moveTodoItem(sIdx,iIdx,1));
      const del = document.createElement('button'); del.className='todo-btn danger'; del.title='Delete'; del.textContent='\u2715'; del.addEventListener('click',()=>deleteTodoItem(sIdx,iIdx));
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
  await api.saveTodo(projectPath, { sections: data.sections });
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

// --- GitHub Issues ---

function getGithubPrefs(projectPath) {
  const prefs = state.userPrefsByProject.get(projectPath) || {};
  const gh = prefs?.integrations?.github || {};
  return {
    enabled: Boolean(gh.enabled),
    token: gh.token || '',
    issue_state: gh.issue_state || 'open',
    labels: gh.labels || '',
    comment_on_close: Boolean(gh.comment_on_close),
    close_comment: gh.close_comment || 'Closed via SuperCLI.',
    comment_on_reopen: Boolean(gh.comment_on_reopen),
    reopen_comment: gh.reopen_comment || 'Reopened via SuperCLI.'
  };
}

function getGithubFiltersForProject(projectPath) {
  return state.githubIssueFiltersByProject.get(projectPath) || null;
}

function applyGithubControlsForProject(projectPath) {
  if (!projectPath) return;
  const filters = getGithubFiltersForProject(projectPath);
  const prefs = getGithubPrefs(projectPath);
  if (ghIssueStateSelect) {
    ghIssueStateSelect.value = (filters?.state || prefs.issue_state || 'open');
  }
  if (ghIssueLabelsInput) {
    ghIssueLabelsInput.value = (filters?.labels || prefs.labels || '');
  }
}

function readGithubFiltersFromUi(projectPath) {
  if (!projectPath) return { state: 'open', labels: '' };
  const stateValue = ghIssueStateSelect?.value || 'open';
  const labelsValue = (ghIssueLabelsInput?.value || '').trim();
  const filters = { state: stateValue, labels: labelsValue };
  state.githubIssueFiltersByProject.set(projectPath, filters);
  return filters;
}

function buildGithubComment(template, issue) {
  return String(template || '')
    .replaceAll('{{number}}', String(issue.number || ''))
    .replaceAll('{{title}}', String(issue.title || ''));
}

async function ensureGithubIssuesLoadedForProject(projectPath, forceReload = false) {
  if (!projectPath) return;
  const prefs = getGithubPrefs(projectPath);
  if (!prefs.enabled) {
    state.githubIssuesByProject.set(projectPath, { issues: [], repo: null });
    state.githubIssueStatusByProject.set(projectPath, { type: 'disabled', message: 'GitHub integration disabled. Enable it in Settings.' });
    renderGithubIssues();
    return;
  }
  const filters = readGithubFiltersFromUi(projectPath);
  if (!forceReload) {
    const cached = state.githubIssuesByProject.get(projectPath);
    const prev = state.githubIssueFiltersByProject.get(projectPath);
    if (cached && prev && prev.state === filters.state && prev.labels === filters.labels) {
      renderGithubIssues();
      return;
    }
  }
  state.githubIssueStatusByProject.set(projectPath, { type: 'loading', message: 'Loading issues...' });
  renderGithubIssues();
  const res = await api.getGithubIssues(projectPath, filters);
  if (res?.success) {
    state.githubIssuesByProject.set(projectPath, { issues: res.issues || [], repo: res.repo || null });
    const repoLabel = res.repo ? `Repo: ${res.repo.owner}/${res.repo.repo}` : 'Repo detected.';
    state.githubIssueStatusByProject.set(projectPath, { type: 'ready', message: repoLabel });
  } else {
    state.githubIssuesByProject.set(projectPath, { issues: [], repo: res?.repo || null });
    state.githubIssueStatusByProject.set(projectPath, { type: 'error', message: res?.error || 'Unable to load issues.' });
  }
  renderGithubIssues();
}

function renderGithubIssues() {
  if (!ghIssueList || !ghIssueMeta || !ghIssueEmpty) return;
  const projectPath = state.activeProjectPath;
  if (!projectPath) return;
  const prefs = getGithubPrefs(projectPath);
  const status = state.githubIssueStatusByProject.get(projectPath);
  const data = state.githubIssuesByProject.get(projectPath) || { issues: [], repo: null };
  const issues = data.issues || [];

  let metaText = '';
  if (!prefs.enabled) {
    metaText = 'GitHub integration disabled. Enable it in Settings.';
  } else if (status?.type === 'loading') {
    metaText = status.message || 'Loading issues...';
  } else if (status?.type === 'error') {
    metaText = status.message || 'Unable to load issues.';
  } else if (data.repo) {
    metaText = `Repo: ${data.repo.owner}/${data.repo.repo}`;
  } else if (status?.message) {
    metaText = status.message;
  } else {
    metaText = 'Repo not detected.';
  }

  ghIssueMeta.textContent = metaText;
  ghIssueMeta.style.display = metaText ? 'block' : 'none';
  ghIssueEmpty.style.display = (prefs.enabled && status?.type !== 'loading' && issues.length === 0) ? 'block' : 'none';

  ghIssueList.innerHTML = '';
  issues.forEach((issue) => {
    const row = document.createElement('div');
    row.className = 'todo-item';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'todo-checkbox';
    cb.checked = issue.state === 'closed';
    row.classList.toggle('done', cb.checked);

    cb.addEventListener('change', async () => {
      if (!projectPath) return;
      const newState = cb.checked ? 'closed' : 'open';
      const commentTemplate = newState === 'closed' ? prefs.close_comment : prefs.reopen_comment;
      const commentEnabled = newState === 'closed' ? prefs.comment_on_close : prefs.comment_on_reopen;
      const comment = commentEnabled ? buildGithubComment(commentTemplate, issue) : '';

      cb.disabled = true;
      const res = await api.setGithubIssueState(projectPath, issue.number, newState, comment);
      cb.disabled = false;
      if (res?.success) {
        issue.state = newState;
        row.classList.toggle('done', newState === 'closed');
      } else {
        cb.checked = !cb.checked;
        row.classList.toggle('done', cb.checked);
        state.githubIssueStatusByProject.set(projectPath, { type: 'error', message: res?.error || 'Failed to update issue.' });
        renderGithubIssues();
      }
    });

    const content = document.createElement('div');
    content.className = 'gh-issue-content';

    const text = document.createElement('span');
    text.className = 'todo-text';
    text.textContent = `#${issue.number} ${issue.title || ''}`.trim();
    content.appendChild(text);

    if (Array.isArray(issue.labels) && issue.labels.length > 0) {
      const meta = document.createElement('span');
      meta.className = 'gh-issue-meta';
      meta.textContent = issue.labels.join(', ');
      content.appendChild(meta);
    }

    const actions = document.createElement('div');
    actions.className = 'todo-actions';
    const openBtn = document.createElement('button');
    openBtn.className = 'todo-btn';
    openBtn.textContent = 'Open';
    openBtn.title = 'Open in browser';
    openBtn.addEventListener('click', () => {
      if (issue.html_url) api.openExternal(issue.html_url);
    });
    actions.appendChild(openBtn);

    row.appendChild(cb);
    row.appendChild(content);
    row.appendChild(actions);
    ghIssueList.appendChild(row);
  });
}

module.exports = {
  init,
  toggleTodoPanel,
  setTodoPanelVisible,
  ensureTodoLoadedForProject,
  renderTodoList,
  handleTodoAdd,
  saveTodoToDisk,
  getGithubPrefs,
  applyGithubControlsForProject,
  ensureGithubIssuesLoadedForProject,
  renderGithubIssues
};
