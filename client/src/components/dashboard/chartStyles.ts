import type { CSSProperties } from "react";

export const chartTooltipStyle: CSSProperties = {
  backgroundColor: "hsl(var(--card) / 0.95)",
  border: "1px solid hsl(var(--primary) / 0.3)",
  borderRadius: "12px",
  color: "hsl(var(--foreground))",
  fontSize: "12px",
  fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
  fontWeight: 500,
  boxShadow: "0 12px 40px hsl(var(--glow-primary)), 0 0 0 1px hsl(var(--primary) / 0.1)",
  backdropFilter: "blur(12px)",
  padding: "10px 14px",
  animation: "fade-in 0.2s ease-out",
};

export const chartTooltipCursor = {
  fill: "hsl(var(--primary) / 0.06)",
  radius: 6,
};

// Definiciones SVG reutilizables — pegar dentro de cada <BarChart> como primer hijo:
// <defs>
//   <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
//     <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={1} />
//     <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.55} />
//   </linearGradient>
// </defs>