const fs = require('fs');
const path = require('path');
const os = require('os');
const esbuild = require('esbuild');

const PROJ = path.resolve(__dirname, '..');
const PLUGIN_DIR = path.join(os.homedir(), '.gemini', 'config', 'plugins', 'gemini-pet');

async function build() {
  const spritesJsonPath = path.join(__dirname, 'sprites-b64.json');
  if (!fs.existsSync(spritesJsonPath)) {
    throw new Error(`Missing ${spritesJsonPath}`);
  }
  const spritesJson = fs.readFileSync(spritesJsonPath, 'utf8');

  // 1. Bundle MCP App client JS
  const clientRes = await esbuild.build({
    entryPoints: [path.join(__dirname, 'client-src.js')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    minify: true,
    write: false,
  });
  const clientJs = clientRes.outputFiles[0].text;

  // 2. Assemble self-contained MCP App ui/app.html
  const tpl = fs.readFileSync(path.join(__dirname, 'app-template.html'), 'utf8');
  const finalAppHtml = tpl
    .replace('__SPRITES_JSON__', () => spritesJson)
    .replace('__CLIENT_BUNDLE__', () => clientJs);

  fs.mkdirSync(path.join(PLUGIN_DIR, 'ui'), { recursive: true });
  fs.mkdirSync(path.join(PLUGIN_DIR, 'server'), { recursive: true });
  fs.mkdirSync(path.join(PLUGIN_DIR, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(PLUGIN_DIR, 'ui', 'app.html'), finalAppHtml, 'utf8');

  // 3. Bundle MCP Server into single standalone Node script
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'server-src.js')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    outfile: path.join(PLUGIN_DIR, 'server', 'mcp-server.js'),
  });

  // 4. Record local project directory for desktop pet launcher
  fs.writeFileSync(
    path.join(PLUGIN_DIR, 'server', 'pet-root.json'),
    JSON.stringify({ petProjectDir: PROJ }, null, 2),
    'utf8'
  );

  // 5. Write plugin.json & mcp_config.json & logo
  const pluginManifest = {
    name: 'gemini-pet',
    displayName: 'Gemini 额度桌宠',
    version: '1.0.0',
    description:
      'Google Antigravity 专属 Gemini 异色瞳猫娘挂件：实时监控剩余 5小时额度、本周额度与每轮对话消耗，支持一键弹出独立桌面悬浮窗。',
    logo: 'assets/logo.png',
    suggestedPrompts: [
      '打开 Gemini 桌宠查看当前剩余 5小时和周额度',
      '弹出独立桌面悬浮猫娘桌宠',
      '查看我今天消耗了多少 Token 和轮数',
    ],
  };
  const mcpConfig = {
    mcpServers: {
      pet: {
        command: 'node',
        args: ['${PLUGIN_ROOT}/server/mcp-server.js'],
      },
    },
  };

  fs.writeFileSync(
    path.join(PLUGIN_DIR, 'plugin.json'),
    JSON.stringify(pluginManifest, null, 2),
    'utf8'
  );
  fs.writeFileSync(
    path.join(PLUGIN_DIR, 'mcp_config.json'),
    JSON.stringify(mcpConfig, null, 2),
    'utf8'
  );
  fs.copyFileSync(
    path.join(PROJ, 'assets', 'icon.png'),
    path.join(PLUGIN_DIR, 'assets', 'logo.png')
  );

  console.log('✅ Antigravity 侧边栏插件已成功安装至:', PLUGIN_DIR);
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
