@echo off
chcp 65001 >nul
set ELECTRON_RUN_AS_NODE=
cd /d "%~dp0"
if not exist "%~dp0node_modules\electron\dist\electron.exe" (
  echo [首次运行] 正在自动安装依赖并下载 Electron 运行时，请稍候...
  call npm.cmd install
  call node scripts\ensure-binaries.js
)
start "" "%~dp0node_modules\electron\dist\electron.exe" .
