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
  const [selectedEstados, setSelectedEstados] = useState<string[]>([]);
  const [selectedSubestados, setSelectedSubestados] = useState<string[]>([]);
  const [selectedBases, setSelectedBases] = useState<string[]>([]);
  const [aniSearch, setAniSearch] = useState("");
  const [duracionRange, setDuracionRange] = useState<[number, number]>([0, 3600]);

  const uniqueEstados = useMemo(() => {
    const estados = new Set<string>();
    data.rawRecords.forEach((r) => {
      if (r.estado) estados.add(r.estado.toUpperCase());
    });
    return Array.from(estados).sort();
  }, [data.rawRecords]);

  const uniqueSubestados = useMemo(() => {
    const subestados = new Set<string>();
    data.rawRecords.forEach((r) => {
      if (r.subestado) subestados.add(r.subestado.toUpperCase());
    });
    return Array.from(subestados).sort();
  }, [data.rawRecords]);

  const uniqueBases = useMemo(() => {
    const bases = new Set<string>();
    data.rawRecords.forEach((r) => {
      if (r.base) bases.add(r.base);
    });
    return Array.from(bases).sort();
  }, [data.rawRecords]);

  const maxDuracion = useMemo(() => {
    return Math.max(...data.rawRecords.map((r) => r.duracion || 0), 3600);
  }, [data.rawRecords]);

  const filteredRecords = useMemo(() => {
    return data.rawRecords.filter((record) => {
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
  }, [data.rawRecords, selectedEstados, selectedSubestados, selectedBases, aniSearch, duracionRange]);

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
        <h2 className="text-xl font-semibold flex items-center justify-center gap-2">
          <Filter className="h-5 w-5 text-chart-1" />
          Filtros
        </h2>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Estado</Label>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 border rounded-md">
                {uniqueEstados.map((estado) => (
                  <Badge
                    key={estado}
                    variant={selectedEstados.includes(estado) ? "default" : "outline"}
                    className={cn(
                      "cursor-pointer text-xs",
                      selectedEstados.includes(estado) && "bg-primary"
                    )}
                    onClick={() => toggleFilter(estado, selectedEstados, setSelectedEstados)}
                    data-testid={`filter-estado-${estado}`}
                  >
                    {estado}
                    {selectedEstados.includes(estado) && <X className="h-3 w-3 ml-1" />}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Subestado</Label>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 border rounded-md">
                {uniqueSubestados.slice(0, 20).map((subestado) => (
                  <Badge
                    key={subestado}
                    variant={selectedSubestados.includes(subestado) ? "default" : "outline"}
                    className={cn(
                      "cursor-pointer text-xs",
                      selectedSubestados.includes(subestado) && "bg-primary"
                    )}
                    onClick={() => toggleFilter(subestado, selectedSubestados, setSelectedSubestados)}
                    data-testid={`filter-subestado-${subestado}`}
                  >
                    {subestado}
                    {selectedSubestados.includes(subestado) && <X className="h-3 w-3 ml-1" />}
                  </Badge>
                ))}
                {uniqueSubestados.length > 20 && (
                  <span className="text-xs text-muted-foreground">
                    +{uniqueSubestados.length - 20} más
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Base</Label>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 border rounded-md">
                {uniqueBases.map((base) => (
                  <Badge
                    key={base}
                    variant={selectedBases.includes(base) ? "default" : "outline"}
                    className={cn(
                      "cursor-pointer text-xs",
                      selectedBases.includes(base) && "bg-primary"
                    )}
                    onClick={() => toggleFilter(base, selectedBases, setSelectedBases)}
                    data-testid={`filter-base-${base}`}
                  >
                    {base}
                    {selectedBases.includes(base) && <X className="h-3 w-3 ml-1" />}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Buscar ANI / Teléfono (contiene)</Label>
              <Input
                value={aniSearch}
                onChange={(e) => setAniSearch(e.target.value)}
                placeholder="Ej: 11234..."
                data-testid="input-filter-ani"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Duración (segundos): {duracionRange[0]} - {duracionRange[1]}
              </Label>
              <Slider
                value={duracionRange}
                min={0}
                max={maxDuracion}
                step={1}
                onValueChange={(value) => setDuracionRange(value as [number, number])}
                className="mt-2"
                data-testid="slider-duracion"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
              Limpiar filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          title="Total llamados"
          value={filteredRecords.length}
          testId="kpi-filtros-total"
        />
        <KPICard
          title="Answer"
          value={answerCount}
          subtitle={`${((answerCount / filteredRecords.length) * 100 || 0).toFixed(1)}%`}
          variant="success"
          testId="kpi-filtros-answer"
        />
        <KPICard
          title="No Answer"
          value={noAnswerCount}
          subtitle={`${((noAnswerCount / filteredRecords.length) * 100 || 0).toFixed(1)}%`}
          variant="warning"
          testId="kpi-filtros-noanswer"
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <span className="text-chart-4">*</span>
            Resultados filtrados
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Filas resultantes: {filteredRecords.length.toLocaleString("es-AR")}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onExportFiltrado(exportFilters, "csv")}
              className="gap-2"
              data-testid="button-export-csv"
            >
              <Download className="h-4 w-4" />
              Descargar CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onExportFiltrado(exportFilters, "txt")}
              className="gap-2"
              data-testid="button-export-txt"
            >
              <Download className="h-4 w-4" />
              Descargar TXT
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => onExportFiltrado(exportFilters, "xlsx")}
              className="gap-2"
              data-testid="button-export-xlsx"
            >
              <Download className="h-4 w-4" />
              Descargar XLSX
            </Button>
          </div>

          <DataTable
            data={filteredRecords}
            columns={recordColumns}
            searchPlaceholder="Buscar en resultados..."
            pageSize={15}
            testId="table-filtros"
          />
        </CardContent>
      </Card>
    </div>
  );
}
