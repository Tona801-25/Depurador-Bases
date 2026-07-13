import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  SlidersHorizontal,
  Download,
  FileSpreadsheet,
  PhoneCall,
  PhoneOff,
  Search,
  Upload,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type FuzzionCategory =
  | "TODOS"
  | "NUNCA_TRABAJADO"
  | "CONTACTADO"
  | "BUZON_SIN_CONTACTO"
  | "NO_SATURADO"
  | "REINTENTAR_MEJOR_FRANJA"
  | "DESCARTAR";

type FuzzionFilterMode = "RECOMENDACION" | "ESTADO" | "CATALOGACION";
type FuzzionExportMode = "DEPURADO" | "SEGMENTO";

type FuzzionStats = {
  nuncaTrabajados: number;
  contactados: number;
  buzonesSinContacto: number;
  noSaturados: number;
  reintentarMejorFranja: number;
  descartar: number;
};

type FuzzionRules = {
  unallocatedDescartar: number;
  rejectedDescartar: number;
  totalSaturado: number;
  noAnswerSaturado: number;
  buzonSaturado: number;
};

type FuzzionLeadPreview = {
  rowNumber: number;
  linea: string;
  razonSocial: string;
  documento: string;
  mercadoActual: string;
  planActual: string;
  planSugerido: string;
  localidad: string;
  intentosTotales: number;
  contactosEfectivos: number;
  buzones: number;
  noAnswer: number;
  invalidos: number;
  rechazados: number;
  ultimoLlamado: string;
  ultimoEstado: string;
  ultimoSubestado: string;
  bases: string[];
  categorias: FuzzionCategory[];
  resultadoGestion: string;
  subresultadoGestion: string;
  accionComercial: string;
  ultimaGestion: string;
  catalogacionesGestion: Array<{
    resultado: string;
    subresultado: string;
    accionComercial: string;
    ultimaGestion: string;
  }>;
  exclusionComercial: boolean;
  motivoExclusion: string;
};

type FuzzionComposition = {
  totalLineas: number;
  loteDepurado: number;
  descartadas: number;
  descarteTecnico: number;
  descarteComercial: number;
  descarteTecnicoYComercial: number;
  con20IntentosOMas: number;
  maxIntentos: number;
  descartesPorMotivo: Array<{ label: string; count: number }>;
  descartesPorEstado: Array<{ label: string; count: number }>;
  intentosAltos: Array<{
    linea: string;
    razonSocial: string;
    intentosTotales: number;
    ultimoEstado: string;
    ultimoSubestado: string;
    lectura: string;
  }>;
};

type FuzzionSelectionSummary = {
  rows: number;
  exportableLines: number;
  composition: FuzzionComposition;
  selections: Array<{ value: string; label: string; count: number }>;
};

type FuzzionPreview = {
  id: string;
  fileName: string;
  totalRows: number;
  validRows: number;
  uniqueAnis: number;
  stats: FuzzionStats;
  filterOptions: { estados: string[]; catalogaciones: string[] };
  preview: FuzzionLeadPreview[];
  composition?: FuzzionComposition;
};

type FuzzionTabProps = {
  onLog?: (entry: {
    kind: "filter" | "export" | "error";
    title: string;
    detail: string;
    count?: number;
  }) => void;
};

const categoryOptions: Array<{
  value: FuzzionCategory;
  label: string;
  description: string;
  stat?: keyof FuzzionPreview["stats"];
}> = [
  {
    value: "TODOS",
    label: "Todos",
    description: "Todas las líneas válidas del archivo cargado.",
  },
  {
    value: "NUNCA_TRABAJADO",
    label: "Nunca trabajados",
    description: "No tienen intentos registrados en el historial SQLite.",
    stat: "nuncaTrabajados",
  },
  {
    value: "CONTACTADO",
    label: "Con contacto efectivo",
    description: "Tuvieron al menos un ANSWER + AGENT en el historial.",
    stat: "contactados",
  },
  {
    value: "BUZON_SIN_CONTACTO",
    label: "Con buzón y sin contacto",
    description:
      "Tuvieron al menos un contestador y ningún ANSWER + AGENT.",
    stat: "buzonesSinContacto",
  },
  {
    value: "NO_SATURADO",
    label: "Sin saturación",
    description:
      "Tienen menos de 9 intentos totales, 6 NOANSWER y 5 buzones.",
    stat: "noSaturados",
  },
  {
    value: "REINTENTAR_MEJOR_FRANJA",
    label: "Aptos para reintento",
    description:
      "No tuvieron contacto, no están saturados y no presentan descarte.",
    stat: "reintentarMejorFranja",
  },
  {
    value: "DESCARTAR",
    label: "Con señal de descarte",
    description:
      "Acumulan 3 UNALLOCATED o 3 REJECTED sin contacto efectivo.",
    stat: "descartar",
  },
];

function parseDownloadName(header: string | null) {
  const match = header?.match(/filename="?([^"]+)"?/i);
  return match?.[1] || "base_fuzzion_neotel.xls";
}

