@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

rem Pinned to the exact version this app is developed/tested against, so a
rem fresh auto-install always matches instead of drifting over time.
set PINNED_NODE_VERSION=22.15.0
set REQUIRED_MAJOR=22

where node >nul 2>nul
if errorlevel 1 goto :install_node
for /f "tokens=1 delims=." %%v in ('node -e "console.log(process.versions.node.split('.')[0])"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS %REQUIRED_MAJOR% goto :install_node
goto :node_ready

:install_node
echo Node.js %REQUIRED_MAJOR%+ was not found - setting it up automatically.

where winget >nul 2>nul
if errorlevel 1 goto :install_node_msi
echo winget found - installing the pinned Node.js v%PINNED_NODE_VERSION% via winget...
winget install --id OpenJS.NodeJS --version %PINNED_NODE_VERSION% -e --silent --accept-package-agreements --accept-source-agreements
if not errorlevel 1 goto :node_installed
echo winget install of the pinned version did not succeed, falling back to the official installer.

:install_node_msi
echo Downloading the official Node.js v%PINNED_NODE_VERSION% installer (matches the exact
echo version this app is tested against)...
set NODE_MSI=%TEMP%\node-installer.msi
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'https://nodejs.org/dist/v%PINNED_NODE_VERSION%/node-v%PINNED_NODE_VERSION%-x64.msi' -OutFile '%NODE_MSI%' } catch { exit 1 }"
if errorlevel 1 (
  echo Download failed.
  goto :install_failed
)
echo Installing Node.js (Windows will ask you to approve this - click Yes)...
powershell -NoProfile -Command "Start-Process msiexec -ArgumentList '/i', '%NODE_MSI%', '/qb' -Verb RunAs -Wait"
del "%NODE_MSI%" >nul 2>nul

:node_installed
echo.
echo Node.js was installed. Please double-click start.bat once more to continue
echo (this refreshes PATH so this launcher can find it).
pause
exit /b 0

:install_failed
echo.
echo Automatic install didn't work. Please install Node.js %REQUIRED_MAJOR%+ manually
echo from https://nodejs.org/ and re-run this script.
start "" "https://nodejs.org/"
pause
exit /b 1

:node_ready
echo Using node -v:
node -v

if not exist node_modules (
  echo Installing dependencies...
  call npm install
)

echo Ensuring Playwright's Chromium browser is installed...
call npx playwright install chromium

if "%PORT%"=="" set PORT=4173
start "" "http://localhost:%PORT%"

echo Starting server at http://localhost:%PORT% ...
node server\index.js
