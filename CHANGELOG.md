# Changelog

All notable changes to this project will be documented in this file.

This project adheres to Keep a Changelog ideals and uses SemVer for versioning.

## [1.1.0] - 2025-11-08

### Added
- Theme system with five themes: Dark, Light, Deep Blue, Light Grey, End Times (yellow/black).
- Settings modal with form-based editor for `.user` (per-project preferences). Advanced toggle exposes raw JSON.
- Root-level `TODO.md` integration:
  - Todo side panel with sections (Markdown headings), checkbox items, reorder (buttons and Alt+Up/Down), delete (button and Delete key).
  - Save/Reload buttons and live file watching to sync external edits while open.
- Global terminal scroll handling so PageUp/PageDown and Ctrl+Home/End work for the active tab regardless of focus.
- Project-scoped `.user` loader with home fallback and IPC to load/save preferences.

### Changed
- Created `TODO.md` automatically on project selection with usage instructions.
- Settings and theme now persist per project and apply immediately on selection (fixed load order).
- Todo panel layout refined to be responsive and non-clipping; fixed overlay with scalable width.

### Docs
- README and PROJECT updated for new features, usage, and troubleshooting.

## [1.0.0] - 2025-10-??

### Added
- Initial multi-project workspace, embedded terminal support via `@lydell/node-pty`, image paste, and basic dark UI.

