// tokenscope-v2.jsx — APPROVED DESIGN MOCKUP (reference only)
// This file is the source-of-truth visual prototype. The real app under src/
// decomposes this into components and replaces the hardcoded data arrays
// with live Supabase queries via useUsageData. Do not import from here.

import { useState, useEffect } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from "recharts";

// ─── Theme ───────────────────────────────────────────────────────────────────
const C = {
  bg:         "#07090f",
  card:       "#0e1119",
  border:     "#1a2035",
  accent:     "#f5a623",
  accentB:    "#3ecfcf",
  accentC:    "#c084fc",
  accentD:    "#f87171",
  text:       "#e8eaf0",
  muted:      "#4b5675",
  mutedLight: "#7a88a8",
  green:      "#34d399",
  red:        "#f87171",
};

const TAG_COLORS = {
  "cam-rec":       C.accent,
  "code-projects": C.accentB,
  "gl-variance":   C.accentC,
  "owner-report":  "#fb923c",
  "cheat-sheet":   C.green,
  "chat":          "#f472b6",
};

// ─── Data ────────────────────────────────────────────────────────────────────
const rawDaily = [
  { d: "Apr 26", t: 74000,  cost: 0.31, cp: 24000 },
  { d: "Apr 25", t: 210000, cost: 0.84, cp: 61000 },
  { d: "Apr 24", t: 95000,  cost: 0.39, cp: 38000 },
  { d: "Apr 23", t: 130000, cost: 0.52, cp: 44000 },
  { d: "Apr 22", t: 61000,  cost: 0.25, cp: 21000 },
  { d: "Apr 21", t: 87000,  cost: 0.34, cp: 10000 },
  { d: "Apr 20", t: 42000,  cost: 0.18, cp: 0 },
  { d: "Apr 19", t: 88000,  cost: 0.36, cp: 0 },
  { d: "Apr 18", t: 145000, cost: 0.58, cp: 0 },
  { d: "Apr 17", t: 210000, cost: 0.84, cp: 0 },
  { d: "Apr 16", t: 190000, cost: 0.76, cp: 0 },
  { d: "Apr 15", t: 120000, cost: 0.48, cp: 0 },
  { d: "Apr 14", t: 95000,  cost: 0.38, cp: 0 },
  { d: "Apr 13", t: 62000,  cost: 0.25, cp: 0 },
];

const WEIGHTS = [1.0, 0.85, 0.72, 0.61, 0.52, 0.40, 0.30];

const nowDays  = rawDaily.slice(0, 7);
const thenDays = rawDaily.slice(7, 14);

const weightedSum = (arr, key) =>
  arr.reduce((s, d, i) => s + d[key] * WEIGHTS[i], 0) /
  WEIGHTS.reduce((a, b) => a + b, 0) * 7;

const nowTokens  = Math.round(weightedSum(nowDays, "t"));
const thenTokens = Math.round(thenDays.reduce((s, d) => s + d.t, 0) / 7 * 7);
const nowCost    = +(weightedSum(nowDays, "cost")).toFixed(2);
const thenCost   = +(thenDays.reduce((s, d) => s + d.cost, 0)).toFixed(2);
const nowCalls   = 219; const thenCalls = 184;
const nowLatency = 4.1; const thenLatency = 5.3;
const nowCache   = 34;  const thenCache   = 21;
const nowRatio   = 0.24; const thenRatio  = 0.19;

const delta = (now, then, pct = true) => {
  const d = pct ? ((now - then) / then * 100) : (now - then);
  return { val: d, up: d >= 0 };
};

const tagDataNow = [
  { tag: "cam-rec",       tokens: 312000, calls: 47 },
  { tag: "code-projects", tokens: 198000, calls: 31, emerging: true },
  { tag: "gl-variance",   tokens: 143000, calls: 31 },
  { tag: "owner-report",  tokens: 89000,  calls: 18 },
  { tag: "cheat-sheet",   tokens: 54000,  calls: 12 },
  { tag: "chat",          tokens: 41000,  calls: 88 },
];

const tagDataThen = [
  { tag: "cam-rec",       tokens: 280000, calls: 40 },
  { tag: "code-projects", tokens: 0,      calls: 0  },
  { tag: "gl-variance",   tokens: 180000, calls: 38 },
  { tag: "owner-report",  tokens: 210000, calls: 29 },
  { tag: "cheat-sheet",   tokens: 61000,  calls: 14 },
  { tag: "chat",          tokens: 38000,  calls: 74 },
];

const modelData = [
  { name: "Sonnet 4",  now: 61, then: 48, color: C.accent },
  { name: "Haiku 3.5", now: 28, then: 35, color: C.accentB },
  { name: "Opus 4",    now: 11, then: 17, color: C.accentC },
];

