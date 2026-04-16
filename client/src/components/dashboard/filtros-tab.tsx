import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { KPICard } from "@/components/kpi-card";
import { DataTable, type Column } from "@/components/data-table";
import { Download, X, Filter } from "lucide-react";
import type { AnalysisResult, CallRecord, RecordsFilter } from "@shared/schema";
import { cn } from "@/lib/utils";

interface FiltrosTabProps {
  data: AnalysisResult;
  onExportFiltrado: (filters: RecordsFilter, format: "csv" | "txt" | "xlsx") => void;
}

export function FiltrosTab({ data, onExportFiltrado }: FiltrosTabProps) {
  // En algunos flujos el backend retorna un resumen sin rawRecords; evitamos crash.
  const rawRecords = data.rawRecords ?? [];

  const [selectedEstados, setSelectedEstados] = useState<string[]>([]);
  const [selectedSubestados, setSelectedSubestados] = useState<string[]>([]);
  const [selectedBases, setSelectedBases] = useState<string[]>([]);
  const [aniSearch, setAniSearch] = useState("");
  const [duracionRange, setDuracionRange] = useState<[number, number]>([0, 3600]);

  const uniqueEstados = useMemo(() => {
    const estados = new Set<string>();
    rawRecords.forEach((r) => {
      if (r.estado) estados.add(r.estado.toUpperCase());
    });
    return Array.from(estados).sort();
  }, [rawRecords]);

  const uniqueSubestados = useMemo(() => {
    const subestados = new Set<string>();
    rawRecords.forEach((r) => {
      if (r.subestado) subestados.add(r.subestado.toUpperCase());
    });
    return Array.from(subestados).sort();
  }, [rawRecords]);

  const uniqueBases = useMemo(() => {
    const bases = new Set<string>();
    rawRecords.forEach((r) => {
      if (r.base) bases.add(r.base);
    });
    return Array.from(bases).sort();
  }, [rawRecords]);

  const maxDuracion = useMemo(() => {
  let max = 0;

  for (const r of rawRecords) {
    const d = typeof r.duracion === "number" ? r.duracion : Number(r.duracion) || 0;
    if (d > max) max = d;
  }

  return Math.max(max, 3600);
  }, [rawRecords]);

  const filteredRecords = useMemo(() => {
    return rawRecords.filter((record) => {
      if (selectedEstados.length > 0 && !selectedEstados.includes(record.estado?.toUpperCase() || "")) {
        return false;
      }
      if (selectedSubestados.length > 0 && !selectedSubestados.includes(record.subestado?.toUpperCase() || "")) {
        return false;
      }
      if (selectedBases.length > 0 && !selectedBases.includes(record.base || "")) {
        return false;
      }
      if (aniSearch && !record.ani.includes(aniSearch)) {
        return false;
      }
      const dur = record.duracion || 0;
      if (dur < duracionRange[0] || dur > duracionRange[1]) {
        return false;
      }
      return true;
    });
  }, [rawRecords, selectedEstados, selectedSubestados, selectedBases, aniSearch, duracionRange]);

  const toggleFilter = (
    value: string,
    selected: string[],
    setSelected: (v: string[]) => void
  ) => {
    if (selected.includes(value)) {
      setSelected(selected.filter((v) => v !== value));
    } else {
      setSelected([...selected, value]);
    }
  };

  const clearFilters = () => {
    setSelectedEstados([]);
    setSelectedSubestados([]);
    setSelectedBases([]);
    setAniSearch("");
    setDuracionRange([0, maxDuracion]);
  };

  const answerCount = filteredRecords.filter(
    (r) => r.estado?.toUpperCase() === "ANSWER"
  ).length;
  const noAnswerCount = filteredRecords.filter(
    (r) => r.estado?.toUpperCase() === "NOANSWER" || r.estado?.toUpperCase() === "NO ANSWER"
  ).length;

  const recordColumns: Column<CallRecord>[] = [
    { key: "fecha", header: "Fecha", sortable: true },
    { key: "estado", header: "Estado", sortable: true },
    { key: "subestado", header: "Sub-Estado", sortable: true },
    { key: "ani", header: "ANI/Teléfono", sortable: true },
    { key: "base", header: "Base", sortable: true },
    {
      key: "duracion",
      header: "Duración (s)",
      sortable: true,
      render: (item) => item.duracion?.toString() || "-",
    },
    { key: "direccion", header: "Dirección", sortable: true },
  ];

  const exportFilters: RecordsFilter = {
    estados: selectedEstados.length > 0 ? selectedEstados : undefined,
    subestados: selectedSubestados.length > 0 ? selectedSubestados : undefined,
    bases: selectedBases.length > 0 ? selectedBases : undefined,
    aniContains: aniSearch ? aniSearch : undefined,
    durMin: duracionRange[0],
    durMax: duracionRange[1],
  };

return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="section-title">
          <Filter className="h-5 w-5 text-primary" />
          Filtros
        </h2>
      </div>

      <Card className="glass-card border-glass-border">
        <CardContent className="pt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { label: "Estado", items: uniqueEstados, selected: selectedEstados, setSelected: setSelectedEstados, testPrefix: "estado" },
              { label: "Subestado", items: uniqueSubestados.slice(0, 20), selected: selectedSubestados, setSelected: setSelectedSubestados, testPrefix: "subestado", extra: uniqueSubestados.length > 20 ? uniqueSubestados.length - 20 : 0 },
              { label: "Base", items: uniqueBases, selected: selectedBases, setSelected: setSelectedBases, testPrefix: "base" },
            ].map(({ label, items, selected, setSelected, testPrefix, extra }) => (
              <div key={label} className="space-y-2">
                <Label className="text-xs font-display font-semibold uppercase tracking-wider">{label}</Label>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2.5 border border-glass-border rounded-xl bg-secondary/30">
                  {items.map((item) => (
                    <Badge
                      key={item}
                      variant={selected.includes(item) ? "default" : "outline"}
                      className={cn(
                        "cursor-pointer text-[10px] font-display transition-all",
                        selected.includes(item) && "bg-primary shadow-sm"
                      )}
                      onClick={() => toggleFilter(item, selected, setSelected)}
                      data-testid={`filter-${testPrefix}-${item}`}
                    >
                      {item}
                      {selected.includes(item) && <X className="h-3 w-3 ml-1" />}
                    </Badge>
                  ))}
                  {extra ? <span className="text-[10px] text-muted-foreground">+{extra} más</span> : null}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-xs font-display font-semibold uppercase tracking-wider">Buscar ANI (contiene)</Label>
              <Input
                value={aniSearch}
                onChange={(e) => setAniSearch(e.target.value)}
                placeholder="Ej: 11234..."
                className="bg-secondary/50 border-glass-border"
                data-testid="input-filter-ani"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-display font-semibold uppercase tracking-wider">
                Duración: {duracionRange[0]}s – {duracionRange[1]}s
              </Label>
              <Slider
                value={duracionRange}
                min={0}
                max={maxDuracion}
                step={1}
                onValueChange={(value) => setDuracionRange(value as [number, number])}
                className="mt-3"
                data-testid="slider-duracion"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={clearFilters} className="rounded-lg font-display text-xs" data-testid="button-clear-filters">
              Limpiar filtros
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KPICard title="Total llamados" value={filteredRecords.length} testId="kpi-filtros-total" />
        <KPICard title="Answer" value={answerCount} subtitle={`${((answerCount / filteredRecords.length) * 100 || 0).toFixed(1)}%`} variant="success" testId="kpi-filtros-answer" />
        <KPICard title="No Answer" value={noAnswerCount} subtitle={`${((noAnswerCount / filteredRecords.length) * 100 || 0).toFixed(1)}%`} variant="warning" testId="kpi-filtros-noanswer" />
      </div>
      
      <Card className="glass-card border-glass-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display font-bold flex items-center gap-2">
            <span className="dot-indicator bg-destructive" />
            Resultados filtrados
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Filas resultantes: {filteredRecords.length.toLocaleString("es-AR")}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(["csv", "txt", "xlsx"] as const).map((fmt) => (
              <Button
                key={fmt}
                variant={fmt === "xlsx" ? "default" : "outline"}
                size="sm"
                onClick={() => onExportFiltrado(exportFilters, fmt)}
                className="gap-2 rounded-lg font-display text-xs"
                data-testid={`button-export-${fmt}`}
              >
                <Download className="h-4 w-4" />
                Descargar {fmt.toUpperCase()}
              </Button>
            ))}
          </div>
          <DataTable data={filteredRecords} columns={recordColumns} searchPlaceholder="Buscar en resultados..." pageSize={15} testId="table-filtros" />
        </CardContent>
      </Card>
    </div>
  );
}