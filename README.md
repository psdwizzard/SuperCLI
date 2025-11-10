# SuperCLI

An Electron desktop app that wrangles multiple AI coding CLIs in one place. Tabs per project, embedded terminals when available, project preferences, themes, and a Markdown‑backed TODO panel.

## Features

- Multi‑project workspace with per‑project tabs and selector
- Embedded terminals via `@lydell/node-pty` with external window fallback
- Deep scrollback (10,000 lines) + global PageUp/PageDown, Ctrl+Home/End
- Image paste to `.supercli/images` with auto‑inserted path
- Settings modal with project `.user` preferences (form‑based editor)
- Theme system: Dark, Light, Deep Blue, Light Grey, End Times (yellow/black)
- Project TODO panel backed by `TODO.md` in the repo root
  - Checkbox lists, optional sections (Markdown headings), reorder, delete
  - Save/Reload and live sync if file changes on disk
- Cross‑platform: Windows, macOS, Linux

### Optional: Automatic Backups

- Enable via `.user` under a `backup` key. Defaults target `.supercli/**` and `TODO.md`, writing snapshots to `.supercli/backups`.
- Minimal example:

```
{
  "backup": {
    "enabled": true,
    "interval_minutes": 60,
    "retention_count": 4,
    "target_dir": ".supercli/backups"
  }
}
```

- Options: `compress` (uses PowerShell Compress-Archive on Windows or `zip` on *nix), `include_globs`, `exclude_globs`, `verify`, `schedule: "daily@HH:MM"`, `max_backup_size_mb`, `on_success_cmd`, `on_error_cmd`.
- Oldest snapshots beyond `retention_count` are removed after a successful backup.

## Installation

1. Make sure you have Node.js installed (v16 or higher recommended)
2. Clone or download this project
3. Install dependencies:

```
npm install
```

### Optional: Embedded terminal support

`npm install` pulls in **@lydell/node-pty**, which ships prebuilt binaries. If that download is blocked (offline/proxy), SuperCLI detects the missing PTY layer and automatically falls back to external PowerShell/Bash windows.

If prebuilt binaries fail:

1. Install Visual Studio 2022 “MSVC v143 Spectre-mitigated libs” (Visual Studio Installer → Individual components)
2. Re-run `npm install`

## Usage

### Starting the Application

```
npm start
```

Development mode with DevTools:

```
npm run dev
```

### Using SuperCLI

1. Create or Open a Project
   - Click "+" to add a tab and choose a CLI
   - Check "New project" in the modal to pick a folder (or reuse the active project)
   - SuperCLI creates a `.supercli` folder (images/temp/metadata) and ensures a root `TODO.md` with usage instructions

2. Switch Projects
   - Use the selector at the left of the tabs

3. Using the Terminal
   - With `@lydell/node-pty`, type directly in the terminal pane or in the input box and press Send
   - Without PTY, SuperCLI launches a labelled external window per tab; use that window to interact while the in‑app pane logs status
   - Shift+Enter inserts a newline; Enter sends

4. Pasting Images
   - Select a project first
   - Paste (Ctrl+V) into the input field; the image is saved to `.supercli/images` and the path is inserted

5. Settings
   - Click `Settings` (header) to edit per‑project preferences via fields (no JSON needed)
   - Theme selection applies immediately and persists per project

6. TODO Panel
   - Click `Todo` (header) to open/close
   - Tasks live in root `TODO.md` as checkbox lines; optional “section” groups tasks under headings
   - Save writes back to file; Reload re‑reads; when open, external edits sync live

## Keyboard Shortcuts

- Enter — Send to embedded terminal
- Shift+Enter — New line in input
- Ctrl+V — Paste (text or images)
- PageUp/PageDown — Scroll a page in the active terminal (works globally)
- Ctrl+Home/Ctrl+End — Jump to top/bottom of terminal
- Alt+Up/Down — Move selected TODO up/down (when focused)
- Delete — Delete selected TODO (when focused)

## Project Structure

```
SuperCLI/
  main.js        # Electron main process, PTY + IPC, TODO watcher
  preload.js     # (empty, reserved)
  renderer.js    # Frontend logic (tabs, settings, todo, themes)
  index.html     # UI layout
  styles.css     # Themes and component styles
  PROJECT.md     # Deeper project notes
  README.md      # This file
```

## How It Works

- Electron provides the desktop shell
- XTerm.js renders terminal output
- Node child_process/PTY handles shells; IPC connects renderer to main

## Notes

- If `@lydell/node-pty` isn’t available, SuperCLI automatically uses external terminals with clear status text.
- Session persistence and presets are planned.

## Troubleshooting

- Embedded terminal missing: rerun `npm install`, verify VS 2022 Spectre libs, and ensure downloads aren’t blocked by proxy/firewall.
- No terminal prompt: some shells suppress the prompt until first command; press Enter or run `cls`/`clear`.
- Images not pasting: select a project; images save to `.supercli/images`.
- Theme didn’t apply after switching projects: set theme via `Settings` (persists per project in `.user`).
