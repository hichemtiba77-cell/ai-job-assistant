@echo off
setlocal
cd /d "%~dp0" || exit /b 1
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js 24 is required. Please make sure node.exe is on PATH.
  pause
  exit /b 1
)
node.exe server.mjs --open
if errorlevel 1 (
  pause
  exit /b 1
)
