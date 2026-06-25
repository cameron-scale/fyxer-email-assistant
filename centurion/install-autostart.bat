@echo off
setlocal
cd /d "%~dp0"
title Centurion - install auto-start
echo This makes Centurion (dashboard + tunnel) launch automatically
echo every time you log in, so it survives reboots.
echo.
schtasks /create /tn "Centurion" /tr "cmd /c \"%~dp0run.bat\"" /sc onlogon /f
if errorlevel 1 (
  echo.
  echo Could not create the task. Try running this file as Administrator
  echo (right-click - Run as administrator).
) else (
  echo.
  echo Installed. Centurion will start at every logon.
  echo To remove it later:  schtasks /delete /tn "Centurion" /f
)
echo.
pause
endlocal
