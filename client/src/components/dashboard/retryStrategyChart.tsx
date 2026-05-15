import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Cell,
  LabelList,
} from "recharts";
import { chartTooltipStyle } from "./chartStyles";

type RetryStrategyItem = {
  intento: number | string;
  cantidad?: number;
  valor?: number;
};

interface RetryStrategyChartProps {
  data?: RetryStrategyItem[];
}

const getColorByIndex = (index: number) => {
  const colors = [
    "hsl(185, 80%, 50%)",
    "hsl(185, 70%, 45%)",
    "hsl(185, 60%, 40%)",
    "hsl(185, 50%, 35%)",
    "hsl(185, 40%, 30%)",
    "hsl(185, 30%, 25%)",
  ];

  return colors[index] ?? "hsl(185, 25%, 22%)";
};

const RetryStrategyChart = ({ data = [] }: RetryStrategyChartProps) => {
  const chartData = useMemo(() => {
    return data
      .map((item, index) => ({
        intento: String(item.intento),
        valor: item.valor ?? item.cantidad ?? 0,
        color: getColorByIndex(index),
      }))
      .filter((item) => item.valor > 0);
  }, [data]);

  return (
    <div className="glass-card p-5 animate-slide-up">
      <h3 className="text-sm font-display font-semibold mb-1 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
        Estrategia de reintentos
      </h3>

      <p className="text-xs text-muted-foreground mb-4">
        Intento donde aparece el primer ANSWER-AGENT por ANI.
      </p>

      {chartData.length === 0 ? (
        <div className="flex h-[240px] items-center justify-center rounded-xl border border-border/40 bg-background/20 text-sm text-muted-foreground">
          No hay contactos ANSWER-AGENT suficientes para graficar reintentos.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 20 }}>
            <XAxis
              dataKey="intento"
              tick={{ fill: "currentColor", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              className="text-muted-foreground"
            />

            <YAxis
              tick={{ fill: "currentColor", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              className="text-muted-foreground"
            />

            <Tooltip
              contentStyle={chartTooltipStyle}
              formatter={(value: number) => [
                value.toLocaleString("es-AR"),
                "ANIs",
              ]}
              labelFormatter={(label) => `Intento ${label}`}
            />

            <Bar dataKey="valor" radius={[4, 4, 0, 0]} barSize={40}>
              {chartData.map((entry, i) => (
                <Cell key={`retry-cell-${entry.intento}-${i}`} fill={entry.color} />
              ))}

              <LabelList
                dataKey="valor"
                position="top"
                className="fill-foreground"
                fontSize={11}
                formatter={(value: number) => value.toLocaleString("es-AR")}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default RetryStrategyChart;