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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import type { AnalysisResult } from "@shared/schema";
import {
  chartTooltipCursor,
  chartTooltipStyle,
} from "@/components/dashboard/chartStyles";

interface SimuladorCortesProps {
  data: AnalysisResult;
}

export function SimuladorCortesTab({ data }: SimuladorCortesProps) {
  const [selectedBase, setSelectedBase] = useState<string>("all");
  const [maxIntentos, setMaxIntentos] = useState<number>(10);

  const uniqueBases = useMemo(() => {
    const bases = new Set<string>();

    data.rawRecords.forEach((record) => {
      if (record.base) bases.add(record.base);
    });

    return Array.from(bases).sort();
  }, [data.rawRecords]);

  const filteredAnis = useMemo(() => {
    if (selectedBase === "all") return data.aniSummaries;

    const anisInBase = new Set(
      data.rawRecords
        .filter((record) => record.base === selectedBase)
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
      </div>

      <Card className="glass-card border-glass-border hover-elevate">
        <CardContent className="space-y-6 pt-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs font-display font-semibold uppercase tracking-wider">
                Filtrar por campaña / base
              </Label>

              <Select value={selectedBase} onValueChange={setSelectedBase}>
                <SelectTrigger
                  className="border-glass-border bg-secondary/50"
                  data-testid="select-base-simulador"
                >
                  <SelectValue placeholder="Seleccionar base" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="all">(Todas)</SelectItem>

                  {uniqueBases.map((base) => (
                    <SelectItem key={base} value={base}>
                      {base}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

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
                  onValueChange={(value) => setMaxIntentos(value[0])}
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

          <p className="text-center text-xs text-muted-foreground">
            Solo corta ANIs que{" "}
            <span className="font-semibold text-destructive">
              nunca tuvieron ANSWER-AGENT
            </span>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}