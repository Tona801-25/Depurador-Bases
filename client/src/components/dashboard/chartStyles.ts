import type { CSSProperties } from "react";

export const chartTooltipStyle: CSSProperties = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--glass-border))",
  borderRadius: "12px",
  color: "hsl(var(--foreground))",
  fontSize: "12px",
  fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
  boxShadow: "0 8px 32px hsl(var(--glow-primary))",
  backdropFilter: "blur(8px)",
  padding: "8px 12px",
};