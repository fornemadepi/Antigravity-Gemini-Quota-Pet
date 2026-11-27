import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
} from '@modelcontextprotocol/ext-apps';

const SPRITES = window.__GEMINI_SPRITES__ || {};

const state = {
  snapshot: null,
  cardIdx: 0,
  exprMode: 'auto',
  tempExpr: null,
  primaryMetric: 'fiveHour',
  soundOn: true,
  lastNotifiedTurnTs: 0,
};

const QUOTES = [
  '星光满格喵✨ 五小时额度很充裕，放心冲大项目吧！',
  '异色瞳帮你盯紧额度啦，今天想写什么神仙代码？',
  '长对话记得适时 /compact 压缩上下文，更省额度喵~',
  '点击下方「🪟 弹出桌面悬浮窗」就能让我浮在屏幕最上层陪你哦✦',
];

let audioCtx = null;
function playChime(notes = [659.25, 880, 1174.66]) {
  if (!state.soundOn) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    notes.forEach((f, i) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + i * 0.055);
      g.gain.setValueAtTime(0.001, now + i * 0.055);
      g.gain.exponentialRampToValueAtTime(0.11, now + i * 0.055 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.055 + 0.16);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start(now + i * 0.055);
      osc.stop(now + i * 0.055 + 0.17);
    });
  } catch (_) {}
}

