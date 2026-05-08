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
import { chartTooltipStyle, chartTooltipCursor, } from "@/components/dashboard/chartStyles";

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
        <h2 className="section-title">
          <Settings className="h-5 w-5 text-[hsl(var(--chart-5))]" />
          Simulador de corte de intentos por ANI
        </h2>
      </div>
      <Card className="glass-card border-glass-border">
        <CardContent className="pt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-xs font-display font-semibold uppercase tracking-wider">Filtrar por campaña / base</Label>
              <Select value={selectedBase} onValueChange={setSelectedBase}>
                <SelectTrigger className="border-glass-border bg-secondary/50" data-testid="select-base-simulador">
                  <SelectValue placeholder="Seleccionar base" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">(Todas)</SelectItem>
                  {uniqueBases.map((base) => (
                    <SelectItem key={base} value={base}>{base}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                ANIs en el ámbito: <span className="font-display font-bold text-foreground">{filteredAnis.length.toLocaleString("es-AR")}</span>
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-display font-semibold uppercase tracking-wider">Corte máximo de intentos</Label>
              <div className="pt-4">
                <Slider value={[maxIntentos]} min={1} max={20} step={1} onValueChange={(value) => setMaxIntentos(value[0])} data-testid="slider-max-intentos" />
              </div>
              <p className="text-sm text-center font-display font-bold text-primary">
                Corte en: {maxIntentos} intentos
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="glass-card border-glass-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display font-bold">Resultado del escenario simulado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <KPICard title="ANIs sin contacto" value={anisSinContacto.length} testId="kpi-sim-sin-contacto" />
            <KPICard title={`Se cortarían (> ${maxIntentos})`} value={anisQueSeCortan.length} subtitle={`${pctDelAmbito.toFixed(1)}%`} variant="danger" testId="kpi-sim-se-cortan" />
            <KPICard title="Seguirían en base" value={anisQueSiguen} subtitle={`${pctSobreTotal.toFixed(1)}%`} trend={{ value: pctSobreTotal - 100, label: "del total" }} variant="success" testId="kpi-sim-siguen" />
            <KPICard title="Total ámbito" value={filteredAnis.length} testId="kpi-sim-total" />
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" opacity={0.06} />
                <XAxis type="number" tick={{ fill: "currentColor", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fill: "currentColor", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={chartTooltipStyle} cursor={chartTooltipCursor} formatter={(value: number) => [ value.toLocaleString("es-AR"), "ANIs",  ]} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Solo corta ANIs que <span className="font-semibold text-destructive">nunca tuvieron ANSWER-AGENT</span>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}