function isExcludedCommercialCatalog(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  return normalized.startsWith("COMPRA |") ||
    normalized.includes("FRAUDE") ||
    normalized.includes("CLIENTE MOLESTO") ||
    normalized.includes("ES PREPAGO") ||
    normalized.includes("ES PERSONAL");
}

type MultiOption = { value: string; label: string };

const DEFAULT_FUZZION_RULES: FuzzionRules = {
  unallocatedDescartar: 3,
  rejectedDescartar: 3,
  totalSaturado: 9,
  noAnswerSaturado: 6,
  buzonSaturado: 5,
};

function getLeadCategories(lead: FuzzionLeadPreview, rules: FuzzionRules) {
  const categories: FuzzionCategory[] = [];
  if (lead.intentosTotales === 0) {
    categories.push("NUNCA_TRABAJADO", "NO_SATURADO");
    if (lead.exclusionComercial) categories.push("DESCARTAR");
    return categories;
  }

  const contactado = lead.contactosEfectivos > 0;
  const descartar =
    lead.invalidos >= rules.unallocatedDescartar ||
    (lead.rechazados >= rules.rejectedDescartar && !contactado) ||
    lead.exclusionComercial;
  const saturado =
    lead.intentosTotales >= rules.totalSaturado ||
    lead.noAnswer >= rules.noAnswerSaturado ||
    lead.buzones >= rules.buzonSaturado;

  if (contactado) categories.push("CONTACTADO");
  if (lead.buzones > 0 && !contactado) categories.push("BUZON_SIN_CONTACTO");
  if (!saturado) categories.push("NO_SATURADO");
  if (!contactado && !descartar && !saturado) {
    categories.push("REINTENTAR_MEJOR_FRANJA");
  }
  if (descartar) categories.push("DESCARTAR");
  return categories;
}

