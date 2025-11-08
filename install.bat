@echo off
setlocal enabledelayedexpansion
set EXIT_CODE=1

pushd "%~dp0" >nul 2>&1
if errorlevel 1 (
  echo [!] Unable to switch to the SuperCLI directory.
  echo     Please run install.bat from the project root.
  exit /b 1
)

call :printHeader

call :requireCommand node "Node.js"
if errorlevel 1 goto :end

call :requireCommand npm "npm"
if errorlevel 1 goto :end

call :checkNodeVersion
if errorlevel 1 goto :end

call :pickNpmCommand

echo.
echo Installing dependencies with %DISPLAY_NPM_CMD% (includes @lydell/node-pty)...
call %NPM_CMD%
if errorlevel 1 goto :installFailed

echo.
echo Dependencies installed successfully!
echo   - Launch the app with run.bat or npm start.
echo   - If embedded terminals keep falling back to external windows, install the
echo     "MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs" component via
echo     Visual Studio Installer, then rerun npm install so @lydell/node-pty can
echo     unpack its platform binaries.
echo.
pause
set EXIT_CODE=0
goto :end

:installFailed
echo.
echo [!] npm failed to install the dependencies.
echo     Common fixes:
echo       1. Ensure your network or proxy allows downloads from registry.npmjs.org.
echo       2. Install the "MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs"
echo          component if @lydell/node-pty needs to rebuild.
echo       3. Delete node_modules and rerun install.bat.
echo.
pause
set EXIT_CODE=1
goto :end

:printHeader
echo ================================
echo   SuperCLI Dependency Installer
echo ================================
echo.
exit /b 0

:requireCommand
where "%~1" >nul 2>&1
if errorlevel 1 (
  echo [!] %~2 ("%~1") is not available on PATH.
  echo     Install it and reopen this window.
  exit /b 1
)
exit /b 0

:checkNodeVersion
for /f "usebackq tokens=* delims=" %%A in (`node -v 2^>nul`) do set "NODE_VERSION=%%~A"
if not defined NODE_VERSION (
  echo [!] Unable to detect the Node.js version.
  exit /b 1
)
for /f "tokens=1 delims=." %%A in ("!NODE_VERSION!") do set "NODE_MAJOR=%%~A"
set "NODE_MAJOR=!NODE_MAJOR:v=!"
if "!NODE_MAJOR!"=="" (
  echo [!] Unexpected Node.js version string: !NODE_VERSION!
  exit /b 1
)
set /a NODE_MAJOR_INT=!NODE_MAJOR! >nul 2>&1
if !NODE_MAJOR_INT! LSS 16 (
  echo [!] Detected Node.js !NODE_VERSION!. SuperCLI requires Node 16 or newer.
  exit /b 1
)
exit /b 0

:pickNpmCommand
set "NPM_CMD=npm install"
set "DISPLAY_NPM_CMD=npm install"
if exist "package-lock.json" (
  set "NPM_CMD=npm ci"
  set "DISPLAY_NPM_CMD=npm ci"
)
exit /b 0

:end
popd >nul 2>&1
endlocal & exit /b %EXIT_CODE%
