import {
  BarChart, Bar, Cell, CartesianGrid,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { C } from "../constants/theme.js";
import { fmtCost } from "../lib/calculations.js";
import { ChartTooltip } from "../components/shared/ChartTooltip.jsx";
import { DeltaBadge } from "../components/shared/DeltaBadge.jsx";
import { EmergingBadge } from "../components/shared/EmergingBadge.jsx";
import { Mono } from "../components/shared/Mono.jsx";
import { SectionLabel } from "../components/shared/SectionLabel.jsx";
import { WeightBadge } from "../components/shared/WeightBadge.jsx";
import { EmptyState } from "../components/shared/EmptyState.jsx";

const MODEL_PALETTE = [C.accent, C.accentB, C.accentC, "#fb923c", C.green, "#f472b6"];

// Pretty-print "claude-sonnet-4-6" → "Sonnet 4.6", with a sensible fallback.
function prettyModelName(name) {
  if (!name) return "—";
  const m = name.match(/claude-(opus|sonnet|haiku)-?(\d[\d-]*)/i);
  if (!m) return name;
  const tier = m[1].charAt(0).toUpperCase() + m[1].slice(1);
  const ver  = m[2].replaceAll("-", ".");
  return `${tier} ${ver}`;
}

export function Models({ data, mode, isMobile }) {
  const { now, then } = data;
  const compare = mode === "compare";

  if (!now.byModel.length) {
    return (
      <EmptyState
        title="No model usage in this window"
        body="The Models tab populates as soon as the wrapper logs its first call."
      />
    );
  }

  const thenMap = new Map((then?.byModel ?? []).map((m) => [m.name, m]));
  const cards = now.byModel.map((m, i) => ({
    ...m,
    color:    MODEL_PALETTE[i % MODEL_PALETTE.length],
    prevPct:  thenMap.get(m.name)?.pct ?? 0,
    prevCost: thenMap.get(m.name)?.cost ?? 0,
    isNew:    !thenMap.has(m.name),
  }));

  const costData = now.byModel.map((m, i) => ({
    model: prettyModelName(m.name),
    cost:  m.cost,
    prev:  thenMap.get(m.name)?.cost ?? 0,
    color: MODEL_PALETTE[i % MODEL_PALETTE.length],
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : `repeat(${Math.min(cards.length, 3)}, 1fr)`,
          gap: 14,
        }}
      >
        {cards.map((m) => (
          <div
            key={m.name}
            style={{
              background: C.card,
              border: `1px solid ${m.color}44`,
              borderTop: `3px solid ${m.color}`,
              borderRadius: 12,
              padding: "20px 24px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 8,
              }}
            >
              <Mono style={{ color: m.color, fontWeight: 600, fontSize: 14 }}>
                {prettyModelName(m.name)}
              </Mono>
              {compare && m.isNew && <EmergingBadge />}
            </div>
            <div
              style={{
                fontSize: 40,
                fontWeight: 700,
                color: C.text,
                fontFamily: "'IBM Plex Mono', monospace",
                marginTop: 10,
                lineHeight: 1,
              }}
            >
              {m.pct.toFixed(0)}%
            </div>
            {compare ? (
              <div
                style={{
                  fontSize: 13,
                  color: C.muted,
                  fontFamily: "'IBM Plex Mono', monospace",
                  marginTop: 6,
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <span>prior: {m.prevPct.toFixed(0)}%</span>
                <DeltaBadge now={m.pct} then={m.prevPct} />
              </div>
            ) : (
              <div style={{ marginTop: 6 }}>
                <WeightBadge />
              </div>
            )}
            <div
              style={{
                marginTop: 14,
                height: 6,
                background: C.border,
                borderRadius: 3,
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, m.pct)}%`,
                  height: "100%",
                  background: m.color,
                  borderRadius: 3,
                  transition: "width 0.4s",
                }}
              />
            </div>
            {compare && (
              <>
                <div
                  style={{
                    marginTop: 4,
                    height: 4,
                    background: C.border,
                    borderRadius: 3,
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, m.prevPct)}%`,
                      height: "100%",
                      background: m.color,
                      opacity: 0.35,
                      borderRadius: 3,
                    }}
                  />
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: C.muted,
                    fontFamily: "'IBM Plex Mono', monospace",
                    marginTop: 4,
                  }}
                >
                  darker bar = prior period
                </div>
              </>
            )}
            <div
              style={{
                marginTop: 12,
                fontSize: 12,
                color: C.mutedLight,
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            >
              {m.calls} calls · {fmtCost(m.cost)}
            </div>
          </div>
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
        <SectionLabel>Cost Attribution by Model</SectionLabel>
        <ResponsiveContainer width="100%" height={isMobile ? 200 : 220}>
          <BarChart data={costData}>
            <CartesianGrid stroke={C.border} />
            <XAxis
              dataKey="model"
              stroke={C.muted}
              tick={{
                fontSize: isMobile ? 11 : 13,
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            />
            <YAxis
              stroke={C.muted}
              tick={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" }}
              tickFormatter={(v) => fmtCost(v)}
            />
            <Tooltip
              content={<ChartTooltip valueFormatter={(v) => fmtCost(v)} />}
            />
            <Bar dataKey="cost" name="cost now" radius={[4, 4, 0, 0]}>
              {costData.map((c, i) => (
                <Cell key={i} fill={c.color} fillOpacity={0.85} />
              ))}
            </Bar>
            {compare && (
              <Bar
                dataKey="prev"
                name="cost prior"
                fill={C.muted}
                fillOpacity={0.35}
                radius={[4, 4, 0, 0]}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
