const fs = require('fs');
const path = require('path');
const os = require('os');
const EventEmitter = require('events');

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const PLAN_PRESETS = {
  pro: {
    label: 'Google AI Pro',
    fiveHourBudgetUnits: 4_500_000,
    weeklyBudgetUnits: 25_000_000,
  },
  ultra: {
    label: 'Google AI Ultra',
    fiveHourBudgetUnits: 12_000_000,
    weeklyBudgetUnits: 70_000_000,
  },
  plus: {
    label: 'Free / Google AI Plus',
    fiveHourBudgetUnits: 1_500_000,
    weeklyBudgetUnits: 6_000_000,
  },
};

function getModelMultiplier(modelId = '') {
  const m = String(modelId).toLowerCase();
  if (!m) return 0.8;
  if (m.includes('lite')) return 0.15;
  if (m.includes('flash') || m.includes('hydrogen')) return 0.35;
  if (m.includes('neon') || m.includes('ultra') || m.includes('opus')) return 1.35;
  return 1.0; // Carbon, Argon, Pro, Sonnet, GPT, etc.
}

function formatModelDisplayName(modelId = '') {
  if (!modelId) return 'Gemini';
  const m = String(modelId).toLowerCase();
  if (m.includes('gemini-4-carbon')) return 'Gemini 4 Carbon';
  if (m.includes('gemini-4-neon')) return 'Gemini 4 Neon';
  if (m.includes('gemini-4-argon')) return 'Gemini 4 Argon';
  if (m.includes('gemini-4-hydrogen')) return 'Gemini 4 Hydrogen';
  if (m.includes('gemini-3')) return 'Gemini 3';
  if (m.includes('flash')) return 'Gemini Flash';
  if (m.includes('pro')) return 'Gemini Pro';
  if (m.includes('claude')) return 'Claude';
  return modelId;
}

function computeWeightedUnits(step) {
  // In Antigravity transcript.jsonl, input_tokens is already uncached input tokens,
  // and cache_read_tokens is tracked separately.
  const uncached = Math.max(0, Number(step.input_tokens) || 0);
  const cached = Math.max(0, Number(step.cache_read_tokens) || 0);
  const output = Math.max(0, Number(step.output_tokens) || 0);
  const mult = getModelMultiplier(step.model);
  return (uncached * 1.0 + cached * 0.06 + output * 3.5) * mult;
}

class QuotaEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.homeDir = options.homeDir || os.homedir();
    this.brainDirs = options.brainDirs || [
      path.join(this.homeDir, '.gemini', 'antigravity', 'brain'),
      path.join(this.homeDir, '.gemini', 'antigravity-ide', 'brain'),
      path.join(this.homeDir, '.gemini', 'antigravity-cli', 'brain'),
    ];
    this.bridgeFilePath =
      options.bridgeFilePath ||
      path.join(this.homeDir, '.gemini', 'antigravity-pet-quota.json');

    this.config = {
      planPreset: 'pro',
      fiveHourBudgetUnits: PLAN_PRESETS.pro.fiveHourBudgetUnits,
      weeklyBudgetUnits: PLAN_PRESETS.pro.weeklyBudgetUnits,
      calibration: {
        fiveHour: null, // { remainingPct, calibratedAt, resetAt }
        weekly: null,   // { remainingPct, calibratedAt, resetAt }
      },
      ...(options.config || {}),
    };

    // Incremental file read state: filePath -> { offset, mtimeMs }
    this.fileStates = new Map();
    // Deduplicated usage events: key `${convId}:${stepIndex}` -> event
    this.eventsMap = new Map();
    // Sorted events array cache
    this.events = [];
    // Conversation turn tracking: convId -> { turnId, startedAt, updatedAt, invocations, rawTokens, units, model, notifiedStepIdx }
    this.convTurns = new Map();
    this.latestTurnSummary = null;
    this.lastBridgeMtimeMs = 0;
    this.bridgeMeta = null;
    this.initialized = false;
    this.pollTimer = null;
  }

  updateConfig(partial) {
    if (partial.planPreset && PLAN_PRESETS[partial.planPreset]) {
      const preset = PLAN_PRESETS[partial.planPreset];
      this.config.planPreset = partial.planPreset;
      if (partial.fiveHourBudgetUnits === undefined) {
        this.config.fiveHourBudgetUnits = preset.fiveHourBudgetUnits;
      }
      if (partial.weeklyBudgetUnits === undefined) {
        this.config.weeklyBudgetUnits = preset.weeklyBudgetUnits;
      }
    }
    if (typeof partial.fiveHourBudgetUnits === 'number' && partial.fiveHourBudgetUnits > 10_000) {
      this.config.fiveHourBudgetUnits = partial.fiveHourBudgetUnits;
    }
    if (typeof partial.weeklyBudgetUnits === 'number' && partial.weeklyBudgetUnits > 50_000) {
      this.config.weeklyBudgetUnits = partial.weeklyBudgetUnits;
    }
    if (partial.calibration !== undefined) {
      this.config.calibration = {
        ...this.config.calibration,
        ...partial.calibration,
      };
    }
    const snap = this.getSnapshot();
    this.emit('quota-updated', snap);
    return snap;
  }

  calibrate({ fiveHourRemainingPct, fiveHourResetMinutes, weeklyRemainingPct, weeklyResetMinutes }) {
    const now = Date.now();
    const cal = { ...this.config.calibration };

    if (typeof fiveHourRemainingPct === 'number' && !Number.isNaN(fiveHourRemainingPct)) {
      const resetMins =
        typeof fiveHourResetMinutes === 'number' && fiveHourResetMinutes > 0
          ? fiveHourResetMinutes
          : 300;
      cal.fiveHour = {
        remainingPct: Math.max(0, Math.min(100, fiveHourRemainingPct)),
        calibratedAt: now,
        resetAt: now + resetMins * 60 * 1000,
        source: 'manual',
      };
    }

    if (typeof weeklyRemainingPct === 'number' && !Number.isNaN(weeklyRemainingPct)) {
      const resetMins =
        typeof weeklyResetMinutes === 'number' && weeklyResetMinutes > 0
          ? weeklyResetMinutes
          : 7 * 24 * 60;
      cal.weekly = {
        remainingPct: Math.max(0, Math.min(100, weeklyRemainingPct)),
        calibratedAt: now,
        resetAt: now + resetMins * 60 * 1000,
        source: 'manual',
      };
    }

    this.config.calibration = cal;
    const snap = this.getSnapshot();
    this.emit('quota-updated', snap);
    return { calibration: cal, snapshot: snap };
  }

  clearCalibration() {
    this.config.calibration = { fiveHour: null, weekly: null };
    const snap = this.getSnapshot();
    this.emit('quota-updated', snap);
    return snap;
  }

  start(intervalMs = 3500) {
    this.scanNow(true);
    this.initialized = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      this.scanNow(false);
    }, intervalMs);
  }

  stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  checkBridgeFile() {
    try {
      if (!fs.existsSync(this.bridgeFilePath)) return false;
      const st = fs.statSync(this.bridgeFilePath);
      if (st.mtimeMs <= this.lastBridgeMtimeMs) return false;
      this.lastBridgeMtimeMs = st.mtimeMs;

      const raw = fs.readFileSync(this.bridgeFilePath, 'utf8');
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return false;

      const quota = data.quota || {};
      const updatedAt = data.updated_at ? Date.parse(data.updated_at) || st.mtimeMs : st.mtimeMs;
      let changed = false;

      // Parse official statusLine quota keys (e.g. gemini-5h, gemini-five-hour, gemini-weekly, etc.)
      for (const [bucketKey, bucket] of Object.entries(quota)) {
        if (!bucket || typeof bucket !== 'object') continue;
        const k = bucketKey.toLowerCase();
        if (k.includes('claude') || k.includes('gpt')) continue; // Keep primary focus on Gemini pool unless needed
        const frac =
          typeof bucket.remaining_fraction === 'number'
            ? bucket.remaining_fraction * 100
            : typeof bucket.remaining_pct === 'number'
            ? bucket.remaining_pct
            : null;
        if (frac === null) continue;

        let resetAt = null;
        if (bucket.reset_time) {
          const parsed = Date.parse(bucket.reset_time);
          if (!Number.isNaN(parsed)) resetAt = parsed;
        } else if (typeof bucket.reset_in_seconds === 'number') {
          resetAt = updatedAt + bucket.reset_in_seconds * 1000;
        }

        if (k.includes('5h') || k.includes('five') || k.includes('hour') || k.includes('sprint')) {
          const prevCal = this.config.calibration.fiveHour;
          if (!prevCal || updatedAt > prevCal.calibratedAt) {
            this.config.calibration.fiveHour = {
              remainingPct: Math.max(0, Math.min(100, frac)),
              calibratedAt: updatedAt,
              resetAt: resetAt || updatedAt + FIVE_HOURS_MS,
              source: 'cli-bridge',
            };
            changed = true;
          }
        } else if (k.includes('week') || k.includes('7d')) {
          const prevCal = this.config.calibration.weekly;
          if (!prevCal || updatedAt > prevCal.calibratedAt) {
            this.config.calibration.weekly = {
              remainingPct: Math.max(0, Math.min(100, frac)),
              calibratedAt: updatedAt,
              resetAt: resetAt || updatedAt + SEVEN_DAYS_MS,
              source: 'cli-bridge',
            };
            changed = true;
          }
        }
      }

      this.bridgeMeta = {
        updatedAt,
        planTier: data.plan_tier || null,
        email: data.email || null,
        agentState: data.agent_state || null,
      };
      return changed;
    } catch (_) {
      return false;
    }
  }

  scanNow(isInitial = false) {
    const now = Date.now();
    const cutoffMs = now - 8 * ONE_DAY_MS; // Only scan conversations touched in the last 8 days
    let newUsageDetected = false;
    const touchedConversations = new Set();

    const bridgeChanged = this.checkBridgeFile();

    for (const brainDir of this.brainDirs) {
      if (!fs.existsSync(brainDir)) continue;
      let entries;
      try {
        entries = fs.readdirSync(brainDir, { withFileTypes: true });
      } catch (_) {
        continue;
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.')) continue;
        const convId = entry.name;
        const transcriptPath = path.join(
          brainDir,
          convId,
          '.system_generated',
          'logs',
          'transcript.jsonl'
        );

        let st;
        try {
          st = fs.statSync(transcriptPath);
        } catch (_) {
          continue;
        }

        // Skip ancient untouched transcripts on initial scan
        const prevState = this.fileStates.get(transcriptPath);
        if (!prevState && st.mtimeMs < cutoffMs) {
          continue;
        }
        if (prevState && st.size === prevState.offset && st.mtimeMs === prevState.mtimeMs) {
          continue;
        }

        const startOffset = prevState && st.size >= prevState.offset ? prevState.offset : 0;
        const bytesToRead = st.size - startOffset;
        if (bytesToRead <= 0) {
          this.fileStates.set(transcriptPath, { offset: st.size, mtimeMs: st.mtimeMs });
          continue;
        }

        let chunkStr = '';
        let consumedBytes = 0;
        try {
          const fd = fs.openSync(transcriptPath, 'r');
          try {
            const buf = Buffer.allocUnsafe(bytesToRead);
            const readCount = fs.readSync(fd, buf, 0, bytesToRead, startOffset);
            const lastNewline = buf.lastIndexOf(0x0a, readCount - 1);
            if (lastNewline !== -1) {
              consumedBytes = lastNewline + 1;
              chunkStr = buf.subarray(0, consumedBytes).toString('utf8');
            } else if (readCount > 0 && isInitial) {
              consumedBytes = readCount;
              chunkStr = buf.subarray(0, readCount).toString('utf8');
            }
          } finally {
            fs.closeSync(fd);
          }
        } catch (_) {
          continue;
        }

        if (consumedBytes > 0) {
          this.fileStates.set(transcriptPath, {
            offset: startOffset + consumedBytes,
            mtimeMs: st.mtimeMs,
          });
          const lines = chunkStr.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const step = JSON.parse(trimmed);
              const added = this.ingestStep(convId, step);
              if (added) {
                newUsageDetected = true;
                touchedConversations.add(convId);
              }
            } catch (_) {
              // Ignore malformed/truncated JSONL line
            }
          }
        }
      }
    }

    if (newUsageDetected) {
      // Prune events older than 8 days & sort
      const pruneBefore = now - 8 * ONE_DAY_MS;
      for (const [k, ev] of this.eventsMap.entries()) {
        if (ev.ts < pruneBefore) this.eventsMap.delete(k);
      }
      this.events = Array.from(this.eventsMap.values()).sort((a, b) => a.ts - b.ts);

      // Update latestTurnSummary from most recently active conversation
      let newestTurn = null;
      for (const turn of this.convTurns.values()) {
        if (turn.invocations > 0) {
          if (!newestTurn || turn.updatedAt > newestTurn.updatedAt) {
            newestTurn = turn;
          }
        }
      }
      if (newestTurn) {
        this.latestTurnSummary = this.formatTurnSummary(newestTurn);
      }
    }

    if (!isInitial && (newUsageDetected || bridgeChanged)) {
      const snap = this.getSnapshot();
      this.emit('quota-updated', snap);

      if (newUsageDetected && this.latestTurnSummary) {
        for (const convId of touchedConversations) {
          const turn = this.convTurns.get(convId);
          if (turn && turn.invocations > 0 && turn.lastStepIdx !== turn.notifiedStepIdx) {
            turn.notifiedStepIdx = turn.lastStepIdx;
            this.emit('turn-usage', {
              turn: this.formatTurnSummary(turn),
              snapshot: snap,
            });
          }
        }
      }
    }
  }

  ingestStep(convId, step) {
    const ts = step.created_at ? Date.parse(step.created_at) : Date.now();
    const validTs = Number.isNaN(ts) ? Date.now() : ts;
    const stepIdx = typeof step.step_index === 'number' ? step.step_index : -1;

    if (step.type === 'USER_INPUT' || step.source === 'USER_EXPLICIT') {
      const existing = this.convTurns.get(convId);
      if (!existing || stepIdx > existing.userStepIdx) {
        this.convTurns.set(convId, {
          convId,
          userStepIdx: stepIdx,
          lastStepIdx: stepIdx,
          notifiedStepIdx: -1,
          startedAt: validTs,
          updatedAt: validTs,
          invocations: 0,
          inputTokens: 0,
          cacheReadTokens: 0,
          outputTokens: 0,
          units: 0,
          model: '',
        });
      }
      return false;
    }

    const inTok = Number(step.input_tokens) || 0;
    const outTok = Number(step.output_tokens) || 0;
    const cacheTok = Number(step.cache_read_tokens) || 0;
    if (inTok <= 0 && outTok <= 0) return false;

    const eventKey = `${convId}:${stepIdx}`;
    if (this.eventsMap.has(eventKey)) return false;

    const units = computeWeightedUnits(step);
    const ev = {
      key: eventKey,
      convId,
      stepIdx,
      ts: validTs,
      model: step.model || 'gemini',
      inputTokens: inTok,
      cacheReadTokens: cacheTok,
      outputTokens: outTok,
      units,
    };
    this.eventsMap.set(eventKey, ev);

    let turn = this.convTurns.get(convId);
    if (!turn) {
      turn = {
        convId,
        userStepIdx: -1,
        lastStepIdx: stepIdx,
        notifiedStepIdx: -1,
        startedAt: validTs,
        updatedAt: validTs,
        invocations: 0,
        inputTokens: 0,
        cacheReadTokens: 0,
        outputTokens: 0,
        units: 0,
        model: ev.model,
      };
      this.convTurns.set(convId, turn);
    }

    turn.lastStepIdx = Math.max(turn.lastStepIdx, stepIdx);
    turn.updatedAt = Math.max(turn.updatedAt, validTs);
    turn.invocations += 1;
    turn.inputTokens += inTok;
    turn.cacheReadTokens += cacheTok;
    turn.outputTokens += outTok;
    turn.units += units;
    if (ev.model) turn.model = ev.model;

    return true;
  }

  formatTurnSummary(turn) {
    const fiveHourCostPct = (turn.units / this.config.fiveHourBudgetUnits) * 100;
    const weeklyCostPct = (turn.units / this.config.weeklyBudgetUnits) * 100;
    const totalRawTokens = turn.inputTokens + turn.outputTokens;
    return {
      convId: turn.convId,
      updatedAt: turn.updatedAt,
      invocations: turn.invocations,
      inputTokens: turn.inputTokens,
      cacheReadTokens: turn.cacheReadTokens,
      outputTokens: turn.outputTokens,
      totalTokens: totalRawTokens,
      units: Math.round(turn.units),
      fiveHourCostPct: Number(fiveHourCostPct.toFixed(2)),
      weeklyCostPct: Number(weeklyCostPct.toFixed(2)),
      model: turn.model,
      modelDisplay: formatModelDisplayName(turn.model),
    };
  }

  sumUnitsBetween(startTs, endTs) {
    let units = 0;
    let rawTokens = 0;
    let invocations = 0;
    let earliestTs = null;
    for (const ev of this.events) {
      if (ev.ts >= startTs && ev.ts <= endTs) {
        units += ev.units;
        rawTokens += ev.inputTokens + ev.outputTokens;
        invocations += 1;
        if (earliestTs === null || ev.ts < earliestTs) earliestTs = ev.ts;
      }
    }
    return { units, rawTokens, invocations, earliestTs };
  }

  computeWindowQuota(now, windowMs, budgetUnits, anchor) {
    if (anchor && typeof anchor.remainingPct === 'number') {
      let resetAt = anchor.resetAt || anchor.calibratedAt + windowMs;
      if (now >= resetAt) {
        // Auto-roll reset cycles forward!
        const cyclesPassed = Math.floor((now - resetAt) / windowMs) + 1;
        resetAt += cyclesPassed * windowMs;
        const cycleStart = resetAt - windowMs;
        const usage = this.sumUnitsBetween(cycleStart, now);
        const usedPct = (usage.units / budgetUnits) * 100;
        const remainingPct = Math.max(0, Math.min(100, 100 - usedPct));
        return {
          remainingPct: Number(remainingPct.toFixed(1)),
          usedPct: Number((100 - remainingPct).toFixed(1)),
          resetAt,
          resetInMs: Math.max(0, resetAt - now),
          mode: anchor.source === 'cli-bridge' ? 'cli-bridge' : 'calibrated-rolled',
          windowTokens: usage.rawTokens,
          windowInvocations: usage.invocations,
        };
      } else {
        const usageSinceCal = this.sumUnitsBetween(anchor.calibratedAt, now);
        const deltaPct = (usageSinceCal.units / budgetUnits) * 100;
        const remainingPct = Math.max(0, Math.min(100, anchor.remainingPct - deltaPct));
        return {
          remainingPct: Number(remainingPct.toFixed(1)),
          usedPct: Number((100 - remainingPct).toFixed(1)),
          resetAt,
          resetInMs: Math.max(0, resetAt - now),
          mode: anchor.source || 'calibrated',
          windowTokens: usageSinceCal.rawTokens,
          windowInvocations: usageSinceCal.invocations,
        };
      }
    }

    // Rolling window mode (zero-config default)
    const windowStart = now - windowMs;
    const usage = this.sumUnitsBetween(windowStart, now);
    const usedPct = Math.min(100, (usage.units / budgetUnits) * 100);
    const remainingPct = Math.max(0, 100 - usedPct);
    const resetAt = usage.earliestTs ? usage.earliestTs + windowMs : now + windowMs;

    return {
      remainingPct: Number(remainingPct.toFixed(1)),
      usedPct: Number(usedPct.toFixed(1)),
      resetAt,
      resetInMs: Math.max(0, resetAt - now),
      mode: 'rolling',
      windowTokens: usage.rawTokens,
      windowInvocations: usage.invocations,
    };
  }

  getSnapshot() {
    const now = Date.now();
    const fiveHour = this.computeWindowQuota(
      now,
      FIVE_HOURS_MS,
      this.config.fiveHourBudgetUnits,
      this.config.calibration.fiveHour
    );
    const weekly = this.computeWindowQuota(
      now,
      SEVEN_DAYS_MS,
      this.config.weeklyBudgetUnits,
      this.config.calibration.weekly
    );

    // Today's local midnight stats
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayUsage = this.sumUnitsBetween(todayStart.getTime(), now);

    // Recent 30-min burn rate for runway forecast
    const recent30m = this.sumUnitsBetween(now - 30 * 60 * 1000, now);
    let runwayMinutes = null;
    if (recent30m.units > 0 && fiveHour.remainingPct > 0) {
      const pctPerMin = ((recent30m.units / this.config.fiveHourBudgetUnits) * 100) / 30;
      if (pctPerMin > 0.01) {
        runwayMinutes = Math.round(fiveHour.remainingPct / pctPerMin);
      }
    }

    const latestEvent = this.events.length > 0 ? this.events[this.events.length - 1] : null;

    return {
      timestamp: now,
      planPreset: this.config.planPreset,
      planLabel: (PLAN_PRESETS[this.config.planPreset] || PLAN_PRESETS.pro).label,
      fiveHourBudgetUnits: this.config.fiveHourBudgetUnits,
      weeklyBudgetUnits: this.config.weeklyBudgetUnits,
      fiveHour,
      weekly,
      today: {
        tokens: todayUsage.rawTokens,
        invocations: todayUsage.invocations,
        units: Math.round(todayUsage.units),
      },
      runwayMinutes,
      latestTurn: this.latestTurnSummary,
      lastActiveAt: latestEvent ? latestEvent.ts : null,
      activeModel: latestEvent ? formatModelDisplayName(latestEvent.model) : 'Gemini 4',
      bridgeMeta: this.bridgeMeta,
      hasCalibration: Boolean(
        this.config.calibration.fiveHour || this.config.calibration.weekly
      ),
    };
  }
}

module.exports = {
  QuotaEngine,
  PLAN_PRESETS,
  formatModelDisplayName,
};
