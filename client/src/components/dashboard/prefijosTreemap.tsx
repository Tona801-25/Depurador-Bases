import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { chartTooltipStyle } from "./chartStyles";

const data = [
  { name: "11", size: 28400, fill: "hsl(185, 80%, 50%)" },
  { name: "351", size: 14200, fill: "hsl(185, 70%, 45%)" },
  { name: "341", size: 11800, fill: "hsl(152, 60%, 45%)" },
  { name: "261", size: 9200, fill: "hsl(38, 92%, 50%)" },
  { name: "221", size: 7800, fill: "hsl(185, 60%, 40%)" },
  { name: "381", size: 5400, fill: "hsl(270, 60%, 55%)" },
  { name: "299", size: 3600, fill: "hsl(0, 72%, 51%)" },
  { name: "362", size: 2900, fill: "hsl(185, 55%, 35%)" },
  { name: "Otros", size: 4800, fill: "hsl(var(--muted-foreground))" },
];

const fmt = (n: number) => n.toLocaleString("es-AR");

interface CustomNodeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  size?: number;
  fill?: string;
}

const CustomNode = (props: CustomNodeProps) => {
  const { x = 0, y = 0, width = 0, height = 0, name = "", size = 0, fill = "" } = props;
  const showLabel = width > 50 && height > 30;
  const showValue = width > 80 && height > 50;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          fill,
          stroke: "hsl(var(--background))",
          strokeWidth: 2,
          cursor: "pointer",
          transition: "opacity 0.2s",
        }}
      />
      {showLabel && (
        <text
          x={x + 8}
          y={y + 18}
          fill="hsl(var(--background))"
          fontSize={12}
          fontWeight={700}
          fontFamily="Plus Jakarta Sans"
        >
          {name}
        </text>
      )}
      {showValue && (
        <text
          x={x + 8}
          y={y + 34}
          fill="hsl(var(--background))"
          fontSize={10}
          opacity={0.85}
          fontFamily="Inter"
        >
          {fmt(size)}
        </text>
      )}
    </g>
  );
};

const PrefijosTreemap = () => (
  <div className="glass-card p-5 animate-slide-up">
    <h3 className="text-sm font-display font-semibold mb-1 flex items-center gap-2">
      <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
      Treemap de prefijos
    </h3>
    <p className="text-xs text-muted-foreground mb-4">
      Volumen relativo de ANIs por prefijo
    </p>
    <ResponsiveContainer width="100%" height={320}>
      <Treemap
        data={data}
        dataKey="size"
        stroke="hsl(var(--background))"
        animationDuration={800}
        content={<CustomNode />}
      >
        <Tooltip
          contentStyle={chartTooltipStyle}
          formatter={(v: number) => [fmt(v), "ANIs"]}
        />
      </Treemap>
    </ResponsiveContainer>
  </div>
);

export default PrefijosTreemap;