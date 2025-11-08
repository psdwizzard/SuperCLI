@echo off
setlocal enabledelayedexpansion
set EXIT_CODE=1

pushd "%~dp0" >nul 2>&1
if errorlevel 1 (
  echo [!] Unable to switch to the SuperCLI directory.
  echo     Please run update.bat from the project root.
  exit /b 1
)

call :printHeader

call :requireCommand git "Git"
if errorlevel 1 goto :end

call :requireCommand node "Node.js"
if errorlevel 1 goto :end

call :requireCommand npm "npm"
if errorlevel 1 goto :end

if not exist ".git" (
  echo [!] This folder does not contain a Git repository.
  goto :end
)

call :ensureCleanWorkingTree
if errorlevel 1 goto :end

for /f "usebackq delims=" %%A in (`git rev-parse --abbrev-ref HEAD 2^>nul`) do (
  set "CURRENT_BRANCH=%%~A"
)
if not defined CURRENT_BRANCH (
  echo [!] Unable to determine the current Git branch.
  goto :end
)
if /i "!CURRENT_BRANCH!"=="HEAD" (
  echo [!] Repository is in a detached HEAD state. Checkout a branch before running update.bat.
  goto :end
)

set "UPSTREAM="
for /f "usebackq delims=" %%A in (`git rev-parse --abbrev-ref --symbolic-full-name "@{u}" 2^>nul`) do (
  set "UPSTREAM=%%~A"
)
if not defined UPSTREAM (
  echo [!] Branch "!CURRENT_BRANCH!" has no upstream tracking branch.
  echo     Set an upstream (e.g., git push -u origin "!CURRENT_BRANCH!") and rerun update.bat.
  goto :end
)

echo.
echo Fetching latest changes (including tags)...
git fetch --prune --tags
if errorlevel 1 goto :gitFail

echo.
echo Pulling updates for !CURRENT_BRANCH! from !UPSTREAM! (fast-forward only)...
git pull --ff-only --stat
if errorlevel 1 goto :gitFail

echo.
echo Refreshing dependencies after pull...
set "SKIP_INSTALL_PAUSE=1"
call "%~dp0install.bat"
set INSTALL_EXIT=%ERRORLEVEL%
set "SKIP_INSTALL_PAUSE="
if not "%INSTALL_EXIT%"=="0" goto :installFail

echo.
echo Update complete! Launch the latest build with run.bat or npm start.
set EXIT_CODE=0
goto :end

:gitFail
echo.
echo [!] Git failed to update this repository.
echo     Resolve the error above and rerun update.bat.
goto :end

:installFail
echo.
echo [!] Dependency refresh failed. Review the npm output above, fix the issue, then rerun update.bat.
goto :end

:ensureCleanWorkingTree
set "HAS_CHANGES=0"
for /f "usebackq delims=" %%A in (`git status --porcelain 2^>nul`) do (
  set "HAS_CHANGES=1"
  goto :afterStatus
)
:afterStatus
if "!HAS_CHANGES!"=="1" (
  echo [!] Working tree has uncommitted changes.
  echo     Commit or stash them before running update.bat.
  exit /b 1
)
exit /b 0

:requireCommand
where "%~1" >nul 2>&1
if errorlevel 1 (
  echo [!] %~2 - command "%~1" is not available on PATH.
  exit /b 1
)
exit /b 0

:printHeader
echo ================================
echo        SuperCLI Updater
echo ================================
echo.
exit /b 0

:end
popd >nul 2>&1
endlocal & exit /b %EXIT_CODE%
