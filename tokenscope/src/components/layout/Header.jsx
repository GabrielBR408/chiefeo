import { C } from "../../constants/theme.js";
import { Mono } from "../shared/Mono.jsx";

const WIN_OPTIONS  = ["7d", "14d", "30d"];
const MODE_OPTIONS = [
  ["weighted", "⚡ Weighted"],
  ["compare",  "↔ vs Prior"],
];

function PillGroup({ value, onChange, options, activeColor, isMobile }) {
  return (
    <div
      style={{
        display: "flex",
        background: C.cardAlt,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {options.map((opt) => {
        const [k, label] = Array.isArray(opt) ? opt : [opt, opt];
        const active = value === k;
        const ac = typeof activeColor === "function" ? activeColor(k) : activeColor;
        return (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            style={{
              padding: isMobile ? "5px 10px" : "6px 14px",
              fontSize: isMobile ? 11 : 12,
              background: active ? `${ac}22` : "transparent",
              color:      active ? ac : C.muted,
              border: "none",
              fontFamily: "'IBM Plex Mono', monospace",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function Header({
  isMobile,
  windowSel, onWindowChange,
  mode, onModeChange,
  user, onSignOut,
}) {
  return (
    <div
      style={{
        background: C.card,
        borderBottom: `1px solid ${C.border}`,
        padding: isMobile ? "14px 16px" : "14px 36px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 30, height: 30,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            background: `${C.accent}22`,
            border: `1px solid ${C.accent}44`,
          }}
        >
          ◈
        </div>
        <div>
          <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 700 }}>
            TokenScope
          </div>
          {!isMobile && (
            <div
              style={{
                fontSize: 11,
                color: C.muted,
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            >
              claude usage intelligence
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <PillGroup
          value={windowSel}
          onChange={onWindowChange}
          options={WIN_OPTIONS}
          activeColor={C.accent}
          isMobile={isMobile}
        />
        <PillGroup
          value={mode}
          onChange={onModeChange}
          options={MODE_OPTIONS}
          activeColor={(k) => (k === "compare" ? C.accentB : C.accent)}
          isMobile={isMobile}
        />
      </div>

      {!isMobile && user && (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                width: 8, height: 8,
                borderRadius: "50%",
                background: C.green,
                boxShadow: `0 0 8px ${C.green}`,
              }}
            />
            <Mono style={{ fontSize: 12, color: C.muted }}>
              {user.email?.split("@")[0] ?? "signed in"}
            </Mono>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            style={{
              fontSize: 11,
              padding: "5px 10px",
              background: "transparent",
              color: C.muted,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          >
            sign out
          </button>
        </div>
      )}
    </div>
  );
}
