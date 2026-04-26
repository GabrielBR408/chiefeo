import { C } from "../../constants/theme.js";
import { calcDelta, pctFmt } from "../../lib/calculations.js";

// Renders ↑ / ↓ + percent change. `invert` means "down is good" (e.g. latency).
// When `then` is 0/null we render nothing — that case is owned by EmergingBadge.
export function DeltaBadge({ now, then, invert = false, fmt = pctFmt, style = {} }) {
  const d = calcDelta(now, then);
  if (d == null || !isFinite(d)) return null;
  const up = d >= 0;
  const positive = invert ? !up : up;
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        color: positive ? C.green : C.red,
        fontFamily: "'IBM Plex Mono', monospace",
        ...style,
      }}
    >
      {up ? "↑" : "↓"} {fmt(d)}
    </span>
  );
}
