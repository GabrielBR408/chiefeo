// TokenScope — interactive mockup for Claude.ai artifacts
//
// Paste this entire file into a new chat at https://claude.ai and ask
// Claude to "render this as an artifact". You'll get the full dashboard
// inline with synthetic data, fully clickable: 4 tabs, weighted/compare
// modes, 7d/14d/30d window selector. No setup, no backend.

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const C = {
  bg: "#07090f", card: "#0e1119", cardAlt: "#0a0d16", border: "#1a2035",
  accent: "#f5a623", accentB: "#3ecfcf", accentC: "#c084fc", accentD: "#f87171",
  text: "#e8eaf0", muted: "#4b5675", mutedLight: "#7a88a8",
  green: "#34d399", red: "#f87171",
};
const SEED_TAG_COLORS = {
  "cam-rec": C.accent, "code-projects": C.accentB, "gl-variance": C.accentC,
  "owner-report": "#fb923c", "cheat-sheet": C.green, "expense-report": "#a3e635",
  "chat": "#f472b6",
};
const PALETTE = [C.accent, C.accentB, C.accentC, "#fb923c", C.green,
  "#f472b6", "#a3e635", "#60a5fa", "#facc15", "#f87171"];
const tagColor = (name) => {
  if (SEED_TAG_COLORS[name]) return SEED_TAG_COLORS[name];
  if (!name) return C.muted;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
};
const WEIGHTS = [1.00, 0.85, 0.72, 0.61, 0.52, 0.40, 0.30];
const TAB_DEFS = [
  { key: "overview", label: "Overview", icon: "◈" },
  { key: "by-tag",   label: "By Tag",   icon: "⊞" },
  { key: "models",   label: "Models",   icon: "◉" },
  { key: "log",      label: "Log",      icon: "≡" },
];

const localDayKey = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const shortDayLabel = (key) => {
  const [, m, d] = key.split("-");
  return `${MONTHS[+m - 1]} ${+d}`;
};
const dayKeysAsc = (days, anchorEnd = new Date()) => {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(anchorEnd);
    d.setDate(d.getDate() - i);
    out.push(localDayKey(d));
  }
  return out;
};
const windowRanges = (days) => {
  const end = new Date(); end.setHours(23,59,59,999);
  const nowStart = new Date(end);
  nowStart.setDate(nowStart.getDate() - (days - 1));
  nowStart.setHours(0,0,0,0);
  const thenEnd = new Date(nowStart);
  thenEnd.setMilliseconds(thenEnd.getMilliseconds() - 1);
  const thenStart = new Date(thenEnd);
  thenStart.setDate(thenStart.getDate() - (days - 1));
  thenStart.setHours(0,0,0,0);
  return { now: { start: nowStart, end }, then: { start: thenStart, end: thenEnd } };
};
const applyRecencyWeights = (daysAsc, key) => {
  if (!daysAsc.length) return 0;
  const minW = WEIGHTS[WEIGHTS.length - 1];
  let weighted = 0, total = 0;
  for (let i = 0; i < daysAsc.length; i++) {
    const ageFromToday = daysAsc.length - 1 - i;
    const w = WEIGHTS[ageFromToday] ?? minW;
    weighted += (daysAsc[i][key] ?? 0) * w;
    total += w;
  }
  return total === 0 ? 0 : (weighted / total) * daysAsc.length;
};
const calcDelta = (now, then) =>
  (then === 0 || then == null) ? null : ((now - then) / then) * 100;
