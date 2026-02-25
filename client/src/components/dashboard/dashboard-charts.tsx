import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import type { AnalysisResult } from "@shared/schema";
import { getTagColor } from "@/components/tag-badge";
import { chartTooltipStyle } from "@/components/dashboard/chartStyles";

interface DashboardChartsProps {
  data: AnalysisResult;
}

const ESTADO_COLORS: Record<string, string> = {
  ANSWER: "hsl(145, 65%, 42%)",
  "NO ANSWER": "hsl(210, 10%, 55%)",
  BUSY: "hsl(45, 93%, 47%)",
  REJECTED: "hsl(0, 72%, 51%)",
  UNALLOCATED: "hsl(0, 72%, 40%)",
};

export function EstadoDistribucionChart({ data }: DashboardChartsProps) {
  const chartData = useMemo(() => {
    const total = Object.values(data.estadoDistribucion).reduce((a, b) => a + b, 0);
    return Object.entries(data.estadoDistribucion).map(([estado, cantidad]) => ({
      name: estado,
      value: cantidad,
      percentage: total > 0 ? ((cantidad / total) * 100).toFixed(1) : "0",
      color: ESTADO_COLORS[estado.toUpperCase()] || "hsl(var(--chart-1))",
    }));
  }, [data]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <span className="text-chart-3">*</span>
          Distribución de estados de llamada
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
                label={false}
                labelLine={false}
                stroke="none"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>

              <Tooltip
                contentStyle={chartTooltipStyle}
                labelStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(value: number, name: string) => [
                  value.toLocaleString("es-AR"),
                  name,
                ]}
              />

              <Legend
                verticalAlign="bottom"
                height={48}
                wrapperStyle={{ fontSize: "11px", color: "currentColor" }}
                formatter={(value, entry) => {
                  const pct = (entry as any)?.payload?.percentage;
                  return (
                    <span className="text-sm text-foreground">
                      {value} {pct ? `(${pct}%)` : ""}
                    </span>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function TagDistribucionChart({ data }: DashboardChartsProps) {
  const chartData = useMemo(() => {
    return Object.entries(data.tagDistribucion).map(([tag, cantidad]) => ({
      name: tag.replace(/_/g, " "),
      cantidad,
      fill: getTagColor(tag as any),
    }));
  }, [data]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <span className="text-chart-2">*</span>
          ANIs por TAG de depuración
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.08} />

              <XAxis
                type="number"
                tick={{ fill: "currentColor", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                className="text-muted-foreground"
              />

              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tick={{ fill: "currentColor", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                className="text-muted-foreground"
              />

              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(value: number) => [value.toLocaleString("es-AR"), "ANIs"]}
              />

              <Bar dataKey="cantidad" radius={[0, 4, 4, 0]} barSize={18}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function CurvaContactacionChart({ data }: DashboardChartsProps) {
  const chartData = useMemo(() => {
    return data.curvaContactacion.map((item) => ({
      intento: item.intento,
      cantidad: item.cantidad,
    }));
  }, [data]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <span className="text-chart-1">*</span>
          Estrategia de reintentos
        </CardTitle>
        <p className="text-xs text-muted-foreground">Intento del primer ANSWER-AGENT</p>
      </CardHeader>

      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.08} />

              <XAxis
                dataKey="intento"
                tick={{ fill: "currentColor", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                className="text-muted-foreground"
                label={{
                  value: "Intento del primer ANSWER-AGENT",
                  position: "insideBottom",
                  offset: -5,
                  style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
                }}
              />

              <YAxis
                tick={{ fill: "currentColor", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                className="text-muted-foreground"
              />

              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(value: number) => [value.toLocaleString("es-AR"), "ANIs"]}
              />

              <Bar
                dataKey="cantidad"
                fill="hsl(var(--chart-1))"
                radius={[4, 4, 0, 0]}
                label={{
                  position: "top",
                  fontSize: 10,
                  fill: "currentColor",
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function IntentosDistribucionChart({ data }: DashboardChartsProps) {
  const chartData = useMemo(() => {
    return data.intentosDistribucion.map((item) => ({
      ...item,
      label: `${item.cantidad.toLocaleString("es-AR")} (${item.porcentaje.toFixed(1)}%)`,
    }));
  }, [data]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <span className="text-chart-4">*</span>
          Distribución de intentos totales por ANI
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.08} />

              <XAxis
                dataKey="intentos"
                tick={{ fill: "currentColor", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                className="text-muted-foreground"
                label={{
                  value: "Intentos totales por ANI",
                  position: "insideBottom",
                  offset: -5,
                  style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
                }}
              />

              <YAxis
                tick={{ fill: "currentColor", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                className="text-muted-foreground"
                label={{
                  value: "Cantidad de ANIs",
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
                }}
              />

              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(value: number, _name: string, props: any) => [
                  `${value.toLocaleString("es-AR")} (${props?.payload?.porcentaje?.toFixed?.(1) ?? "0"}%)`,
                  "ANIs",
                ]}
              />

              <Bar dataKey="cantidad" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-2">
          Aquí vemos cuántos ANIs reciben 1, 2, 3... intentos en total.
        </p>
      </CardContent>
    </Card>
  );
}