// Colors and tag palette. Imported everywhere — keep this file as the only
// source of truth for the dark amber/teal aesthetic.

export const C = {
  bg:         "#07090f",
  card:       "#0e1119",
  cardAlt:    "#0a0d16",
  border:     "#1a2035",
  accent:     "#f5a623",  // amber — primary metric
  accentB:    "#3ecfcf",  // teal — secondary / compare
  accentC:    "#c084fc",  // purple — tertiary
  accentD:    "#f87171",  // red — alerts / negative
  text:       "#e8eaf0",
  muted:      "#4b5675",
  mutedLight: "#7a88a8",
  green:      "#34d399",
  red:        "#f87171",
};

// Stable per-tag colors. Falls back to a hashed pick from PALETTE for unknown
// tags so brand-new tags still get a consistent (but not collision-free) color.
const SEED_TAG_COLORS = {
  "cam-rec":       C.accent,
  "code-projects": C.accentB,
  "gl-variance":   C.accentC,
  "owner-report":  "#fb923c",
  "cheat-sheet":   C.green,
  "expense-report":"#a3e635",
  "chat":          "#f472b6",
  "smoke-test":    C.muted,
};

const PALETTE = [
  C.accent, C.accentB, C.accentC, "#fb923c", C.green,
  "#f472b6", "#a3e635", "#60a5fa", "#facc15", "#f87171",
];

export function tagColor(name) {
  if (SEED_TAG_COLORS[name]) return SEED_TAG_COLORS[name];
  if (!name) return C.muted;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

// 7-day exponential decay weights, day 0 = today. Used by both the data hook
// (for the recency-weighted summary numbers) and any chart that wants to draw
// the weight curve.
export const WEIGHTS = [1.00, 0.85, 0.72, 0.61, 0.52, 0.40, 0.30];

export const TAB_DEFS = [
  { key: "overview", label: "Overview", icon: "◈" },
  { key: "by-tag",   label: "By Tag",   icon: "⊞" },
  { key: "models",   label: "Models",   icon: "◉" },
  { key: "log",      label: "Log",      icon: "≡" },
];

export const MOBILE_BREAKPOINT = 700;
