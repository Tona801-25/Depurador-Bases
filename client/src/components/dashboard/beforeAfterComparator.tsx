import { useMemo, useState } from "react";
import {
  ArrowRight,
  Database,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { Slider } from "@/components/ui/slider";
import type { AnalysisResult } from "@shared/schema";
import {
  chartTooltipCursor,
  chartTooltipStyle,
} from "@/components/dashboard/chartStyles";

interface BeforeAfterComparatorProps {
  data: AnalysisResult;
}

interface SegmentoBase {
  name: string;
  value: number;
  color: string;
}

interface KPIProps {
  label: string;
  antes: number;
  despues: number;
  formatter: (value: number) => string;
  invert?: boolean;
}

const sum = (arr: { value: number }[]) =>
  arr.reduce((acc, item) => acc + item.value, 0);

function normalizeTag(tag?: string) {
  return String(tag || "").toUpperCase().trim();
}

function buildBaseAntes(data: AnalysisResult): SegmentoBase[] {
  const summaries = data.aniSummaries ?? [];

  let contactados = 0;
  let noAtiende = 0;
  let rechaza = 0;
  let invalidos = 0;
  let buzon = 0;
  let otros = 0;

  summaries.forEach((summary) => {
    const tag = normalizeTag(summary.tagTelefono);

    if (summary.intentosAnswerAgent > 0) {
      contactados += 1;
      return;
    }

    if (tag === "INVALIDO") {
      invalidos += 1;
      return;
    }

    if (tag === "SOLO_BUZON") {
      buzon += 1;
      return;
    }

    if (tag === "NO_ATIENDE") {
      noAtiende += 1;
      return;
    }

    if (tag === "RECHAZA") {
      rechaza += 1;
      return;
    }

    otros += 1;
  });

  return [
    {
      name: "Contactados",
      value: contactados,
      color: "hsl(var(--success))",
    },
    {
      name: "No atiende",
      value: noAtiende,
      color: "hsl(var(--warning))",
    },
    {
      name: "Rechaza",
      value: rechaza,
      color: "hsl(var(--chart-5))",
    },
    {
      name: "Inválidos",
      value: invalidos,
      color: "hsl(var(--destructive))",
    },
    {
      name: "Buzón",
      value: buzon,
      color: "hsl(var(--primary))",
    },
    {
      name: "Otros",
      value: otros,
      color: "hsl(var(--muted-foreground))",
    },
  ].filter((item) => item.value > 0);
}

function computeDespues(baseAntes: SegmentoBase[], intensidad: number) {
  const factor = intensidad / 100;

  return baseAntes
    .map((item) => {
      let remaining = item.value;

      if (item.name === "Inválidos") {
        remaining = Math.round(item.value * (1 - factor));
      }

      if (item.name === "Buzón") {
        remaining = Math.round(item.value * (1 - 0.65 * factor));
      }

      if (item.name === "No atiende") {
        remaining = Math.round(item.value * (1 - 0.45 * factor));
      }

      if (item.name === "Rechaza") {
        remaining = Math.round(item.value * (1 - 0.5 * factor));
      }

      return {
        ...item,
        value: Math.max(remaining, 0),
      };
    })
    .filter((item) => item.value > 0);
}

function getSegmentValue(data: SegmentoBase[], name: string) {
  return data.find((item) => item.name === name)?.value ?? 0;
}

const KPI = ({ label, antes, despues, formatter, invert }: KPIProps) => {
  const diff = despues - antes;
  const pct = antes === 0 ? 0 : (diff / antes) * 100;
  const positive = invert ? diff < 0 : diff > 0;

  return (
    <div className="soft-cyan-hover rounded-xl border border-border bg-secondary/40 p-3">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>

      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-lg font-display font-bold tabular-nums text-muted-foreground line-through opacity-60">
          {formatter(antes)}
        </span>

        <ArrowRight className="h-3 w-3 text-muted-foreground" />

        <span className="text-xl font-display font-extrabold tabular-nums text-foreground">
          {formatter(despues)}
        </span>
      </div>

      <div
        className={`mt-1 flex items-center gap-1 text-xs font-semibold ${
          positive ? "text-success" : "text-destructive"
        }`}
      >
        {positive ? (
          <TrendingUp className="h-3 w-3" />
        ) : (
          <TrendingDown className="h-3 w-3" />
        )}

        <span className="tabular-nums">
          {pct > 0 ? "+" : ""}
          {pct.toFixed(1)}%
        </span>
      </div>
    </div>
  );
};

const Donut = ({
  data,
  label,
  accent,
}: {
  data: SegmentoBase[];
  label: string;
  accent: React.ReactNode;
}) => {
  const total = sum(data);

  return (
    <div className="soft-cyan-hover rounded-xl border border-border bg-secondary/30 p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 text-sm font-display font-semibold">
          {accent}
          {label}
        </h4>

        <span className="text-xs tabular-nums text-muted-foreground">
          {total.toLocaleString("es-AR")} ANIs
        </span>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            innerRadius={45}
            outerRadius={75}
            paddingAngle={2}
            animationDuration={700}
          >
            {data.map((item, index) => (
              <Cell
                key={`${item.name}-${index}`}
                fill={item.color}
                stroke="hsl(var(--background))"
                strokeWidth={2}
              />
            ))}
          </Pie>

          <Tooltip
            contentStyle={chartTooltipStyle}
            cursor={chartTooltipCursor}
            formatter={(value: number) => [
              value.toLocaleString("es-AR"),
              "ANIs",
            ]}
          />
        </PieChart>
      </ResponsiveContainer>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {data.map((item) => (
          <div key={item.name} className="flex min-w-0 items-center gap-1.5">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: item.color }}
            />

            <span className="truncate text-muted-foreground">{item.name}</span>

            <span className="ml-auto tabular-nums font-medium text-foreground">
              {total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0"}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const BeforeAfterComparator = ({ data }: BeforeAfterComparatorProps) => {
  const [intensidad, setIntensidad] = useState(60);

  const baseAntes = useMemo(() => buildBaseAntes(data), [data]);

  const baseDespues = useMemo(
    () => computeDespues(baseAntes, intensidad),
    [baseAntes, intensidad]
  );

  const antesTotal = sum(baseAntes);
  const despuesTotal = sum(baseDespues);

  const antesContactados = getSegmentValue(baseAntes, "Contactados");
  const despuesContactados = getSegmentValue(baseDespues, "Contactados");

  const antesEfectividad =
    antesTotal > 0 ? (antesContactados / antesTotal) * 100 : 0;

  const despuesEfectividad =
    despuesTotal > 0 ? (despuesContactados / despuesTotal) * 100 : 0;

  const antesInvalidos = getSegmentValue(baseAntes, "Inválidos");
  const despuesInvalidos = getSegmentValue(baseDespues, "Inválidos");

  const anisDepurados = Math.max(antesTotal - despuesTotal, 0);

  if (antesTotal === 0) return null;

  return (
    <div className="glass-card p-5 animate-slide-up hover-elevate">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-display font-semibold">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
            Comparador antes / después
          </h3>

          <p className="mt-0.5 text-xs text-muted-foreground">
            Simula el impacto de depurar ANIs improductivos usando los datos
            reales del archivo cargado.
          </p>
        </div>

        <div className="flex min-w-[260px] max-w-md flex-1 items-center gap-3">
          <span className="whitespace-nowrap text-xs font-semibold text-muted-foreground">
            Intensidad
          </span>

          <Slider
            value={[intensidad]}
            onValueChange={(value) => setIntensidad(value[0] ?? 60)}
            min={0}
            max={100}
            step={5}
            className="flex-1"
          />

          <span className="w-10 text-right text-sm font-display font-bold tabular-nums text-primary">
            {intensidad}%
          </span>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KPI
          label="Total ANIs"
          antes={antesTotal}
          despues={despuesTotal}
          formatter={(value) => value.toLocaleString("es-AR")}
          invert
        />

        <KPI
          label="% Contacto efectivo"
          antes={antesEfectividad}
          despues={despuesEfectividad}
          formatter={(value) => `${value.toFixed(1)}%`}
        />

        <KPI
          label="Inválidos"
          antes={antesInvalidos}
          despues={despuesInvalidos}
          formatter={(value) => value.toLocaleString("es-AR")}
          invert
        />

        <KPI
          label="ANIs depurados"
          antes={0}
          despues={anisDepurados}
          formatter={(value) => value.toLocaleString("es-AR")}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Donut
          data={baseAntes}
          label="Base original"
          accent={<Database className="h-3.5 w-3.5 text-muted-foreground" />}
        />

        <Donut
          data={baseDespues}
          label="Base depurada simulada"
          accent={<Sparkles className="h-3.5 w-3.5 text-primary" />}
        />
      </div>
    </div>
  );
};

export default BeforeAfterComparator;