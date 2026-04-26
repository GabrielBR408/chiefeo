import { C } from "../../constants/theme.js";

export function SectionLabel({ children, style = {} }) {
  return (
    <div
      style={{
        fontSize: 10,
        letterSpacing: "0.15em",
        textTransform: "uppercase",
        color: C.muted,
        fontFamily: "'IBM Plex Mono', monospace",
        marginBottom: 8,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
