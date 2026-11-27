#!/usr/bin/env node
/**
 * Antigravity CLI StatusLine 额度自动同步桥接脚本 (官方公开接口)
 *
 * 用法（在 Antigravity CLI 中执行一次即可开启自动同步）：
 *   /statusline node "<path-to>/Antigravity-Gemini-Quota-Pet/scripts/agy-statusline-bridge.js"
 *
 * 作用：
 *   接收 agy CLI 官方 statusLine 传入的 JSON 状态（含真实 quota 百分比与重置时间），
 *   写入 ~/.gemini/antigravity-pet-quota.json 供 Gemini 桌宠实时读取，同时在终端原样输出精简状态栏。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(raw);
    const outPath = path.join(os.homedir(), '.gemini', 'antigravity-pet-quota.json');
    const record = {
      updated_at: new Date().toISOString(),
      quota: payload.quota || {},
      plan_tier: payload.plan_tier || null,
      email: payload.email || null,
      model: payload.model || null,
      agent_state: payload.agent_state || 'idle',
      context_window: payload.context_window || null,
    };
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(record, null, 2), 'utf8');

    const modelName = payload.model?.display_name || payload.model?.id || 'Gemini';
    const ctxPct =
      payload.context_window?.used_percentage != null
        ? ` · Ctx ${Number(payload.context_window.used_percentage).toFixed(1)}%`
        : '';
    process.stdout.write(`✦ ${modelName}${ctxPct} [${payload.agent_state || 'ready'}]`);
  } catch (_) {
    process.stdout.write('✦ Antigravity Ready');
  }
});
