const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  screen,
  clipboard,
  nativeImage,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { QuotaEngine } = require('./quota-engine');

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

const BASE_WIDTH = 340;
const BASE_HEIGHT = 460;
const TOP_CUT_DIPS = 38;
const SNAP_THRESHOLD = 42;

let petWindow = null;
let settingsWindow = null;
let tray = null;
let quotaEngine = null;
let followTimer = null;

function getStorePath() {
  return path.join(app.getPath('userData'), 'pet-settings.json');
}

const DEFAULT_SETTINGS = {
  scale: 1.0,
  opacity: 1.0,
  alwaysOnTop: true,
  followAntigravity: false,
  edgeSnap: true,
  soundEnabled: true,
  volume: 0.65,
  showTurnBubble: true,
  turnBubbleSeconds: 10,
  primaryMetric: 'fiveHour', // 'fiveHour' | 'weekly'
  bubbleAlwaysVisible: true,
  lockedPosition: false,
  flipped: false, // true = pet on left side facing right
  posX: null,
  posY: null,
  planPreset: 'pro',
  fiveHourBudgetUnits: 4_500_000,
  weeklyBudgetUnits: 25_000_000,
  calibration: {
    fiveHour: null,
    weekly: null,
  },
};

let settings = { ...DEFAULT_SETTINGS };

function loadSettings() {
  try {
    const p = getStorePath();
    if (fs.existsSync(p)) {
      const loaded = JSON.parse(fs.readFileSync(p, 'utf8'));
      settings = {
        ...DEFAULT_SETTINGS,
        ...loaded,
        calibration: {
          ...DEFAULT_SETTINGS.calibration,
          ...(loaded.calibration || {}),
        },
      };
    }
  } catch (_) {
    settings = { ...DEFAULT_SETTINGS };
  }
}

function persistSettings() {
  try {
    const p = getStorePath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(settings, null, 2), 'utf8');
  } catch (_) {
    // ignore write error
  }
}

function getAvailableSprites() {
  const spriteDir = path.join(__dirname, '..', 'assets', 'sprites');
  const map = {};
  for (const name of ['idle', 'happy', 'low', 'sleep']) {
    const file = path.join(spriteDir, `gemini-${name}.png`);
    if (fs.existsSync(file)) {
      map[name] = `../../assets/sprites/gemini-${name}.png`;
    }
  }
  return map;
}

function getScaledSize(scale = settings.scale) {
  const s = Math.max(0.6, Math.min(2.2, Number(scale) || 1.0));
  return {
    width: Math.round(BASE_WIDTH * s),
    height: Math.round(BASE_HEIGHT * s),
  };
}

function broadcastSettings() {
  const payload = {
    settings,
    sprites: getAvailableSprites(),
    bridgeScriptPath: path.join(__dirname, '..', 'scripts', 'agy-statusline-bridge.js').replace(/\\/g, '/'),
  };
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('settings-updated', payload);
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('settings-updated', payload);
  }
  updateTrayMenu();
}

function broadcastQuota(snapshot) {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('quota-updated', snapshot);
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('quota-updated', snapshot);
  }
  if (tray && !tray.isDestroyed() && snapshot) {
    tray.setToolTip(
      `Gemini 桌宠 · Antigravity\n5h剩余: ${snapshot.fiveHour.remainingPct}% · 周剩余: ${snapshot.weekly.remainingPct}%`
    );
  }
}

function createPetWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;
  const { width, height } = getScaledSize();

  const defaultX = workArea.x + workArea.width - width - 16;
  const defaultY = workArea.y + workArea.height - height - 8;

  const x = typeof settings.posX === 'number' ? settings.posX : defaultX;
  const y = typeof settings.posY === 'number' ? settings.posY : defaultY;

  petWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    title: '',
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    backgroundMaterial: 'none',
    roundedCorners: false,
    thickFrame: false,
    autoHideMenuBar: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: settings.alwaysOnTop,
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  petWindow.on('page-title-updated', (e) => {
    e.preventDefault();
  });

  applyWindowShape();
  petWindow.once('ready-to-show', applyWindowShape);
  petWindow.on('focus', applyWindowShape);
  petWindow.on('blur', applyWindowShape);

  if (settings.alwaysOnTop) {
    petWindow.setAlwaysOnTop(true, 'screen-saver');
  }

  // Start with mouse pass-through forwarding enabled
  petWindow.setIgnoreMouseEvents(true, { forward: true });

  petWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  petWindow.on('closed', () => {
    petWindow = null;
  });
}

