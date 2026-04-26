import { C } from "../../constants/theme.js";
import { Mono } from "./Mono.jsx";

export function LoadingPanel({ label = "loading" }) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "40px 24px",
        textAlign: "center",
        color: C.mutedLight,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div
        style={{
          width: 28, height: 28,
          borderRadius: "50%",
          border: `2px solid ${C.border}`,
          borderTopColor: C.accent,
          animation: "tk-spin 0.7s linear infinite",
        }}
      />
      <Mono style={{ fontSize: 11, color: C.muted, letterSpacing: "0.1em" }}>
        {label}…
      </Mono>
      <style>{`@keyframes tk-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
