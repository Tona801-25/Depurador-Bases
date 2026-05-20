import { useMemo, useState } from "react";
import { Settings } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { KPICard } from "@/components/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { AnalysisResult } from "@shared/schema";
import {
  chartTooltipCursor,
  chartTooltipStyle,
} from "@/components/dashboard/chartStyles";

interface SimuladorCortesProps {
  data: AnalysisResult;
}

const ALL_BASES_VALUE = "__TODAS_LAS_BASES__";

type SimuladorRecommendation = {
  title: string;
  description: string;
  variant: "neutral" | "warning" | "danger" | "success";
};

function normalizeBaseName(base?: string) {
  return String(base || "").trim();
}

function getRecommendation(
  maxIntentos: number,
  pctDelAmbito: number,
  anisQueSeCortan: number,
  anisSinContacto: number
): SimuladorRecommendation {
  if (anisSinContacto === 0) {
    return {
      title: "Sin ANIs pendientes de contacto",
      description:
        "No se detectan ANIs sin ANSWER-AGENT dentro del ámbito seleccionado. No hace falta aplicar corte por intentos.",
      variant: "success",
    };
  }

  if (anisQueSeCortan === 0) {
    return {
      title: "El corte actual no genera impacto",
      description: `Con un corte mayor a ${maxIntentos} intentos no se excluiría ningún ANI. Probá bajar el umbral a 3, 4 o 5 intentos para evaluar un escenario más útil.`,
      variant: "neutral",
    };
  }

  if (pctDelAmbito < 5) {
    return {
      title: "Impacto bajo",
      description:
        "El corte depura pocos ANIs sin contacto. Puede servir como limpieza conservadora, pero no modifica demasiado la base final.",
      variant: "neutral",
    };
  }

  if (pctDelAmbito <= 20) {
    return {
      title: "Corte moderado recomendable",
      description:
        "El escenario reduce una porción relevante de ANIs sin contacto sin ser excesivamente agresivo. Conviene revisarlo por base antes de exportar.",
      variant: "warning",
    };
  }

  return {
    title: "Corte agresivo",
    description:
      "El escenario excluye un volumen alto de ANIs sin contacto. Usalo solo si la base muestra baja contactabilidad o fatiga clara de intentos.",
    variant: "danger",
  };
}

function getRecommendationClasses(variant: SimuladorRecommendation["variant"]) {
  if (variant === "success") {
    return "border-success/30 bg-success/5 text-success";
  }

  if (variant === "warning") {
    return "border-warning/30 bg-warning/5 text-warning";
  }

  if (variant === "danger") {
    return "border-destructive/30 bg-destructive/5 text-destructive";
  }

  return "border-primary/25 bg-primary/5 text-primary";
}

