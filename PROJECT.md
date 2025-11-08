# SuperCLI - Project Overview

## What's New

- Multi-project workspace with a project selector in the header. Each project shows its own set of tabs; switching the selector swaps the visible terminals to that project's tabs.
- Improved terminal scrolling: deeper scrollback (10,000 lines) and keyboard navigation (PageUp/PageDown, Ctrl+Home/End). A global handler ensures shortcuts work on the active tab even when focus is elsewhere.
- Theme system with live preview and per-project persistence: Dark, Light, Deep Blue, Light Grey, End Times.
- Settings modal with form-based editor for `.user` (no JSON required) including Python venv rules and templates.
- Root-level `TODO.md` with an in-app Todo panel (sections, reorder, delete, Save/Reload, live sync while open).


## What This App Does
SuperCLI is an Electron desktop app that manages multiple AI coding CLIs (Claude, Codex, Gemini, etc.) inside one tabbed interface. It gives you:

- A dark-mode UI built with HTML/CSS/vanilla JS (see `index.html`, `styles.css`, `renderer.js`).
- Terminal rendering powered by **XTerm.js** plus **@lydell/node-pty** for real PTY support on Windows and *nix.
- A Node/Electron main process (`main.js`) that spawns shells, manages IPC, saves clipboard images, and falls back to external PowerShell windows if the embedded PTY layer is missing.
- Quick launch scripts (`run.bat`, `install.bat`) and a Spectre-lib-aware install flow for Windows users.
- A dogfooding workflow: we use SuperCLI to build SuperCLI, so expect to open this repo inside the app itself when iterating.

## Tech Stack
| Layer          | Details                                                                 |
|----------------|-------------------------------------------------------------------------|
| UI             | Electron renderer, vanilla JS, XTerm.js                                 |
| Backend        | Electron main process + Node.js IPC                                     |
| PTY handling   | `@lydell/node-pty` (prebuilt binaries) with fallback to external shells |
| Styling        | Plain CSS (dark mode)                                                   |
| Packaging      | npm scripts (`npm install`, `npm start`, `npm run dev`)                 |

## Recent Issues & Fixes
1. **External windows not opening**  
   - Cause: fragile `cmd /c start powershell` quoting.  
   - Fix: rewrote the launcher to use `Start-Process PowerShell` with safe quoting and clear status messages.

2. **No embedded terminals**  
   - Cause: `node-pty` native build failed (missing Spectre libs).  
   - Fix: switched to `@lydell/node-pty` (prebuilt binaries), updated docs/install scripts, and added diagnostics so users know when the PTY layer is missing.

3. **Renderer input didn't reach the shell**  
   - Cause: we were echoing commands but couldn't send them to external windows.  
   - Fix: once PTY support worked, the renderer writes directly to `ptyProcess`; the input box now issues a real carriage return so commands execute immediately.

4. **New tab workflow locked to one folder**  
   - Cause: the CLI picker always reused the last selected directory.  
   - Fix: the modal now includes a **New project** checkbox that opens the folder chooser so each tab can target a different workspace when needed.

5. **Enter key added blank lines instead of sending**  
   - Cause: some keyboards inserted the newline before our handler ran, so pressing Enter just produced another line in the textbox.  
   - Fix: a dedicated key handler now watches for both Enter keys, trims any trailing newline, and immediately pipes the command through `sendCommand`; Shift+Enter still inserts a newline for multi-line input.

## Hand-off Notes
1. **Install flow**  
   - Run `install.bat` (or `npm install`). It pulls in `@lydell/node-pty` automatically; if you're on Windows without the "MSVC v143 Spectre-mitigated libs," install that component via Visual Studio Installer and re-run npm install.

2. **Running**  
   - `run.bat` (Windows) or `npm start` elsewhere launches the Electron app with DevTools already open.  
   - Remember we're actively using SuperCLI to build this project; launching the app gives you the environment you'll keep iterating inside.

3. **Settings**  
   - Use the `Settings` button in the header to view/edit the active project's `.user` preferences.  
   - The modal provides fields (form UI). Advanced mode exposes raw JSON if needed. `Save` writes to `<project>/.user`. `Reload` re-reads from disk/home-fallback.

4. **Project structure basics**
   - `main.js`: Electron main process, PTY management, file IO.
   - `renderer.js`: all tab logic, clipboard handling, XTerm wiring.
   - `styles.css`: dark theme styling.
   - `install.bat` / `run.bat`: Windows convenience scripts.

5. **Current TODOs**
   - Detect when @lydell/node-pty fails to download and surface a repair button/CTA.
   - Improve UX for fallback mode (focus external window, onboarding overlay, better error copy).
   - Add session persistence and window-position management.
   - Flesh out next-level features (command history, project templates, CLI presets).

6. **Troubleshooting quick hits**
   - Embedded terminal missing → rerun `npm install`, ensure Spectre libs are installed, and check firewall/proxy for blocked downloads.
   - External window stuck minimized → PowerShell sometimes spawns off-screen; use Alt+Tab or Task View to bring it forward.
   - Input box not closing commands → make sure the tab is in "embedded" mode (status text is green). Fallback tabs intentionally only log the text.

With those notes, you should be able to continue development, add new CLIs, or start polishing the installer/UX without reverse engineering the history. Good luck!

## TODO.md
- SuperCLI looks for `TODO.md` (or `todo.md`) in the project root and renders checkbox tasks in the Todo panel.
- Format: Markdown checkbox list items using `- [ ] Task` and `- [x] Task`.
- The Todo panel can add items, toggle completion, Save back to `TODO.md`, or Reload from disk.
- On first selecting a project, SuperCLI creates a starter `TODO.md` with usage instructions if missing.

## Changelog
- See `CHANGELOG.md` for version history. Current version: 1.1.0.

## User Preferences (.user)
- Place a JSON file named `.user` in the project root to store per-project preferences. A home-level fallback at `~/.supercli.user` is also read; project values take precedence.
- Loaded on project selection and available via IPC (`load-user-preferences`).
- Example fields include session/UI defaults and language-specific rules.

Example `.user` snippet for Python venv policy:

```
{
  "version": 1,
  "language_prefs": {
    "python": {
      "venv": {
        "auto_enable_when_dependency_count_gte": 2,
        "venv_dir": ".venv",
        "python_executable": "python",
        "use_requirements_txt": true
      },
      "scripts": {
        "install_bat": "...bat template...",
        "run_bat": "...bat template..."
      }
    }
  }
}
```

Intended behavior: when creating Python apps with ≥2 dependencies, use a venv in `.venv` and scaffold `install.bat`/`run.bat` using the provided templates. Hook-up to generation flows can be added next.
