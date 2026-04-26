import { C } from "../../constants/theme.js";

export function EmergingBadge({ style = {} }) {
  return (
    <span
      style={{
        fontSize: 10,
        background: `${C.accentB}22`,
        color: C.accentB,
        border: `1px solid ${C.accentB}55`,
        borderRadius: 3,
        padding: "1px 6px",
        fontFamily: "'IBM Plex Mono', monospace",
        letterSpacing: "0.05em",
        marginLeft: 6,
        ...style,
      }}
    >
      EMERGING ▲
    </span>
  );
}
