@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "%~dp0node_modules\esbuild" (
  echo [首次安装] 正在准备构建依赖...
  call npm.cmd install
)
call node scripts\ensure-binaries.js
call node mcp-app\build-plugin.js
echo.
echo ✦ 安装完成！现在可以在 Antigravity 右上角「+」菜单或左侧边栏打开「Gemini 桌宠」啦！
pause