const recentCalls = [
  { time: "11:42 AM", tag: "cam-rec",       model: "sonnet-4",  in: 14200, out: 3100, cost: "$0.062", ms: 4200 },
  { time: "11:39 AM", tag: "gl-variance",   model: "sonnet-4",  in: 8900,  out: 1800, cost: "$0.038", ms: 3100 },
  { time: "11:31 AM", tag: "chat",          model: "haiku-3.5", in: 420,   out: 180,  cost: "$0.001", ms: 890  },
  { time: "11:20 AM", tag: "code-projects", model: "sonnet-4",  in: 22100, out: 5400, cost: "$0.089", ms: 6700 },
  { time: "10:58 AM", tag: "cheat-sheet",   model: "haiku-3.5", in: 6800,  out: 2200, cost: "$0.012", ms: 2100 },
  { time: "10:44 AM", tag: "code-projects", model: "opus-4",    in: 31000, out: 7200, cost: "$0.214", ms: 9400 },
];

const useIsMobile = () => {
  const [mob, setMob] = useState(typeof window !== "undefined" && window.innerWidth < 700);
  useEffect(() => {
    const h = () => setMob(window.innerWidth < 700);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return mob;
};

const Mono = ({ children, style = {} }) => (
  <span style={{ fontFamily: "'IBM Plex Mono', monospace", ...style }}>{children}</span>
);

const Label = ({ children }) => (
  <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase",
    color: C.muted, fontFamily: "'IBM Plex Mono', monospace", marginBottom: 8 }}>
    {children}
  </div>
);

const Tag = ({ name }) => (
  <span style={{
    background: (TAG_COLORS[name] || "#888") + "22",
    color: TAG_COLORS[name] || "#888",
    border: `1px solid ${(TAG_COLORS[name] || "#888")}55`,
    borderRadius: 4, padding: "3px 9px", fontSize: 12,
    fontFamily: "'IBM Plex Mono', monospace",
  }}>{name}</span>
);

const DeltaBadge = ({ now, then, invert = false, fmt = v => `${Math.abs(v).toFixed(0)}%` }) => {
  const d = delta(now, then);
  const positive = invert ? !d.up : d.up;
  return (
    <span style={{
      fontSize: 12, fontWeight: 600,
      color: positive ? C.green : C.red,
      fontFamily: "'IBM Plex Mono', monospace",
    }}>
      {d.up ? "↑" : "↓"} {fmt(d.val)}
    </span>
  );
};

const WeightBadge = () => (
  <span style={{
    fontSize: 10, background: C.accent + "22", color: C.accent,
    border: `1px solid ${C.accent}44`, borderRadius: 3,
    padding: "1px 6px", fontFamily: "'IBM Plex Mono', monospace",
    letterSpacing: "0.05em"
  }}>⚡ weighted</span>
);

const EmergingBadge = () => (
  <span style={{
    fontSize: 10, background: C.accentB + "22", color: C.accentB,
    border: `1px solid ${C.accentB}55`, borderRadius: 3,
    padding: "1px 6px", fontFamily: "'IBM Plex Mono', monospace",
    letterSpacing: "0.05em", marginLeft: 6
  }}>EMERGING ▲</span>
);

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0a0d16", border: `1px solid ${C.border}`,
      borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
      <div style={{ color: C.muted, fontFamily: "monospace", fontSize: 11, marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || C.accent, fontFamily: "monospace" }}>
          {p.name}: {typeof p.value === "number" && p.value > 999 ? `${(p.value/1000).toFixed(1)}K` : p.value}
        </div>
      ))}
    </div>
  );
};

const StatCard = ({ label, nowVal, thenVal, display, compareDisplay, mode, accent, invert, pctFmt }) => {
  const isCompare = mode === "compare";
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: "18px 20px", position: "relative", overflow: "hidden",
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: accent || C.accent }} />
      <Label>{label}</Label>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent || C.accent,
        fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1 }}>
        {isCompare ? display : display}
      </div>
      {isCompare ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ fontSize: 12, color: C.mutedLight }}>
            <Mono style={{ color: C.muted }}>prev </Mono>{compareDisplay}
          </div>
          <DeltaBadge now={nowVal} then={thenVal} invert={invert} fmt={pctFmt} />
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <WeightBadge />
        </div>
      )}
    </div>
  );
};

const TABS = ["overview", "by tag", "models", "log"];
const TAB_ICONS = { "overview": "◈", "by tag": "⊞", "models": "◉", "log": "≡" };

export default function App() {
  const [tab, setTab]   = useState("overview");
  const [mode, setMode] = useState("weighted");
  const [win, setWin]   = useState("7d");
  const isMobile        = useIsMobile();

  const PAD  = isMobile ? "16px" : "28px 36px";

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text,
      fontFamily: "'DM Sans', sans-serif", paddingBottom: isMobile ? 72 : 0 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=DM+Sans:wght@400;500;600;700&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; } ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; } button { cursor: pointer; }`}</style>

      {/* Header, tabs, mode bar, content panes for overview / by tag / models / log,
          and mobile bottom tab bar follow exactly as in the prototype.
          See src/components/layout/* and src/pages/* for the production decomposition. */}
    </div>
  );
}
