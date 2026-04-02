@echo off
setlocal
cd /d "%~dp0"

where npm >nul 2>&1
if %ERRORLEVEL% equ 0 (
  call npm run monitor:workitem
  exit /b %ERRORLEVEL%
)

set "GITBASH=%ProgramFiles%\Git\bin\bash.exe"
if not exist "%GITBASH%" set "GITBASH=%ProgramFiles(x86)%\Git\bin\bash.exe"
if exist "%GITBASH%" (
  "%GITBASH%" "%~dp0scripts\run-monitor.sh"
  exit /b %ERRORLEVEL%
)

echo [run.bat] ERROR: 找不到 npm（PATH）也找不到 Git 內建的 bash.exe。
echo 請安裝 Node.js LTS（勾選加入 PATH）或安裝 Git for Windows。
exit /b 1
