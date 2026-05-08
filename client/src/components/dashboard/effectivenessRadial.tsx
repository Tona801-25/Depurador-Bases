import {
  RadialBarChart,
  RadialBar,
  ResponsiveContainer,
  PolarAngleAxis,
} from "recharts";
import type { AnalysisResult } from "@shared/schema";

interface EffectivenessRadialProps {
  data: AnalysisResult;
}

function getEstadoValue(
  estadoDistribucion: Record<string, number>,
  estadoBuscado: string
) {
  return Object.entries(estadoDistribucion).reduce((acc, [estado, cantidad]) => {
    return estado.toUpperCase() === estadoBuscado.toUpperCase()
      ? acc + cantidad
      : acc;
  }, 0);
}

function formatPercentage(value: number) {
  if (!Number.isFinite(value)) return "0.0";
  return value.toFixed(1);
}

const Ring = ({ value, color }: { value: number; color: string }) => (
  <ResponsiveContainer width="100%" height={140}>
    <RadialBarChart
      innerRadius="72%"
      outerRadius="100%"
      data={[{ value }]}
      startAngle={90}
      endAngle={-270}
    >
      <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />

      <RadialBar
        dataKey="value"
        cornerRadius={10}
        fill={color}
        background={{ fill: "hsl(var(--secondary))" }}
      />
    </RadialBarChart>
  </ResponsiveContainer>
);

const EffectivenessRadial = ({ data }: EffectivenessRadialProps) => {
  const total = Object.values(data.estadoDistribucion || {}).reduce(
    (acc, value) => acc + value,
    0
  );

  const answer = getEstadoValue(data.estadoDistribucion || {}, "ANSWER");
  const noAnswer = getEstadoValue(data.estadoDistribucion || {}, "NO ANSWER");

  const otros = Math.max(total - answer - noAnswer, 0);

  const contactacion = total > 0 ? (answer / total) * 100 : 0;
  const noContactacion = total > 0 ? (noAnswer / total) * 100 : 0;
  const otrosEstados = total > 0 ? (otros / total) * 100 : 0;

  const metrics = [
    {
      name: "Contactación",
      value: contactacion,
      detail: `${answer.toLocaleString("es-AR")} ANSWER`,
      color: "hsl(var(--success))",
    },
    {
      name: "No contactados",
      value: noContactacion,
      detail: `${noAnswer.toLocaleString("es-AR")} NO ANSWER`,
      color: "hsl(var(--primary))",
    },
    {
      name: "Otros estados",
      value: otrosEstados,
      detail: `${otros.toLocaleString("es-AR")} registros`,
      color: "hsl(var(--warning))",
    },
  ];

  return (
    <div className="glass-card p-5 animate-slide-up hover-elevate">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-display font-semibold">
        <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
        Tasas clave de la base
      </h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div
            key={metric.name}
            className="soft-cyan-hover rounded-xl border border-border bg-secondary/30 p-3 text-center"
          >
            <div className="relative mx-auto h-[140px]">
              <Ring value={metric.value} color={metric.color} />

              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span
                  className="text-xl font-display font-extrabold tabular-nums"
                  style={{ color: metric.color }}
                >
                  {formatPercentage(metric.value)}%
                </span>
              </div>
            </div>

            <span className="mt-1 block text-xs font-semibold text-foreground">
              {metric.name}
            </span>

            <span className="mt-1 block text-[11px] text-muted-foreground">
              {metric.detail}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EffectivenessRadial;