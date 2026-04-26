import {
  BarChart, Bar, Cell, CartesianGrid,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { C, tagColor } from "../constants/theme.js";
import { fmtTokens } from "../lib/calculations.js";
import { ChartTooltip } from "../components/shared/ChartTooltip.jsx";
import { DeltaBadge } from "../components/shared/DeltaBadge.jsx";
import { EmergingBadge } from "../components/shared/EmergingBadge.jsx";
import { Mono } from "../components/shared/Mono.jsx";
import { SectionLabel } from "../components/shared/SectionLabel.jsx";
import { EmptyState } from "../components/shared/EmptyState.jsx";

export function ByTag({ data, mode, isMobile }) {
  const { now, then } = data;
  const compare = mode === "compare";
  const tagsNow = now.byTag;

  if (!tagsNow.length) {
    return (
      <EmptyState
        title="No tagged calls yet in this window"
        body={
          <>
            Send a call through the wrapper with a <code>tag</code> argument and refresh.<br />
            Example: <code>claudeCall(&#123; tag: "owner-report", … &#125;)</code>
          </>
        }
      />
    );
  }

  const thenMap = new Map((then?.byTag ?? []).map((t) => [t.tag, t]));
  const chartRows = tagsNow.map((t) => ({
    tag:    t.tag,
    now:    t.tokens,
    then:   thenMap.get(t.tag)?.tokens ?? 0,
    color:  tagColor(t.tag),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 20,
        }}
      >
        <SectionLabel>
          {compare ? "NOW vs PRIOR — Tokens by Tag" : "⚡ Recency-Weighted Token Share by Tag"}
        </SectionLabel>
        <ResponsiveContainer width="100%" height={isMobile ? 240 : 280}>
          <BarChart data={chartRows} layout="vertical">
            <CartesianGrid stroke={C.border} horizontal={false} />
            <XAxis
              type="number"
              stroke={C.muted}
              tick={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }}
              tickFormatter={(v) => fmtTokens(v)}
            />
            <YAxis
              type="category"
              dataKey="tag"
              stroke={C.muted}
              tick={{
                fontSize: isMobile ? 10 : 12,
                fontFamily: "'IBM Plex Mono', monospace",
              }}
              width={isMobile ? 90 : 120}
            />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="now" name={compare ? "now" : "tokens"} radius={[0, 3, 3, 0]}>
              {chartRows.map((r, i) => (
                <Cell
                  key={i}
                  fill={compare ? C.accent : r.color}
                  fillOpacity={0.85}
                />
              ))}
            </Bar>
            {compare && (
              <Bar
                dataKey="then"
                name="prior"
                fill={C.muted}
                fillOpacity={0.4}
                radius={[0, 3, 3, 0]}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
          gap: 12,
        }}
      >
        {tagsNow.map((t) => {
          const prev   = thenMap.get(t.tag);
          const isNew  = !prev || prev.tokens === 0;
          const color  = tagColor(t.tag);

          const cells = [
            ["tokens",   fmtTokens(t.tokens), prev ? fmtTokens(prev.tokens) : "—"],
            ["calls",    String(t.calls),     prev ? String(prev.calls)     : "—"],
            [
              "avg/call",
              fmtTokens(t.avgPerCall),
              prev?.calls ? fmtTokens(prev.tokens / prev.calls) : "—",
            ],
          ];

          return (
            <div
              key={t.tag}
              style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                borderLeft: `3px solid ${color}`,
                borderRadius: 10,
                padding: "16px 20px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 12,
                  flexWrap: "wrap",
                }}
              >
                <Mono style={{ color, fontWeight: 600, fontSize: 14 }}>
                  {t.tag}
                </Mono>
                {isNew && compare && <EmergingBadge />}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 12,
                }}
              >
                {cells.map(([lbl, nowVal, thenVal]) => (
                  <div key={lbl}>
                    <div
                      style={{
                        fontSize: 10,
                        color: C.muted,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        fontFamily: "'IBM Plex Mono', monospace",
                        marginBottom: 4,
                      }}
                    >
                      {lbl}
                    </div>
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 700,
                        color: C.text,
                        fontFamily: "'IBM Plex Mono', monospace",
                      }}
                    >
                      {nowVal}
                    </div>
                    {compare && (
                      <div
                        style={{
                          fontSize: 11,
                          color: C.muted,
                          fontFamily: "'IBM Plex Mono', monospace",
                          marginTop: 2,
                        }}
                      >
                        prev: {thenVal}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {compare && !isNew && prev?.tokens > 0 && (
                <div
                  style={{
                    marginTop: 12,
                    paddingTop: 10,
                    borderTop: `1px solid ${C.border}`,
                  }}
                >
                  <DeltaBadge now={t.tokens} then={prev.tokens} />
                  <Mono style={{ fontSize: 11, color: C.muted, marginLeft: 8 }}>
                    token volume
                  </Mono>
                </div>
              )}
              {compare && isNew && (
                <div
                  style={{
                    marginTop: 12,
                    paddingTop: 10,
                    borderTop: `1px solid ${C.border}`,
                    fontSize: 12,
                    color: C.accentB,
                    fontFamily: "'IBM Plex Mono', monospace",
                  }}
                >
                  ▲ New tag this period — no prior history to compare
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