function MultiCheckSelect({
  options,
  values,
  onChange,
  disabled = false,
}: {
  options: MultiOption[];
  values: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
}) {
  const summary = values.length === 0
    ? "Todos"
    : values.length === 1
      ? options.find((option) => option.value === values[0])?.label || values[0]
      : `${values.length} seleccionados`;

  const toggle = (value: string) => {
    onChange(values.includes(value)
      ? values.filter((item) => item !== value)
      : [...values, value]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="h-10 w-full justify-between rounded-none px-3 font-normal"
        >
          <span className="truncate">{summary}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-2">
        <label className="flex cursor-pointer items-center gap-2 px-2 py-2 text-sm hover:bg-muted/50">
          <Checkbox checked={values.length === 0} onCheckedChange={() => onChange([])} />
          <span>Todos</span>
        </label>
        <div className="max-h-64 overflow-y-auto">
          {options.map((option) => (
            <label key={option.value} className="flex cursor-pointer items-start gap-2 px-2 py-2 text-sm hover:bg-muted/50">
              <Checkbox
                checked={values.includes(option.value)}
                onCheckedChange={() => toggle(option.value)}
              />
              <span className="leading-4">{option.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function FuzzionTab({ onLog }: FuzzionTabProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [data, setData] = useState<FuzzionPreview | null>(null);
  const [composition, setComposition] = useState<FuzzionComposition | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<FuzzionCategory[]>([]);
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<FuzzionFilterMode>("RECOMENDACION");
  const [exportMode, setExportMode] = useState<FuzzionExportMode>("DEPURADO");
  const [filterValues, setFilterValues] = useState<string[]>([]);
  const [rangeDays, setRangeDays] = useState(0);
  const [compositionOpen, setCompositionOpen] = useState(true);
  const [configOpen, setConfigOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [fuzzionRules, setFuzzionRules] = useState<FuzzionRules>(DEFAULT_FUZZION_RULES);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [quickCategory, setQuickCategory] = useState<FuzzionCategory | null>(null);
  const [quickExporting, setQuickExporting] = useState(false);
  const [quickRangeDays, setQuickRangeDays] = useState(7);
  const [selectedExportCount, setSelectedExportCount] = useState<number | null>(null);
  const [selectionSummary, setSelectionSummary] = useState<FuzzionSelectionSummary | null>(null);
  const [countingSelection, setCountingSelection] = useState(false);
  const [ruleStats, setRuleStats] = useState<FuzzionStats | null>(null);

  const filterChoices = useMemo(() => {
    if (!data) return [];
    if (filterMode === "ESTADO") return data.filterOptions.estados;
    if (filterMode === "CATALOGACION") return data.filterOptions.catalogaciones;
    return categoryOptions.map((option) => option.value);
  }, [data, filterMode]);

  const quickOption = categoryOptions.find(
    (option) => option.value === quickCategory,
  );
  const dynamicStats = ruleStats ?? data?.stats ?? {
    nuncaTrabajados: 0,
    contactados: 0,
    buzonesSinContacto: 0,
    noSaturados: 0,
    reintentarMejorFranja: 0,
    descartar: 0,
  };

  const quickCount = quickOption?.stat
    ? dynamicStats[quickOption.stat]
    : 0;

  useEffect(() => {
    if (!data) {
      setComposition(null);
      return;
    }
    if (data.composition) {
      setComposition(data.composition);
      return;
    }

    fetch(`/api/fuzzion/${data.id}/composition`)
      .then((response) => {
        if (!response.ok) throw new Error("No se pudo leer la composicion del lote.");
        return response.json();
      })
      .then((payload: FuzzionComposition) => setComposition(payload))
      .catch(() => setComposition(null));
  }, [data]);

  useEffect(() => {
    if (!data) {
      setRuleStats(null);
      return;
    }

    const controller = new AbortController();
    setRuleStats(data.stats);
    fetch(`/api/fuzzion/${data.id}/stats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: fuzzionRules }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("No se pudieron recalcular las tarjetas.");
        return response.json();
      })
      .then((payload: FuzzionStats) => setRuleStats(payload))
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRuleStats(data.stats);
      });

    return () => controller.abort();
  }, [data, fuzzionRules]);

  useEffect(() => {
    if (!data) {
      setSelectedExportCount(null);
      setSelectionSummary(null);
      setCountingSelection(false);
      return;
    }

    const controller = new AbortController();
    setCountingSelection(true);
    const timeout = window.setTimeout(() => {
      controller.abort();
      setCountingSelection(false);
      setSelectedExportCount(null);
      setSelectionSummary(null);
    }, 4_000);
    const timer = window.setTimeout(() => {
      fetch(`/api/fuzzion/${data.id}/count`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories: selectedCategories,
          search,
          filterMode,
          filterValues,
          rangeDays,
          exportMode,
          rules: fuzzionRules,
        }),
        signal: controller.signal,
      })
        .then((response) => {
        if (!response.ok) throw new Error("No se pudo contar la selección.");
          return response.json();
        })
        .then((payload: FuzzionSelectionSummary) => {
          setSelectedExportCount(payload.exportableLines);
          setSelectionSummary(payload);
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setSelectedExportCount(null);
          setSelectionSummary(null);
        })
        .finally(() => {
          window.clearTimeout(timeout);
          if (!controller.signal.aborted) setCountingSelection(false);
        });
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
      window.clearTimeout(timer);
    };
  }, [data, exportMode, filterMode, filterValues, fuzzionRules, rangeDays, search, selectedCategories]);

  const multiOptions = useMemo<MultiOption[]>(() => {
    if (filterMode === "RECOMENDACION") {
      return categoryOptions
        .filter((option) => option.value !== "TODOS")
        .map((option) => ({ value: option.value, label: option.label }));
    }
    return filterChoices.map((value) => ({ value, label: value }));
  }, [filterChoices, filterMode]);

  const displayedComposition = selectionSummary?.composition ?? composition;
  const showingSelectionComposition = Boolean(selectionSummary);
  const selectedBreakdown = selectionSummary?.selections.map((item) => ({
    ...item,
    label:
      filterMode === "RECOMENDACION"
        ? categoryOptions.find((option) => option.value === item.value)?.label || item.label
        : item.label,
  })) ?? [];

  const visiblePreview = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();
    const cutoff = rangeDays > 0 ? Date.now() - rangeDays * 86400000 : 0;

    return data.preview.filter((lead) => {
      const leadCategories = getLeadCategories(lead, fuzzionRules);
      if (exportMode === "DEPURADO" && leadCategories.includes("DESCARTAR")) return false;
      const reviewingExcludedCatalog =
        exportMode === "SEGMENTO" &&
        filterMode === "CATALOGACION" &&
        filterValues.some(isExcludedCommercialCatalog);
      const reviewingDiscardGroup =
        exportMode === "SEGMENTO" &&
        filterMode === "RECOMENDACION" &&
        selectedCategories.includes("DESCARTAR");
      if (
        exportMode === "SEGMENTO" &&
        lead.exclusionComercial &&
        !reviewingExcludedCatalog &&
        !reviewingDiscardGroup
      ) return false;
      if (filterMode === "RECOMENDACION" && selectedCategories.length > 0 && !selectedCategories.some(
        (category) => leadCategories.includes(category),
      )) return false;
      if (filterMode === "ESTADO" && filterValues.length > 0 && !filterValues.includes(
        `${lead.ultimoEstado} | ${lead.ultimoSubestado}`,
      )) return false;
      if (filterMode === "CATALOGACION" && filterValues.length > 0 && !lead.catalogacionesGestion.some(
        (item) => filterValues.includes(`${item.resultado} | ${item.subresultado}`),
      )) return false;

      if (cutoff > 0) {
        if (filterMode === "CATALOGACION" && filterValues.length > 0) {
          const hasRecentCatalog = lead.catalogacionesGestion.some((item) => {
            const key = `${item.resultado} | ${item.subresultado}`;
            return filterValues.includes(key) && new Date(item.ultimaGestion).getTime() >= cutoff;
          });
          if (!hasRecentCatalog) return false;
        } else {
          const value = filterMode === "CATALOGACION"
            ? lead.ultimaGestion
            : [lead.ultimoLlamado, lead.ultimaGestion]
                .filter(Boolean)
                .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || "";
          const timestamp = value ? new Date(value).getTime() : 0;
          if (!timestamp || timestamp < cutoff) return false;
        }
      }

      if (!query) return true;
      return [lead.linea, lead.razonSocial, lead.documento, lead.mercadoActual, lead.planActual, lead.ultimoEstado, lead.ultimoSubestado, lead.resultadoGestion, lead.subresultadoGestion, ...lead.bases]
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [data, exportMode, filterMode, filterValues, fuzzionRules, rangeDays, search, selectedCategories]);

  async function handleFile(file?: File) {
    if (!file) return;

    setUploading(true);
    setData(null);
    setComposition(null);
    setRuleStats(null);
    setSelectionSummary(null);
    setSelectedCategories([]);
    setExportMode("DEPURADO");
    setFilterMode("RECOMENDACION");
    setFilterValues([]);
    setRangeDays(0);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/fuzzion/preview", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.detail || payload.message || "Error al cargar Fuzzión");
      }

      setData(payload);
      onLog?.({
        kind: "filter",
        title: "Base Fuzzión cruzada",
        detail: `${payload.fileName} · ${payload.uniqueAnis.toLocaleString("es-AR")} líneas únicas (ANIs)`,
        count: payload.validRows,
      });
      toast({
        title: "Base Fuzzión lista",
        description: `Se cruzaron ${payload.validRows.toLocaleString(
          "es-AR",
        )} filas contra el historial SQLite.`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo leer el archivo";
      onLog?.({
        kind: "error",
        title: "Falló la carga Fuzzión",
        detail: message,
      });
      toast({
        title: "No se pudo procesar la base Fuzzión",
        description: message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleExport() {
    if (!data) return;

    setExporting(true);
    try {
      const response = await fetch(`/api/fuzzion/${data.id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories: selectedCategories,
          search,
          filterMode,
          filterValues,
          rangeDays,
          exportMode,
          rules: fuzzionRules,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || "No se pudo generar el lote");
      }

      const exportedCount = Number(response.headers.get("X-Exported-Count")) || undefined;
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = parseDownloadName(
        response.headers.get("Content-Disposition"),
      );
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      onLog?.({
        kind: "export",
        title: "Lote Fuzzión exportado",
        detail: exportMode === "DEPURADO"
          ? "Lote depurado para llamar"
          : filterMode === "RECOMENDACION"
            ? selectedCategories.map((value) => categoryOptions.find((item) => item.value === value)?.label || value).join(" + ") || "Todos"
            : filterValues.join(" + ") || "Todos",
        count: exportedCount,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo descargar";
      onLog?.({
        kind: "error",
        title: "Falló la descarga Fuzzión",
        detail: message,
      });
      toast({
        title: "Error al exportar",
        description: message,
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  }

  async function handleQuickExport() {
    if (!data || !quickCategory || !quickOption) return;

    setQuickExporting(true);
    try {
      const response = await fetch(`/api/fuzzion/${data.id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories: [quickCategory],
          search: "",
          filterMode: "RECOMENDACION",
          filterValues: [],
          rangeDays: quickRangeDays,
          exportMode: "SEGMENTO",
          rules: fuzzionRules,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || "No se pudo generar el lote");
      }

      const exportedCount = Number(response.headers.get("X-Exported-Count")) || undefined;
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = parseDownloadName(response.headers.get("Content-Disposition"));
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      onLog?.({
        kind: "export",
        title: "Lote rápido exportado",
        detail: quickOption.label,
        count: exportedCount,
      });
      toast({
        title: "Lote listo",
        description: `${(exportedCount ?? quickCount).toLocaleString("es-AR")} líneas exportadas: ${quickOption.label}.`,
      });
      setQuickCategory(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo descargar";
      toast({ title: "Error al exportar", description: message, variant: "destructive" });
    } finally {
      setQuickExporting(false);
    }
  }

  return (
    <Card className="glass-card border-glass-border">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
              Modo operativo
            </p>
            <CardTitle className="mt-1 flex items-center gap-2 text-base font-bold uppercase">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Base Fuzzión / Lote Neotel
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Cruza una base comercial contra el historial SQLite y conserva el
              formato final compatible con Neotel.
            </p>
          </div>

          <input
            ref={inputRef}
            className="hidden"
            type="file"
            accept=".xls,.xlsx,.csv,.txt"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
          <Button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="mr-2 h-4 w-4" />
            {uploading ? "Cruzando..." : "Cargar base Fuzzión"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {[
            { category: "NUNCA_TRABAJADO" as const, label: "Nunca trabajados", count: dynamicStats.nuncaTrabajados, valueClass: "text-foreground", cardClass: "border-border bg-background" },
            { category: "CONTACTADO" as const, label: "Con contacto efectivo", count: dynamicStats.contactados, valueClass: "text-success", cardClass: "border-border bg-background" },
            { category: "BUZON_SIN_CONTACTO" as const, label: "Con buzón y sin contacto", count: data?.stats.buzonesSinContacto ?? 0, valueClass: "text-warning", cardClass: "border-border bg-background" },
            { category: "REINTENTAR_MEJOR_FRANJA" as const, label: "Aptos para reintento", count: dynamicStats.reintentarMejorFranja, valueClass: "text-primary", cardClass: "border-border bg-background" },
            { category: "DESCARTAR" as const, label: "Con señal de descarte", count: data?.stats.descartar ?? 0, valueClass: "text-destructive", cardClass: "border-destructive/25 bg-destructive/5" },
          ].map((item) => {
            const countByCategory: Record<FuzzionCategory, number> = {
              TODOS: data?.validRows ?? 0,
              NUNCA_TRABAJADO: dynamicStats.nuncaTrabajados,
              CONTACTADO: dynamicStats.contactados,
              BUZON_SIN_CONTACTO: dynamicStats.buzonesSinContacto,
              NO_SATURADO: dynamicStats.noSaturados,
              REINTENTAR_MEJOR_FRANJA: dynamicStats.reintentarMejorFranja,
              DESCARTAR: dynamicStats.descartar,
            };
            const count = countByCategory[item.category];

            return (
            <button
              key={item.category}
              type="button"
              disabled={!data || count === 0}
              onClick={() => {
                setQuickCategory(item.category);
                setQuickRangeDays(item.category === "NUNCA_TRABAJADO" ? 0 : 7);
              }}
              className={`soft-cyan-hover min-h-[74px] rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default disabled:opacity-60 ${item.cardClass}`}
              title={data ? `Abrir descarga de ${item.label.toLowerCase()}` : "Cargá una base Fuzzión primero"}
            >
              <p className="text-[11px] uppercase text-muted-foreground">{item.label}</p>
              <p className={`mt-1 text-xl font-bold ${item.valueClass}`}>
                {count.toLocaleString("es-AR")}
              </p>
            </button>
            );
          })}
        </div>

        {!data ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            Acepta los dos formatos mostrados: archivo Fuzzión con columna
            <span className="font-semibold text-foreground"> Ani</span> o archivo
            final con columna
            <span className="font-semibold text-foreground"> LINEA</span>.
          </div>
        ) : (
          <>
            {displayedComposition ? (
              <div className="rounded-lg border border-border bg-background p-3">
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{showingSelectionComposition ? "Composición de la selección actual" : "Composición del lote cargado"}</p>
                    <p className="text-xs text-muted-foreground">
                      {displayedComposition.loteDepurado.toLocaleString("es-AR")} quedan · {displayedComposition.descartadas.toLocaleString("es-AR")} se quitan · máximo {displayedComposition.maxIntentos} intentos
                    </p>
                  </div>
                  <span className="flex flex-wrap items-center gap-2">
                    {displayedComposition.con20IntentosOMas > 0 ? (
                      <Badge variant="outline" className="border-destructive/35 text-destructive">
                        {displayedComposition.con20IntentosOMas.toLocaleString("es-AR")} líneas con 20+ intentos
                      </Badge>
                    ) : null}
                    <button
                      type="button"
                      className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                      onClick={() => setCompositionOpen((current) => !current)}
                      aria-expanded={compositionOpen}
                    >
                      {compositionOpen ? "Ocultar detalle" : "Ver detalle"}
                      <ChevronDown className={`h-4 w-4 transition-transform ${compositionOpen ? "rotate-180" : ""}`} />
                    </button>
                  </span>
                </div>

                {compositionOpen ? (
                  <>
                    <div className="mt-3 grid gap-2 md:grid-cols-4">
                      {[
                        [showingSelectionComposition ? "Total selección" : "Total cargado", displayedComposition.totalLineas],
                        ["Queda en lote depurado", displayedComposition.loteDepurado],
                        ["Se quita del lote", displayedComposition.descartadas],
                        ["Máximo de intentos", displayedComposition.maxIntentos],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="border border-border px-3 py-2">
                          <p className="text-[11px] uppercase text-muted-foreground">{label}</p>
                          <p className="mt-1 text-lg font-bold text-foreground">
                            {Number(value).toLocaleString("es-AR")}
                          </p>
                        </div>
                      ))}
                    </div>

                    {selectedBreakdown.length > 0 ? (
                      <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                        <p className="text-xs font-semibold uppercase text-primary">
                          Detalle de lo seleccionado
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Los grupos pueden superponerse. El total seleccionado cuenta cada línea una sola vez.
                        </p>
                        <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {selectedBreakdown.map((item) => (
                            <div key={item.value} className="flex items-center justify-between gap-3 border border-border/70 px-3 py-2 text-xs">
                              <span className="truncate text-muted-foreground">{item.label}</span>
                              <strong className="text-foreground">{item.count.toLocaleString("es-AR")}</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      <div className="rounded-lg border border-border p-3">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Por que se descartan
                        </p>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                          <span><strong className="text-foreground">{displayedComposition.descarteTecnico.toLocaleString("es-AR")}</strong> técnicas</span>
                          <span><strong className="text-foreground">{displayedComposition.descarteComercial.toLocaleString("es-AR")}</strong> comerciales</span>
                          <span><strong className="text-foreground">{displayedComposition.descarteTecnicoYComercial.toLocaleString("es-AR")}</strong> ambas</span>
                        </div>
                        <div className="mt-3 space-y-1">
                          {displayedComposition.descartesPorMotivo.slice(0, 6).map((item) => (
                            <div key={item.label} className="flex items-center justify-between gap-3 text-xs">
                              <span className="truncate text-muted-foreground">{item.label}</span>
                              <strong className="text-foreground">{item.count.toLocaleString("es-AR")}</strong>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-lg border border-border p-3">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Estados de esas líneas
                        </p>
                        <div className="mt-2 space-y-1">
                          {displayedComposition.descartesPorEstado.slice(0, 6).map((item) => (
                            <div key={item.label} className="flex items-center justify-between gap-3 text-xs">
                              <span className="truncate text-muted-foreground">{item.label}</span>
                              <strong className="text-foreground">{item.count.toLocaleString("es-AR")}</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {displayedComposition.intentosAltos.length > 0 ? (
                      <div className="mt-3 rounded-lg border border-destructive/25 bg-destructive/5 p-3">
                        <p className="text-xs font-semibold uppercase text-destructive">
                          Muestra de líneas con más intentos
                        </p>
                        <div className="mt-2 max-h-36 divide-y divide-border/70 overflow-auto">
                          {displayedComposition.intentosAltos.map((lead) => (
                            <div key={lead.linea} className="grid grid-cols-[110px_1fr_70px_150px] gap-2 py-1.5 text-xs">
                              <span className="font-mono text-foreground">{lead.linea}</span>
                              <span className="truncate text-muted-foreground">{lead.razonSocial || "-"}</span>
                              <strong className="text-foreground">{lead.intentosTotales}</strong>
                              <span className="truncate text-muted-foreground">{lead.lectura}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}

            <div className="border border-border bg-background">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                onClick={() => setConfigOpen((current) => !current)}
                aria-expanded={configOpen}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <SlidersHorizontal className="h-4 w-4 text-primary" />
                  Configurar lote
                  <Badge variant="outline">
                    {exportMode === "DEPURADO"
                      ? "Lote depurado"
                      : rangeDays > 0
                        ? `Últimos ${rangeDays} días`
                        : "Grupo puntual"}
                  </Badge>
                  <Badge variant="outline" className="border-primary/30 text-primary">
                    {countingSelection
                      ? "Contando..."
                      : selectedExportCount === null
                        ? "Conteo no disponible"
                        : `${selectedExportCount.toLocaleString("es-AR")} líneas quedan`}
                  </Badge>
                </span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${configOpen ? "rotate-180" : ""}`} />
              </button>

              {configOpen ? (
                <div className="space-y-3 border-t border-border p-3">
                  <div className="grid gap-2 lg:grid-cols-4">
                    <label className="space-y-1 text-xs text-muted-foreground">
                      <span>Quiero descargar</span>
                      <select
                        value={exportMode}
                        onChange={(event) => {
                          const mode = event.target.value as FuzzionExportMode;
                          setExportMode(mode);
                          if (mode === "DEPURADO") {
                            setFilterMode("RECOMENDACION");
                            setSelectedCategories([]);
                            setFilterValues([]);
                            setRangeDays(0);
                          }
                        }}
                        className="h-10 w-full border border-border bg-background px-3 text-sm text-foreground"
                      >
                        <option value="DEPURADO">Lote depurado para llamar</option>
                        <option value="SEGMENTO">Un grupo puntual</option>
                      </select>
                    </label>

                    <label className="space-y-1 text-xs text-muted-foreground">
                      <span>Filtrar según</span>
                      <select
                        disabled={exportMode === "DEPURADO"}
                        value={filterMode}
                        onChange={(event) => {
                          setFilterMode(event.target.value as FuzzionFilterMode);
                          setSelectedCategories([]);
                          setFilterValues([]);
                        }}
                        className="h-10 w-full border border-border bg-background px-3 text-sm text-foreground"
                      >
                        <option value="RECOMENDACION">Recomendación operativa</option>
                        <option value="ESTADO">Estado técnico del ticket</option>
                        <option value="CATALOGACION">Catalogación comercial</option>
                      </select>
                    </label>

                    <div className="space-y-1 text-xs text-muted-foreground">
                      <span>Valores</span>
                      <MultiCheckSelect
                        disabled={exportMode === "DEPURADO"}
                        options={multiOptions}
                        values={filterMode === "RECOMENDACION" ? selectedCategories : filterValues}
                        onChange={(values) => {
                          if (filterMode === "RECOMENDACION") {
                            setSelectedCategories(values as FuzzionCategory[]);
                          } else {
                            setFilterValues(values);
                          }
                        }}
                      />
                    </div>

                    <label className="space-y-1 text-xs text-muted-foreground">
                      <span>Rango histórico</span>
                      <select
                        disabled={exportMode === "DEPURADO"}
                        value={rangeDays}
                        onChange={(event) => setRangeDays(Number(event.target.value))}
                        className="h-10 w-full border border-border bg-background px-3 text-sm text-foreground"
                      >
                        <option value={0}>Todo el historial</option>
                        <option value={7}>Últimos 7 días</option>
                        <option value={30}>Últimos 30 días</option>
                        <option value={60}>Últimos 60 días</option>
                        <option value={90}>Últimos 90 días</option>
                      </select>
                    </label>
                  </div>

                  <div className="border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                    <p className="mb-1 font-semibold text-foreground">
                      {countingSelection
                        ? "Calculando líneas disponibles..."
                        : selectedExportCount === null
                          ? "Podés descargar igual; el conteo previo no respondió a tiempo."
                          : `Con esta selección quedan ${selectedExportCount.toLocaleString("es-AR")} líneas para descargar.`}
                    </p>
                    {exportMode === "DEPURADO" ? (
                      <>
                        Se conservarán las líneas aptas y se quitarán del archivo las
                        catalogadas como compra, fraude, cliente molesto, prepago o ya
                        pertenecientes a Personal, además de los descartes técnicos. Los
                        datos continúan guardados en SQLite.
                      </>
                    ) : (
                      <>
                        Este modo descarga solamente el estado o la catalogación elegida.
                        Usalo, por ejemplo, para armar un lote de re-llamados. Las exclusiones
                        comerciales se mantienen, salvo que elijas una de ellas expresamente
                        para controlarla por separado.
                      </>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Buscar línea, nombre, DNI, estado o catalogación..." />
                    </div>
                    <Button type="button" onClick={handleExport} disabled={exporting || !data || selectedExportCount === 0}>
                      <Download className="mr-2 h-4 w-4" />
                      {exporting
                        ? "Generando..."
                        : countingSelection
                          ? "Descargar sin esperar conteo"
                        : selectedExportCount === null
                          ? exportMode === "DEPURADO"
                            ? "Descargar lote depurado"
                            : "Descargar grupos seleccionados"
                        : exportMode === "DEPURADO"
                          ? `Descargar lote depurado (${selectedExportCount.toLocaleString("es-AR")})`
                          : `Descargar grupos seleccionados (${selectedExportCount.toLocaleString("es-AR")})`}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="border border-border bg-background">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                onClick={() => setRulesOpen((current) => !current)}
                aria-expanded={rulesOpen}
              >
                <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  <SlidersHorizontal className="h-4 w-4 text-primary" />
                  Reglas de depuración
                  <Badge variant="outline">
                    UNALLOCATED {fuzzionRules.unallocatedDescartar}+ · REJECTED {fuzzionRules.rejectedDescartar}+ · Saturación {fuzzionRules.totalSaturado} intentos
                  </Badge>
                </span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${rulesOpen ? "rotate-180" : ""}`} />
              </button>

              {rulesOpen ? (
                <div className="space-y-3 border-t border-border p-3">
                  <p className="text-xs text-muted-foreground">
                    Estas reglas afectan el conteo, el lote depurado y los grupos operativos. Ajustalas antes de descargar si querés endurecer o aflojar el criterio.
                  </p>
                  <div className="grid gap-2 md:grid-cols-5">
                    {([
                      ["unallocatedDescartar", "Descartar UNALLOCATED desde"],
                      ["rejectedDescartar", "Descartar REJECTED desde"],
                      ["totalSaturado", "Saturado por intentos desde"],
                      ["noAnswerSaturado", "Saturado NOANSWER desde"],
                      ["buzonSaturado", "Saturado buzón desde"],
                    ] as Array<[keyof FuzzionRules, string]>).map(([key, label]) => (
                      <label key={key} className="space-y-1 text-xs text-muted-foreground">
                        <span>{label}</span>
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          value={fuzzionRules[key]}
                          onChange={(event) => {
                            const value = Math.max(1, Math.floor(Number(event.target.value) || DEFAULT_FUZZION_RULES[key]));
                            setFuzzionRules((current) => ({ ...current, [key]: value }));
                          }}
                          className="h-10"
                        />
                      </label>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFuzzionRules(DEFAULT_FUZZION_RULES)}
                  >
                    Restaurar reglas estándar
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="overflow-hidden rounded-lg border border-border">
              <div className="grid grid-cols-[minmax(110px,1fr)_minmax(150px,1.5fr)_100px_110px_130px] gap-3 bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase text-muted-foreground">
                <span>Línea</span>
                <span>Cliente</span>
                <span>Intentos</span>
                <span>Último estado</span>
                <span>Lectura</span>
              </div>
              <div className="max-h-72 divide-y divide-border overflow-auto">
                {visiblePreview.slice(0, 100).map((lead) => {
                  const leadCategories = getLeadCategories(lead, fuzzionRules);

                  return (
                  <div
                    key={`${lead.rowNumber}-${lead.linea}`}
                    className="grid grid-cols-[minmax(110px,1fr)_minmax(150px,1.5fr)_100px_110px_130px] gap-3 px-3 py-2 text-xs"
                  >
                    <span className="font-mono text-foreground">{lead.linea}</span>
                    <span className="truncate">{lead.razonSocial || "-"}</span>
                    <span>{lead.intentosTotales}</span>
                    <span className="truncate">{lead.ultimoEstado || "Sin historial"}</span>
                    <div>
                      {leadCategories.includes("DESCARTAR") ? (
                        <Badge variant="destructive">
                          <XCircle className="mr-1 h-3 w-3" />
                          Descartar
                        </Badge>
                      ) : leadCategories.includes("CONTACTADO") ? (
                        <Badge variant="outline" className="text-success">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Contacto efectivo
                        </Badge>
                      ) : leadCategories.includes("BUZON_SIN_CONTACTO") ? (
                        <Badge variant="outline" className="text-warning">
                          <PhoneOff className="mr-1 h-3 w-3" />
                          Buzón sin contacto
                        </Badge>
                      ) : leadCategories.includes("NUNCA_TRABAJADO") ? (
                        <Badge variant="outline">Nunca trabajado</Badge>
                      ) : leadCategories.includes("REINTENTAR_MEJOR_FRANJA") ? (
                        <Badge variant="outline" className="text-primary">
                          <PhoneCall className="mr-1 h-3 w-3" />
                          Apto para reintento
                        </Badge>
                      ) : (
                        <Badge variant="outline">Con historial</Badge>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <div className="space-y-1 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          <p>
            <span className="font-semibold text-foreground">Cómo leerlo:</span>{" "}
            cada intento es una llamada registrada para ese ANI en todo el
            historial SQLite.
          </p>
          <p>
            Las categorías son condiciones acumulables: un ANI puede figurar,
            por ejemplo, como con buzón, sin saturación y apto para reintento al
            mismo tiempo.
          </p>
          <p>
            Contacto efectivo = al menos 1 ANSWER + AGENT. Saturación ={" "}
            {fuzzionRules.totalSaturado} intentos totales,{" "}
            {fuzzionRules.noAnswerSaturado} NOANSWER o{" "}
            {fuzzionRules.buzonSaturado} buzones. Descarte ={" "}
            {fuzzionRules.unallocatedDescartar} UNALLOCATED o{" "}
            {fuzzionRules.rejectedDescartar} REJECTED sin contacto efectivo.
          </p>
        </div>

        <Dialog
          open={Boolean(quickCategory)}
          onOpenChange={(open) => {
            if (!open && !quickExporting) setQuickCategory(null);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{quickOption?.label ?? "Descargar lote"}</DialogTitle>
              <DialogDescription>
                Se generará un archivo Neotel únicamente con las líneas de este grupo.
              </DialogDescription>
            </DialogHeader>

            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Rango histórico</span>
              <select
                value={quickRangeDays}
                disabled={quickCategory === "NUNCA_TRABAJADO"}
                onChange={(event) => setQuickRangeDays(Number(event.target.value))}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground disabled:opacity-70"
              >
                {quickCategory === "NUNCA_TRABAJADO" ? (
                  <option value={0}>Todo el historial · sin llamadas previas</option>
                ) : (
                  <>
                    <option value={7}>Últimos 7 días</option>
                    <option value={30}>Últimos 30 días</option>
                    <option value={60}>Últimos 60 días</option>
                    <option value={90}>Últimos 90 días</option>
                    <option value={0}>Todo el historial</option>
                  </>
                )}
              </select>
            </label>

            <div className="border-y border-border py-4">
              <p className="text-3xl font-bold text-foreground">
                {quickCount.toLocaleString("es-AR")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                líneas del grupo antes de aplicar el rango histórico
              </p>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {quickCategory === "DESCARTAR"
                  ? "Este es un archivo de control: incluye descartes técnicos y exclusiones comerciales. No está pensado para volver a llamar."
                  : "Las compras, fraudes, clientes molestos, líneas prepagas y líneas que ya pertenecen a Personal se excluirán por seguridad."}
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={quickExporting}
                onClick={() => setQuickCategory(null)}
              >
                Cancelar
              </Button>
              <Button type="button" disabled={quickExporting} onClick={handleQuickExport}>
                <Download className="mr-2 h-4 w-4" />
                {quickExporting ? "Generando..." : "Descargar lote"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

