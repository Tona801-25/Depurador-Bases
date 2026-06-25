import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { KPICard } from "@/components/kpi-card";
import { DataTable, type Column } from "@/components/data-table";
import { Download, X, Filter, Search, Wand2 } from "lucide-react";
import type { AnalysisResult, CallRecord, RecordsFilter } from "@shared/schema";
import { cn } from "@/lib/utils";

interface FiltrosTabProps {
  data: AnalysisResult;
  onExportFiltrado: (
    filters: RecordsFilter,
    format: "csv" | "txt" | "xlsx",
    meta?: FilterExportMeta
  ) => void;
  onRegisterLog?: (meta: FilterExportMeta) => void;
}

type FilterExportMeta = {
  visibleRows: number;
  activeFilters: number;
  selectedBases: string[];
  selectedEstados: string[];
  selectedSubestados: string[];
};

type OperationalPreset = {
  label: string;
  description: string;
  estados: string[];
  subestados: string[];
  variant?: "default" | "success" | "warning" | "danger";
};

function normalizeText(value?: string | number | null) {
  return String(value ?? "").trim().toUpperCase();
}

function formatCount(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Math.round(value).toLocaleString("es-AR");
}

function pct(value: number, total: number) {
  if (!total || total <= 0) return "0.0";
  return ((value / total) * 100).toFixed(1);
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function isContactoEfectivo(record: CallRecord) {
  return (
    normalizeText(record.estado) === "ANSWER" &&
    normalizeText(record.subestado).includes("AGENT") &&
    !normalizeText(record.subestado).includes("MACHINE")
  );
}

function isBuzon(record: CallRecord) {
  const estado = normalizeText(record.estado);
  const subestado = normalizeText(record.subestado);

  return (
    estado === "ANSWER" &&
    (subestado.includes("ANSWERING_MACHINE") ||
      subestado.includes("MACHINE") ||
      subestado.includes("BUZON") ||
      subestado.includes("VOICEMAIL"))
  );
}

function isNoContesta(record: CallRecord) {
  const estado = normalizeText(record.estado);
  return estado === "NOANSWER" || estado === "NO ANSWER";
}

function isOcupadoRechazo(record: CallRecord) {
  const estado = normalizeText(record.estado);
  return estado === "BUSY" || estado === "REJECTED";
}

function isInvalido(record: CallRecord) {
  return normalizeText(record.estado) === "UNALLOCATED";
}

const operationalPresets: OperationalPreset[] = [
  {
    label: "Contacto efectivo",
    description: "ANSWER + AGENT. Sirve para ver conversaciones reales.",
    estados: ["ANSWER"],
    subestados: ["AGENT"],
    variant: "success",
  },
  {
    label: "Buzón / contestador",
    description:
      "ANSWER + ANSWERING_MACHINE. Sirve para medir consumo improductivo.",
    estados: ["ANSWER"],
    subestados: ["ANSWERING_MACHINE"],
    variant: "warning",
  },
  {
    label: "No contesta",
    description:
      "NOANSWER. Sirve para analizar horarios, prefijos y reintentos.",
    estados: ["NOANSWER"],
    subestados: [],
    variant: "warning",
  },
  {
    label: "Ocupado / rechazo",
    description: "BUSY + REJECTED. Sirve para revisar intensidad de remarcado.",
    estados: ["BUSY", "REJECTED"],
    subestados: [],
    variant: "danger",
  },
  {
    label: "Inválidos",
    description: "UNALLOCATED. Candidatos fuertes a depuración.",
    estados: ["UNALLOCATED"],
    subestados: [],
    variant: "danger",
  },
];

export function FiltrosTab({ data, onExportFiltrado, onRegisterLog }: FiltrosTabProps) {
  const rawRecords = data.rawRecords ?? [];
  const isSummaryOnly =
    rawRecords.length === 0 &&
    data.totalRecords > 0 &&
    (data as AnalysisResult & { clientDataMode?: string }).clientDataMode ===
      "summary";

  const [selectedEstados, setSelectedEstados] = useState<string[]>([]);
  const [selectedSubestados, setSelectedSubestados] = useState<string[]>([]);
  const [selectedBases, setSelectedBases] = useState<string[]>([]);
  const [aniSearch, setAniSearch] = useState("");
  const [duracionRange, setDuracionRange] = useState<[number, number]>([
    0,
    3600,
  ]);

  const uniqueEstados = useMemo(() => {
    const estados = new Set<string>();

    rawRecords.forEach((r) => {
      if (r.estado) estados.add(normalizeText(r.estado));
    });

    return Array.from(estados).sort();
  }, [rawRecords]);

  const uniqueSubestados = useMemo(() => {
    const subestados = new Set<string>();

    rawRecords.forEach((r) => {
      if (r.subestado) subestados.add(normalizeText(r.subestado));
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
      const d =
        typeof r.duracion === "number" ? r.duracion : Number(r.duracion) || 0;

      if (d > max) max = d;
    }

    return Math.max(max, 3600);
  }, [rawRecords]);

  const filteredRecords = useMemo(() => {
    return rawRecords.filter((record) => {
      if (
        selectedEstados.length > 0 &&
        !selectedEstados.includes(normalizeText(record.estado))
      ) {
        return false;
      }

      if (
        selectedSubestados.length > 0 &&
        !selectedSubestados.includes(normalizeText(record.subestado))
      ) {
        return false;
      }

      if (selectedBases.length > 0 && !selectedBases.includes(record.base || "")) {
        return false;
      }

      if (aniSearch && !String(record.ani || "").includes(aniSearch)) {
        return false;
      }

      const dur = record.duracion || 0;

      if (dur < duracionRange[0] || dur > duracionRange[1]) {
        return false;
      }

      return true;
    });
  }, [
    rawRecords,
    selectedEstados,
    selectedSubestados,
    selectedBases,
    aniSearch,
    duracionRange,
  ]);

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

  const applyOperationalPreset = (preset: OperationalPreset) => {
    setSelectedEstados(preset.estados);
    setSelectedSubestados(preset.subestados);
  };

  const setDurMin = (value: number) => {
    const nextMin = clamp(value, 0, duracionRange[1]);
    setDuracionRange([nextMin, duracionRange[1]]);
  };

  const setDurMax = (value: number) => {
    const nextMax = clamp(value, duracionRange[0], maxDuracion);
    setDuracionRange([duracionRange[0], nextMax]);
  };

  const contactoEfectivoCount = filteredRecords.filter(isContactoEfectivo).length;
  const buzonCount = filteredRecords.filter(isBuzon).length;
  const noContestaCount = filteredRecords.filter(isNoContesta).length;
  const ocupadoRechazoCount = filteredRecords.filter(isOcupadoRechazo).length;
  const invalidoCount = filteredRecords.filter(isInvalido).length;

  const otrosTecnicosCount = Math.max(
    filteredRecords.length -
      contactoEfectivoCount -
      buzonCount -
      noContestaCount -
      ocupadoRechazoCount -
      invalidoCount,
    0
  );

  const dominantCategory = [
    { label: "contacto efectivo", count: contactoEfectivoCount },
    { label: "buzón / contestador", count: buzonCount },
    { label: "no contesta", count: noContestaCount },
    { label: "ocupado / rechazo", count: ocupadoRechazoCount },
    { label: "inválidos", count: invalidoCount },
    { label: "otros técnicos", count: otrosTecnicosCount },
  ].sort((a, b) => b.count - a.count)[0];

  const activeFiltersCount =
    selectedEstados.length +
    selectedSubestados.length +
    selectedBases.length +
    (aniSearch ? 1 : 0) +
    (duracionRange[0] > 0 || duracionRange[1] < maxDuracion ? 1 : 0);

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

  const exportMeta: FilterExportMeta = {
    visibleRows: filteredRecords.length,
    activeFilters: activeFiltersCount,
    selectedBases,
    selectedEstados,
    selectedSubestados,
  };

  if (isSummaryOnly) {
    return (
      <Card className="glass-card border-glass-border">
        <CardHeader>
          <CardTitle className="text-sm font-display font-bold flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            Filtro detallado no disponible en historial completo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            El historial completo se analiza en modo resumen para no cargar
            millones de filas en el navegador. Para filtrar y descargar
            registros puntuales, analizá un ticket individual desde el historial.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="section-title">
          <Filter className="h-5 w-5 text-primary" />
          Explorador y exportación de registros
        </h2>

        <p className="mt-2 text-xs text-muted-foreground">
          Filtrá segmentos reales del archivo, revisá su composición operativa
          y exportá solo las filas visibles.
        </p>
      </div>

      <Card className="glass-card border-glass-border">
        <CardContent className="pt-6 space-y-6">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-display font-bold text-foreground">
                  <Search className="h-4 w-4 text-primary" />
                  Lectura del filtro actual
                </p>

                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Segmento actual:{" "}
                  <span className="font-semibold text-foreground">
                    {formatCount(filteredRecords.length)}
                  </span>{" "}
                  registros filtrados.
                  {filteredRecords.length > 0 && dominantCategory ? (
                    <>
                      {" "}
                      Predomina{" "}
                      <span className="font-semibold text-foreground">
                        {dominantCategory.label}
                      </span>{" "}
                      con{" "}
                      <span className="font-semibold text-foreground">
                        {formatCount(dominantCategory.count)}
                      </span>{" "}
                      registros.
                    </>
                  ) : (
                    <> No hay filas visibles con los filtros aplicados.</>
                  )}{" "}
                  Para contacto real usá{" "}
                  <span className="font-semibold text-foreground">
                    ANSWER + AGENT
                  </span>
                  ; para buzones usá{" "}
                  <span className="font-semibold text-foreground">
                    ANSWER + ANSWERING_MACHINE
                  </span>
                  .
                </p>
              </div>

              <div className="shrink-0 rounded-lg border border-border/70 bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
                Filtros activos:{" "}
                <span className="font-display font-bold text-foreground">
                  {activeFiltersCount}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-xs font-display font-semibold uppercase tracking-wider">
              <Wand2 className="h-3.5 w-3.5 text-primary" />
              Filtros rápidos operativos
            </Label>

            <div className="flex flex-wrap gap-2 rounded-xl border border-glass-border bg-secondary/20 p-3">
              {operationalPresets.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  title={preset.description}
                  onClick={() => applyOperationalPreset(preset)}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-display",
                    preset.variant === "success" &&
                      "hover:border-success/60 hover:bg-success/10 hover:text-success",
                    preset.variant === "warning" &&
                      "hover:border-warning/60 hover:bg-warning/10 hover:text-warning",
                    preset.variant === "danger" &&
                      "hover:border-destructive/60 hover:bg-destructive/10 hover:text-destructive"
                  )}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                label: "Estado",
                items: uniqueEstados,
                selected: selectedEstados,
                setSelected: setSelectedEstados,
                testPrefix: "estado",
              },
              {
                label: "Subestado",
                items: uniqueSubestados.slice(0, 20),
                selected: selectedSubestados,
                setSelected: setSelectedSubestados,
                testPrefix: "subestado",
                extra:
                  uniqueSubestados.length > 20
                    ? uniqueSubestados.length - 20
                    : 0,
              },
              {
                label: "Base",
                items: uniqueBases,
                selected: selectedBases,
                setSelected: setSelectedBases,
                testPrefix: "base",
              },
            ].map(({ label, items, selected, setSelected, testPrefix, extra }) => (
              <div key={label} className="space-y-2">
                <Label className="text-xs font-display font-semibold uppercase tracking-wider">
                  {label}
                </Label>

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
                      {selected.includes(item) && (
                        <X className="h-3 w-3 ml-1" />
                      )}
                    </Badge>
                  ))}

                  {extra ? (
                    <span className="text-[10px] text-muted-foreground">
                      +{extra} más
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-xs font-display font-semibold uppercase tracking-wider">
                Buscar ANI (contiene)
              </Label>

              <Input
                value={aniSearch}
                onChange={(e) => setAniSearch(e.target.value)}
                placeholder="Ej: 11234..."
                className="bg-secondary/50 border-glass-border"
                data-testid="input-filter-ani"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-xs font-display font-semibold uppercase tracking-wider">
                  Duración: {duracionRange[0]}s – {duracionRange[1]}s
                </Label>

                <span className="text-[10px] text-muted-foreground">
                  Máx. archivo: {maxDuracion}s
                </span>
              </div>

              <Slider
                value={duracionRange}
                min={0}
                max={maxDuracion}
                step={1}
                onValueChange={(value) =>
                  setDuracionRange(value as [number, number])
                }
                className="mt-3"
                data-testid="slider-duracion"
              />

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Desde segundos
                  </Label>

                  <Input
                    type="number"
                    min={0}
                    max={duracionRange[1]}
                    value={duracionRange[0]}
                    onChange={(e) => setDurMin(Number(e.target.value))}
                    className="h-9 bg-secondary/50 border-glass-border text-sm"
                    data-testid="input-duracion-min"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Hasta segundos
                  </Label>

                  <Input
                    type="number"
                    min={duracionRange[0]}
                    max={maxDuracion}
                    value={duracionRange[1]}
                    onChange={(e) => setDurMax(Number(e.target.value))}
                    className="h-9 bg-secondary/50 border-glass-border text-sm"
                    data-testid="input-duracion-max"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={clearFilters}
              className="rounded-lg font-display text-xs"
              data-testid="button-clear-filters"
            >
              Limpiar filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <KPICard
          title="Total registros"
          value={filteredRecords.length}
          testId="kpi-filtros-total"
        />

        <KPICard
          title="Contacto efectivo"
          value={contactoEfectivoCount}
          subtitle={`${pct(
            contactoEfectivoCount,
            filteredRecords.length
          )}% · ANSWER + AGENT`}
          variant="success"
          testId="kpi-filtros-contacto"
        />

        <KPICard
          title="Buzón / contestador"
          value={buzonCount}
          subtitle={`${pct(
            buzonCount,
            filteredRecords.length
          )}% · ANSWERING_MACHINE`}
          variant="warning"
          testId="kpi-filtros-buzon"
        />

        <KPICard
          title="No contesta"
          value={noContestaCount}
          subtitle={`${pct(
            noContestaCount,
            filteredRecords.length
          )}% · NOANSWER`}
          variant="warning"
          testId="kpi-filtros-noanswer"
        />
      </div>

      <Card className="glass-card border-glass-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display font-bold flex items-center gap-2">
            <span className="dot-indicator bg-destructive" />
            Resultados filtrados
          </CardTitle>

          <p className="text-xs text-muted-foreground">
            Filas resultantes:{" "}
            {filteredRecords.length.toLocaleString("es-AR")}. Las descargas
            exportan únicamente las filas visibles con los filtros aplicados.
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRegisterLog?.(exportMeta)}
              disabled={filteredRecords.length === 0}
              className="gap-2 rounded-lg font-display text-xs"
              data-testid="button-register-filter-log"
            >
              <Search className="h-4 w-4" />
              Registrar en log
            </Button>

            {(["csv", "txt", "xlsx"] as const).map((fmt) => (
              <Button
                key={fmt}
                variant={fmt === "xlsx" ? "default" : "outline"}
                size="sm"
                onClick={() => onExportFiltrado(exportFilters, fmt, exportMeta)}
                disabled={filteredRecords.length === 0}
                className="gap-2 rounded-lg font-display text-xs"
                data-testid={`button-export-${fmt}`}
              >
                <Download className="h-4 w-4" />
                Descargar {fmt.toUpperCase()}
              </Button>
            ))}
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
