@echo off
setlocal enabledelayedexpansion

rem One-click bootstrap for Windows colleagues:
rem - Ensure Node.js LTS exists (via choco or winget)
rem - Install npm deps
rem - Install Playwright Chromium only

cd /d "%~dp0.."
set "ROOT=%cd%"

echo [bootstrap] repo: "%ROOT%"

rem --- Check admin (recommended for choco/winget installs) ---
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo [bootstrap] WARN: 建議用「以系統管理員身分執行」以便安裝 Node.js。
)

rem --- Detect node/npm ---
where node >nul 2>&1
set "HAS_NODE=%ERRORLEVEL%"
where npm >nul 2>&1
set "HAS_NPM=%ERRORLEVEL%"

if "%HAS_NODE%"=="0" if "%HAS_NPM%"=="0" goto :node_ok

echo [bootstrap] node/npm not found. Try installing Node.js LTS...

rem --- Detect choco / winget ---
where choco >nul 2>&1
set "HAS_CHOCO=%ERRORLEVEL%"
where winget >nul 2>&1
set "HAS_WINGET=%ERRORLEVEL%"

if "%HAS_CHOCO%"=="0" goto :install_node_choco
if "%HAS_WINGET%"=="0" goto :install_node_winget

echo [bootstrap] ERROR: 找不到 Node.js，且未偵測到 choco 或 winget。
echo [bootstrap]        請先安裝其中之一：
echo [bootstrap]        - Chocolatey: https://chocolatey.org/install
echo [bootstrap]        - winget: Windows 10/11 通常內建（或安裝 App Installer）
exit /b 1

:install_node_choco
echo [bootstrap] installing Node.js LTS via choco...
choco install nodejs-lts -y
if %ERRORLEVEL% neq 0 (
  echo [bootstrap] ERROR: choco install nodejs-lts failed.
  exit /b 1
)

rem Try refreshenv if present (helps same-session PATH)
if exist "%ProgramData%\chocolatey\bin\refreshenv.cmd" (
  call "%ProgramData%\chocolatey\bin\refreshenv.cmd" >nul 2>&1
)
goto :recheck_node

:install_node_winget
echo [bootstrap] installing Node.js LTS via winget...
winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
if %ERRORLEVEL% neq 0 (
  echo [bootstrap] ERROR: winget install OpenJS.NodeJS.LTS failed.
  exit /b 1
)
goto :recheck_node

:recheck_node
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo [bootstrap] ERROR: Node.js 安裝完成但此視窗仍找不到 node。
  echo [bootstrap]        請關閉本視窗後重新開啟，再重跑此檔案。
  exit /b 1
)
where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo [bootstrap] ERROR: Node.js 安裝完成但此視窗仍找不到 npm。
  echo [bootstrap]        請關閉本視窗後重新開啟，再重跑此檔案。
  exit /b 1
)

:node_ok
for /f "delims=" %%v in ('node -v') do set "NODE_VER=%%v"
for /f "delims=" %%v in ('npm -v') do set "NPM_VER=%%v"
echo [bootstrap] node: %NODE_VER%
echo [bootstrap] npm:  %NPM_VER%

rem --- .env bootstrap (same behavior as bash) ---
if not exist ".env" (
  if exist ".env.example" (
    echo [bootstrap] .env not found, creating from .env.example
    copy /y ".env.example" ".env" >nul
    echo [bootstrap] NOTE: Please edit .env and set PLAYWRIGHT_BPM_PASSWORD, etc.
  ) else (
    echo [bootstrap] WARN: .env and .env.example not found. Continue anyway.
  )
)

rem --- Install deps ---
if exist "package-lock.json" (
  echo [bootstrap] installing deps with npm ci
  call npm ci
) else (
  echo [bootstrap] package-lock.json not found; using npm install
  call npm install
)
if %ERRORLEVEL% neq 0 (
  echo [bootstrap] ERROR: npm install failed.
  exit /b 1
)

rem --- Install Playwright Chromium only ---
echo [bootstrap] installing Playwright Chromium browser
call npx playwright install chromium
if %ERRORLEVEL% neq 0 (
  echo [bootstrap] ERROR: npx playwright install chromium failed.
  exit /b 1
)

echo [bootstrap] done
exit /b 0

