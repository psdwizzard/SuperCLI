@echo off
setlocal

REM Always run from repo root
cd /d "%~dp0"

if not exist "node_modules" (
  echo [!] Dependencies not installed. Run install.bat first.
  pause
  exit /b 1
)

echo Starting SuperCLI...
call npm start

endlocal