function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 540,
    height: 670,
    title: 'Gemini 桌宠设置与额度校准',
    resizable: false,
    minimizable: true,
    maximizable: false,
    autoHideMenuBar: true,
    backgroundColor: '#121526',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function snapAndClampWindow() {
  if (!petWindow || petWindow.isDestroyed()) return settings;
  const bounds = petWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const wa = display.workArea;

  let x = bounds.x;
  let y = bounds.y;

  if (settings.edgeSnap) {
    if (Math.abs(x - wa.x) <= SNAP_THRESHOLD) {
      x = wa.x + 4;
    } else if (Math.abs(x + bounds.width - (wa.x + wa.width)) <= SNAP_THRESHOLD) {
      x = wa.x + wa.width - bounds.width - 4;
    }
    if (Math.abs(y - wa.y) <= SNAP_THRESHOLD) {
      y = wa.y + 4;
    } else if (Math.abs(y + bounds.height - (wa.y + wa.height)) <= SNAP_THRESHOLD) {
      y = wa.y + wa.height - bounds.height - 4;
    }
  }

  // Keep inside visible workArea
  x = Math.max(wa.x - 20, Math.min(wa.x + wa.width - bounds.width + 20, x));
  y = Math.max(wa.y - 10, Math.min(wa.y + wa.height - bounds.height + 16, y));

  const centerX = x + bounds.width / 2;
  const flipped = centerX < wa.x + wa.width * 0.35;

  petWindow.setPosition(Math.round(x), Math.round(y));
  settings.posX = Math.round(x);
  settings.posY = Math.round(y);
  settings.flipped = flipped;
  persistSettings();
  broadcastSettings();
  return settings;
}

function applyWindowShape() {
  if (!petWindow || petWindow.isDestroyed()) return;
  try {
    const { width, height } = petWindow.getBounds();
    const s = Math.max(0.6, Math.min(2.2, Number(settings.scale) || 1.0));
    const cutTop = Math.round(TOP_CUT_DIPS * s);
    // Hard-clip the top non-client DWM caption zone via Win32 SetWindowRgn so Windows 11
    // can never draw an inactive white bar at the top of the transparent window.
    petWindow.setShape([
      { x: 0, y: cutTop, width, height: Math.max(20, height - cutTop) },
    ]);
  } catch (_) {}
}

function applyScaleChange(newScale) {
  if (!petWindow || petWindow.isDestroyed()) return;
  const oldBounds = petWindow.getBounds();
  const newSize = getScaledSize(newScale);

  // Anchor bottom-right (or bottom-left when flipped) so her feet stay planted!
  const newX = settings.flipped
    ? oldBounds.x
    : oldBounds.x + (oldBounds.width - newSize.width);
  const newY = oldBounds.y + (oldBounds.height - newSize.height);

  petWindow.setBounds({
    x: Math.round(newX),
    y: Math.round(newY),
    width: newSize.width,
    height: newSize.height,
  });
  applyWindowShape();
  settings.posX = Math.round(newX);
  settings.posY = Math.round(newY);
}

