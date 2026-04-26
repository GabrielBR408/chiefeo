import { C, TAB_DEFS } from "../../constants/theme.js";

// Two render modes:
//  - desktop "top" → underline-style tabs in the chrome below the header
//  - mobile  "bottom" → fixed bottom bar with stacked icon + label
export function TabBar({ tab, onTabChange, variant }) {
  if (variant === "bottom") {
    return (
      <div
        style={{
          position: "fixed",
          bottom: 0, left: 0, right: 0,
          background: C.card,
          borderTop: `1px solid ${C.border}`,
          display: "flex",
          zIndex: 100,
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {TAB_DEFS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onTabChange(t.key)}
              style={{
                flex: 1,
                padding: "12px 0",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                background: "transparent",
                border: "none",
                color: active ? C.accent : C.muted,
                borderTop: active ? `2px solid ${C.accent}` : "2px solid transparent",
              }}
            >
              <span style={{ fontSize: 18 }}>{t.icon}</span>
              <span
                style={{
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
              >
                {t.label.toLowerCase()}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      style={{
        background: C.card,
        borderBottom: `1px solid ${C.border}`,
        padding: "0 36px",
        display: "flex",
        gap: 4,
      }}
    >
      {TAB_DEFS.map((t) => {
        const active = tab === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onTabChange(t.key)}
            style={{
              padding: "12px 20px",
              fontSize: 13,
              fontFamily: "'IBM Plex Mono', monospace",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              background: "transparent",
              border: "none",
              color: active ? C.accent : C.muted,
              borderBottom: active
                ? `2px solid ${C.accent}`
                : "2px solid transparent",
              transition: "all 0.15s",
            }}
          >
            {t.icon} {t.label.toLowerCase()}
          </button>
        );
      })}
    </div>
  );
}
