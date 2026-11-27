/* global petAPI */
(() => {
  const petRoot = document.getElementById('pet-root');
  const bubbleWrap = document.getElementById('bubble-wrap');
  const thoughtBubble = document.getElementById('thought-bubble');
  const petSprite = document.getElementById('pet-sprite');
  const spriteMover = document.getElementById('sprite-mover');
  const particleLayer = document.getElementById('particle-layer');
  const btnRefresh = document.getElementById('btn-refresh');
  const btnSettings = document.getElementById('btn-settings');

  const cards = [
    document.getElementById('card-main'),
    document.getElementById('card-turn'),
    document.getElementById('card-bars'),
    document.getElementById('card-quote'),
  ];

  // Card 0 elements
  const mainLabel = document.getElementById('main-label');
  const mainReset = document.getElementById('main-reset');
  const mainHero = document.getElementById('main-hero');
  const mainPill = document.getElementById('main-pill');

  // Card 1 elements
  const turnHero = document.getElementById('turn-hero');
  const turnPill = document.getElementById('turn-pill');

  // Card 2 elements
  const bar5h = document.getElementById('bar-5h');
  const bar5hVal = document.getElementById('bar-5h-val');
  const barWeek = document.getElementById('bar-week');
  const barWeekVal = document.getElementById('bar-week-val');
  const barsFooter = document.getElementById('bars-footer');

  // Card 3 elements
  const quoteText = document.getElementById('quote-text');

  let state = {
    settings: {
      scale: 1.0,
      opacity: 1.0,
      soundEnabled: true,
      volume: 0.65,
      showTurnBubble: true,
      turnBubbleSeconds: 10,
      primaryMetric: 'fiveHour',
      bubbleAlwaysVisible: true,
      lockedPosition: false,
      flipped: false,
    },
    sprites: {
      idle: '../../assets/sprites/gemini-idle.png',
    },
    snapshot: null,
    activeCardIdx: 0,
    displayedMainPct: null,
    expressionLock: null, // null = auto, or 'idle'|'happy'|'low'|'sleep'
    tempExpression: null,
    tempExprTimer: null,
    turnRevertTimer: null,
    bubbleHideTimer: null,
    hoveringPetOrBubble: false,
  };

  // Offscreen canvas for pixel-accurate alpha hit-testing on the transparent sprite
  const hitCanvas = document.createElement('canvas');
  const hitCtx = hitCanvas.getContext('2d', { willReadFrequently: true });
  let hitCanvasReady = false;

  function syncHitCanvas() {
    if (!petSprite.complete || !petSprite.naturalWidth) return;
    hitCanvas.width = petSprite.naturalWidth;
    hitCanvas.height = petSprite.naturalHeight;
    hitCtx.clearRect(0, 0, hitCanvas.width, hitCanvas.height);
    hitCtx.drawImage(petSprite, 0, 0);
    hitCanvasReady = true;
  }

  petSprite.addEventListener('load', syncHitCanvas);

  // Cute Web Audio synthesizer (zero external audio dependencies)
  let audioCtx = null;
  function playCuteSound(type = 'poke') {
    if (!state.settings.soundEnabled) return;
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const now = audioCtx.currentTime;
      const vol = Math.max(0.05, Math.min(1, Number(state.settings.volume) || 0.65)) * 0.18;

      if (type === 'poke') {
        // Starry double chime (meow-pop)
        const notes = [659.25, 880, 1174.66];
        notes.forEach((freq, i) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + i * 0.055);
          gain.gain.setValueAtTime(0.001, now + i * 0.055);
          gain.gain.exponentialRampToValueAtTime(vol, now + i * 0.055 + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.055 + 0.16);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(now + i * 0.055);
          osc.stop(now + i * 0.055 + 0.17);
        });
      } else if (type === 'bubble') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(780, now + 0.09);
        gain.gain.setValueAtTime(vol * 0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'turn') {
        // Gentle notification bell
        [783.99, 1046.5].forEach((freq, i) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + i * 0.08);
          gain.gain.setValueAtTime(vol * 0.75, now + i * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.24);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(now + i * 0.08);
          osc.stop(now + i * 0.08 + 0.25);
        });
      }
    } catch (_) {
      // Ignore audio errors
    }
  }

  const QUOTES = {
    high: [
      '星光满格喵✨ 五小时额度很充裕，放心冲大项目吧！',
      '异色瞳帮你盯紧额度啦，今天想写什么神仙代码？',
      '双子星能量满满！复杂任务交给 /boost 也没问题喵~',
      '摸摸猫耳充充电，祝你今天一次编译零报错✦',
    ],
    mid: [
      '额度消耗过半咯，长对话记得适时 /compact 省上下文喵~',
      '不急不急，距离下一次五小时回血已经不远啦！',
      '喝口水歇一歇，本喵继续替你守着额度账本~',
    ],
    low: [
      '呜哇…额度快见底啦(>_<) 先省着点用等重置回血喵！',
      '猫粮（额度）告急警告！简单问题可以先切轻量模型哦~',
      '抱紧小星星瑟瑟发抖…撑到倒计时结束就满血复活啦！',
    ],
    night: [
      '夜深啦，窗外的星星都打盹了，早点休息喵💤',
      '熬夜写代码的铲屎官最辛苦啦，注意护眼哦✨',
    ],
  };

  function pickRandomQuote() {
    const snap = state.snapshot;
    const hour = new Date().getHours();
    if (hour >= 23 || hour < 5) {
      if (Math.random() < 0.45) {
        return QUOTES.night[Math.floor(Math.random() * QUOTES.night.length)];
      }
    }
    const minPct = snap
      ? Math.min(snap.fiveHour.remainingPct, snap.weekly.remainingPct)
      : 100;
    const pool = minPct <= 22 ? QUOTES.low : minPct <= 60 ? QUOTES.mid : QUOTES.high;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function formatDurationCompact(ms) {
    if (!ms || ms <= 0) return '即将重置';
    const totalMins = Math.ceil(ms / 60000);
    const days = Math.floor(totalMins / (60 * 24));
    const hours = Math.floor((totalMins % (60 * 24)) / 60);
    const mins = totalMins % 60;
    if (days > 0) return `${days}d${hours}h`;
    if (hours > 0) return `${hours}h${String(mins).padStart(2, '0')}m`;
    return `${mins}m`;
  }

  function formatTokensCompact(n) {
    const num = Number(n) || 0;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
    return String(num);
  }

  // Smooth rolling number animation
  let rollRaf = null;
  function animateNumber(el, fromVal, toVal, suffix = '%') {
    if (rollRaf) cancelAnimationFrame(rollRaf);
    if (fromVal === null || Math.abs(toVal - fromVal) < 0.05) {
      el.textContent = `${toVal.toFixed(1)}${suffix}`;
      return;
    }
    const start = performance.now();
    const duration = 520;
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const cur = fromVal + (toVal - fromVal) * eased;
      el.textContent = `${cur.toFixed(1)}${suffix}`;
      if (t < 1) {
        rollRaf = requestAnimationFrame(tick);
      } else {
        el.textContent = `${toVal.toFixed(1)}${suffix}`;
      }
    }
    rollRaf = requestAnimationFrame(tick);
  }

  function resolveDesiredExpression() {
    if (state.expressionLock) return state.expressionLock;
    if (state.tempExpression) return state.tempExpression;
    const snap = state.snapshot;
    if (!snap) return 'idle';

    const minPct = Math.min(snap.fiveHour.remainingPct, snap.weekly.remainingPct);
    if (minPct <= 20 && state.sprites.low) {
      return 'low';
    }

    // If no conversation activity for > 25 minutes, cozy sleep pose
    if (
      snap.lastActiveAt &&
      Date.now() - snap.lastActiveAt > 25 * 60 * 1000 &&
      state.sprites.sleep
    ) {
      return 'sleep';
    }

    return 'idle';
  }

  function updateSpriteExpression() {
    const expr = resolveDesiredExpression();
    const targetSrc = state.sprites[expr] || state.sprites.idle;
    if (targetSrc && petSprite.getAttribute('src') !== targetSrc) {
      petSprite.setAttribute('src', targetSrc);
    }
  }

  function setTemporaryExpression(expr, durationMs = 2600) {
    if (!state.sprites[expr]) return;
    state.tempExpression = expr;
    updateSpriteExpression();
    if (state.tempExprTimer) clearTimeout(state.tempExprTimer);
    state.tempExprTimer = setTimeout(() => {
      state.tempExpression = null;
      updateSpriteExpression();
    }, durationMs);
  }

  function setHealthClass(el, pct) {
    el.classList.remove('health-good', 'health-warn', 'health-low');
    if (pct <= 22) el.classList.add('health-low');
    else if (pct <= 55) el.classList.add('health-warn');
    else el.classList.add('health-good');
  }

  function setBarHealth(el, pct) {
    el.classList.remove('warn', 'low');
    if (pct <= 22) el.classList.add('low');
    else if (pct <= 55) el.classList.add('warn');
  }

  function showCard(idx, withPop = false) {
    state.activeCardIdx = ((idx % cards.length) + cards.length) % cards.length;
    cards.forEach((c, i) => {
      c.classList.toggle('active', i === state.activeCardIdx);
    });
    if (state.activeCardIdx === 3) {
      quoteText.textContent = pickRandomQuote();
    }
    if (withPop) {
      bubbleWrap.classList.remove('pop-anim');
      void bubbleWrap.offsetWidth;
      bubbleWrap.classList.add('pop-anim');
    }
    updateBubbleVisibility();
  }

  function updateBubbleVisibility() {
    const shouldShow =
      state.settings.bubbleAlwaysVisible ||
      state.hoveringPetOrBubble ||
      Boolean(state.turnRevertTimer);
    bubbleWrap.classList.toggle('hidden', !shouldShow);
  }

  function renderQuota() {
    const snap = state.snapshot;
    if (!snap) return;

    const primaryIs5h = state.settings.primaryMetric !== 'weekly';
    const primary = primaryIs5h ? snap.fiveHour : snap.weekly;
    const secondary = primaryIs5h ? snap.weekly : snap.fiveHour;

    // Card 0: Hero + Secondary Pill
    mainLabel.textContent = primaryIs5h ? '5小时剩余额度：' : '本周剩余额度：';
    mainReset.textContent = `↻ ${formatDurationCompact(primary.resetInMs)}`;
    setHealthClass(mainHero, primary.remainingPct);
    animateNumber(mainHero, state.displayedMainPct, primary.remainingPct, '%');
    state.displayedMainPct = primary.remainingPct;

    const secPrefix = primaryIs5h ? '周剩余' : '5h剩余';
    mainPill.textContent = `${secPrefix} ${secondary.remainingPct.toFixed(1)}% · ↻${formatDurationCompact(
      secondary.resetInMs
    )}`;

    // Card 1: Latest Turn Usage
    if (snap.latestTurn) {
      const t = snap.latestTurn;
      turnHero.textContent = `-${t.fiveHourCostPct.toFixed(2)}%`;
      turnPill.textContent = `本轮 ${formatTokensCompact(t.totalTokens)} tok · 5h余 ${snap.fiveHour.remainingPct.toFixed(
        1
      )}%`;
    } else {
      turnHero.textContent = '-0.00%';
      turnPill.textContent = `5h余 ${snap.fiveHour.remainingPct.toFixed(1)}% · 周余 ${snap.weekly.remainingPct.toFixed(
        1
      )}%`;
    }

    // Card 2: Dual Progress Bars
    bar5h.style.width = `${snap.fiveHour.remainingPct}%`;
    bar5hVal.textContent = `${snap.fiveHour.remainingPct.toFixed(0)}%`;
    setBarHealth(bar5h, snap.fiveHour.remainingPct);

    barWeek.style.width = `${snap.weekly.remainingPct}%`;
    barWeekVal.textContent = `${snap.weekly.remainingPct.toFixed(0)}%`;
    setBarHealth(barWeek, snap.weekly.remainingPct);

    const runwayText =
      snap.runwayMinutes && snap.runwayMinutes < 300
        ? `⚡续航 ~${formatDurationCompact(snap.runwayMinutes * 60000)}`
        : `今日 ${formatTokensCompact(snap.today.tokens)} tok`;
    barsFooter.textContent = `${runwayText} · ${snap.activeModel}`;

    updateSpriteExpression();
  }

  function applySettings(newSettings, newSprites) {
    if (newSprites) state.sprites = newSprites;
    if (newSettings) {
      state.settings = { ...state.settings, ...newSettings };
    }
    const scale = Math.max(0.6, Math.min(2.2, Number(state.settings.scale) || 1.0));
    document.documentElement.style.zoom = String(scale);
    petRoot.style.opacity = String(Math.max(0.25, Math.min(1, Number(state.settings.opacity) || 1)));
    petRoot.classList.toggle('flipped', Boolean(state.settings.flipped));

    updateBubbleVisibility();
    renderQuota();
  }

  function spawnParticles(count = 5) {
    const symbols = ['✦', '✧', '★', '♡'];
    const colors = ['#a78bfa', '#f472b6', '#fbbf24', '#60a5fa'];
    for (let i = 0; i < count; i++) {
      const span = document.createElement('span');
      span.className = 'star-particle';
      span.textContent = symbols[i % symbols.length];
      span.style.color = colors[i % colors.length];
      span.style.left = `${80 + (Math.random() - 0.5) * 70}px`;
      span.style.top = `${55 + (Math.random() - 0.5) * 45}px`;
      span.style.setProperty('--tx', `${(Math.random() - 0.5) * 90}px`);
      span.style.setProperty('--ty', `${-35 - Math.random() * 55}px`);
      span.style.setProperty('--rot', `${(Math.random() - 0.5) * 90}deg`);
      particleLayer.appendChild(span);
      setTimeout(() => span.remove(), 920);
    }
  }

  function triggerPoke() {
    spriteMover.classList.remove('squish');
    void spriteMover.offsetWidth;
    spriteMover.classList.add('squish');
    spawnParticles(6);
    playCuteSound('poke');
    setTemporaryExpression('happy', 2800);
    petAPI.refreshQuota();
  }

  // Pixel-accurate mouse pass-through hit testing
  let lastIgnoring = true;
  function setIgnore(ignore) {
    if (ignore !== lastIgnoring) {
      lastIgnoring = ignore;
      petAPI.setIgnoreMouseEvents(ignore, { forward: true });
    }
  }

  function isPointOpaqueOnSprite(clientX, clientY) {
    const rect = petSprite.getBoundingClientRect();
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return false;
    }
    if (!hitCanvasReady) return true;

    let relX = (clientX - rect.left) / rect.width;
    const relY = (clientY - rect.top) / rect.height;
    if (state.settings.flipped) {
      relX = 1 - relX;
    }
    const px = Math.min(hitCanvas.width - 1, Math.max(0, Math.floor(relX * hitCanvas.width)));
    const py = Math.min(hitCanvas.height - 1, Math.max(0, Math.floor(relY * hitCanvas.height)));
    try {
      const alpha = hitCtx.getImageData(px, py, 1, 1).data[3];
      return alpha > 18;
    } catch (_) {
      return true;
    }
  }

  function isPointOverBubble(clientX, clientY) {
    if (bubbleWrap.classList.contains('hidden')) return false;
    const rect = thoughtBubble.getBoundingClientRect();
    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  }

  // Dragging & Click handling on Sprite
  let dragState = null;

  window.addEventListener('mousemove', (e) => {
    if (dragState) {
      const dx = e.screenX - dragState.lastScreenX;
      const dy = e.screenY - dragState.lastScreenY;
      dragState.totalDist += Math.hypot(dx, dy);
      if (dragState.totalDist > 5) {
        dragState.moved = true;
        petAPI.moveWindowBy(dx, dy);
      }
      dragState.lastScreenX = e.screenX;
      dragState.lastScreenY = e.screenY;
      return;
    }

    const overBubble = isPointOverBubble(e.clientX, e.clientY);
    const overSprite = isPointOpaqueOnSprite(e.clientX, e.clientY);
    const interactive = overBubble || overSprite;

    if (interactive !== state.hoveringPetOrBubble) {
      state.hoveringPetOrBubble = interactive;
      updateBubbleVisibility();
    }
    setIgnore(!interactive);
  });

  petSprite.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (!isPointOpaqueOnSprite(e.clientX, e.clientY)) return;
    dragState = {
      lastScreenX: e.screenX,
      lastScreenY: e.screenY,
      totalDist: 0,
      moved: false,
    };
  });

  window.addEventListener('mouseup', async (e) => {
    if (!dragState) return;
    const wasMoved = dragState.moved;
    dragState = null;
    if (wasMoved) {
      await petAPI.finishDrag();
    } else if (e.button === 0) {
      triggerPoke();
    }
  });

  // Bubble click cycles cards
  thoughtBubble.addEventListener('click', (e) => {
    if (e.target.closest('.mini-btn')) return;
    if (state.turnRevertTimer) {
      clearTimeout(state.turnRevertTimer);
      state.turnRevertTimer = null;
    }
    playCuteSound('bubble');
    showCard(state.activeCardIdx + 1, false);
  });

  btnRefresh.addEventListener('click', async (e) => {
    e.stopPropagation();
    playCuteSound('bubble');
    spawnParticles(4);
    const snap = await petAPI.refreshQuota();
    if (snap) {
      state.snapshot = snap;
      renderQuota();
    }
  });

  btnSettings.addEventListener('click', (e) => {
    e.stopPropagation();
    petAPI.openSettingsWindow();
  });

  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    petAPI.showContextMenu();
  });

  // Refresh countdown display every 20s even when idle
  setInterval(() => {
    if (state.snapshot) {
      const now = Date.now();
      state.snapshot.fiveHour.resetInMs = Math.max(0, state.snapshot.fiveHour.resetAt - now);
      state.snapshot.weekly.resetInMs = Math.max(0, state.snapshot.weekly.resetAt - now);
      renderQuota();
    }
  }, 20000);

  // IPC Subscriptions
  petAPI.onQuotaUpdated((snap) => {
    state.snapshot = snap;
    renderQuota();
  });

  petAPI.onTurnUsage(({ turn, snapshot }) => {
    state.snapshot = snapshot;
    renderQuota();
    if (!state.settings.showTurnBubble) return;

    playCuteSound('turn');
    spawnParticles(5);
    setTemporaryExpression(
      Math.min(snapshot.fiveHour.remainingPct, snapshot.weekly.remainingPct) <= 20 ? 'low' : 'happy',
      3500
    );

    // Pop up Card 1 ("上一轮对话消耗") just like DeepSeek Whale Widget!
    showCard(1, true);
    if (state.turnRevertTimer) clearTimeout(state.turnRevertTimer);
    const secs = Number(state.settings.turnBubbleSeconds) || 10;
    if (secs > 0) {
      state.turnRevertTimer = setTimeout(() => {
        state.turnRevertTimer = null;
        showCard(0, false);
        updateBubbleVisibility();
      }, secs * 1000);
    }
  });

  petAPI.onSettingsUpdated(({ settings, sprites }) => {
    applySettings(settings, sprites);
  });

  petAPI.onTriggerAction((action) => {
    if (action === 'poke') {
      triggerPoke();
    } else if (action === 'cycle-bubble') {
      playCuteSound('bubble');
      showCard(state.activeCardIdx + 1, true);
    } else if (typeof action === 'string' && action.startsWith('expr:')) {
      const mode = action.slice(5);
      state.expressionLock = mode === 'auto' ? null : mode;
      updateSpriteExpression();
      spawnParticles(3);
    }
  });

  // Boot
  petAPI.getInitialState().then(({ settings, sprites, snapshot }) => {
    state.snapshot = snapshot;
    applySettings(settings, sprites);
    syncHitCanvas();
  });
})();
