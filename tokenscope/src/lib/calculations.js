import { WEIGHTS } from "../constants/theme.js";

export const WEIGHT_SUM = WEIGHTS.reduce((a, b) => a + b, 0);

// Format a YYYY-MM-DD bucket key in the user's local timezone. We do all
// bucketing in local time so "today" matches what the user sees on a clock,
// not whatever UTC happens to be.
export function localDayKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function shortDayLabel(key) {
  const [, m, d] = key.split("-");
  const monthName = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m - 1];
  return `${monthName} ${+d}`;
}

// Given a window size in days, return [startISO, endISO] for the "now"
// period and the immediately preceding "then" period of the same length.
export function windowRanges(days) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const nowStart = new Date(end);
  nowStart.setDate(nowStart.getDate() - (days - 1));
  nowStart.setHours(0, 0, 0, 0);

  const thenEnd = new Date(nowStart);
  thenEnd.setMilliseconds(thenEnd.getMilliseconds() - 1);

  const thenStart = new Date(thenEnd);
  thenStart.setDate(thenStart.getDate() - (days - 1));
  thenStart.setHours(0, 0, 0, 0);

  return {
    now:  { start: nowStart.toISOString(),  end: end.toISOString() },
    then: { start: thenStart.toISOString(), end: thenEnd.toISOString() },
  };
}

// Build an array of N day keys ending today (oldest → newest).
export function dayKeysAsc(days, anchorEnd = new Date()) {
  const out = [];
  const end = new Date(anchorEnd);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    out.push(localDayKey(d));
  }
  return out;
}

// Recency-weight a numeric series. Expects `daysAsc` ordered oldest→newest
// over the same window the WEIGHTS array describes (today is the last entry,
// gets weight 1.0). For windows longer than WEIGHTS, older days are clamped
// to the smallest weight — so 14d/30d still emphasize recent activity but
// don't drop pre-week-1 data entirely.
//
// The result is normalized so a flat series returns the same total as a
// straight sum: that way "weighted total tokens" is comparable in magnitude
// to "raw total tokens" — only the distribution shifts.
export function applyRecencyWeights(daysAsc, key) {
  if (!daysAsc.length) return 0;
  const minW = WEIGHTS[WEIGHTS.length - 1];
  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 0; i < daysAsc.length; i++) {
    // i=0 is the oldest day; today is i = length - 1.
    const ageFromToday = daysAsc.length - 1 - i;
    const w = WEIGHTS[ageFromToday] ?? minW;
    weightedSum += (daysAsc[i][key] ?? 0) * w;
    totalWeight += w;
  }
  if (totalWeight === 0) return 0;
  return (weightedSum / totalWeight) * daysAsc.length;
}

export function calcDelta(now, then) {
  if (then === 0 || then == null) return null;
  return ((now - then) / then) * 100;
}

export function pctFmt(v) {
  return `${Math.abs(v).toFixed(0)}%`;
}

// Token formatting that stays compact in stat cards but readable in tooltips.
export function fmtTokens(n) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(Math.round(n));
}

export function fmtCost(n) {
  if (n == null) return "—";
  if (n >= 1000) return `$${n.toFixed(0)}`;
  if (n >= 10)   return `$${n.toFixed(2)}`;
  return `$${n.toFixed(2)}`;
}

export function fmtMs(n) {
  if (n == null) return "—";
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}s`;
  if (n >= 1000)   return `${(n / 1000).toFixed(2)}s`;
  return `${Math.round(n)}ms`;
}

export function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
