@echo off
rem ---------------------------------------------------------------
rem  Double-click this to open the Lanebreaker AI control panel.
rem  It starts a small local web page and opens it in your browser.
rem  Close this window (or press Ctrl-C) to shut the panel down.
rem ---------------------------------------------------------------
title Lanebreaker AI panel
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js was not found on this machine.
  echo   Install it from https://nodejs.org and then run this again.
  echo.
  pause
  exit /b 1
)

node "%~dp0ai\panel.js" %*

echo.
echo   The panel has stopped.
pause
