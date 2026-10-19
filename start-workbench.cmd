@echo off
cd /d "%~dp0"
call pnpm.cmd workbench --open
if errorlevel 1 pause
