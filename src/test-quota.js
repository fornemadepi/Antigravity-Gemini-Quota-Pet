const { QuotaEngine } = require('./quota-engine');

const engine = new QuotaEngine();
engine.scanNow(true);
const snap = engine.getSnapshot();

console.log('=== Antigravity Gemini Pet · Quota Snapshot ===');
console.log('Active Model   :', snap.activeModel);
console.log('5H Remaining   :', `${snap.fiveHour.remainingPct}% (mode: ${snap.fiveHour.mode}, resetInMin: ${Math.round(snap.fiveHour.resetInMs / 60000)})`);
console.log('Week Remaining :', `${snap.weekly.remainingPct}% (mode: ${snap.weekly.mode}, resetInHours: ${Math.round(snap.weekly.resetInMs / 3600000)})`);
console.log('Today Usage    :', `${snap.today.tokens} tokens across ${snap.today.invocations} invocations`);
console.log('Runway Forecast:', snap.runwayMinutes ? `${snap.runwayMinutes} mins` : 'Plenty / Idle');
console.log('Latest Turn    :', snap.latestTurn);

// Test calibration + deduction math
const calRes = engine.calibrate({
  fiveHourRemainingPct: 82.5,
  fiveHourResetMinutes: 165,
  weeklyRemainingPct: 91.0,
  weeklyResetMinutes: 4 * 1440 + 360,
});
console.log('Calibrated Snap:', {
  fiveHour: calRes.snapshot.fiveHour.remainingPct,
  weekly: calRes.snapshot.weekly.remainingPct,
});
