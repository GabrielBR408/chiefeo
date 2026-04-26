export function Mono({ children, style = {} }) {
  return (
    <span style={{ fontFamily: "'IBM Plex Mono', monospace", ...style }}>
      {children}
    </span>
  );
}
