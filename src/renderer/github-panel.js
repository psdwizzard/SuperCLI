// GitHub panel logic is co-located with todo-panel.js since they share the same side panel.
// Re-export the relevant functions from todo-panel for convenience.
const todoPanel = require('./todo-panel');

module.exports = {
  getGithubPrefs: todoPanel.getGithubPrefs,
  applyGithubControlsForProject: todoPanel.applyGithubControlsForProject,
  ensureGithubIssuesLoadedForProject: todoPanel.ensureGithubIssuesLoadedForProject,
  renderGithubIssues: todoPanel.renderGithubIssues
};
