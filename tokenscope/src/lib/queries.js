import { supabase } from "./supabase.js";
import {
  applyRecencyWeights,
  dayKeysAsc,
  fmtCost,
  fmtTokens,
  localDayKey,
  shortDayLabel,
  windowRanges,
} from "./calculations.js";

const COLUMNS =
  "id, created_at, tag, model, stop_reason, " +
  "input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, " +
  "cost_usd, duration_ms, metadata";

// Pull every log row in a window. Supabase caps a single response at 1000
// rows by default, so we paginate. For the volumes the dashboard targets
// (one user, weeks of API calls), this is plenty cheap.
export async function fetchLogsInRange(startISO, endISO) {
  const PAGE = 1000;
  let all = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("usage_logs")
      .select(COLUMNS)
      .gte("created_at", startISO)
      .lte("created_at", endISO)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    all = all.concat(data ?? []);
    if (!data || data.length < PAGE) break;
  }
  return all;
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

function emptyDayBucket(key) {
  return {
    date:    key,
    label:   shortDayLabel(key),
    tokens:  0,
    cost:    0,
    calls:   0,
    inTok:   0,
    outTok:  0,
    cacheR:  0,
    cacheW:  0,
    durSum:  0,
  };
}

function aggregateLogs(logs, days, anchorEnd) {
  const dayKeys = dayKeysAsc(days, anchorEnd);
  const byDay   = Object.fromEntries(dayKeys.map((k) => [k, emptyDayBucket(k)]));
  // Per-tag-per-day for the area-chart "emerging tag" overlay.
  const byTagDay = {};

  const tags   = new Map(); // tag    -> { tokens, calls, inTok, outTok, cacheR, cacheW, cost, durSum }
  const models = new Map(); // model  -> { tokens, calls, cost }

  let totalTokens = 0, totalCost = 0, totalCalls = 0;
  let totalIn = 0, totalOut = 0, totalCacheR = 0, totalCacheW = 0, totalDur = 0;

  for (const r of logs) {
    const k = localDayKey(r.created_at);
    const tokens = (r.input_tokens || 0) + (r.output_tokens || 0)
                 + (r.cache_read_tokens || 0) + (r.cache_write_tokens || 0);
    const cost   = Number(r.cost_usd || 0);
    const dur    = Number(r.duration_ms || 0);

    if (byDay[k]) {
      byDay[k].tokens += tokens;
      byDay[k].cost   += cost;
      byDay[k].calls  += 1;
      byDay[k].inTok  += r.input_tokens  || 0;
      byDay[k].outTok += r.output_tokens || 0;
      byDay[k].cacheR += r.cache_read_tokens  || 0;
      byDay[k].cacheW += r.cache_write_tokens || 0;
      byDay[k].durSum += dur;
    }

    const tagBucket = tags.get(r.tag) || {
      tokens: 0, calls: 0, inTok: 0, outTok: 0, cacheR: 0, cacheW: 0, cost: 0, durSum: 0,
    };
    tagBucket.tokens += tokens;
    tagBucket.calls  += 1;
    tagBucket.inTok  += r.input_tokens  || 0;
    tagBucket.outTok += r.output_tokens || 0;
    tagBucket.cacheR += r.cache_read_tokens  || 0;
    tagBucket.cacheW += r.cache_write_tokens || 0;
    tagBucket.cost   += cost;
    tagBucket.durSum += dur;
    tags.set(r.tag, tagBucket);

    if (!byTagDay[r.tag]) byTagDay[r.tag] = Object.fromEntries(dayKeys.map((dk) => [dk, 0]));
    if (byTagDay[r.tag][k] != null) byTagDay[r.tag][k] += tokens;

    const modBucket = models.get(r.model) || { tokens: 0, calls: 0, cost: 0 };
    modBucket.tokens += tokens;
    modBucket.calls  += 1;
    modBucket.cost   += cost;
    models.set(r.model, modBucket);

    totalTokens += tokens;
    totalCost   += cost;
    totalCalls  += 1;
    totalIn     += r.input_tokens  || 0;
    totalOut    += r.output_tokens || 0;
    totalCacheR += r.cache_read_tokens  || 0;
    totalCacheW += r.cache_write_tokens || 0;
    totalDur    += dur;
  }

  return {
    dayKeys, byDay, byTagDay, tags, models,
    totals: {
      tokens: totalTokens,
      cost:   totalCost,
      calls:  totalCalls,
      inTok:  totalIn,
      outTok: totalOut,
      cacheR: totalCacheR,
      cacheW: totalCacheW,
      durSum: totalDur,
    },
  };
}

