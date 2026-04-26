import { C } from "../../constants/theme.js";
import { Mono } from "./Mono.jsx";

export function EmptyState({ title = "No data yet", body, accent = C.muted }) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px dashed ${C.border}`,
        borderRadius: 12,
        padding: "40px 24px",
        textAlign: "center",
        color: C.mutedLight,
      }}
    >
      <div
        style={{
          fontSize: 32,
          color: accent,
          marginBottom: 8,
          fontFamily: "'IBM Plex Mono', monospace",
        }}
      >
        ◌
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: C.text,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {body && (
        <Mono style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
          {body}
        </Mono>
      )}
    </div>
  );
}
