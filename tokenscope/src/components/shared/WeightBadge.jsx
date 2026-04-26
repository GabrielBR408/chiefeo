import { C } from "../../constants/theme.js";

export function WeightBadge() {
  return (
    <span
      style={{
        fontSize: 10,
        background: `${C.accent}22`,
        color: C.accent,
        border: `1px solid ${C.accent}44`,
        borderRadius: 3,
        padding: "1px 6px",
        fontFamily: "'IBM Plex Mono', monospace",
        letterSpacing: "0.05em",
      }}
    >
      ⚡ weighted
    </span>
  );
}
