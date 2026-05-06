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
  LineChart,
  Line,
} from "recharts";
import type { AnalysisResult } from "@shared/schema";
import { getTagColor } from "@/components/tag-badge";
import { chartTooltipStyle } from "@/components/dashboard/chartStyles";

interface DashboardChartsProps {
  data: AnalysisResult;
}

const ESTADO_COLORS: Record<string, string> = {
  ANSWER: "hsl(var(--success))",
  "NO ANSWER": "hsl(var(--muted-foreground))",
  BUSY: "hsl(var(--warning))",
  REJECTED: "hsl(var(--destructive))",
  UNALLOCATED: "hsl(var(--chart-5))",
};

function formatNumber(value: number) {
  return value.toLocaleString("es-AR");
}

export function EstadoDistribucionChart({ data }: DashboardChartsProps) {
  const chartData = useMemo(() => {
    const total = Object.values(data.estadoDistribucion).reduce((a, b) => a + b, 0);

    return Object.entries(data.estadoDistribucion)
      .map(([estado, cantidad]) => ({
        name: estado,
        value: cantidad,
        percentage: total > 0 ? (cantidad / total) * 100 : 0,
        color: ESTADO_COLORS[estado.toUpperCase()] || "hsl(var(--chart-1))",
      }))
      .sort((a, b) => b.value - a.value);
  }, [data]);

  return (
    <Card className="glass-card border-glass-border">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-display font-bold">
          <span className="dot-indicator bg-success" />
          Estados de llamada
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Distribución general del resultado de las llamadas.
        </p>
      </CardHeader>

      <CardContent>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="46%"
                innerRadius={65}
                outerRadius={105}
                paddingAngle={3}
                dataKey="value"
                stroke="none"
              >
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>

              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(value: number, name: string, props: any) => [
                  `${formatNumber(value)} (${props?.payload?.percentage?.toFixed(1)}%)`,
                  name,
                ]}
              />

              <Legend
                verticalAlign="bottom"
                height={64}
                wrapperStyle={{ fontSize: "11px" }}
                formatter={(value, entry) => {
                  const pct = (entry as any)?.payload?.percentage;
                  return (
                    <span className="text-xs font-display text-foreground">
                      {value} {pct ? `(${pct.toFixed(1)}%)` : ""}
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

export function EstadoBarrasChart({ data }: DashboardChartsProps) {
  const chartData = useMemo(() => {
    return Object.entries(data.estadoDistribucion)
      .map(([estado, cantidad]) => ({
        estado,
        cantidad,
        fill: ESTADO_COLORS[estado.toUpperCase()] || "hsl(var(--chart-1))",
      }))
      .sort((a, b) => b.cantidad - a.cantidad);
  }, [data]);

  return (
    <Card className="glass-card border-glass-border">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-display font-bold">
          <span className="dot-indicator bg-primary" />
          Volumen por estado
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Permite detectar rápidamente dónde se concentra el mayor consumo.
        </p>
      </CardHeader>

      <CardContent>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
              <XAxis
                dataKey="estado"
                angle={-25}
                textAnchor="end"
                height={70}
                tick={{ fill: "currentColor", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "currentColor", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(value: number) => [formatNumber(value), "Llamadas"]}
              />
              <Bar dataKey="cantidad" radius={[8, 8, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function TagDistribucionChart({ data }: DashboardChartsProps) {
  const chartData = useMemo(() => {
    return Object.entries(data.tagDistribucion)
      .map(([tag, cantidad]) => ({
        name: tag.replace(/_/g, " "),
        cantidad,
        fill: getTagColor(tag as any),
      }))
      .sort((a, b) => b.cantidad - a.cantidad);
  }, [data]);

  return (
    <Card className="glass-card border-glass-border">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-display font-bold">
          <span className="dot-indicator bg-warning" />
          ANIs por TAG de depuración
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Clasificación operativa para decidir qué seguir llamando y qué depurar.
        </p>
      </CardHeader>

      <CardContent>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 25, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
              <XAxis
                type="number"
                tick={{ fill: "currentColor", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={130}
                tick={{ fill: "currentColor", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(value: number) => [formatNumber(value), "ANIs"]}
              />
              <Bar dataKey="cantidad" radius={[0, 8, 8, 0]} barSize={18}>
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function PrefijosTopChart({ data }: DashboardChartsProps) {
  const chartData = useMemo(() => {
    return [...data.prefijoDistribucion]
      .sort((a, b) => b.total - a.total)
      .slice(0, 12)
      .map((item) => ({
        prefijo: item.prefijo,
        total: item.total,
        pct: item.pctSobreTotal,
      }));
  }, [data]);

  return (
    <Card className="glass-card border-glass-border">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-display font-bold">
          <span className="dot-indicator bg-primary" />
          Top prefijos por volumen
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Muestra dónde está concentrada la base por zona/prefijo.
        </p>
      </CardHeader>

      <CardContent>
        <div className="h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
              <XAxis
                dataKey="prefijo"
                tick={{ fill: "currentColor", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "currentColor", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(value: number, _name: string, props: any) => [
                  `${formatNumber(value)} (${props?.payload?.pct?.toFixed(1)}%)`,
                  "Registros",
                ]}
              />
              <Bar dataKey="total" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function PrefijosAnswerChart({ data }: DashboardChartsProps) {
  const chartData = useMemo(() => {
    return [...data.prefijoDistribucionAnswer]
      .sort((a, b) => b.total - a.total)
      .slice(0, 12)
      .map((item) => ({
        prefijo: item.prefijo,
        total: item.total,
        pct: item.pctSobreTotal,
      }));
  }, [data]);

  return (
    <Card className="glass-card border-glass-border">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-display font-bold">
          <span className="dot-indicator bg-success" />
          Top prefijos con ANSWER
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Prioriza las zonas con mayor respuesta efectiva.
        </p>
      </CardHeader>

      <CardContent>
        <div className="h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
              <XAxis
                dataKey="prefijo"
                tick={{ fill: "currentColor", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "currentColor", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(value: number, _name: string, props: any) => [
                  `${formatNumber(value)} (${props?.payload?.pct?.toFixed(1)}%)`,
                  "ANSWER",
                ]}
              />
              <Bar dataKey="total" fill="hsl(var(--success))" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function HorariosPerformanceChart({ data }: DashboardChartsProps) {
  const chartData = useMemo(() => {
    return Object.entries(data.rangoDistribucion || {}).map(([rango, item]) => ({
      rango,
      total: item.total,
      answer: item.answer,
      noAnswer: item.noAnswer,
      pctAnswer: item.total > 0 ? (item.answer / item.total) * 100 : 0,
    }));
  }, [data]);

  return (
    <Card className="glass-card border-glass-border lg:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-display font-bold">
          <span className="dot-indicator bg-warning" />
          Performance por horario
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Compara volumen total, ANSWER y NO ANSWER por franja horaria.
        </p>
      </CardHeader>

      <CardContent>
        <div className="h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
              <XAxis
                dataKey="rango"
                angle={-25}
                textAnchor="end"
                height={70}
                tick={{ fill: "currentColor", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "currentColor", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(value: number, name: string) => [
                  name === "pctAnswer" ? `${value.toFixed(1)}%` : formatNumber(value),
                  name,
                ]}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              <Bar dataKey="total" name="Total" fill="hsl(var(--chart-1))" radius={[6, 6, 0, 0]} />
              <Bar dataKey="answer" name="ANSWER" fill="hsl(var(--success))" radius={[6, 6, 0, 0]} />
              <Bar dataKey="noAnswer" name="NO ANSWER" fill="hsl(var(--muted-foreground))" radius={[6, 6, 0, 0]} />
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
    <Card className="glass-card border-glass-border">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-display font-bold">
          <span className="dot-indicator bg-primary" />
          Curva de contactación
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Indica en qué intento aparece el primer ANSWER-AGENT.
        </p>
      </CardHeader>

      <CardContent>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
              <XAxis
                dataKey="intento"
                tick={{ fill: "currentColor", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "currentColor", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(value: number) => [formatNumber(value), "ANIs"]}
              />
              <Line
                type="monotone"
                dataKey="cantidad"
                stroke="hsl(var(--primary))"
                strokeWidth={3}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
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
      label: `${formatNumber(item.cantidad)} (${item.porcentaje.toFixed(1)}%)`,
    }));
  }, [data]);

  return (
    <Card className="glass-card border-glass-border">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-display font-bold">
          <span className="dot-indicator bg-destructive" />
          Intentos totales por ANI
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Ayuda a detectar saturación y exceso de reintentos.
        </p>
      </CardHeader>

      <CardContent>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
              <XAxis
                dataKey="intentos"
                tick={{ fill: "currentColor", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "currentColor", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(value: number, _name: string, props: any) => [
                  `${formatNumber(value)} (${props?.payload?.porcentaje?.toFixed?.(1) ?? "0"}%)`,
                  "ANIs",
                ]}
              />
              <Bar dataKey="cantidad" fill="hsl(var(--destructive))" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          Cuántos ANIs recibieron 1, 2, 3 o más intentos.
        </p>
      </CardContent>
    </Card>
  );
}