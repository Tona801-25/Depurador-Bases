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
  chartTooltipStyle,
  chartTooltipCursor,
} from "@/components/dashboard/chartStyles";

interface HourlyAreaChartProps {
  data: AnalysisResult;
}

function parseDateValue(value?: unknown): Date | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    if (value > 20000) {
      const ms = (value - 25569) * 86400 * 1000;
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    return null;
  }

  const text = String(value).trim();

  if (!text) return null;

  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text);

    if (Number.isFinite(serial) && serial > 20000) {
      const ms = (serial - 25569) * 86400 * 1000;
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }

  const isoDate = new Date(text);

  if (!Number.isNaN(isoDate.getTime())) return isoDate;

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

  const d = new Date(year, month - 1, day, hour, minute, second);

  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeEstado(value?: string) {
  return String(value || "")
    .toUpperCase()
    .trim();
}

function normalizeSubestado(value?: string) {
  return String(value || "")
    .toUpperCase()
    .trim();
}

function isContactoEfectivo(record: AnalysisResult["rawRecords"][number]) {
  const estado = normalizeEstado(record.estado);
  const subestado = normalizeSubestado(record.subestado);

  return estado === "ANSWER" && subestado.includes("AGENT");
}

const HourlyAreaChart = ({ data }: HourlyAreaChartProps) => {
  const chartData = useMemo(() => {
    const hourlyMap = new Map<
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

      if (!hourlyMap.has(hour)) {
        hourlyMap.set(hour, {
          hora: String(hour).padStart(2, "0"),
          llamadas: 0,
          contactos: 0,
        });
      }

      const current = hourlyMap.get(hour)!;

      current.llamadas += 1;

      if (isContactoEfectivo(record)) {
        current.contactos += 1;
      }
    }

    return Array.from(hourlyMap.values()).sort(
      (a, b) => Number(a.hora) - Number(b.hora)
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
          No hay datos horarios disponibles para mostrar.
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
            <linearGradient id="gradLlamadas" x1="0" y1="0" x2="0" y2="1">
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

            <linearGradient id="gradContactos" x1="0" y1="0" x2="0" y2="1">
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
              name === "llamadas" ? "Llamadas" : "Contactos efectivos",
            ]}
            labelFormatter={(label) => `Hora ${label}:00`}
          />

          <Area
            type="monotone"
            dataKey="llamadas"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            fill="url(#gradLlamadas)"
            animationDuration={900}
          />

          <Area
            type="monotone"
            dataKey="contactos"
            stroke="hsl(var(--success))"
            strokeWidth={2}
            fill="url(#gradContactos)"
            animationDuration={1100}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default HourlyAreaChart;