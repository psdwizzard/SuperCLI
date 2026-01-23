@echo off
setlocal

set "START_DIR=%CD%"
set "PROJECT_DIR=%~1"
if "%PROJECT_DIR%"=="" set "PROJECT_DIR=%START_DIR%"

REM Always run from repo root
cd /d "%~dp0"

if not exist "node_modules" (
  echo [!] Dependencies not installed. Run install.bat first.
  exit /b 1
)

echo Starting SuperCLI for "%PROJECT_DIR%"...
call npm start -- --project "%PROJECT_DIR%"

endlocal
