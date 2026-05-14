import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { AnalysisResult } from "@shared/schema";
import {
  chartTooltipCursor,
  chartTooltipStyle,
} from "@/components/dashboard/chartStyles";

interface HourlyAreaChartProps {
  data: AnalysisResult;
}

function parseDateValue(value?: unknown): Date | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    if (value > 20000) {
      const ms = (value - 25569) * 86400 * 1000;
      const date = new Date(ms);

      return Number.isNaN(date.getTime()) ? null : date;
    }

    return null;
  }

  const text = String(value).trim();

  if (!text) return null;

  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text);

    if (Number.isFinite(serial) && serial > 20000) {
      const ms = (serial - 25569) * 86400 * 1000;
      const date = new Date(ms);

      return Number.isNaN(date.getTime()) ? null : date;
    }
  }

  const direct = new Date(text);

  if (!Number.isNaN(direct.getTime())) return direct;

  const [datePart, timePart] = text.split(" ");

  if (!datePart) return null;

  const separator = datePart.includes("-")
    ? "-"
    : datePart.includes("/")
      ? "/"
      : null;

  if (!separator) return null;

  const [dayText, monthText, yearText] = datePart.split(separator);

  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);

  let hour = 0;
  let minute = 0;
  let second = 0;

  if (timePart) {
    const timeParts = timePart.split(":").map(Number);

    hour = timeParts[0] ?? 0;
    minute = timeParts[1] ?? 0;
    second = timeParts[2] ?? 0;
  }

  if (![day, month, year, hour, minute, second].every(Number.isFinite)) {
    return null;
  }

  const date = new Date(year, month - 1, day, hour, minute, second);

  return Number.isNaN(date.getTime()) ? null : date;
}

function isContactoEfectivo(record: AnalysisResult["rawRecords"][number]) {
  const estado = String(record.estado || "").toUpperCase().trim();
  const subestado = String(record.subestado || "").toUpperCase().trim();

  return estado === "ANSWER" && subestado.includes("AGENT");
}

const HourlyAreaChart = ({ data }: HourlyAreaChartProps) => {
  const chartData = useMemo(() => {
    const hourMap = new Map<
      number,
      {
        hora: string;
        llamadas: number;
        contactos: number;
      }
    >();

    for (const record of data.rawRecords ?? []) {
      const date = parseDateValue(record.fecha);

      if (!date) continue;

      const hour = date.getHours();

      const current =
        hourMap.get(hour) ??
        {
          hora: String(hour).padStart(2, "0"),
          llamadas: 0,
          contactos: 0,
        };

      current.llamadas += 1;

      if (isContactoEfectivo(record)) {
        current.contactos += 1;
      }

      hourMap.set(hour, current);
    }

    return Array.from(hourMap.values()).sort((a, b) =>
      a.hora.localeCompare(b.hora)
    );
  }, [data.rawRecords]);

  if (chartData.length === 0) {
    return (
      <div className="glass-card p-5 animate-slide-up hover-elevate">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-display font-semibold">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
          Curva horaria de gestión
        </h3>

        <p className="py-8 text-center text-sm text-muted-foreground">
          No hay datos horarios suficientes para construir la curva.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card p-5 animate-slide-up hover-elevate">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-display font-semibold">
        <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
        Curva horaria de gestión
      </h3>

      <p className="mb-4 text-xs text-muted-foreground">
        Llamadas vs. contactos efectivos por hora.
      </p>

      <ResponsiveContainer width="100%" height={260}>
        <AreaChart
          data={chartData}
          margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
        >
          <defs>
            <linearGradient id="grad-llamadas" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="hsl(var(--primary))"
                stopOpacity={0.5}
              />
              <stop
                offset="100%"
                stopColor="hsl(var(--primary))"
                stopOpacity={0}
              />
            </linearGradient>

            <linearGradient id="grad-contactos" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="hsl(var(--success))"
                stopOpacity={0.55}
              />
              <stop
                offset="100%"
                stopColor="hsl(var(--success))"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" opacity={0.06} />

          <XAxis
            dataKey="hora"
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
            cursor={chartTooltipCursor}
            formatter={(value: number, name: string) => [
              value.toLocaleString("es-AR"),
              name === "llamadas" ? "Llamadas" : "Contactos",
            ]}
          />

          <Area
            type="monotone"
            dataKey="llamadas"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            fill="url(#grad-llamadas)"
            animationDuration={900}
          />

          <Area
            type="monotone"
            dataKey="contactos"
            stroke="hsl(var(--success))"
            strokeWidth={2}
            fill="url(#grad-contactos)"
            animationDuration={1100}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default HourlyAreaChart;