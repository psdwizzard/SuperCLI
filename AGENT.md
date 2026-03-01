# SuperCLI Agent Guide

## Purpose
- SuperCLI is an Electron desktop app for running and managing multiple AI coding CLIs per project.
- Main user-facing features: tabbed terminals, project selector, TODO panel (`TODO.md`), settings (`.user`), snippets, templates, themes, and GitHub issue integration.

## Quick Start
1. Install deps: `npm install` or `install.bat`
2. Run app: `npm start` or `run.bat`
3. Optional Windows launcher from any folder: `supercli <projectPath>`

## Runtime Architecture
- Electron main process entry: `src/main/index.js`
- Renderer entry: `src/renderer/index.js`
- UI shell/layout: `index.html`, `styles.css`
- Preload (currently minimal): `preload.js`

## Main Process Map (`src/main`)
- `index.js`: window creation + IPC registration
- `terminals.js`: embedded PTY via `@lydell/node-pty`, external terminal fallback, terminal IO, image save
- `project.js`: startup project resolution, project bootstrapping (`.supercli`, `TODO.md`), explorer tree build
- `todo.js`: parse/save/watch `TODO.md`
- `preferences.js`: read/write project `.user`, merge with `~/.supercli.user`
- `backup.js`: optional backup scheduler from `.user.backup`
- `github.js`: detect GitHub repo from `.git/config`, fetch/update issues
- `utils.js`: path escaping, directory helpers, zip helper

## Renderer Map (`src/renderer`)
- `index.js`: orchestration, module wiring, DOM events
- `terminal.js`: xterm lifecycle, send/receive commands, terminal state
- `tabs.js`: per-project tab rendering and active state
- `cli-modal.js`: CLI/project creation modal workflow
- `explorer.js`: project tree view + `.bat` run support
- `todo-panel.js`: TODO panel UI + GitHub issue controls
- `settings.js`: `.user` form editor and save/reload
- `themes.js`, `theme-creator.js`: theme application and custom theme creation
- `snippets.js`: project/global snippets panel
- `templates.js`: template list/save/apply
- `shortcuts.js`: keyboard shortcuts and rebinding
- `input.js`: input box behavior, mic toggle, numbered list mode, global scroll shortcuts
- `api.js`: renderer IPC bridge
- `state.js`: shared renderer state container

## Data + Files
- Project-local generated dir: `<project>/.supercli/`
- Images from paste: `<project>/.supercli/images`
- Project metadata: `<project>/.supercli/project.json`
- Project snippets: `<project>/.supercli/snippets.json`
- Tasks source of truth: `<project>/TODO.md`
- Project preferences: `<project>/.user`
- Home fallback prefs: `~/.supercli.user`
- Home custom assets:
  - templates: `~/.supercli/templates/*.json`
  - themes: `~/.supercli/themes/*.json`

## IPC Surface (high-level)
- Project/file ops: `select-project-folder`, `get-startup-project`, `read-project-tree`
- Preferences: `load-user-preferences`, `save-user-preferences`
- Todo: `load-todo`, `save-todo`, `watch-todo`, `unwatch-todo`
- GitHub: `github-issues`, `github-issue-set-state`
- Terminal: `create-terminal`, `write-to-terminal`, `resize-terminal`, `close-terminal`
- Other: `open-devtools`, `open-external`, `save-image`, snippet/template/theme IPC handlers

## Common Workflows
- Add a new feature touching UI + IPC:
  1. Add/adjust main handler in `src/main/index.js` and backing module.
  2. Expose/consume via `src/renderer/api.js`.
  3. Wire renderer behavior in `src/renderer/*.js`.
- Terminal bugs:
  - Check PTY availability path in `src/main/terminals.js`.
  - Verify fallback behavior and renderer messaging in `src/renderer/terminal.js`.
- Todo sync issues:
  - Check markdown parse/serialize in `src/main/todo.js`.
  - Check panel cache/render path in `src/renderer/todo-panel.js`.

## Known Constraints
- `contextIsolation: false` and `nodeIntegration: true` are enabled in BrowserWindow.
- No test suite is currently defined in `package.json`.
- PTY dependency can fail on restricted/offline setups; external terminal fallback is expected behavior.

## Pre-Push Private Diary
- A local Git pre-push hook is provided at `.githooks/pre-push`.
- It runs `node scripts/agent-diary.js --require-entry` before push continues.
- Diary entries are written to `.supercli/agent-private/diary.md` (gitignored via `.supercli/`).
- To activate hooks in this clone:
  - `npm run hooks:install`

## Recommended First 10 Minutes for a New Agent
1. Read `package.json`, `README.md`, and this `AGENT.md`.
2. Launch app with `npm start` and create/open a project.
3. Open DevTools and verify startup project + first tab flow.
4. Validate terminal mode (embedded vs fallback) and TODO panel save/reload.
