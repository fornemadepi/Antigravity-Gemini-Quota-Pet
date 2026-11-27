const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');

function ensurePkgBinary(checkRelPath, installScriptRelPath, label) {
  const binPath = path.join(root, checkRelPath);
  const scriptPath = path.join(root, installScriptRelPath);
  if (!fs.existsSync(binPath) && fs.existsSync(scriptPath)) {
    console.log(`[setup] Downloading ${label} binary...`);
    execFileSync(process.execPath, [scriptPath], { cwd: root, stdio: 'inherit' });
  }
}

ensurePkgBinary('node_modules/electron/dist/electron.exe', 'node_modules/electron/install.js', 'Electron');
ensurePkgBinary('node_modules/esbuild/bin/esbuild', 'node_modules/esbuild/install.js', 'esbuild');
