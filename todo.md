# SuperCLI - Feature Development TODO

## Session Persistence & Auto-Backup

### Goals
- Restore tabs, directories, and command history when the app restarts
- Automatic backup of session state at configurable intervals
- Prevent data loss from unexpected crashes or closures

### Tasks
- [ ] Design session data structure (tabs, directories, command history, active project)
- [ ] Implement session capture logic to collect all tab states
- [ ] Implement session restore logic on app startup
- [ ] Add auto-backup timer with configurable interval from settings
- [ ] Store session data in user data directory (e.g., `sessions/latest.json`, `sessions/backup-{timestamp}.json`)
- [ ] Add recovery options if session restore fails

---

## Settings Panel

### Goals
- Centralized configuration interface for all app settings
- Persistent storage of user preferences
- Easy access via menu or keyboard shortcut

### Tasks
- [ ] Design settings data structure and storage schema
- [ ] Create settings panel UI (modal/sidebar with tabs or sections)
- [ ] Implement settings modal logic in renderer.js
- [ ] Add settings IPC handlers in main.js (save/load from JSON file)
- [ ] Add settings menu item and keyboard shortcut (e.g., Ctrl+,)

### Settings to Include
- **Auto-Backup**
  - Enable/disable auto-backup
  - Backup interval (in minutes): 1, 5, 10, 15, 30, 60
  - Max backup files to keep
- **Session**
  - Restore previous session on startup (checkbox)
  - Restore command history (checkbox)
- **Appearance**
  - Theme selection
  - Font size
  - Terminal scrollback lines (currently 10,000)
- **General**
  - Default working directory
  - Confirm before closing app with active terminals

---

## Theme System

### Goals
- Multiple color schemes for terminal and UI
- Easy theme switching without restart
- Custom theme creation (future enhancement)

### Tasks
- [ ] Create theme system with CSS variable architecture
- [ ] Define at least 3 built-in themes:
  - Dark (current default)
  - Light
  - High Contrast
- [ ] Add theme selection UI in settings panel
- [ ] Implement dynamic theme switching (update CSS variables + XTerm theme)
- [ ] Persist selected theme in settings
- [ ] Apply theme to both UI and XTerm terminals

### Theme Properties to Define
- Background colors (main, secondary, terminal)
- Text colors (primary, secondary, muted)
- Accent colors (links, highlights, selections)
- Border colors
- XTerm color palette (16 ANSI colors + foreground/background)

---

## Implementation Notes

### File Structure
```
userData/
  ├── settings.json          # User preferences
  ├── sessions/
  │   ├── latest.json        # Most recent session
  │   └── backup-*.json      # Timestamped backups
  └── themes/
      └── custom/            # Future: user-created themes
```

### Settings Schema (Draft)
```json
{
  "version": "1.0.0",
  "autoBackup": {
    "enabled": true,
    "intervalMinutes": 5,
    "maxBackups": 10
  },
  "session": {
    "restoreOnStartup": true,
    "restoreHistory": true
  },
  "appearance": {
    "theme": "dark",
    "fontSize": 14,
    "scrollbackLines": 10000
  },
  "general": {
    "defaultWorkingDir": null,
    "confirmBeforeClose": true
  }
}
```

### Session Schema (Draft)
```json
{
  "version": "1.0.0",
  "timestamp": "2025-11-08T10:30:00.000Z",
  "activeProject": "project-id",
  "projects": [
    {
      "id": "project-id",
      "name": "SuperCLI",
      "tabs": [
        {
          "id": "tab-1",
          "title": "Claude",
          "cwd": "C:\\Users\\Rabbit\\Documents\\SuperCLI",
          "command": "npx @anthropic-ai/claude-code",
          "history": ["npm install", "npm start"],
          "scrollPosition": 0
        }
      ]
    }
  ],
  "windowState": {
    "bounds": {"x": 100, "y": 100, "width": 1200, "height": 800},
    "isMaximized": false
  }
}
```

---

## Testing Checklist

- [ ] Settings persist across app restarts
- [ ] Session restores all tabs with correct working directories
- [ ] Auto-backup creates files at specified intervals
- [ ] Theme switching updates both UI and terminals immediately
- [ ] Old backup files are cleaned up when limit is reached
- [ ] App handles corrupted session/settings files gracefully
- [ ] Settings UI validation works (e.g., backup interval must be positive)

---

## Future Enhancements (Not in Scope Yet)

- Custom theme creation and import/export
- Cloud sync for settings and sessions
- Multiple named sessions (save/load different workspace configurations)
- Session templates
- Command history search and filtering in settings