const pctFmt = (v) => `${Math.abs(v).toFixed(0)}%`;
const fmtTokens = (n) => {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(Math.round(n));
};
const fmtCost = (n) => n == null ? "—" : `$${Number(n).toFixed(2)}`;
const fmtMs = (n) => {
  if (n == null) return "—";
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}s`;
  if (n >= 1000)   return `${(n / 1000).toFixed(2)}s`;
  return `${Math.round(n)}ms`;
};
const fmtTime = (iso) => new Date(iso).toLocaleTimeString([],
  { hour: "numeric", minute: "2-digit" });

const DEMO_PROFILES = [
  { tag: "cam-rec",        weight: 0.18, model: "claude-sonnet-4-6",
    inMin: 8000,  inMax: 25000, outRatio: 0.18, cacheRate: 0.30, latencyMs: 4500 },
  { tag: "code-projects",  weight: 0.20, model: "claude-sonnet-4-6",
    inMin: 12000, inMax: 35000, outRatio: 0.22, cacheRate: 0.25, latencyMs: 6000,
    recentOnly: true },
  { tag: "gl-variance",    weight: 0.13, model: "claude-sonnet-4-6",
    inMin: 6000,  inMax: 15000, outRatio: 0.20, cacheRate: 0.45, latencyMs: 3200 },
  { tag: "owner-report",   weight: 0.11, model: "claude-sonnet-4-6",
    inMin: 9000,  inMax: 20000, outRatio: 0.25, cacheRate: 0.20, latencyMs: 4000 },
  { tag: "cheat-sheet",    weight: 0.07, model: "claude-haiku-4-5",
    inMin: 2000,  inMax: 8000,  outRatio: 0.30, cacheRate: 0.10, latencyMs: 1800 },
  { tag: "expense-report", weight: 0.06, model: "claude-sonnet-4-6",
    inMin: 4000,  inMax: 10000, outRatio: 0.28, cacheRate: 0.40, latencyMs: 2500 },
  { tag: "chat",           weight: 0.18, model: "claude-haiku-4-5",
    inMin: 200,   inMax: 1500,  outRatio: 0.40, cacheRate: 0.05, latencyMs: 700 },
  { tag: "code-projects",  weight: 0.07, model: "claude-opus-4-7",
    inMin: 18000, inMax: 40000, outRatio: 0.25, cacheRate: 0.20, latencyMs: 9000,
    recentOnly: true },
];
const DEMO_PRICING = {
  "claude-opus-4-7":   { input: 15.00, output: 75.00, cache_read: 1.50, cache_write: 18.75 },
  "claude-sonnet-4-6": { input:  3.00, output: 15.00, cache_read: 0.30, cache_write:  3.75 },
  "claude-haiku-4-5":  { input:  0.80, output:  4.00, cache_read: 0.08, cache_write:  1.00 },
};
const pickWeighted = (profiles) => {
  const total = profiles.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of profiles) { if (r < p.weight) return p; r -= p.weight; }
  return profiles[profiles.length - 1];
};
const generateDemoRows = () => {
  const rows = [];
  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  for (let dayOffset = 13; dayOffset >= 0; dayOffset--) {
    const recencyBoost = Math.pow(1.06, 13 - dayOffset);
    const callsToday = Math.round(10 * recencyBoost * (0.6 + Math.random() * 0.9));
    const eligible = DEMO_PROFILES.filter((p) => !p.recentOnly || dayOffset <= 6);
    for (let i = 0; i < callsToday; i++) {
      const p = pickWeighted(eligible);
      const inTok  = Math.round(p.inMin + Math.random() * (p.inMax - p.inMin));
      const outTok = Math.round(inTok * p.outRatio * (0.5 + Math.random()));
      const cacheR = Math.round(inTok * p.cacheRate * (0.6 + Math.random() * 0.6));
      const cacheW = cacheR > 0 ? Math.round(cacheR * (0.05 + Math.random() * 0.1)) : 0;
      const ms     = Math.round(p.latencyMs * (0.5 + Math.random() * 0.9));
      const ts = new Date(now - dayOffset * dayMs);
      ts.setHours(8 + Math.floor(Math.random() * 12),
                  Math.floor(Math.random() * 60),
                  Math.floor(Math.random() * 60), 0);
      const pp = DEMO_PRICING[p.model];
      const cost = (inTok / 1e6) * pp.input + (outTok / 1e6) * pp.output
                 + (cacheR / 1e6) * pp.cache_read + (cacheW / 1e6) * pp.cache_write;
      rows.push({
        id: `demo-${rows.length}`,
        created_at: ts.toISOString(),
        tag: p.tag, model: p.model,
        stop_reason: Math.random() > 0.04 ? "end_turn" : "max_tokens",
        input_tokens: inTok, output_tokens: outTok,
        cache_read_tokens: cacheR, cache_write_tokens: cacheW,
        cost_usd: cost, duration_ms: ms,
      });
    }
  }
  return rows;
};

const useIsMobile = () => {
  const detect = () => typeof window !== "undefined" && window.innerWidth < 700;
  const [mob, setMob] = useState(detect);
  useEffect(() => {
    const onResize = () => setMob(detect());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return mob;
};

const aggregateLogs = (logs, days, anchorEnd) => {
  const dayKeys = dayKeysAsc(days, anchorEnd);
  const byDay = Object.fromEntries(dayKeys.map((k) => [k, {
    date: k, label: shortDayLabel(k),
    tokens: 0, cost: 0, calls: 0,
    inTok: 0, outTok: 0, cacheR: 0, cacheW: 0, durSum: 0,
  }]));
  const byTagDay = {};
  const tags = new Map();
  const models = new Map();
  let totalIn = 0, totalOut = 0, totalCacheR = 0, totalCacheW = 0;
  let totalTokens = 0, totalCost = 0, totalCalls = 0, totalDur = 0;

  for (const r of logs) {
    const k = localDayKey(r.created_at);
    const tokens = (r.input_tokens || 0) + (r.output_tokens || 0)
                 + (r.cache_read_tokens || 0) + (r.cache_write_tokens || 0);
    const cost = Number(r.cost_usd || 0);
    const dur  = Number(r.duration_ms || 0);
    if (byDay[k]) {
      const d = byDay[k];
      d.tokens += tokens; d.cost += cost; d.calls += 1;
      d.inTok += r.input_tokens || 0; d.outTok += r.output_tokens || 0;
      d.cacheR += r.cache_read_tokens || 0; d.cacheW += r.cache_write_tokens || 0;
      d.durSum += dur;
    }
    const tb = tags.get(r.tag) || { tokens: 0, calls: 0, inTok: 0, outTok: 0, cacheR: 0, cacheW: 0, cost: 0, durSum: 0 };
    tb.tokens += tokens; tb.calls += 1;
    tb.inTok += r.input_tokens || 0; tb.outTok += r.output_tokens || 0;
    tb.cacheR += r.cache_read_tokens || 0; tb.cacheW += r.cache_write_tokens || 0;
    tb.cost += cost; tb.durSum += dur;
    tags.set(r.tag, tb);

    if (!byTagDay[r.tag]) byTagDay[r.tag] = Object.fromEntries(dayKeys.map((dk) => [dk, 0]));
    if (byTagDay[r.tag][k] != null) byTagDay[r.tag][k] += tokens;

    const mb = models.get(r.model) || { tokens: 0, calls: 0, cost: 0 };
    mb.tokens += tokens; mb.calls += 1; mb.cost += cost;
    models.set(r.model, mb);

    totalTokens += tokens; totalCost += cost; totalCalls += 1;
    totalIn += r.input_tokens || 0; totalOut += r.output_tokens || 0;
    totalCacheR += r.cache_read_tokens || 0; totalCacheW += r.cache_write_tokens || 0;
    totalDur += dur;
  }
  return {
    dayKeys, byDay, byTagDay, tags, models,
    totals: {
      tokens: totalTokens, cost: totalCost, calls: totalCalls,
      inTok: totalIn, outTok: totalOut,
      cacheR: totalCacheR, cacheW: totalCacheW, durSum: totalDur,
    },
  };
};

const buildPeriod = (logs, days, weighted, anchorEnd) => {
  const agg = aggregateLogs(logs, days, anchorEnd);
  const dailyAsc = agg.dayKeys.map((k) => agg.byDay[k]);
  const totalTokens = weighted ? Math.round(applyRecencyWeights(dailyAsc, "tokens")) : agg.totals.tokens;
  const totalCost   = weighted ? +applyRecencyWeights(dailyAsc, "cost").toFixed(2) : +agg.totals.cost.toFixed(2);
  const callCount   = weighted ? Math.round(applyRecencyWeights(dailyAsc, "calls")) : agg.totals.calls;
  const avgLatency  = agg.totals.calls ? agg.totals.durSum / agg.totals.calls : 0;
  const cacheable = agg.totals.inTok + agg.totals.cacheR + agg.totals.cacheW;
  const cacheHitRate = cacheable ? (agg.totals.cacheR / cacheable) * 100 : 0;
  const outputRatio  = agg.totals.inTok ? agg.totals.outTok / agg.totals.inTok : 0;

  const byTag = [...agg.tags.entries()]
    .map(([tag, b]) => ({
      tag, tokens: b.tokens, calls: b.calls, cost: b.cost,
      avgPerCall: b.calls ? b.tokens / b.calls : 0,
    }))
    .sort((a, b) => b.tokens - a.tokens);

  const byTagDailyAsc = Object.fromEntries(
    Object.entries(agg.byTagDay).map(([tag, daily]) => [
      tag, agg.dayKeys.map((k) => daily[k] || 0),
    ])
  );

  const totalModelTokens = agg.totals.tokens || 1;
  const byModel = [...agg.models.entries()]
    .map(([name, b]) => ({
      name, tokens: b.tokens, calls: b.calls,
      cost: +b.cost.toFixed(4),
      pct: +((b.tokens / totalModelTokens) * 100).toFixed(1),
    }))
    .sort((a, b) => b.tokens - a.tokens);

  return {
    totalTokens, totalCost, callCount, avgLatency, cacheHitRate, outputRatio,
    byTag, byTagDailyAsc, byModel,
    dayKeys: agg.dayKeys,
    daily: dailyAsc.map((d) => ({
      date: d.date, label: d.label,
      tokens: d.tokens, cost: +d.cost.toFixed(4), calls: d.calls,
    })),
  };
};

const useUsageData = (rows, windowSel, mode) => useMemo(() => {
  if (!rows) return null;
  const days = parseInt(windowSel, 10) || 7;
  const { now, then } = windowRanges(days);
  const inRange = (r, start, end) => {
    const t = new Date(r.created_at).getTime();
    return t >= start.getTime() && t <= end.getTime();
  };
  const nowLogs  = rows.filter((r) => inRange(r, now.start,  now.end));
  const thenLogs = rows.filter((r) => inRange(r, then.start, then.end));
  const weighted = mode === "weighted";
  const nowPeriod  = buildPeriod(nowLogs,  days, weighted, now.end);
  const thenPeriod = buildPeriod(thenLogs, days, false,    then.end);
  const recent = nowLogs
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 200)
    .map((r) => ({
      id: r.id, time: r.created_at, tag: r.tag, model: r.model,
      in: r.input_tokens, out: r.output_tokens,
      cacheR: r.cache_read_tokens, cacheW: r.cache_write_tokens,
      cost: Number(r.cost_usd || 0), ms: r.duration_ms,
    }));
  return {
    now: { ...nowPeriod, recentCalls: recent },
    then: thenPeriod,
    windowDays: days,
  };
}, [rows, windowSel, mode]);

const Mono = ({ children, style = {} }) => (
  <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", ...style }}>{children}</span>
);

const SectionLabel = ({ children, style = {} }) => (
  <div style={{
    fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase",
    color: C.muted, fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
    marginBottom: 8, ...style,
  }}>{children}</div>
);

const TagBadge = ({ name, style = {} }) => {
  const c = tagColor(name);
  return (
    <span style={{
      background: `${c}22`, color: c, border: `1px solid ${c}55`,
      borderRadius: 4, padding: "3px 9px", fontSize: 12,
      fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
      whiteSpace: "nowrap", ...style,
    }}>{name}</span>
  );
};

const DeltaBadge = ({ now, then, invert = false, fmt = pctFmt }) => {
  const d = calcDelta(now, then);
  if (d == null || !isFinite(d)) return null;
  const up = d >= 0;
  const positive = invert ? !up : up;
  return (
    <span style={{
      fontSize: 12, fontWeight: 600,
      color: positive ? C.green : C.red,
      fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
    }}>{up ? "↑" : "↓"} {fmt(d)}</span>
  );
};

const WeightBadge = () => (
  <span style={{
    fontSize: 10, background: `${C.accent}22`, color: C.accent,
    border: `1px solid ${C.accent}44`, borderRadius: 3, padding: "1px 6px",
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
    letterSpacing: "0.05em",
  }}>⚡ weighted</span>
);

const EmergingBadge = () => (
  <span style={{
    fontSize: 10, background: `${C.accentB}22`, color: C.accentB,
    border: `1px solid ${C.accentB}55`, borderRadius: 3, padding: "1px 6px",
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
    letterSpacing: "0.05em", marginLeft: 6,
  }}>EMERGING ▲</span>
);

const ChartTooltip = ({ active, payload, label, valueFormatter }) => {
  if (!active || !payload?.length) return null;
  const fmt = valueFormatter || ((v) =>
    typeof v === "number" && v > 999 ? fmtTokens(v) : String(v));
  return (
    <div style={{
      background: C.cardAlt, border: `1px solid ${C.border}`,
      borderRadius: 8, padding: "10px 14px", fontSize: 13,
      boxShadow: "0 6px 20px rgba(0,0,0,0.45)",
    }}>
      <div style={{
        color: C.muted, fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
        fontSize: 11, marginBottom: 6,
      }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{
          color: p.color || C.accent,
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          display: "flex", justifyContent: "space-between", gap: 12,
        }}>
          <span>{p.name}</span>
          <span>{fmt(p.value, p)}</span>
        </div>
      ))}
    </div>
  );
};

const StatCard = ({ label, display, compareDisplay, nowVal, thenVal,
                    mode, accent, invert = false }) => {
  const isCompare = mode === "compare";
  const color = accent || C.accent;
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: "18px 20px",
      position: "relative", overflow: "hidden",
      display: "flex", flexDirection: "column", gap: 6, minHeight: 110,
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2, background: color,
      }} />
      <SectionLabel>{label}</SectionLabel>
      <div style={{
        fontSize: 26, fontWeight: 700, color,
        fontFamily: "'IBM Plex Mono', ui-monospace, monospace", lineHeight: 1,
      }}>{display}</div>
      {isCompare ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ fontSize: 12, color: C.mutedLight }}>
            <Mono style={{ color: C.muted }}>prev </Mono>{compareDisplay}
          </div>
          <DeltaBadge now={nowVal} then={thenVal} invert={invert} />
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <WeightBadge />
        </div>
      )}
    </div>
  );
};

const EmptyState = ({ title = "No data yet", body }) => (
  <div style={{
    background: C.card, border: `1px dashed ${C.border}`,
    borderRadius: 12, padding: "40px 24px",
    textAlign: "center", color: C.mutedLight,
  }}>
    <div style={{
      fontSize: 32, color: C.muted, marginBottom: 8,
      fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
    }}>◌</div>
    <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6 }}>
      {title}
    </div>
    {body && <div style={{
      fontSize: 12, color: C.muted, lineHeight: 1.6,
      fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
    }}>{body}</div>}
  </div>
);

const PillGroup = ({ value, onChange, options, activeColor, isMobile }) => (
  <div style={{
    display: "flex", background: C.cardAlt,
    border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden",
  }}>
    {options.map((opt) => {
      const [k, label] = Array.isArray(opt) ? opt : [opt, opt];
      const active = value === k;
      const ac = typeof activeColor === "function" ? activeColor(k) : activeColor;
      return (
        <button key={k} type="button" onClick={() => onChange(k)} style={{
          padding: isMobile ? "5px 10px" : "6px 14px",
          fontSize: isMobile ? 11 : 12,
          background: active ? `${ac}22` : "transparent",
          color: active ? ac : C.muted,
          border: "none", cursor: "pointer",
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          whiteSpace: "nowrap",
        }}>{label}</button>
      );
    })}
  </div>
);

const Header = ({ isMobile, windowSel, onWindowChange, mode, onModeChange, onRegenerate }) => (
  <div style={{
    background: C.card, borderBottom: `1px solid ${C.border}`,
    padding: isMobile ? "12px 14px" : "14px 28px",
    display: "flex", alignItems: "center",
    justifyContent: "space-between", gap: 12, flexWrap: "wrap",
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16, background: `${C.accent}22`,
        border: `1px solid ${C.accent}44`, color: C.accent,
      }}>◈</div>
      <div>
        <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 700, color: C.text }}>TokenScope</div>
        {!isMobile && (
          <div style={{
            fontSize: 11, color: C.muted,
            fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          }}>claude usage intelligence · mockup</div>
        )}
      </div>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <PillGroup value={windowSel} onChange={onWindowChange}
        options={["7d","14d","30d"]} activeColor={C.accent} isMobile={isMobile} />
      <PillGroup value={mode} onChange={onModeChange}
        options={[["weighted","⚡ Weighted"],["compare","↔ vs Prior"]]}
        activeColor={(k) => k === "compare" ? C.accentB : C.accent}
        isMobile={isMobile} />
    </div>
    <button type="button" onClick={onRegenerate} title="Regenerate demo data"
      style={{
        background: "transparent", border: `1px solid ${C.border}`,
        color: C.text, borderRadius: 6, padding: "5px 10px",
        fontSize: 12, cursor: "pointer",
        fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
      }}>↻ regenerate</button>
  </div>
);

const TabBar = ({ tab, onTabChange, variant }) => {
  if (variant === "bottom") {
    return (
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: C.card, borderTop: `1px solid ${C.border}`,
        display: "flex", zIndex: 100,
      }}>
        {TAB_DEFS.map((t) => {
          const active = tab === t.key;
          return (
            <button key={t.key} type="button" onClick={() => onTabChange(t.key)} style={{
              flex: 1, padding: "12px 0",
              display: "flex", flexDirection: "column",
              alignItems: "center", gap: 3,
              background: "transparent", border: "none", cursor: "pointer",
              color: active ? C.accent : C.muted,
              borderTop: active ? `2px solid ${C.accent}` : "2px solid transparent",
            }}>
              <span style={{ fontSize: 18 }}>{t.icon}</span>
              <span style={{
                fontSize: 9, textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
              }}>{t.label.toLowerCase()}</span>
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div style={{
      background: C.card, borderBottom: `1px solid ${C.border}`,
      padding: "0 28px", display: "flex", gap: 4,
    }}>
      {TAB_DEFS.map((t) => {
        const active = tab === t.key;
        return (
          <button key={t.key} type="button" onClick={() => onTabChange(t.key)} style={{
            padding: "12px 20px", fontSize: 13,
            fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
            textTransform: "uppercase", letterSpacing: "0.08em",
            background: "transparent", border: "none", cursor: "pointer",
            color: active ? C.accent : C.muted,
            borderBottom: active ? `2px solid ${C.accent}` : "2px solid transparent",
            transition: "all 0.15s",
          }}>{t.icon} {t.label.toLowerCase()}</button>
        );
      })}
    </div>
  );
};

const ModeBar = ({ mode, windowSel, isMobile }) => {
  const isCompare = mode === "compare";
  const color = isCompare ? C.accentB : C.accent;
  const text = isCompare
    ? `Comparing NOW (${windowSel}) vs prior ${windowSel} — deltas show workflow shifts. Tags with no prior history get flagged EMERGING.`
    : "Recency-weighted: recent days count up to ~3.3× more than 7 days ago — summary numbers reflect current trajectory.";
  return (
    <div style={{
      background: isCompare ? `${C.accentB}12` : `${C.accent}0e`,
      borderBottom: `1px solid ${color}33`,
      padding: isMobile ? "8px 14px" : "8px 28px",
      fontSize: 12, color,
      fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <span>{isCompare ? "↔" : "⚡"}</span>
      <span>{text}</span>
    </div>
  );
};

const DemoBanner = () => (
  <div style={{
    background: `${C.accent}12`, borderBottom: `1px solid ${C.accent}33`,
    padding: "8px 16px",
    fontSize: 12, color: C.accent,
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  }}>
    🎮 mockup mode — synthetic ~14 days of usage. <code>code-projects</code> is
    seeded as an emerging tag so the EMERGING ▲ badge has something to point at
    in compare mode.
  </div>
);

const pickEmergingTag = (now, then) => {
  if (!now?.byTag?.length) return null;
  const thenMap = new Map((then?.byTag ?? []).map((t) => [t.tag, t.tokens]));
  let best = null;
  for (const t of now.byTag) {
    const prev = thenMap.get(t.tag) || 0;
    const gain = t.tokens - prev;
    if (gain <= 0) continue;
    if (!best || gain > best.gain) best = { tag: t.tag, gain, isNew: prev === 0 };
  }
  return best;
};

const Overview = ({ data, mode, windowSel, isMobile }) => {
  const { now, then } = data;
  const compare = mode === "compare";
  const cols = isMobile ? "1fr 1fr" : "repeat(3, 1fr)";

  const stats = [
    { label: "Total Tokens", now: now.totalTokens, then: then?.totalTokens ?? 0,
      display: fmtTokens(now.totalTokens),
      compareDisplay: fmtTokens(then?.totalTokens ?? 0), accent: C.accent },
    { label: "Total Cost", now: now.totalCost, then: then?.totalCost ?? 0,
      display: fmtCost(now.totalCost),
      compareDisplay: fmtCost(then?.totalCost ?? 0), accent: C.accentB },
    { label: "API Calls", now: now.callCount, then: then?.callCount ?? 0,
      display: String(now.callCount),
      compareDisplay: String(then?.callCount ?? 0), accent: C.accentC },
    { label: "Avg Latency", now: now.avgLatency, then: then?.avgLatency ?? 0,
      display: fmtMs(now.avgLatency),
      compareDisplay: fmtMs(then?.avgLatency ?? 0), accent: "#fb923c", invert: true },
    { label: "Cache Hit Rate", now: now.cacheHitRate, then: then?.cacheHitRate ?? 0,
      display: `${now.cacheHitRate.toFixed(0)}%`,
      compareDisplay: `${(then?.cacheHitRate ?? 0).toFixed(0)}%`, accent: C.green },
    { label: "Output Ratio", now: now.outputRatio, then: then?.outputRatio ?? 0,
      display: now.outputRatio.toFixed(2),
      compareDisplay: (then?.outputRatio ?? 0).toFixed(2), accent: "#f472b6" },
  ];

  const emergent = compare ? pickEmergingTag(now, then) : null;
  const emergentDailyAsc = emergent ? now.byTagDailyAsc[emergent.tag] : null;
  const chartData = compare && then?.daily
    ? [
        ...then.daily.map((d) => ({ ...d, emergent: 0 })),
        ...now.daily.map((d, i) => ({ ...d, emergent: emergentDailyAsc ? emergentDailyAsc[i] : 0 })),
      ]
    : now.daily.map((d, i) => ({ ...d, emergent: emergentDailyAsc ? emergentDailyAsc[i] : 0 }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 12 }}>
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label}
            display={s.display} compareDisplay={s.compareDisplay}
            nowVal={s.now} thenVal={s.then}
            accent={s.accent} invert={s.invert} mode={mode} />
        ))}
      </div>

      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 12, padding: 20,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <SectionLabel>
            Daily Token Volume — {compare ? `${windowSel} now vs prior` : windowSel}
          </SectionLabel>
          {emergent && (
            <Mono style={{ fontSize: 11, color: C.accentB }}>
              ↑ {emergent.tag} {emergent.isNew ? "emerging" : "growing"}
            </Mono>
          )}
        </div>
        <ResponsiveContainer width="100%" height={isMobile ? 200 : 230}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="tk-area-tokens" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.accent} stopOpacity={0.35} />
                <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="tk-area-emergent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.accentB} stopOpacity={0.25} />
                <stop offset="100%" stopColor={C.accentB} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke={C.muted}
              tick={{ fontSize: isMobile ? 10 : 12, fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
              minTickGap={isMobile ? 16 : 8} />
            <YAxis stroke={C.muted}
              tick={{ fontSize: isMobile ? 10 : 12, fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
              tickFormatter={(v) => fmtTokens(v)} />
            <Tooltip content={<ChartTooltip />} />
            <Area dataKey="tokens" name="tokens" stroke={C.accent}
              strokeWidth={2} fill="url(#tk-area-tokens)" dot={false} />
            {emergent && (
              <Area dataKey="emergent" name={emergent.tag} stroke={C.accentB}
                strokeWidth={2} fill="url(#tk-area-emergent)" dot={false} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 12, padding: 20,
      }}>
        <SectionLabel>Daily Cost ($) — burn rate</SectionLabel>
        <ResponsiveContainer width="100%" height={isMobile ? 160 : 180}>
          <LineChart data={now.daily}>
            <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke={C.muted}
              tick={{ fontSize: isMobile ? 10 : 12, fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
              minTickGap={isMobile ? 16 : 8} />
            <YAxis stroke={C.muted}
              tick={{ fontSize: isMobile ? 10 : 12, fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
              tickFormatter={(v) => fmtCost(v)} />
            <Tooltip content={<ChartTooltip valueFormatter={(v) => fmtCost(v)} />} />
            <Line dataKey="cost" name="cost" stroke={C.accentB}
              strokeWidth={2} dot={{ fill: C.accentB, r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const ByTag = ({ data, mode, isMobile }) => {
  const { now, then } = data;
  const compare = mode === "compare";
  const tagsNow = now.byTag;
  if (!tagsNow.length) return <EmptyState title="No tagged calls yet" />;

  const thenMap = new Map((then?.byTag ?? []).map((t) => [t.tag, t]));
  const chartRows = tagsNow.map((t) => ({
    tag: t.tag, now: t.tokens,
    then: thenMap.get(t.tag)?.tokens ?? 0,
    color: tagColor(t.tag),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 12, padding: 20,
      }}>
        <SectionLabel>{compare
          ? "NOW vs PRIOR — Tokens by Tag"
          : "⚡ Recency-Weighted Token Share by Tag"}</SectionLabel>
        <ResponsiveContainer width="100%" height={isMobile ? 240 : 280}>
          <BarChart data={chartRows} layout="vertical">
            <CartesianGrid stroke={C.border} horizontal={false} />
            <XAxis type="number" stroke={C.muted}
              tick={{ fontSize: 11, fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
              tickFormatter={(v) => fmtTokens(v)} />
            <YAxis type="category" dataKey="tag" stroke={C.muted}
              tick={{ fontSize: isMobile ? 10 : 12, fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
              width={isMobile ? 90 : 120} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="now" name={compare ? "now" : "tokens"} radius={[0, 3, 3, 0]}>
              {chartRows.map((r, i) => (
                <Cell key={i} fill={compare ? C.accent : r.color} fillOpacity={0.85} />
              ))}
            </Bar>
            {compare && (
              <Bar dataKey="then" name="prior" fill={C.muted}
                fillOpacity={0.4} radius={[0, 3, 3, 0]} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 12,
      }}>
        {tagsNow.map((t) => {
          const prev = thenMap.get(t.tag);
          const isNew = !prev || prev.tokens === 0;
          const color = tagColor(t.tag);
          const cells = [
            ["tokens", fmtTokens(t.tokens), prev ? fmtTokens(prev.tokens) : "—"],
            ["calls", String(t.calls), prev ? String(prev.calls) : "—"],
            ["avg/call", fmtTokens(t.avgPerCall),
              prev?.calls ? fmtTokens(prev.tokens / prev.calls) : "—"],
          ];
          return (
            <div key={t.tag} style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderLeft: `3px solid ${color}`,
              borderRadius: 10, padding: "16px 20px",
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                marginBottom: 12, flexWrap: "wrap",
              }}>
                <Mono style={{ color, fontWeight: 600, fontSize: 14 }}>{t.tag}</Mono>
                {isNew && compare && <EmergingBadge />}
              </div>
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12,
              }}>
                {cells.map(([lbl, nowVal, thenVal]) => (
                  <div key={lbl}>
                    <div style={{
                      fontSize: 10, color: C.muted, textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                      marginBottom: 4,
                    }}>{lbl}</div>
                    <div style={{
                      fontSize: 20, fontWeight: 700, color: C.text,
                      fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                    }}>{nowVal}</div>
                    {compare && (
                      <div style={{
                        fontSize: 11, color: C.muted, marginTop: 2,
                        fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                      }}>prev: {thenVal}</div>
                    )}
                  </div>
                ))}
              </div>
              {compare && !isNew && prev?.tokens > 0 && (
                <div style={{
                  marginTop: 12, paddingTop: 10,
                  borderTop: `1px solid ${C.border}`,
                }}>
                  <DeltaBadge now={t.tokens} then={prev.tokens} />
                  <Mono style={{ fontSize: 11, color: C.muted, marginLeft: 8 }}>
                    token volume
                  </Mono>
                </div>
              )}
              {compare && isNew && (
                <div style={{
                  marginTop: 12, paddingTop: 10,
                  borderTop: `1px solid ${C.border}`,
                  fontSize: 12, color: C.accentB,
                  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                }}>▲ New tag this period — no prior history to compare</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const MODEL_PALETTE = [C.accent, C.accentB, C.accentC, "#fb923c", C.green];
const prettyModelName = (name) => {
  if (!name) return "—";
  const m = name.match(/claude-(opus|sonnet|haiku)-?(\d[\d-]*)/i);
  if (!m) return name;
  const tier = m[1].charAt(0).toUpperCase() + m[1].slice(1);
  return `${tier} ${m[2].replaceAll("-", ".")}`;
};

const Models = ({ data, mode, isMobile }) => {
  const { now, then } = data;
  const compare = mode === "compare";
  if (!now.byModel.length) return <EmptyState title="No model usage yet" />;

  const thenMap = new Map((then?.byModel ?? []).map((m) => [m.name, m]));
  const cards = now.byModel.map((m, i) => ({
    ...m,
    color: MODEL_PALETTE[i % MODEL_PALETTE.length],
    prevPct: thenMap.get(m.name)?.pct ?? 0,
    isNew: !thenMap.has(m.name),
  }));
  const costData = now.byModel.map((m, i) => ({
    model: prettyModelName(m.name),
    cost: m.cost,
    prev: thenMap.get(m.name)?.cost ?? 0,
    color: MODEL_PALETTE[i % MODEL_PALETTE.length],
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : `repeat(${Math.min(cards.length, 3)}, 1fr)`,
        gap: 14,
      }}>
        {cards.map((m) => (
          <div key={m.name} style={{
            background: C.card,
            border: `1px solid ${m.color}44`,
            borderTop: `3px solid ${m.color}`,
            borderRadius: 12, padding: "20px 24px",
          }}>
            <div style={{
              display: "flex", justifyContent: "space-between",
              alignItems: "baseline", gap: 8,
            }}>
              <Mono style={{ color: m.color, fontWeight: 600, fontSize: 14 }}>
                {prettyModelName(m.name)}
              </Mono>
              {compare && m.isNew && <EmergingBadge />}
            </div>
            <div style={{
              fontSize: 40, fontWeight: 700, color: C.text,
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
              marginTop: 10, lineHeight: 1,
            }}>{m.pct.toFixed(0)}%</div>
            {compare ? (
              <div style={{
                fontSize: 13, color: C.muted, marginTop: 6,
                display: "flex", gap: 10, alignItems: "center",
                fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
              }}>
                <span>prior: {m.prevPct.toFixed(0)}%</span>
                <DeltaBadge now={m.pct} then={m.prevPct} />
              </div>
            ) : (
              <div style={{ marginTop: 6 }}><WeightBadge /></div>
            )}
            <div style={{
              marginTop: 14, height: 6,
              background: C.border, borderRadius: 3,
            }}>
              <div style={{
                width: `${Math.min(100, m.pct)}%`, height: "100%",
                background: m.color, borderRadius: 3,
                transition: "width 0.4s",
              }} />
            </div>
            {compare && (
              <div style={{
                marginTop: 4, height: 4,
                background: C.border, borderRadius: 3,
              }}>
                <div style={{
                  width: `${Math.min(100, m.prevPct)}%`, height: "100%",
                  background: m.color, opacity: 0.35, borderRadius: 3,
                }} />
              </div>
            )}
            <div style={{
              marginTop: 12, fontSize: 12, color: C.mutedLight,
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
            }}>{m.calls} calls · {fmtCost(m.cost)}</div>
          </div>
        ))}
      </div>

      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 12, padding: 20,
      }}>
        <SectionLabel>Cost Attribution by Model</SectionLabel>
        <ResponsiveContainer width="100%" height={isMobile ? 200 : 220}>
          <BarChart data={costData}>
            <CartesianGrid stroke={C.border} />
            <XAxis dataKey="model" stroke={C.muted}
              tick={{ fontSize: isMobile ? 11 : 13, fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }} />
            <YAxis stroke={C.muted}
              tick={{ fontSize: 12, fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
              tickFormatter={(v) => fmtCost(v)} />
            <Tooltip content={<ChartTooltip valueFormatter={(v) => fmtCost(v)} />} />
            <Bar dataKey="cost" name="cost now" radius={[4, 4, 0, 0]}>
              {costData.map((c, i) => <Cell key={i} fill={c.color} fillOpacity={0.85} />)}
            </Bar>
            {compare && (
              <Bar dataKey="prev" name="cost prior" fill={C.muted}
                fillOpacity={0.35} radius={[4, 4, 0, 0]} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const PAGE_SIZE = 30;

const Log = ({ data, isMobile }) => {
  const all = data.now.recentCalls || [];
  const [tagFilter,   setTagFilter]   = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [page,        setPage]        = useState(0);
  const tags   = useMemo(() => ["all", ...new Set(all.map((r) => r.tag))],   [all]);
  const models = useMemo(() => ["all", ...new Set(all.map((r) => r.model))], [all]);
  const filtered = useMemo(() => all.filter((r) =>
    (tagFilter === "all" || r.tag === tagFilter) &&
    (modelFilter === "all" || r.model === modelFilter)
  ), [all, tagFilter, modelFilter]);
  const pageRows  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (!all.length) return <EmptyState title="Log is empty" />;

  const selectStyle = {
    background: "transparent", color: C.text, border: "none",
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
    fontSize: 12, outline: "none",
  };
  const selectWrap = {
    display: "inline-flex", alignItems: "center", gap: 6,
    background: C.cardAlt, border: `1px solid ${C.border}`,
    borderRadius: 6, padding: "4px 8px",
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
    fontSize: 11, color: C.muted,
  };

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 12, overflow: "hidden",
    }}>
      <div style={{
        padding: "16px 20px", borderBottom: `1px solid ${C.border}`,
        display: "flex", flexWrap: "wrap", alignItems: "center",
        justifyContent: "space-between", gap: 10,
      }}>
        <SectionLabel style={{ marginBottom: 0 }}>Recent API Calls</SectionLabel>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label style={selectWrap}>
            tag
            <select value={tagFilter}
              onChange={(e) => { setTagFilter(e.target.value); setPage(0); }}
              style={selectStyle}>
              {tags.map((o) => <option key={o} value={o} style={{ background: C.card, color: C.text }}>{o}</option>)}
            </select>
          </label>
          <label style={selectWrap}>
            model
            <select value={modelFilter}
              onChange={(e) => { setModelFilter(e.target.value); setPage(0); }}
              style={selectStyle}>
              {models.map((o) => <option key={o} value={o} style={{ background: C.card, color: C.text }}>{o}</option>)}
            </select>
          </label>
          <Mono style={{ fontSize: 11, color: C.muted }}>
            {filtered.length} of {all.length}
          </Mono>
        </div>
      </div>

      {isMobile ? (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {pageRows.map((r, i) => (
            <div key={r.id || i} style={{
              padding: "14px 18px",
              borderBottom: `1px solid ${C.border}55`,
              background: i % 2 === 0 ? "transparent" : C.cardAlt,
            }}>
              <div style={{
                display: "flex", justifyContent: "space-between",
                marginBottom: 8, alignItems: "center",
              }}>
                <TagBadge name={r.tag} />
                <Mono style={{ fontSize: 12, color: C.muted }}>{fmtTime(r.time)}</Mono>
              </div>
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8,
              }}>
                {[
                  ["model", r.model.replace(/^claude-/, "")],
                  ["in", fmtTokens(r.in)],
                  ["out", fmtTokens(r.out)],
                  ["cost", fmtCost(r.cost)],
                ].map(([l, v]) => (
                  <div key={l}>
                    <div style={{
                      fontSize: 9, color: C.muted, textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                    }}>{l}</div>
                    <div style={{
                      fontSize: 13, fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                      color: C.text, marginTop: 2,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["Time","Tag","Model","Input","Output","Cost","Latency"].map((h) => (
                  <th key={h} style={{
                    padding: "10px 16px", textAlign: "left",
                    fontSize: 10, color: C.muted,
                    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                    textTransform: "uppercase", letterSpacing: "0.1em",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, i) => (
                <tr key={r.id || i} style={{
                  borderBottom: `1px solid ${C.border}55`,
                  background: i % 2 === 0 ? "transparent" : C.cardAlt,
                }}>
                  <td style={{ padding: "12px 16px" }}>
                    <Mono style={{ fontSize: 13, color: C.muted }}>{fmtTime(r.time)}</Mono>
                  </td>
                  <td style={{ padding: "12px 16px" }}><TagBadge name={r.tag} /></td>
                  <td style={{ padding: "12px 16px" }}>
                    <Mono style={{ fontSize: 13 }}>{r.model.replace(/^claude-/, "")}</Mono>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <Mono style={{ fontSize: 13, color: C.accent }}>{fmtTokens(r.in)}</Mono>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <Mono style={{ fontSize: 13, color: C.accentB }}>{fmtTokens(r.out)}</Mono>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <Mono style={{ fontSize: 13, color: "#fbbf24" }}>{fmtCost(r.cost)}</Mono>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <Mono style={{ fontSize: 13 }}>{fmtMs(r.ms)}</Mono>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <div style={{
          padding: "12px 20px", borderTop: `1px solid ${C.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}
            style={{
              background: "transparent", border: `1px solid ${C.border}`,
              color: page === 0 ? C.muted : C.text, opacity: page === 0 ? 0.5 : 1,
              borderRadius: 6, padding: "5px 12px",
              cursor: page === 0 ? "default" : "pointer",
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11,
            }}>← prev</button>
          <Mono style={{ fontSize: 11, color: C.muted }}>
            page {page + 1} of {pageCount}
          </Mono>
          <button type="button" disabled={page >= pageCount - 1}
            onClick={() => setPage(page + 1)} style={{
              background: "transparent", border: `1px solid ${C.border}`,
              color: page >= pageCount - 1 ? C.muted : C.text,
              opacity: page >= pageCount - 1 ? 0.5 : 1,
              borderRadius: 6, padding: "5px 12px",
              cursor: page >= pageCount - 1 ? "default" : "pointer",
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11,
            }}>next →</button>
        </div>
      )}
    </div>
  );
};

