const { ipcRenderer } = require('electron');

const api = {
  selectProjectFolder: () => ipcRenderer.invoke('select-project-folder'),
  loadUserPreferences: (projectPath) => ipcRenderer.invoke('load-user-preferences', projectPath),
  saveUserPreferences: (projectPath, prefs) => ipcRenderer.invoke('save-user-preferences', projectPath, prefs),
  loadTodo: (projectPath) => ipcRenderer.invoke('load-todo', projectPath),
  saveTodo: (projectPath, items) => ipcRenderer.invoke('save-todo', projectPath, items),
  watchTodo: (projectPath) => ipcRenderer.invoke('watch-todo', projectPath),
  unwatchTodo: (projectPath) => ipcRenderer.invoke('unwatch-todo', projectPath),
  getGithubIssues: (projectPath, options) => ipcRenderer.invoke('github-issues', projectPath, options),
  setGithubIssueState: (projectPath, issueNumber, newState, comment) => ipcRenderer.invoke('github-issue-set-state', projectPath, issueNumber, newState, comment),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  createTerminal: (id, cwd, cliCommand, cliLabel) => ipcRenderer.invoke('create-terminal', id, cwd, cliCommand, cliLabel),
  writeToTerminal: (id, data) => ipcRenderer.invoke('write-to-terminal', id, data),
  resizeTerminal: (id, cols, rows) => ipcRenderer.invoke('resize-terminal', id, cols, rows),
  closeTerminal: (id) => ipcRenderer.invoke('close-terminal', id),
  openDevTools: () => ipcRenderer.invoke('open-devtools'),
  onTerminalData: (callback) => {
    ipcRenderer.on('terminal-data', (event, id, data) => callback(id, data));
  },
  onTerminalExit: (callback) => {
    ipcRenderer.on('terminal-exit', (event, id) => callback(id));
  },
  getStartupProject: () => ipcRenderer.invoke('get-startup-project'),
  saveImage: (projectPath, imageData) => ipcRenderer.invoke('save-image', projectPath, imageData),
  readProjectTree: (projectPath, options) => ipcRenderer.invoke('read-project-tree', projectPath, options),
  // New feature IPC
  loadSnippets: (projectPath) => ipcRenderer.invoke('load-snippets', projectPath),
  saveSnippets: (projectPath, snippets) => ipcRenderer.invoke('save-snippets', projectPath, snippets),
  listTemplates: () => ipcRenderer.invoke('list-templates'),
  loadTemplate: (templateName) => ipcRenderer.invoke('load-template', templateName),
  saveTemplate: (template) => ipcRenderer.invoke('save-template', template),
  applyTemplate: (templateName, projectPath) => ipcRenderer.invoke('apply-template', templateName, projectPath),
  deleteTemplate: (templateName) => ipcRenderer.invoke('delete-template', templateName),
  listCustomThemes: () => ipcRenderer.invoke('list-custom-themes'),
  saveCustomTheme: (theme) => ipcRenderer.invoke('save-custom-theme', theme),
  deleteCustomTheme: (themeName) => ipcRenderer.invoke('delete-custom-theme', themeName),
  onTodoUpdatedFromDisk: (callback) => {
    ipcRenderer.on('todo-updated-from-disk', (event, projectPath, payload) => callback(projectPath, payload));
  },
  // Quota
  fetchClaudeQuota: () => ipcRenderer.invoke('fetch-claude-quota'),
  fetchCodexQuota: () => ipcRenderer.invoke('fetch-codex-quota'),
  openCodexLogin: () => ipcRenderer.invoke('open-codex-login'),
  openClaudeLogin: () => ipcRenderer.invoke('open-claude-login'),
  checkMicAccess: () => ipcRenderer.invoke('check-mic-access')
};

window.electronAPI = api;

module.exports = api;
