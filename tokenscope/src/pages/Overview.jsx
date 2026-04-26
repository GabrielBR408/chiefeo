import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { C } from "../constants/theme.js";
import { fmtCost, fmtTokens, fmtMs } from "../lib/calculations.js";
import { ChartTooltip } from "../components/shared/ChartTooltip.jsx";
import { SectionLabel } from "../components/shared/SectionLabel.jsx";
import { StatCard } from "../components/shared/StatCard.jsx";
import { Mono } from "../components/shared/Mono.jsx";

// Pick the tag whose token volume grew the most (in absolute terms) between
// `then` and `now` to overlay on the area chart in compare mode. Returns null
// if there's no meaningful gain.
function pickEmergingTag(now, then) {
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
}

export function Overview({ data, mode, windowSel, isMobile }) {
  const { now, then } = data;

  const compare = mode === "compare";
  const cols    = isMobile ? "1fr 1fr" : "repeat(3, 1fr)";

  const stats = [
    {
      label: "Total Tokens",
      now:   now.totalTokens,
      then:  then?.totalTokens ?? 0,
      display:        fmtTokens(now.totalTokens),
      compareDisplay: fmtTokens(then?.totalTokens ?? 0),
      accent: C.accent,
    },
    {
      label: "Total Cost",
      now:   now.totalCost,
      then:  then?.totalCost ?? 0,
      display:        fmtCost(now.totalCost),
      compareDisplay: fmtCost(then?.totalCost ?? 0),
      accent: C.accentB,
    },
    {
      label: "API Calls",
      now:   now.callCount,
      then:  then?.callCount ?? 0,
      display:        String(now.callCount),
      compareDisplay: String(then?.callCount ?? 0),
      accent: C.accentC,
    },
    {
      label: "Avg Latency",
      now:   now.avgLatency,
      then:  then?.avgLatency ?? 0,
      display:        fmtMs(now.avgLatency),
      compareDisplay: fmtMs(then?.avgLatency ?? 0),
      accent: "#fb923c",
      invert: true,   // lower latency = green
    },
    {
      label: "Cache Hit Rate",
      now:   now.cacheHitRate,
      then:  then?.cacheHitRate ?? 0,
      display:        `${now.cacheHitRate.toFixed(0)}%`,
      compareDisplay: `${(then?.cacheHitRate ?? 0).toFixed(0)}%`,
      accent: C.green,
    },
    {
      label: "Output Ratio",
      now:   now.outputRatio,
      then:  then?.outputRatio ?? 0,
      display:        now.outputRatio.toFixed(2),
      compareDisplay: (then?.outputRatio ?? 0).toFixed(2),
      accent: "#f472b6",
    },
  ];

  const emergent = compare ? pickEmergingTag(now, then) : null;
  const emergentDailyAsc = emergent ? now.byTagDailyAsc[emergent.tag] : null;

  // Stitch then+now for the area chart in compare mode (oldest → newest).
  const chartData = compare && then?.daily
    ? [
        ...then.daily.map((d, i) => ({
          ...d,
          tokens: d.tokens,
          emergent: 0,
        })),
        ...now.daily.map((d, i) => ({
          ...d,
          tokens: d.tokens,
          emergent: emergentDailyAsc ? emergentDailyAsc[i] : 0,
        })),
      ]
    : now.daily.map((d, i) => ({
        ...d,
        emergent: emergentDailyAsc ? emergentDailyAsc[i] : 0,
      }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 12 }}>
        {stats.map((s) => (
          <StatCard
            key={s.label}
            label={s.label}
            display={s.display}
            compareDisplay={s.compareDisplay}
            nowVal={s.now}
            thenVal={s.then}
            accent={s.accent}
            invert={s.invert}
            mode={mode}
          />
        ))}
      </div>

      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
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
                <stop offset="0%"   stopColor={C.accent} stopOpacity={0.35} />
                <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="tk-area-emergent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={C.accentB} stopOpacity={0.25} />
                <stop offset="100%" stopColor={C.accentB} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              stroke={C.muted}
              tick={{ fontSize: isMobile ? 10 : 12, fontFamily: "'IBM Plex Mono', monospace" }}
              minTickGap={isMobile ? 16 : 8}
            />
            <YAxis
              stroke={C.muted}
              tick={{ fontSize: isMobile ? 10 : 12, fontFamily: "'IBM Plex Mono', monospace" }}
              tickFormatter={(v) => fmtTokens(v)}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area
              dataKey="tokens"
              name="tokens"
              stroke={C.accent}
              strokeWidth={2}
              fill="url(#tk-area-tokens)"
              dot={false}
            />
            {emergent && (
              <Area
                dataKey="emergent"
                name={emergent.tag}
                stroke={C.accentB}
                strokeWidth={2}
                fill="url(#tk-area-emergent)"
                dot={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
        {compare && (
          <Mono
            style={{
              fontSize: 11,
              color: C.muted,
              marginTop: 8,
              display: "block",
            }}
          >
            ←&nbsp;prior {windowSel}&nbsp;|&nbsp;current {windowSel}&nbsp;→
          </Mono>
        )}
      </div>

      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 20,
        }}
      >
        <SectionLabel>Daily Cost ($) — burn rate</SectionLabel>
        <ResponsiveContainer width="100%" height={isMobile ? 160 : 180}>
          <LineChart data={now.daily}>
            <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              stroke={C.muted}
              tick={{ fontSize: isMobile ? 10 : 12, fontFamily: "'IBM Plex Mono', monospace" }}
              minTickGap={isMobile ? 16 : 8}
            />
            <YAxis
              stroke={C.muted}
              tick={{ fontSize: isMobile ? 10 : 12, fontFamily: "'IBM Plex Mono', monospace" }}
              tickFormatter={(v) => fmtCost(v)}
            />
            <Tooltip
              content={
                <ChartTooltip
                  valueFormatter={(v) => fmtCost(v)}
                />
              }
            />
            <Line
              dataKey="cost"
              name="cost"
              stroke={C.accentB}
              strokeWidth={2}
              dot={{ fill: C.accentB, r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
