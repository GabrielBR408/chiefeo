import { C } from "../../constants/theme.js";
import { Mono } from "./Mono.jsx";
import { SectionLabel } from "./SectionLabel.jsx";
import { DeltaBadge } from "./DeltaBadge.jsx";
import { WeightBadge } from "./WeightBadge.jsx";

// `mode` controls the secondary line: weighted shows the ⚡ badge, compare
// shows "prev <value>" plus a delta arrow. `accent` colors the top stripe and
// the headline number; `invert` flips the green/red logic for stats where
// going down is good (latency, error rate, output ratio in some cases).
export function StatCard({
  label,
  display,
  compareDisplay,
  nowVal,
  thenVal,
  mode,
  accent,
  invert = false,
  pctFmt,
}) {
  const isCompare = mode === "compare";
  const color     = accent || C.accent;
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "18px 20px",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minHeight: 110,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0, height: 2,
          background: color,
        }}
      />
      <SectionLabel>{label}</SectionLabel>
      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          color,
          fontFamily: "'IBM Plex Mono', monospace",
          lineHeight: 1,
        }}
      >
        {display}
      </div>
      {isCompare ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ fontSize: 12, color: C.mutedLight }}>
            <Mono style={{ color: C.muted }}>prev </Mono>
            {compareDisplay}
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
}
