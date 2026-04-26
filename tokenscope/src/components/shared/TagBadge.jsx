import { tagColor } from "../../constants/theme.js";

export function TagBadge({ name, style = {} }) {
  const c = tagColor(name);
  return (
    <span
      style={{
        background: `${c}22`,
        color: c,
        border: `1px solid ${c}55`,
        borderRadius: 4,
        padding: "3px 9px",
        fontSize: 12,
        fontFamily: "'IBM Plex Mono', monospace",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {name}
    </span>
  );
}