function fmtDur(ms) {
  if (!ms || ms <= 0) return '即将重置';
  const m = Math.ceil(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const min = m % 60;
  if (d > 0) return `${d}d${h}h`;
  if (h > 0) return `${h}h${String(min).padStart(2, '0')}m`;
  return `${min}m`;
}

function fmtTok(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}

function spawnParticles() {
  const layer = document.getElementById('particles');
  const syms = ['✦', '✧', '★', '♡'];
  const cols = ['#a78bfa', '#f472b6', '#fbbf24', '#60a5fa'];
  for (let i = 0; i < 6; i++) {
    const s = document.createElement('span');
    s.className = 'star-p';
    s.textContent = syms[i % syms.length];
    s.style.color = cols[i % cols.length];
    s.style.left = `${85 + (Math.random() - 0.5) * 60}px`;
    s.style.top = `${50 + (Math.random() - 0.5) * 40}px`;
    s.style.setProperty('--tx', `${(Math.random() - 0.5) * 85}px`);
    s.style.setProperty('--ty', `${-35 - Math.random() * 50}px`);
    s.style.setProperty('--rot', `${(Math.random() - 0.5) * 90}deg`);
    layer.appendChild(s);
    setTimeout(() => s.remove(), 900);
  }
}

function updateSprite() {
  const img = document.getElementById('pet-img');
  let key = state.tempExpr;
  if (!key) {
    if (state.exprMode !== 'auto') key = state.exprMode;
    else if (state.snapshot) {
      const minP = Math.min(state.snapshot.fiveHour.remainingPct, state.snapshot.weekly.remainingPct);
      key = minP <= 20 ? 'low' : 'idle';
    } else {
      key = 'idle';
    }
  }
  if (SPRITES[key]) img.src = SPRITES[key];
}

function showCard(idx) {
  state.cardIdx = ((idx % 4) + 4) % 4;
  for (let i = 0; i < 4; i++) {
    document.getElementById(`card-${i}`).classList.toggle('active', i === state.cardIdx);
  }
  if (state.cardIdx === 3) {
    document.getElementById('quote-txt').textContent =
      QUOTES[Math.floor(Math.random() * QUOTES.length)];
  }
}

function render(snap) {
  if (!snap) return;
  const prevTurnTs = state.lastNotifiedTurnTs;
  state.snapshot = snap;

  const p5 = snap.fiveHour;
  const pw = snap.weekly;
  const primary = state.primaryMetric === 'weekly' ? pw : p5;
  const secondary = state.primaryMetric === 'weekly' ? p5 : pw;

  document.getElementById('c0-label').textContent =
    state.primaryMetric === 'weekly' ? '本周剩余额度：' : '5小时剩余额度：';
  document.getElementById('c0-reset').textContent = `↻ ${fmtDur(primary.resetInMs)}`;

  const hero = document.getElementById('c0-hero');
  hero.textContent = `${primary.remainingPct.toFixed(1)}%`;
  hero.className =
    'hero-num ' + (primary.remainingPct <= 20 ? 'low' : primary.remainingPct <= 55 ? 'warn' : 'good');

  document.getElementById('c0-pill').textContent = `${
    state.primaryMetric === 'weekly' ? '5h剩余' : '周剩余'
  } ${secondary.remainingPct.toFixed(1)}% · ↻${fmtDur(secondary.resetInMs)}`;

  if (snap.latestTurn) {
    document.getElementById('c1-hero').textContent = `-${snap.latestTurn.fiveHourCostPct.toFixed(2)}%`;
    document.getElementById('c1-pill').textContent = `本轮 ${fmtTok(
      snap.latestTurn.totalTokens
    )} tok · 5h余 ${p5.remainingPct.toFixed(1)}%`;

    if (prevTurnTs > 0 && snap.latestTurn.updatedAt > prevTurnTs) {
      showCard(1);
      playChime([784, 1046.5]);
      spawnParticles();
      setTimeout(() => {
        if (state.cardIdx === 1) showCard(0);
      }, 9000);
    }
    state.lastNotifiedTurnTs = snap.latestTurn.updatedAt;
  }

  document.getElementById('b-5h').style.width = `${p5.remainingPct}%`;
  document.getElementById('b-5h-val').textContent = `${p5.remainingPct.toFixed(0)}%`;
  document.getElementById('b-wk').style.width = `${pw.remainingPct}%`;
  document.getElementById('b-wk-val').textContent = `${pw.remainingPct.toFixed(0)}%`;
  document.getElementById('b-sub').textContent = `今日 ${fmtTok(snap.today.tokens)} tok · ${
    snap.activeModel
  }`;

  document.getElementById('stat-5h').textContent = `${p5.remainingPct.toFixed(1)}%`;
  document.getElementById('stat-5h-sub').textContent = `重置: ${fmtDur(p5.resetInMs)}`;
  document.getElementById('stat-wk').textContent = `${pw.remainingPct.toFixed(1)}%`;
  document.getElementById('stat-wk-sub').textContent = `重置: ${fmtDur(pw.resetInMs)}`;

  updateSprite();
}

function showToast(text) {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

const app = new App({ name: 'Gemini Pet', version: '1.0.0' }, {});

app.ontoolresult = (result) => {
  if (result && result.structuredContent) {
    render(result.structuredContent);
  }
};

app.onhostcontextchanged = (ctx) => {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
};

async function init() {
  updateSprite();

  document.getElementById('pet-hit').addEventListener('click', async () => {
    const mover = document.getElementById('sprite-mover');
    mover.classList.remove('squish');
    void mover.offsetWidth;
    mover.classList.add('squish');
    spawnParticles();
    playChime();
    state.tempExpr = 'happy';
    updateSprite();
    setTimeout(() => {
      state.tempExpr = null;
      updateSprite();
    }, 2400);
    try {
      const res = await app.callServerTool({ name: 'get_live_quota', arguments: {} });
      if (res?.structuredContent) render(res.structuredContent);
    } catch (_) {}
  });

  document.getElementById('bubble').addEventListener('click', () => {
    playChime([520, 760]);
    showCard(state.cardIdx + 1);
  });

  document.getElementById('btn-launch-desktop').addEventListener('click', async () => {
    playChime([784, 1046.5]);
    try {
      const res = await app.callServerTool({ name: 'launch_floating_pet', arguments: {} });
      showToast(res?.structuredContent?.message || '已启动桌面悬浮窗 ✦');
    } catch (e) {
      showToast('启动请求已发送');
    }
  });

  document.getElementById('btn-open-folder').addEventListener('click', async () => {
    try {
      await app.callServerTool({ name: 'open_pet_folder', arguments: {} });
      showToast('已在资源管理器打开目录');
    } catch (_) {}
  });

  document.getElementById('btn-toggle-cal').addEventListener('click', () => {
    const panel = document.getElementById('cal-panel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden') && state.snapshot) {
      document.getElementById('cal-5h-pct').value = state.snapshot.fiveHour.remainingPct;
      document.getElementById('cal-wk-pct').value = state.snapshot.weekly.remainingPct;
    }
  });

  document.getElementById('btn-save-cal').addEventListener('click', async () => {
    const fiveHourRemainingPct = parseFloat(document.getElementById('cal-5h-pct').value);
    const fiveHourResetMinutes =
      (parseInt(document.getElementById('cal-5h-h').value, 10) || 0) * 60 +
      (parseInt(document.getElementById('cal-5h-m').value, 10) || 0);
    const weeklyRemainingPct = parseFloat(document.getElementById('cal-wk-pct').value);
    const weeklyResetMinutes =
      (parseInt(document.getElementById('cal-wk-d').value, 10) || 0) * 1440 +
      (parseInt(document.getElementById('cal-wk-h').value, 10) || 0) * 60;

    const res = await app.callServerTool({
      name: 'calibrate_pet_quota',
      arguments: {
        fiveHourRemainingPct,
        fiveHourResetMinutes: Math.max(1, fiveHourResetMinutes),
        weeklyRemainingPct,
        weeklyResetMinutes: Math.max(1, weeklyResetMinutes),
      },
    });
    if (res?.structuredContent) render(res.structuredContent);
    showToast('官方额度锚点已校准生效 ✦');
  });

  document.getElementById('btn-clear-cal').addEventListener('click', async () => {
    const res = await app.callServerTool({
      name: 'calibrate_pet_quota',
      arguments: { clear: true },
    });
    if (res?.structuredContent) render(res.structuredContent);
    showToast('已恢复本地滚动统计');
  });

  document.getElementById('sel-expr').addEventListener('change', (e) => {
    state.exprMode = e.target.value;
    updateSprite();
  });

  document.getElementById('sel-primary').addEventListener('change', (e) => {
    state.primaryMetric = e.target.value;
    render(state.snapshot);
  });

  await app.connect();
  const ctx = app.getHostContext();
  if (ctx?.theme) applyDocumentTheme(ctx.theme);
  if (ctx?.styles?.variables) applyHostStyleVariables(ctx.styles.variables);

  // Initial fetch & live poll every 5s
  try {
    const res = await app.callServerTool({ name: 'get_live_quota', arguments: {} });
    if (res?.structuredContent) render(res.structuredContent);
  } catch (_) {}

  setInterval(async () => {
    try {
      const res = await app.callServerTool({ name: 'get_live_quota', arguments: {} });
      if (res?.structuredContent) render(res.structuredContent);
    } catch (_) {}
  }, 5000);
}

init();
