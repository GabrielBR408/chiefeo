import { C } from "../../constants/theme.js";

const COMPARE_COPY = (win) =>
  `Comparing NOW (${win}) vs prior ${win} — deltas show workflow shifts. Tags with no prior history are flagged EMERGING.`;

const WEIGHTED_COPY =
  "Recency-weighted: recent days count up to ~3.3× more than 7 days ago — summary numbers reflect current trajectory, not flat averages.";

export function ModeBar({ mode, windowSel, isMobile }) {
  const isCompare = mode === "compare";
  const color = isCompare ? C.accentB : C.accent;
  return (
    <div
      style={{
        background: isCompare ? `${C.accentB}12` : `${C.accent}0e`,
        borderBottom: `1px solid ${color}33`,
        padding: isMobile ? "8px 16px" : "8px 36px",
        fontSize: 12,
        color,
        fontFamily: "'IBM Plex Mono', monospace",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span>{isCompare ? "↔" : "⚡"}</span>
      <span>{isCompare ? COMPARE_COPY(windowSel) : WEIGHTED_COPY}</span>
    </div>
  );
}
