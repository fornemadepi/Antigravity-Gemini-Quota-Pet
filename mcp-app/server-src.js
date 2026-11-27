const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const { QuotaEngine } = require('../src/quota-engine');

const APP_URI = 'ui://gemini-pet/app.html';
const SHARED_CAL_FILE = path.join(os.homedir(), '.gemini', 'antigravity-pet-calibration.json');

function resolvePetProjectDir() {
  try {
    const metaPath = path.join(__dirname, 'pet-root.json');
    if (fs.existsSync(metaPath)) {
      const data = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (data.petProjectDir && fs.existsSync(data.petProjectDir)) {
        return data.petProjectDir;
      }
    }
  } catch (_) {}
  return process.env.GEMINI_PET_DIR || path.resolve(__dirname, '..', '..');
}

function loadSharedCalibration() {
  try {
    if (fs.existsSync(SHARED_CAL_FILE)) {
      return JSON.parse(fs.readFileSync(SHARED_CAL_FILE, 'utf8'));
    }
  } catch (_) {}
  return { fiveHour: null, weekly: null };
}

function saveSharedCalibration(cal) {
  try {
    fs.mkdirSync(path.dirname(SHARED_CAL_FILE), { recursive: true });
    fs.writeFileSync(SHARED_CAL_FILE, JSON.stringify(cal, null, 2), 'utf8');
  } catch (_) {}
}

const quotaEngine = new QuotaEngine({
  config: {
    calibration: loadSharedCalibration(),
  },
});
quotaEngine.scanNow(true);

function getFreshSnapshot() {
  quotaEngine.scanNow(false);
  return quotaEngine.getSnapshot();
}

function launchElectronDesktopPet() {
  const petDir = resolvePetProjectDir();
  const electronBin =
    process.platform === 'win32'
      ? path.join(petDir, 'node_modules', 'electron', 'dist', 'electron.exe')
      : path.join(petDir, 'node_modules', '.bin', 'electron');

  if (!fs.existsSync(electronBin)) {
    return {
      ok: false,
      message: `未找到 Electron 运行时，请先在项目目录执行 npm install: ${electronBin}`,
    };
  }
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electronBin, [petDir], {
    cwd: petDir,
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
    env,
  });
  child.unref();
  return { ok: true, pid: child.pid, message: '已在桌面右下角启动独立透明 Gemini 猫娘桌宠！' };
}

const server = new Server(
  { name: 'gemini-pet-server', version: '1.0.0' },
  { capabilities: { tools: {}, resources: {} } }
);

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: APP_URI,
      name: 'Gemini 额度桌宠面板',
      description: 'Google Antigravity 专属 Gemini 异色瞳猫娘额度监控挂件',
      mimeType: 'text/html;profile=mcp-app',
      _meta: { ui: { prefersBorder: false } },
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  if (req.params.uri !== APP_URI) {
    throw new Error(`Unknown resource URI: ${req.params.uri}`);
  }
  const htmlPath = path.join(__dirname, '..', 'ui', 'app.html');
  const text = fs.readFileSync(htmlPath, 'utf8');
  return {
    contents: [
      {
        uri: APP_URI,
        mimeType: 'text/html;profile=mcp-app',
        text,
        _meta: { ui: { prefersBorder: false } },
      },
    ],
  };
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'open_gemini_pet',
      title: 'Gemini 桌宠',
      description: '打开 Antigravity 内置 Gemini 猫娘桌宠面板，查看实时 5小时剩余额度、周剩余额度与每轮对话消耗。',
      inputSchema: { type: 'object', properties: {} },
      _meta: {
        ui: { resourceUri: APP_URI, visibility: ['model', 'app'] },
        'com.google.antigravity/ui': {
          entrypoints: [
            { type: 'aux_pane', title: 'Gemini 桌宠' },
            { type: 'global', title: 'Gemini 桌宠' },
          ],
        },
      },
    },
    {
      name: 'launch_floating_pet',
      title: '启动独立桌面悬浮桌宠',
      description: '在桌面上弹出独立透明置顶的 Gemini 猫娘悬浮窗桌宠。',
      inputSchema: { type: 'object', properties: {} },
      _meta: { ui: { visibility: ['model', 'app'] } },
    },
    {
      name: 'get_live_quota',
      title: '刷新实时额度',
      description: '读取最新本地会话日志与额度状态',
      inputSchema: { type: 'object', properties: {} },
      _meta: { ui: { visibility: ['app'] } },
    },
    {
      name: 'calibrate_pet_quota',
      title: '校准官方额度百分比',
      description: '保存 5小时与周剩余百分比校准锚点',
      inputSchema: {
        type: 'object',
        properties: {
          fiveHourRemainingPct: { type: 'number' },
          fiveHourResetMinutes: { type: 'number' },
          weeklyRemainingPct: { type: 'number' },
          weeklyResetMinutes: { type: 'number' },
          clear: { type: 'boolean' },
        },
      },
      _meta: { ui: { visibility: ['app'] } },
    },
    {
      name: 'open_pet_folder',
      title: '打开桌宠目录',
      description: '在系统文件管理器中打开独立版桌宠目录',
      inputSchema: { type: 'object', properties: {} },
      _meta: { ui: { visibility: ['app'] } },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;

  if (name === 'open_gemini_pet' || name === 'get_live_quota') {
    const snap = getFreshSnapshot();
    return {
      content: [
        {
          type: 'text',
          text: `Gemini 桌宠状态：5小时剩余 ${snap.fiveHour.remainingPct}%，本周剩余 ${snap.weekly.remainingPct}%，今日累计 ${snap.today.tokens} tokens。`,
        },
      ],
      structuredContent: snap,
    };
  }

  if (name === 'launch_floating_pet') {
    const res = launchElectronDesktopPet();
    return { content: [{ type: 'text', text: res.message }], structuredContent: res };
  }

  if (name === 'calibrate_pet_quota') {
    if (args.clear) {
      const snap = quotaEngine.clearCalibration();
      saveSharedCalibration({ fiveHour: null, weekly: null });
      return { content: [{ type: 'text', text: '已恢复本地滚动窗口统计' }], structuredContent: snap };
    }
    const { calibration, snapshot } = quotaEngine.calibrate({
      fiveHourRemainingPct: Number(args.fiveHourRemainingPct),
      fiveHourResetMinutes: Number(args.fiveHourResetMinutes),
      weeklyRemainingPct: Number(args.weeklyRemainingPct),
      weeklyResetMinutes: Number(args.weeklyResetMinutes),
    });
    saveSharedCalibration(calibration);
    return { content: [{ type: 'text', text: '校准已保存' }], structuredContent: snapshot };
  }

  if (name === 'open_pet_folder') {
    const petDir = resolvePetProjectDir();
    const opener = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    spawn(opener, [petDir], { detached: true, stdio: 'ignore' }).unref();
    return { content: [{ type: 'text', text: '已打开文件夹' }], structuredContent: { ok: true } };
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`MCP server error: ${err.stack || err}\n`);
  process.exit(1);
});
