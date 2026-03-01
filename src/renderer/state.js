const state = {
  projects: new Map(),
  activeProjectPath: null,
  projectInfo: null,
  userPrefsByProject: new Map(),
  todoByProject: new Map(),
  githubIssuesByProject: new Map(),
  githubIssueStatusByProject: new Map(),
  githubIssueFiltersByProject: new Map(),
  terminals: new Map(),
  activeTerminalId: null,
  terminalCounter: 0,
  selectedCli: null,
  numberedListMode: false,
  snippetsByProject: new Map(),
  customThemes: [],
  shortcuts: {},
  usageStats: new Map(),
  quotaData: { claude: null, codex: null, lastFetch: null }
};

module.exports = state;