// Build the period summary that the dashboard renders. `weighted=true` means
// use recency-weighted token/cost/call totals for the headline numbers; the
// daily series is always raw (charts show actuals, summary cards show trend).
function buildPeriod(logs, days, weighted, anchorEnd) {
  const agg = aggregateLogs(logs, days, anchorEnd);
  const dailyAsc = agg.dayKeys.map((k) => agg.byDay[k]);

  const totalTokens = weighted
    ? Math.round(applyRecencyWeights(dailyAsc, "tokens"))
    : agg.totals.tokens;
  const totalCost = weighted
    ? +applyRecencyWeights(dailyAsc, "cost").toFixed(2)
    : +agg.totals.cost.toFixed(2);
  const callCount = weighted
    ? Math.round(applyRecencyWeights(dailyAsc, "calls"))
    : agg.totals.calls;

  const avgLatency = agg.totals.calls
    ? agg.totals.durSum / agg.totals.calls
    : 0;

  const cachedReads = agg.totals.cacheR;
  const cacheableInputs = agg.totals.inTok + agg.totals.cacheR + agg.totals.cacheW;
  const cacheHitRate = cacheableInputs ? (cachedReads / cacheableInputs) * 100 : 0;

  const outputRatio = agg.totals.inTok
    ? agg.totals.outTok / agg.totals.inTok
    : 0;

  const byTag = [...agg.tags.entries()]
    .map(([tag, b]) => ({
      tag,
      tokens:     b.tokens,
      calls:      b.calls,
      cost:       b.cost,
      avgPerCall: b.calls ? b.tokens / b.calls : 0,
    }))
    .sort((a, b) => b.tokens - a.tokens);

  const byTagDailyAsc = Object.fromEntries(
    Object.entries(agg.byTagDay).map(([tag, daily]) => [
      tag,
      agg.dayKeys.map((k) => daily[k] || 0),
    ])
  );

  const totalModelTokens = agg.totals.tokens || 1;
  const byModel = [...agg.models.entries()]
    .map(([name, b]) => ({
      name,
      tokens: b.tokens,
      calls:  b.calls,
      cost:   +b.cost.toFixed(4),
      pct:    +((b.tokens / totalModelTokens) * 100).toFixed(1),
    }))
    .sort((a, b) => b.tokens - a.tokens);

  return {
    totalTokens,
    totalCost,
    callCount,
    avgLatency,
    cacheHitRate,
    outputRatio,
    byTag,
    byTagDailyAsc,
    dayKeys: agg.dayKeys,
    byModel,
    daily: dailyAsc.map((d) => ({
      date:   d.date,
      label:  d.label,
      tokens: d.tokens,
      cost:   +d.cost.toFixed(4),
      calls:  d.calls,
    })),
    raw: {
      tokens:     agg.totals.tokens,
      cost:       agg.totals.cost,
      calls:      agg.totals.calls,
      inTok:      agg.totals.inTok,
      outTok:     agg.totals.outTok,
      cacheReads: agg.totals.cacheR,
    },
  };
}

// Public: load both the current and prior periods for the selected window.
// `mode === "weighted"` only affects the summary numbers — `then` is loaded
// either way so flipping to compare is instantaneous.
export async function loadUsage({ window, mode }) {
  const days = parseInt(window, 10) || 7;
  const { now, then } = windowRanges(days);
  const weighted = mode === "weighted";

  const [nowLogs, thenLogs] = await Promise.all([
    fetchLogsInRange(now.start,  now.end),
    fetchLogsInRange(then.start, then.end),
  ]);

  const nowPeriod  = buildPeriod(nowLogs,  days, weighted, new Date(now.end));
  const thenPeriod = buildPeriod(thenLogs, days, false,    new Date(then.end));

  // Recent calls list (mostly used by the Log tab and Overview tooltips).
  const recent = nowLogs.slice(0, 200).map((r) => ({
    id:       r.id,
    time:     r.created_at,
    tag:      r.tag,
    model:    r.model,
    in:       r.input_tokens,
    out:      r.output_tokens,
    cacheR:   r.cache_read_tokens,
    cacheW:   r.cache_write_tokens,
    cost:     Number(r.cost_usd || 0),
    ms:       r.duration_ms,
    stop:     r.stop_reason,
    metadata: r.metadata,
  }));

  return {
    now:  { ...nowPeriod, recentCalls: recent },
    then: thenPeriod,
    windowDays: days,
  };
}

// Re-export so consumers can import format helpers from one place.
export { fmtCost, fmtTokens };