export default function App() {
  const isMobile = useIsMobile();
  const [tab, setTab]    = useState("overview");
  const [mode, setMode]  = useState("weighted");
  const [winSel, setWin] = useState("7d");
  const [seed, setSeed]  = useState(0);
  const rows = useMemo(() => generateDemoRows(), [seed]);
  const data = useUsageData(rows, winSel, mode);

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.text,
      fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
      paddingBottom: isMobile ? 76 : 0,
    }}>
      <Header isMobile={isMobile}
        windowSel={winSel} onWindowChange={setWin}
        mode={mode} onModeChange={setMode}
        onRegenerate={() => setSeed((s) => s + 1)} />
      {!isMobile && <TabBar tab={tab} onTabChange={setTab} variant="top" />}
      <DemoBanner />
      <ModeBar mode={mode} windowSel={winSel} isMobile={isMobile} />

      <main style={{
        padding: isMobile ? 16 : "28px 28px",
        maxWidth: 1360, margin: "0 auto",
      }}>
        {data && tab === "overview" && <Overview data={data} mode={mode} windowSel={winSel} isMobile={isMobile} />}
        {data && tab === "by-tag"   && <ByTag    data={data} mode={mode} isMobile={isMobile} />}
        {data && tab === "models"   && <Models   data={data} mode={mode} isMobile={isMobile} />}
        {data && tab === "log"      && <Log      data={data} isMobile={isMobile} />}
      </main>

      {isMobile && <TabBar tab={tab} onTabChange={setTab} variant="bottom" />}
    </div>
  );
}