export function SimuladorCortesTab({ data }: SimuladorCortesProps) {
  const [selectedBase, setSelectedBase] = useState<string>(ALL_BASES_VALUE);
  const [maxIntentos, setMaxIntentos] = useState<number>(10);

  const uniqueBases = useMemo(() => {
    const bases = new Set<string>();

    data.rawRecords.forEach((record) => {
      const base = normalizeBaseName(record.base);
      if (base.length > 0) bases.add(base);
    });

    return Array.from(bases).sort((a, b) => a.localeCompare(b, "es"));
  }, [data.rawRecords]);

  const filteredAnis = useMemo(() => {
    if (selectedBase === ALL_BASES_VALUE) return data.aniSummaries;

    const anisInBase = new Set(
      data.rawRecords
        .filter((record) => normalizeBaseName(record.base) === selectedBase)
        .map((record) => record.ani)
    );

    return data.aniSummaries.filter((aniSummary) =>
      anisInBase.has(aniSummary.ani)
    );
  }, [data.aniSummaries, data.rawRecords, selectedBase]);

  const anisSinContacto = useMemo(() => {
    return filteredAnis.filter(
      (aniSummary) => aniSummary.intentosAnswerAgent === 0
    );
  }, [filteredAnis]);

  const anisQueSeCortan = useMemo(() => {
    return anisSinContacto.filter(
      (aniSummary) => aniSummary.intentosTotales > maxIntentos
    );
  }, [anisSinContacto, maxIntentos]);

  const anisQueSiguen = filteredAnis.length - anisQueSeCortan.length;

  const pctDelAmbito =
    anisSinContacto.length > 0
      ? (anisQueSeCortan.length / anisSinContacto.length) * 100
      : 0;

  const pctSobreTotal =
    filteredAnis.length > 0 ? (anisQueSiguen / filteredAnis.length) * 100 : 100;

  const recommendation = getRecommendation(
    maxIntentos,
    pctDelAmbito,
    anisQueSeCortan.length,
    anisSinContacto.length
  );

  const chartData = useMemo(
    () => [
      {
        name: "Se cortan",
        value: anisQueSeCortan.length,
        fill: "hsl(var(--destructive))",
      },
      {
        name: "Siguen en base",
        value: anisQueSiguen,
        fill: "hsl(var(--success))",
      },
    ],
    [anisQueSeCortan.length, anisQueSiguen]
  );

  return (
    <div className="space-y-6">
      <div className="mb-6 text-center">
        <h2 className="section-title">
          <Settings className="h-5 w-5 text-[hsl(var(--chart-5))]" />
          Simulador de corte de intentos por ANI
        </h2>

        <p className="mt-2 text-xs text-muted-foreground">
          Simula cuántos ANIs sin contacto efectivo se pausarían si se define
          un límite máximo de intentos sin ANSWER-AGENT.
        </p>
      </div>

      <Card className="glass-card border-glass-border hover-elevate">
        <CardContent className="space-y-6 pt-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label
                htmlFor="simulador-base-select"
                className="text-xs font-display font-semibold uppercase tracking-wider"
              >
                Filtrar por campaña / base
              </Label>

              <select
                id="simulador-base-select"
                value={selectedBase}
                onChange={(event) => setSelectedBase(event.target.value)}
                data-testid="select-base-simulador"
                className="
                  h-10 w-full rounded-md border border-glass-border
                  bg-secondary/50 px-3 text-sm font-medium text-foreground
                  outline-none transition-colors
                  hover:border-primary/40
                  focus:border-primary/70 focus:ring-2 focus:ring-primary/20
                "
              >
                <option value={ALL_BASES_VALUE}>(Todas)</option>

                {uniqueBases.map((base) => (
                  <option key={base} value={base}>
                    {base}
                  </option>
                ))}
              </select>

              <p className="text-xs text-muted-foreground">
                ANIs en el ámbito:{" "}
                <span className="font-display font-bold text-foreground">
                  {filteredAnis.length.toLocaleString("es-AR")}
                </span>
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-display font-semibold uppercase tracking-wider">
                Corte máximo de intentos
              </Label>

              <div className="pt-4">
                <Slider
                  value={[maxIntentos]}
                  min={1}
                  max={20}
                  step={1}
                  onValueChange={(value) => setMaxIntentos(value[0] ?? 1)}
                  data-testid="slider-max-intentos"
                />
              </div>

              <p className="text-center text-sm font-display font-bold text-primary">
                Corte en: {maxIntentos} intentos
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card border-glass-border hover-elevate">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display font-bold">
            Resultado del escenario simulado
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <KPICard
              title="ANIs sin contacto"
              value={anisSinContacto.length.toLocaleString("es-AR")}
              testId="kpi-sim-sin-contacto"
            />

            <KPICard
              title={`Se cortarían (> ${maxIntentos})`}
              value={anisQueSeCortan.length.toLocaleString("es-AR")}
              subtitle={`${pctDelAmbito.toFixed(1)}% de los ANIs sin contacto`}
              variant="danger"
              testId="kpi-sim-se-cortan"
            />

            <KPICard
              title="Seguirían en base"
              value={anisQueSiguen.toLocaleString("es-AR")}
              subtitle={`${pctSobreTotal.toFixed(1)}% del total`}
              variant="success"
              testId="kpi-sim-siguen"
            />

            <KPICard
              title="Total ámbito"
              value={filteredAnis.length.toLocaleString("es-AR")}
              testId="kpi-sim-total"
            />
          </div>

          <div
            className={`rounded-xl border p-4 ${getRecommendationClasses(
              recommendation.variant
            )}`}
          >
            <p className="text-sm font-display font-bold">
              {recommendation.title}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {recommendation.description}
            </p>
          </div>

          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" opacity={0.06} />

                <XAxis
                  type="number"
                  tick={{ fill: "currentColor", fontSize: 10 }}
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
                  cursor={chartTooltipCursor}
                  formatter={(value: number) => [
                    value.toLocaleString("es-AR"),
                    "ANIs",
                  ]}
                />

                <Bar
                  dataKey="value"
                  radius={[0, 6, 6, 0]}
                  barSize={42}
                  animationDuration={900}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl border border-border/70 bg-secondary/20 p-4">
            <p className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">Criterio:</span>{" "}
              el simulador solo corta ANIs que{" "}
              <span className="font-semibold text-destructive">
                nunca tuvieron ANSWER-AGENT
              </span>
              . No elimina contactos efectivos. Sirve para evaluar una regla de
              pausa o exclusión temporal por exceso de intentos improductivos.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}