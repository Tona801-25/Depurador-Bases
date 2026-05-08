import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  LabelList,
} from "recharts";
import {
  BarChart3,
  Clock,
  Filter,
  BookOpen,
  Scissors,
  Layers,
  Eye,
} from "lucide-react";
import type { AnalysisResult } from "@shared/schema";
import { getTagColor } from "@/components/tag-badge";
import {
  chartTooltipStyle,
  chartTooltipCursor,
} from "@/components/dashboard/chartStyles";

interface DashboardChartsProps {
  data: AnalysisResult;
}

interface DashboardTabsProps {
  activeTab: string;
  onTabChange: (value: string) => void;
}

const dashboardTabs = [
  { value: "visual", label: "Tablero visual", icon: Eye },
  { value: "turnos", label: "Turnos y prefijos", icon: Clock },
  { value: "prefijos-hora", label: "Prefijos por hora", icon: BarChart3 },
  { value: "depuracion", label: "Depuración sugerida", icon: Layers },
  { value: "filtro", label: "Filtro detallado", icon: Filter },
  { value: "catalogo", label: "Catálogo de prefijos", icon: BookOpen },
  { value: "simulador", label: "Simulador de cortes", icon: Scissors },
];

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

export function DashboardTabs({ activeTab, onTabChange }: DashboardTabsProps) {
  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
      <TabsList className="h-auto w-full flex-wrap gap-1.5 rounded-2xl border border-border/70 bg-secondary/40 p-1.5 shadow-inner backdrop-blur-md">
        {dashboardTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.value;

          return (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="
                relative flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium
                transition-all duration-300
                hover:bg-primary/10 hover:text-foreground
                data-[state=active]:scale-[1.02]
                data-[state=active]:bg-gradient-to-br
                data-[state=active]:from-primary
                data-[state=active]:to-primary/80
                data-[state=active]:text-primary-foreground
                data-[state=active]:shadow-[0_4px_20px_-4px_hsl(var(--primary)/0.5)]
              "
            >
              <Icon
                className={`h-3.5 w-3.5 transition-transform duration-300 ${
                  isActive ? "scale-110" : ""
                }`}
              />

              {tab.label}

              {isActive && (
                <span className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 animate-pulse rounded-full bg-primary-foreground" />
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}

export function EstadoDistribucionChart({ data }: DashboardChartsProps) {
  const chartData = useMemo(() => {
    const total = Object.values(data.estadoDistribucion).reduce(
      (a, b) => a + b,
      0
    );

    return Object.entries(data.estadoDistribucion)
      .map(([estado, cantidad]) => ({
        name: estado,
        value: cantidad,
        percentage: total > 0 ? (cantidad / total) * 100 : 0,
        color: ESTADO_COLORS[estado.toUpperCase()] || "hsl(var(--chart-1))",
      }))
      .sort((a, b) => b.value - a.value);
  }, [data]);

  const renderLegend = (props: any) => (
    <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px]">
      {props.payload.map((entry: any, i: number) => {
        const payload = entry.payload;

        return (
          <li key={i} className="flex items-center gap-1.5 text-foreground/80">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: entry.color }}
            />

            <span className="font-medium tabular-nums">
              {entry.value}
              {typeof payload?.percentage === "number"
                ? ` (${payload.percentage.toFixed(1)}%)`
                : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="glass-card p-5 animate-slide-up hover-elevate">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-display font-semibold">
        <span className="dot-indicator bg-primary animate-pulse-glow" />
        Distribución de estados de llamada
      </h3>

      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={62}
            outerRadius={92}
            paddingAngle={3}
            dataKey="value"
            stroke="hsl(var(--card))"
            strokeWidth={2}
            animationDuration={900}
            animationBegin={100}
          >
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>

          <Tooltip
            contentStyle={chartTooltipStyle}
            formatter={(value: number, _name: string, props: any) => [
              `${formatNumber(value)} llamadas - ${props?.payload?.percentage?.toFixed(
                1
              )}%`,
              "",
            ]}
          />

          <Legend verticalAlign="bottom" content={renderLegend} />
        </PieChart>
      </ResponsiveContainer>
    </div>
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
    <div className="glass-card p-5 animate-slide-up hover-elevate">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-display font-semibold">
        <span className="dot-indicator bg-primary animate-pulse-glow" />
        Volumen por estado
      </h3>

      <p className="mb-4 text-xs text-muted-foreground">
        Permite detectar rápidamente dónde se concentra el mayor consumo.
      </p>

      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={chartData}
          margin={{ top: 24, right: 8, left: 0, bottom: 28 }}
        >
          <defs>
            <linearGradient id="estadoBarrasGrad" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="hsl(var(--primary))"
                stopOpacity={1}
              />
              <stop
                offset="100%"
                stopColor="hsl(var(--primary))"
                stopOpacity={0.45}
              />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="estado"
            angle={-18}
            textAnchor="end"
            height={52}
            tick={{
              fill: "currentColor",
              fontSize: 10,
              fontWeight: 600,
            }}
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
            cursor={chartTooltipCursor}
            formatter={(value: number) => [
              value.toLocaleString("es-AR"),
              "Llamadas",
            ]}
          />

          <Bar
            dataKey="cantidad"
            radius={[6, 6, 0, 0]}
            barSize={42}
            animationDuration={900}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={index}
                fill={entry.fill}
                fillOpacity={0.88}
              />
            ))}

            <LabelList
              dataKey="cantidad"
              position="top"
              className="fill-foreground"
              fontSize={11}
              fontWeight={600}
              formatter={(value: number) => value.toLocaleString("es-AR")}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TagDistribucionChart({ data }: DashboardChartsProps) {
  const chartData = useMemo(() => {
    return Object.entries(data.tagDistribucion)
      .map(([tag, cantidad]) => ({
        name: tag.replace(/_/g, " "),
        value: cantidad,
        color: getTagColor(tag as any),
      }))
      .sort((a, b) => b.value - a.value);
  }, [data]);

  return (
    <div className="glass-card p-5 animate-slide-up hover-elevate">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-display font-semibold">
        <span className="dot-indicator bg-success animate-pulse-glow" />
        ANIs por TAG de depuración
      </h3>

      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
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
            tick={{
              fill: "currentColor",
              fontSize: 10,
              fontWeight: 600,
            }}
            axisLine={false}
            tickLine={false}
            width={120}
            className="text-muted-foreground"
          />

          <Tooltip
            contentStyle={chartTooltipStyle}
            cursor={chartTooltipCursor}
            formatter={(value: number) => [
              value.toLocaleString("es-AR"),
              "ANIs",
            ]}
          />

          <Bar
            dataKey="value"
            radius={[0, 6, 6, 0]}
            barSize={20}
            animationDuration={900}
          >
            {chartData.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.color}
                fillOpacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
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
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
            >
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
                  `${formatNumber(value)} (${props?.payload?.pct?.toFixed(
                    1
                  )}%)`,
                  "Registros",
                ]}
              />
              <Bar
                dataKey="total"
                fill="hsl(var(--primary))"
                radius={[8, 8, 0, 0]}
              />
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
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
            >
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
                  `${formatNumber(value)} (${props?.payload?.pct?.toFixed(
                    1
                  )}%)`,
                  "ANSWER",
                ]}
              />
              <Bar
                dataKey="total"
                fill="hsl(var(--success))"
                radius={[8, 8, 0, 0]}
              />
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
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 0, bottom: 40 }}
            >
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
                  name === "pctAnswer"
                    ? `${value.toFixed(1)}%`
                    : formatNumber(value),
                  name,
                ]}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              <Bar
                dataKey="total"
                name="Total"
                fill="hsl(var(--chart-1))"
                radius={[6, 6, 0, 0]}
              />
              <Bar
                dataKey="answer"
                name="ANSWER"
                fill="hsl(var(--success))"
                radius={[6, 6, 0, 0]}
              />
              <Bar
                dataKey="noAnswer"
                name="NO ANSWER"
                fill="hsl(var(--muted-foreground))"
                radius={[6, 6, 0, 0]}
              />
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
      intento: String(item.intento),
      valor: item.cantidad,
    }));
  }, [data]);

  return (
    <div className="glass-card p-5 animate-slide-up hover-elevate">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-display font-semibold">
        <span className="dot-indicator bg-warning animate-pulse-glow" />
        Estrategia de reintentos
      </h3>

      <p className="mb-4 text-xs text-muted-foreground">
        Intento del primer ANSWER-AGENT
      </p>

      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} margin={{ top: 24 }}>
          <defs>
            <linearGradient id="retryGrad" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="hsl(var(--primary))"
                stopOpacity={1}
              />
              <stop
                offset="100%"
                stopColor="hsl(var(--primary))"
                stopOpacity={0.45}
              />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="intento"
            tick={{
              fill: "currentColor",
              fontSize: 11,
              fontWeight: 600,
            }}
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
            cursor={chartTooltipCursor}
            formatter={(value: number) => [
              value.toLocaleString("es-AR"),
              "ANIs",
            ]}
          />

          <Bar
            dataKey="valor"
            radius={[6, 6, 0, 0]}
            barSize={42}
            fill="url(#retryGrad)"
            animationDuration={900}
          >
            <LabelList
              dataKey="valor"
              position="top"
              className="fill-foreground"
              fontSize={11}
              fontWeight={600}
              formatter={(value: number) => value.toLocaleString("es-AR")}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function IntentosDistribucionChart({ data }: DashboardChartsProps) {
  const chartData = useMemo(() => {
    return data.intentosDistribucion.map((item) => ({
      intentos: String(item.intentos),
      cantidad: item.cantidad,
      porcentaje: item.porcentaje,
    }));
  }, [data]);

  return (
    <div className="glass-card p-5 animate-slide-up hover-elevate">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-display font-semibold">
        <span className="dot-indicator bg-destructive animate-pulse-glow" />
        Intentos totales por ANI
      </h3>

      <p className="mb-4 text-xs text-muted-foreground">
        Cuántos ANIs recibieron 1, 2, 3 o más intentos.
      </p>

      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} margin={{ top: 24, right: 8, left: 0 }}>
          <defs>
            <linearGradient id="intentosGrad" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="hsl(var(--destructive))"
                stopOpacity={1}
              />
              <stop
                offset="100%"
                stopColor="hsl(var(--destructive))"
                stopOpacity={0.45}
              />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="intentos"
            tick={{
              fill: "currentColor",
              fontSize: 11,
              fontWeight: 600,
            }}
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
            cursor={chartTooltipCursor}
            formatter={(value: number, _name: string, props: any) => [
              `${formatNumber(value)} ANIs - ${
                props?.payload?.porcentaje?.toFixed?.(1) ?? "0"
              }%`,
              "Cantidad",
            ]}
          />

          <Bar
            dataKey="cantidad"
            radius={[6, 6, 0, 0]}
            barSize={42}
            fill="url(#intentosGrad)"
            animationDuration={900}
          >
            <LabelList
              dataKey="cantidad"
              position="top"
              className="fill-foreground"
              fontSize={11}
              fontWeight={600}
              formatter={(value: number) => value.toLocaleString("es-AR")}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default DashboardTabs;