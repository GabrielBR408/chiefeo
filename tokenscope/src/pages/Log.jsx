import { useMemo, useState } from "react";
import { C } from "../constants/theme.js";
import { fmtCost, fmtMs, fmtTime, fmtTokens } from "../lib/calculations.js";
import { Mono } from "../components/shared/Mono.jsx";
import { SectionLabel } from "../components/shared/SectionLabel.jsx";
import { TagBadge } from "../components/shared/TagBadge.jsx";
import { EmptyState } from "../components/shared/EmptyState.jsx";

const PAGE_SIZE = 50;

export function Log({ data, isMobile }) {
  const all = data.now.recentCalls || [];
  const [tagFilter,   setTagFilter]   = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [page,        setPage]        = useState(0);

  const tags   = useMemo(() => ["all", ...new Set(all.map((r) => r.tag))],   [all]);
  const models = useMemo(() => ["all", ...new Set(all.map((r) => r.model))], [all]);

  const filtered = useMemo(() => all.filter((r) =>
    (tagFilter   === "all" || r.tag   === tagFilter) &&
    (modelFilter === "all" || r.model === modelFilter)
  ), [all, tagFilter, modelFilter]);

  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  if (!all.length) {
    return (
      <EmptyState
        title="Log is empty for this window"
        body="As the wrapper inserts rows, calls show up here in reverse chronological order."
      />
    );
  }

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "16px 20px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <SectionLabel style={{ marginBottom: 0 }}>Recent API Calls</SectionLabel>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <FilterSelect label="tag"   value={tagFilter}   onChange={(v) => { setTagFilter(v);   setPage(0); }} options={tags} />
          <FilterSelect label="model" value={modelFilter} onChange={(v) => { setModelFilter(v); setPage(0); }} options={models} />
          <Mono style={{ fontSize: 11, color: C.muted }}>
            {filtered.length} of {all.length}
          </Mono>
        </div>
      </div>

      {isMobile ? (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {pageRows.map((r, i) => (
            <div
              key={r.id || i}
              style={{
                padding: "14px 18px",
                borderBottom: `1px solid ${C.border}55`,
                background: i % 2 === 0 ? "transparent" : C.cardAlt,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 8,
                  alignItems: "center",
                }}
              >
                <TagBadge name={r.tag} />
                <Mono style={{ fontSize: 12, color: C.muted }}>{fmtTime(r.time)}</Mono>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 8,
                }}
              >
                {[
                  ["model", r.model.replace(/^claude-/, "")],
                  ["in",    fmtTokens(r.in)],
                  ["out",   fmtTokens(r.out)],
                  ["cost",  fmtCost(r.cost)],
                ].map(([l, v]) => (
                  <div key={l}>
                    <div
                      style={{
                        fontSize: 9,
                        color: C.muted,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        fontFamily: "'IBM Plex Mono', monospace",
                      }}
                    >
                      {l}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontFamily: "'IBM Plex Mono', monospace",
                        color: C.text,
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={String(v)}
                    >
                      {v}
                    </div>
                  </div>
                ))}
              </div>
              <Mono style={{ fontSize: 11, color: C.mutedLight, marginTop: 6, display: "block" }}>
                latency {fmtMs(r.ms)}
                {r.cacheR ? ` · cache ${fmtTokens(r.cacheR)}` : ""}
              </Mono>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["Time", "Tag", "Model", "Input", "Output", "Cache R", "Cost", "Latency"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 16px",
                      textAlign: "left",
                      fontSize: 10,
                      color: C.muted,
                      fontFamily: "'IBM Plex Mono', monospace",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, i) => (
                <tr
                  key={r.id || i}
                  style={{
                    borderBottom: `1px solid ${C.border}55`,
                    background: i % 2 === 0 ? "transparent" : C.cardAlt,
                  }}
                >
                  <td style={{ padding: "12px 16px" }}>
                    <Mono style={{ fontSize: 13, color: C.muted }}>{fmtTime(r.time)}</Mono>
                  </td>
                  <td style={{ padding: "12px 16px" }}><TagBadge name={r.tag} /></td>
                  <td style={{ padding: "12px 16px" }}>
                    <Mono style={{ fontSize: 13 }}>{r.model.replace(/^claude-/, "")}</Mono>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <Mono style={{ fontSize: 13, color: C.accent }}>{fmtTokens(r.in)}</Mono>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <Mono style={{ fontSize: 13, color: C.accentB }}>{fmtTokens(r.out)}</Mono>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <Mono style={{ fontSize: 13, color: C.mutedLight }}>
                      {r.cacheR ? fmtTokens(r.cacheR) : "—"}
                    </Mono>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <Mono style={{ fontSize: 13, color: "#fbbf24" }}>{fmtCost(r.cost)}</Mono>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <Mono style={{ fontSize: 13 }}>{fmtMs(r.ms)}</Mono>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <div
          style={{
            padding: "12px 20px",
            borderTop: `1px solid ${C.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <PageButton disabled={page === 0} onClick={() => setPage(page - 1)}>
            ← prev
          </PageButton>
          <Mono style={{ fontSize: 11, color: C.muted }}>
            page {page + 1} of {pageCount}
          </Mono>
          <PageButton
            disabled={page >= pageCount - 1}
            onClick={() => setPage(page + 1)}
          >
            next →
          </PageButton>
        </div>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: C.cardAlt,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        padding: "4px 8px",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11,
        color: C.muted,
      }}
    >
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: "transparent",
          color: C.text,
          border: "none",
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 12,
          outline: "none",
        }}
      >
        {options.map((o) => (
          <option key={o} value={o} style={{ background: C.card, color: C.text }}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function PageButton({ children, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        background: "transparent",
        border: `1px solid ${C.border}`,
        color: disabled ? C.muted : C.text,
        opacity: disabled ? 0.5 : 1,
        borderRadius: 6,
        padding: "5px 12px",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11,
      }}
    >
      {children}
    </button>
  );
}