// Optional Window-Follow helper for Windows (docks pet to Antigravity window bottom-right)
function updateWindowFollowLoop() {
  if (followTimer) {
    clearInterval(followTimer);
    followTimer = null;
  }
  if (!settings.followAntigravity || process.platform !== 'win32') return;

  const psScript = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinRectHelper {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
$p = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and ($_.ProcessName -match 'Antigravity' -or $_.MainWindowTitle -match 'Antigravity') } | Select-Object -First 1
if ($p) {
  $h = $p.MainWindowHandle
  $min = [WinRectHelper]::IsIconic($h)
  $r = New-Object WinRectHelper+RECT
  [WinRectHelper]::GetWindowRect($h, [ref]$r) | Out-Null
  Write-Output "$min,$($r.Left),$($r.Top),$($r.Right),$($r.Bottom)"
}
`;

  followTimer = setInterval(() => {
    if (!settings.followAntigravity || !petWindow || petWindow.isDestroyed()) return;
    execFile(
      'powershell.exe',
      ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', psScript],
      { timeout: 2000, windowsHide: true },
      (err, stdout) => {
        if (err || !stdout || !petWindow || petWindow.isDestroyed()) return;
        const line = stdout.trim();
        if (!line) return;
        const parts = line.split(',');
        if (parts.length !== 5) return;
        const isMin = parts[0].toLowerCase() === 'true';
        if (isMin) {
          if (petWindow.isVisible()) petWindow.hide();
          return;
        }
        if (!petWindow.isVisible()) petWindow.showInactive();
        const right = parseInt(parts[3], 10);
        const bottom = parseInt(parts[4], 10);
        if (Number.isNaN(right) || Number.isNaN(bottom)) return;
        const { width, height } = getScaledSize();
        const targetX = right - width - 14;
        const targetY = bottom - height - 12;
        const cur = petWindow.getBounds();
        if (Math.abs(cur.x - targetX) > 4 || Math.abs(cur.y - targetY) > 4) {
          petWindow.setPosition(targetX, targetY);
          settings.flipped = false;
        }
      }
    );
  }, 2500);
}

function buildContextMenuTemplate() {
  const snap = quotaEngine ? quotaEngine.getSnapshot() : null;
  const headerLabel = snap
    ? `✦ 5h剩余 ${snap.fiveHour.remainingPct}% · 周剩余 ${snap.weekly.remainingPct}%`
    : '✦ Gemini 额度桌宠';

  return [
    { label: headerLabel, enabled: false },
    { type: 'separator' },
    {
      label: '🎯 打开额度校准与设置面板...',
      click: () => openSettingsWindow(),
    },
    {
      label: '🔄 立即刷新本地会话额度',
      click: () => {
        if (quotaEngine) {
          quotaEngine.scanNow(false);
          broadcastQuota(quotaEngine.getSnapshot());
        }
        if (petWindow && !petWindow.isDestroyed()) {
          petWindow.webContents.send('trigger-action', 'poke');
        }
      },
    },
    {
      label: '🫧 切换气泡卡片视图',
      click: () => {
        if (petWindow && !petWindow.isDestroyed()) {
          petWindow.webContents.send('trigger-action', 'cycle-bubble');
        }
      },
    },
    {
      label: settings.bubbleAlwaysVisible ? '💬 常驻显示思想气泡' : '💬 仅悬停/对话结束时显示气泡',
      type: 'checkbox',
      checked: settings.bubbleAlwaysVisible,
      click: (item) => {
        settings.bubbleAlwaysVisible = item.checked;
        persistSettings();
        broadcastSettings();
      },
    },
    {
      label: '主显示指标切换',
      submenu: [
        {
          label: '⚡ 优先大字展示「5小时剩余额度」',
          type: 'radio',
          checked: settings.primaryMetric === 'fiveHour',
          click: () => {
            settings.primaryMetric = 'fiveHour';
            persistSettings();
            broadcastSettings();
          },
        },
        {
          label: '📅 优先大字展示「本周剩余额度」',
          type: 'radio',
          checked: settings.primaryMetric === 'weekly',
          click: () => {
            settings.primaryMetric = 'weekly';
            persistSettings();
            broadcastSettings();
          },
        },
      ],
    },
    { type: 'separator' },
    {
      label: '📏 桌宠缩放比例',
      submenu: [0.65, 0.8, 1.0, 1.2, 1.4, 1.65].map((s) => ({
        label: `${Math.round(s * 100)}%${s === 1.0 ? ' (默认)' : ''}`,
        type: 'radio',
        checked: Math.abs(settings.scale - s) < 0.04,
        click: () => {
          settings.scale = s;
          applyScaleChange(s);
          persistSettings();
          broadcastSettings();
        },
      })),
    },
    {
      label: '🎭 切换猫娘表情预览',
      submenu: [
        { label: '✨ 自动随额度切换 (默认)', click: () => petWindow?.webContents.send('trigger-action', 'expr:auto') },
        { label: '😺 待机思考 (原图)', click: () => petWindow?.webContents.send('trigger-action', 'expr:idle') },
        { label: '🌟 开心元气', click: () => petWindow?.webContents.send('trigger-action', 'expr:happy') },
        { label: '🥺 额度告急委屈', click: () => petWindow?.webContents.send('trigger-action', 'expr:low') },
        { label: '💤 休眠打盹', click: () => petWindow?.webContents.send('trigger-action', 'expr:sleep') },
      ],
    },
    {
      label: '🔊 开启互动音效',
      type: 'checkbox',
      checked: settings.soundEnabled,
      click: (item) => {
        settings.soundEnabled = item.checked;
        persistSettings();
        broadcastSettings();
      },
    },
    {
      label: '📌 窗口总在最前',
      type: 'checkbox',
      checked: settings.alwaysOnTop,
      click: (item) => {
        settings.alwaysOnTop = item.checked;
        if (petWindow && !petWindow.isDestroyed()) {
          petWindow.setAlwaysOnTop(item.checked, item.checked ? 'screen-saver' : 'normal');
        }
        persistSettings();
        broadcastSettings();
      },
    },
    {
      label: '🧲 跟随 Antigravity 窗口右下角',
      type: 'checkbox',
      checked: settings.followAntigravity,
      click: (item) => {
        settings.followAntigravity = item.checked;
        persistSettings();
        updateWindowFollowLoop();
        broadcastSettings();
      },
    },
    {
      label: '🔒 锁定当前位置',
      type: 'checkbox',
      checked: settings.lockedPosition,
      click: (item) => {
        settings.lockedPosition = item.checked;
        persistSettings();
        broadcastSettings();
      },
    },
    {
      label: '📍 重置到屏幕右下角',
      click: () => {
        if (!petWindow || petWindow.isDestroyed()) return;
        const wa = screen.getPrimaryDisplay().workArea;
        const { width, height } = getScaledSize();
        settings.posX = wa.x + wa.width - width - 16;
        settings.posY = wa.y + wa.height - height - 8;
        settings.flipped = false;
        settings.followAntigravity = false;
        updateWindowFollowLoop();
        petWindow.show();
        petWindow.setPosition(settings.posX, settings.posY);
        persistSettings();
        broadcastSettings();
      },
    },
    { type: 'separator' },
    {
      label: '❌ 退出 Gemini 桌宠',
      click: () => {
        app.quit();
      },
    },
  ];
}

function createTray() {
  const pngPath = path.join(__dirname, '..', 'assets', 'icon.png');
  const img = nativeImage.createFromPath(pngPath).resize({ width: 32, height: 32 });
  tray = new Tray(img);
  tray.setToolTip('Gemini 桌宠 · Antigravity 额度监控');
  tray.on('click', () => {
    if (!petWindow || petWindow.isDestroyed()) {
      createPetWindow();
    } else if (petWindow.isVisible()) {
      petWindow.focus();
      petWindow.webContents.send('trigger-action', 'poke');
    } else {
      petWindow.show();
    }
  });
  tray.on('double-click', () => {
    openSettingsWindow();
  });
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  const menu = Menu.buildFromTemplate(buildContextMenuTemplate());
  tray.setContextMenu(menu);
}

function registerIpc() {
  ipcMain.handle('pet:get-initial-state', () => {
    return {
      settings,
      sprites: getAvailableSprites(),
      snapshot: quotaEngine ? quotaEngine.getSnapshot() : null,
      bridgeScriptPath: path
        .join(__dirname, '..', 'scripts', 'agy-statusline-bridge.js')
        .replace(/\\/g, '/'),
    };
  });

  ipcMain.handle('pet:refresh-quota', () => {
    if (!quotaEngine) return null;
    quotaEngine.scanNow(false);
    const snap = quotaEngine.getSnapshot();
    broadcastQuota(snap);
    return snap;
  });

  ipcMain.handle('pet:save-settings', (_, partial) => {
    const prevScale = settings.scale;
    const prevFollow = settings.followAntigravity;

    settings = {
      ...settings,
      ...partial,
    };

    if (typeof partial.scale === 'number' && Math.abs(partial.scale - prevScale) > 0.01) {
      applyScaleChange(partial.scale);
    }

    if (typeof partial.alwaysOnTop === 'boolean' && petWindow && !petWindow.isDestroyed()) {
      petWindow.setAlwaysOnTop(
        partial.alwaysOnTop,
        partial.alwaysOnTop ? 'screen-saver' : 'normal'
      );
    }

    if (partial.followAntigravity !== undefined && partial.followAntigravity !== prevFollow) {
      updateWindowFollowLoop();
    }

    if (
      quotaEngine &&
      (partial.planPreset !== undefined ||
        partial.fiveHourBudgetUnits !== undefined ||
        partial.weeklyBudgetUnits !== undefined)
    ) {
      quotaEngine.updateConfig({
        planPreset: settings.planPreset,
        fiveHourBudgetUnits: settings.fiveHourBudgetUnits,
        weeklyBudgetUnits: settings.weeklyBudgetUnits,
      });
    }

    persistSettings();
    broadcastSettings();
    return settings;
  });

  ipcMain.handle('pet:calibrate-quota', (_, payload) => {
    if (!quotaEngine) return null;
    const { calibration, snapshot } = quotaEngine.calibrate(payload);
    settings.calibration = calibration;
    persistSettings();
    broadcastSettings();
    broadcastQuota(snapshot);
    return snapshot;
  });

  ipcMain.handle('pet:clear-calibration', () => {
    if (!quotaEngine) return null;
    const snapshot = quotaEngine.clearCalibration();
    settings.calibration = { fiveHour: null, weekly: null };
    persistSettings();
    broadcastSettings();
    broadcastQuota(snapshot);
    return snapshot;
  });

  ipcMain.on('pet:open-settings', () => {
    openSettingsWindow();
  });

  ipcMain.on('pet:close-settings', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.close();
    }
  });

  ipcMain.on('pet:show-context-menu', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const menu = Menu.buildFromTemplate(buildContextMenuTemplate());
    menu.popup({ window: win });
  });

  ipcMain.on('pet:set-ignore-mouse-events', (event, ignore, opts) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed() && win === petWindow) {
      win.setIgnoreMouseEvents(Boolean(ignore), opts || { forward: true });
    }
  });

  ipcMain.on('pet:move-window-by', (_, dx, dy) => {
    if (!petWindow || petWindow.isDestroyed() || settings.lockedPosition) return;
    if (settings.followAntigravity) {
      settings.followAntigravity = false;
      updateWindowFollowLoop();
    }
    const [x, y] = petWindow.getPosition();
    petWindow.setPosition(Math.round(x + dx), Math.round(y + dy));
  });

  ipcMain.handle('pet:finish-drag', () => {
    return snapAndClampWindow();
  });

  ipcMain.handle('pet:copy-text', (_, text) => {
    clipboard.writeText(String(text || ''));
    return true;
  });
}

app.on('second-instance', () => {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.show();
    petWindow.focus();
    petWindow.webContents.send('trigger-action', 'poke');
  }
});

app.whenReady().then(() => {
  loadSettings();

  quotaEngine = new QuotaEngine({
    config: {
      planPreset: settings.planPreset,
      fiveHourBudgetUnits: settings.fiveHourBudgetUnits,
      weeklyBudgetUnits: settings.weeklyBudgetUnits,
      calibration: settings.calibration,
    },
  });

  quotaEngine.on('quota-updated', (snap) => {
    broadcastQuota(snap);
  });

  quotaEngine.on('turn-usage', (payload) => {
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send('turn-usage', payload);
    }
  });

  quotaEngine.start(3500);

  registerIpc();
  createPetWindow();
  createTray();
  updateWindowFollowLoop();
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

app.on('before-quit', () => {
  if (quotaEngine) quotaEngine.stop();
  if (followTimer) clearInterval(followTimer);
});
