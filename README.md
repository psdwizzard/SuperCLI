# SuperCLI

A powerful Node.js-based terminal interface with dark mode, multi-tab support, and image paste functionality.

## Features

- **Dark Mode UI**: Easy on the eyes with a professional dark theme
- **Multi-Tab Support**: Open multiple terminal sessions simultaneously
- **Embedded Terminals**: Optional PTY-powered terminals keep your CLIs inside SuperCLI with automatic fallback to external windows
- **Image Paste**: Paste images directly into the input field - they're automatically saved to your project folder
- **Project Management**: Organized folder structure with automatic temp and image directories
- **Cross-Platform**: Works on Windows, macOS, and Linux

## Installation

1. Make sure you have Node.js installed (v16 or higher recommended)
2. Clone or download this project
3. Install dependencies:
   ```bash
   npm install
   ```

### Optional: Embedded terminal support

`npm install` already pulls in **@lydell/node-pty**, which ships prebuilt binaries for every major platform. If that download is blocked (offline install, proxy restrictions, etc.), SuperCLI detects the missing PTY layer and automatically falls back to external PowerShell/Bash windows.

Only when the prebuilt package fails do you need extra tooling:

1. Install the Visual Studio 2022 **Spectre-mitigated libs** (Visual Studio Installer -> Individual components -> search for *MSVC v143 Spectre-mitigated libs*).
2. Re-run `npm install` so @lydell/node-pty and its platform-specific package can unpack.

Until those binaries are present, SuperCLI will keep launching external windows and show a reminder in each tab.

## Usage

### Starting the Application

Run the application with:
```bash
npm start
```

For development mode with DevTools:
```bash
npm run dev
```

### Using SuperCLI

1. **Select a Project Folder**
   - Click "Select Project Folder" in the top right
   - Choose or create a folder for your project
   - SuperCLI will create a `.supercli` folder with:
     - `images/` - For pasted images
     - `temp/` - For temporary files
     - `project.json` - Project metadata

2. **Managing Tabs**
   - Click the "+" button to create a new terminal tab
   - Click on tabs to switch between terminals
   - Click the "×" on a tab to close it

3. **Using the Terminal**
   - With `@lydell/node-pty` installed, each tab hosts a live shell (PowerShell on Windows, your default shell on macOS/Linux); type directly in the terminal pane or in the input box and press **Send**
   - Without the PTY dependency, SuperCLI launches a labelled PowerShell/terminal window for each tab; use that window to interact while the in-app pane logs activity and reminders
   - The input box supports multi-line commands with `Shift+Enter` and sends with `Enter`

4. **Pasting Images**
   - First, select a project folder
   - Copy an image to your clipboard
   - Paste (`Ctrl+V`) into the input field
   - The image path will be automatically inserted
   - Images are saved to `.supercli/images/` in your project folder

## Keyboard Shortcuts

- `Enter` - Send command to embedded terminal
- `Shift+Enter` - New line in input field
- `Ctrl+V` - Paste (supports both text and images)

## Project Structure

```
SuperCLI/
├── main.js           # Electron main process
├── preload.js        # Secure IPC bridge
├── renderer.js       # Frontend logic
├── index.html        # UI structure
├── styles.css        # Dark mode styling
├── package.json      # Dependencies
└── README.md         # This file
```

## How It Works

- **Electron**: Provides the desktop application framework
- **XTerm.js**: Powers the terminal display
- **Node.js child_process**: Handles shell command execution
- **IPC**: Secure communication between main and renderer processes

## Notes for MVP

This is the initial MVP (Minimum Viable Product) version. Embedded PTY support is available when `@lydell/node-pty` is installed; otherwise SuperCLI relies on external windows. Future enhancements could include:

- Shipping prebuilt PTY binaries so the embedded experience works out-of-the-box
- Session persistence
- Custom themes
- Keyboard shortcuts customization
- Multiple shell support (cmd, bash, zsh, etc.)

## Troubleshooting

- **Embedded terminal never appears**: Install the VS 2022 Spectre-mitigated libs and rerun `npm install` so `@lydell/node-pty` can download its binary. Until then SuperCLI uses external windows automatically.
- **No terminal prompt showing**: Some shells suppress the prompt until the first command. Run `cls`/`clear` or press Enter once.
- **Images not pasting**: Ensure you've selected a project folder first.
- **Input field not working after command**: The input field should automatically focus after sending. If not, click on it.

## License

MIT

