import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { KPICard } from "@/components/kpi-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { Settings } from "lucide-react";
import type { AnalysisResult } from "@shared/schema";

interface SimuladorCortesProps {
  data: AnalysisResult;
}

export function SimuladorCortesTab({ data }: SimuladorCortesProps) {
  const [selectedBase, setSelectedBase] = useState<string>("all");
  const [maxIntentos, setMaxIntentos] = useState<number>(10);

  const uniqueBases = useMemo(() => {
    const bases = new Set<string>();
    data.rawRecords.forEach((r) => {
      if (r.base) bases.add(r.base);
    });
    return Array.from(bases).sort();
  }, [data.rawRecords]);

  const filteredAnis = useMemo(() => {
    if (selectedBase === "all") {
      return data.aniSummaries;
    }
    const anisInBase = new Set(
      data.rawRecords.filter((r) => r.base === selectedBase).map((r) => r.ani)
    );
    return data.aniSummaries.filter((a) => anisInBase.has(a.ani));
  }, [data, selectedBase]);

  const anisSinContacto = useMemo(() => {
    return filteredAnis.filter((a) => a.intentosAnswerAgent === 0);
  }, [filteredAnis]);

  const anisQueSeCortan = useMemo(() => {
    return anisSinContacto.filter((a) => a.intentosTotales > maxIntentos);
  }, [anisSinContacto, maxIntentos]);

  const anisQueSiguen = filteredAnis.length - anisQueSeCortan.length;
  const pctDelAmbito =
    anisSinContacto.length > 0
      ? (anisQueSeCortan.length / anisSinContacto.length) * 100
      : 0;
  const pctSobreTotal =
    filteredAnis.length > 0
      ? ((anisQueSiguen / filteredAnis.length) * 100)
      : 100;

  const chartData = [
    {
      name: "Se cortan",
      value: anisQueSeCortan.length,
      fill: "hsl(var(--destructive))",
    },
    {
      name: "Siguen en base",
      value: anisQueSiguen,
      fill: "hsl(var(--chart-2))",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold flex items-center justify-center gap-2">
          <Settings className="h-5 w-5 text-chart-5" />
          Simulador de corte de intentos por ANI
        </h2>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Filtrar por campaña / base (opcional):
              </Label>
              <Select value={selectedBase} onValueChange={setSelectedBase}>
                <SelectTrigger data-testid="select-base-simulador">
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
                ANIs en el ámbito seleccionado:{" "}
                <span className="font-semibold">
                  {filteredAnis.length.toLocaleString("es-AR")}
                </span>
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Elegí el nuevo corte máximo de intentos por ANI (solo ANIs sin
                ANSWER-AGENT se cortarán):
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
              <p className="text-sm text-center font-semibold text-primary">
                Corte en: {maxIntentos} intentos
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">
            Resultado del escenario simulado
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              title="ANIs sin contacto (actualmente)"
              value={anisSinContacto.length}
              testId="kpi-sim-sin-contacto"
            />
            <KPICard
              title={`ANIs que se cortarían con corte > ${maxIntentos} intentos`}
              value={anisQueSeCortan.length}
              subtitle={`${pctDelAmbito.toFixed(1)}% de los ANIs del ámbito`}
              variant="danger"
              testId="kpi-sim-se-cortan"
            />
            <KPICard
              title="ANIs que seguirían en la base"
              value={anisQueSiguen}
              subtitle={`${pctSobreTotal.toFixed(1)}% del total`}
              trend={{ value: pctSobreTotal - 100, label: "del total" }}
              variant="success"
              testId="kpi-sim-siguen"
            />
            <KPICard
              title="Total ANIs en el ámbito"
              value={filteredAnis.length}
              testId="kpi-sim-total"
            />
          </div>

          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={120} />
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
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Este simulador solo corta ANIs que{" "}
            <span className="font-semibold text-destructive">
              nunca tuvieron ANSWER-AGENT
            </span>
            . Sirve para evaluar el impacto de bajar o subir el corte de
            intentos máximos por ANI.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
