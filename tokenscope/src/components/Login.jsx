import { useState } from "react";
import { C } from "../constants/theme.js";
import { Mono } from "./shared/Mono.jsx";

export function Login({ onSubmit }) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(email, password);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: C.bg,
        padding: 24,
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: "100%",
          maxWidth: 360,
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 28,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32, height: 32,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              background: `${C.accent}22`,
              border: `1px solid ${C.accent}44`,
              color: C.accent,
            }}
          >
            ◈
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>TokenScope</div>
            <Mono style={{ fontSize: 11, color: C.muted }}>sign in</Mono>
          </div>
        </div>

        <Field label="email">
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
        </Field>

        <Field label="password">
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
        </Field>

        {error && (
          <div
            style={{
              fontSize: 12,
              color: C.red,
              fontFamily: "'IBM Plex Mono', monospace",
              padding: "8px 10px",
              background: `${C.red}11`,
              border: `1px solid ${C.red}33`,
              borderRadius: 6,
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{
            background: C.accent,
            color: C.bg,
            border: "none",
            borderRadius: 8,
            padding: "10px 14px",
            fontFamily: "'IBM Plex Mono', monospace",
            fontWeight: 600,
            fontSize: 13,
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "signing in…" : "sign in"}
        </button>

        <Mono style={{ fontSize: 11, color: C.muted, textAlign: "center" }}>
          single-user phase 1 — create your account in Supabase Auth
        </Mono>
      </form>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  background: C.cardAlt,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: "8px 10px",
  color: C.text,
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 13,
  outline: "none",
};

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          color: C.muted,
          fontFamily: "'IBM Plex Mono', monospace",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
