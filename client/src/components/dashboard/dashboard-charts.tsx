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
      color: ESTADO_COLORS[estado.toUpperCase()] || "hsl(207, 90%, 54%)",
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
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.5rem",
                }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(value: number, name: string) => [
                  value.toLocaleString("es-AR"),
                  name,
                ]}
              />
              <Legend
                verticalAlign="bottom"
                height={48}
                formatter={(value, entry) => {
                  const pct = (entry as { payload?: { percentage?: string } })?.payload
                    ?.percentage;
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
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis type="number" />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.5rem",
                }}
                formatter={(value: number) => [
                  value.toLocaleString("es-AR"),
                  "ANIs",
                ]}
              />
              <Bar dataKey="cantidad" radius={[0, 4, 4, 0]}>
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