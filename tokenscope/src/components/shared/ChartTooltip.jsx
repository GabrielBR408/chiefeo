import { C } from "../../constants/theme.js";
import { fmtTokens } from "../../lib/calculations.js";

// Recharts tooltip. Pass via <Tooltip content={<ChartTooltip />} />.
// `valueFormatter` is per-payload-entry; defaults to compact-token formatting
// for big numbers and pass-through for everything else.
export function ChartTooltip({ active, payload, label, valueFormatter }) {
  if (!active || !payload?.length) return null;
  const fmt = valueFormatter || ((v) =>
    typeof v === "number" && v > 999 ? fmtTokens(v) : String(v)
  );
  return (
    <div
      style={{
        background: C.cardAlt,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 13,
        boxShadow: "0 6px 20px rgba(0,0,0,0.45)",
      }}
    >
      <div
        style={{
          color: C.muted,
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 11,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {payload.map((p, i) => (
        <div
          key={i}
          style={{
            color: p.color || C.accent,
            fontFamily: "'IBM Plex Mono', monospace",
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span>{p.name}</span>
          <span>{fmt(p.value, p)}</span>
        </div>
      ))}
    </div>
  );
}
