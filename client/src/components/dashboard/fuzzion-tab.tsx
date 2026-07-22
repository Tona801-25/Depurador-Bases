import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  SlidersHorizontal,
  Download,
  FileSpreadsheet,
  Minus,
  PhoneCall,
  PhoneOff,
  Plus,
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
import { cn } from "@/lib/utils";

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
  intentosDescartar: number;
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
    label: "Sin historial en tickets SQLite",
    description: "No aparecen en los tickets guardados en SQLite.",
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
  intentosDescartar: 100,
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
    lead.intentosTotales >= rules.intentosDescartar ||
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

function getLeadReading(
  lead: FuzzionLeadPreview,
  categories: FuzzionCategory[],
  rules: FuzzionRules,
) {
  const contactado = categories.includes("CONTACTADO");
  const sinHistorial = categories.includes("NUNCA_TRABAJADO");
  const descartar = categories.includes("DESCARTAR");
  const noSaturado = categories.includes("NO_SATURADO");
  const reintentar = categories.includes("REINTENTAR_MEJOR_FRANJA");
  const buzonSinContacto = categories.includes("BUZON_SIN_CONTACTO");

  if (descartar) {
    if (lead.exclusionComercial) {
      return {
        label: lead.motivoExclusion || "No llamar: exclusion comercial",
        variant: "destructive" as const,
        className: "",
        icon: XCircle,
      };
    }
    if (lead.intentosTotales >= rules.intentosDescartar) {
      return {
        label: `No llamar: ${rules.intentosDescartar}+ intentos`,
        variant: "destructive" as const,
        className: "",
        icon: XCircle,
      };
    }
    if (lead.invalidos >= rules.unallocatedDescartar) {
      return {
        label: "No llamar: UNALLOCATED",
        variant: "destructive" as const,
        className: "",
        icon: XCircle,
      };
    }
    if (lead.rechazados >= rules.rejectedDescartar && !contactado) {
      return {
        label: "No llamar: REJECTED",
        variant: "destructive" as const,
        className: "",
        icon: XCircle,
      };
    }
    return {
      label: "No llamar",
      variant: "destructive" as const,
      className: "",
      icon: XCircle,
    };
  }

  if (sinHistorial) {
    return {
      label: "Sin historial",
      variant: "outline" as const,
      className: "text-foreground",
      icon: Search,
    };
  }

  if (reintentar) {
    return {
      label: "Apta para reintento",
      variant: "outline" as const,
      className: "text-primary",
      icon: PhoneCall,
    };
  }

  if (contactado && !noSaturado) {
    return {
      label: "Revisar: contacto histórico",
      variant: "outline" as const,
      className: "text-warning",
      icon: CheckCircle2,
    };
  }

  if (contactado) {
    return {
      label: "Contacto histórico",
      variant: "outline" as const,
      className: "text-success",
      icon: CheckCircle2,
    };
  }

  if (buzonSinContacto && !noSaturado) {
    return {
      label: "Pausar: buzón saturado",
      variant: "outline" as const,
      className: "text-warning",
      icon: PhoneOff,
    };
  }

  if (buzonSinContacto) {
    return {
      label: "Segmentar: buzón",
      variant: "outline" as const,
      className: "text-warning",
      icon: PhoneOff,
    };
  }

  if (!noSaturado) {
    return {
      label: "Pausar: saturada",
      variant: "outline" as const,
      className: "text-warning",
      icon: PhoneOff,
    };
  }

  return {
    label: "Con historial",
    variant: "outline" as const,
    className: "text-muted-foreground",
    icon: CheckCircle2,
  };
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
          className="soft-cyan-hover h-10 w-full justify-between rounded-none px-3 font-normal"
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

function FlatSelect({
  value,
  options,
  onChange,
  disabled = false,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? options[0]?.label ?? "Seleccionar";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="soft-cyan-hover h-11 w-full justify-between rounded-none border-primary/25 bg-background px-3 text-sm font-semibold focus:ring-0 focus:ring-offset-0"
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] rounded-none border-primary/25 bg-popover p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={cn(
              "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-primary/10 hover:text-primary",
              option.value === value && "bg-primary/10 text-primary"
            )}
            onClick={() => onChange(option.value)}
          >
            <span>{option.label}</span>
            {option.value === value ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : null}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function FuzzionTab({ onLog }: FuzzionTabProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const flatInputRef = useRef<HTMLInputElement>(null);
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
  const [cardDetailOpen, setCardDetailOpen] = useState(false);
  const [highAttemptsOpen, setHighAttemptsOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [fuzzionRules, setFuzzionRules] = useState<FuzzionRules>(DEFAULT_FUZZION_RULES);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportReviewOpen, setExportReviewOpen] = useState(false);
  const [quickCategory, setQuickCategory] = useState<FuzzionCategory | null>(null);
  const [quickExporting, setQuickExporting] = useState(false);
  const [quickRangeDays, setQuickRangeDays] = useState(7);
  const [quickExportCount, setQuickExportCount] = useState<number | null>(null);
  const [quickCounting, setQuickCounting] = useState(false);
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

  const updateFuzzionRule = (key: keyof FuzzionRules, value: number) => {
    const nextValue = Math.max(1, Math.floor(value || DEFAULT_FUZZION_RULES[key]));
    setFuzzionRules((current) => ({ ...current, [key]: nextValue }));
  };

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

  useEffect(() => {
    if (!data || !quickCategory) {
      setQuickExportCount(null);
      setQuickCounting(false);
      return;
    }

    const controller = new AbortController();
    setQuickCounting(true);
    setQuickExportCount(null);

    fetch(`/api/fuzzion/${data.id}/count`, {
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
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("No se pudo contar el lote rapido.");
        return response.json();
      })
      .then((payload: FuzzionSelectionSummary) => {
        setQuickExportCount(payload.exportableLines);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setQuickExportCount(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setQuickCounting(false);
      });

    return () => controller.abort();
  }, [data, fuzzionRules, quickCategory, quickRangeDays]);

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
  const exportReviewComposition = selectionSummary?.composition ?? displayedComposition;
  const exportReviewCount = selectedExportCount ?? exportReviewComposition?.loteDepurado ?? 0;
  const exportReviewLabel = exportMode === "DEPURADO"
    ? "Lote depurado para llamar"
    : filterMode === "RECOMENDACION"
      ? selectedCategories.map((value) => categoryOptions.find((item) => item.value === value)?.label || value).join(" + ") || "Todos"
      : filterValues.join(" + ") || "Todos";
  const operationalSummary = useMemo(() => {
    if (!data) {
      return {
        noLlamar: 0,
        pausar: 0,
        reintentar: 0,
        segmentar: 0,
      };
    }

    const summary = {
      noLlamar: 0,
      pausar: 0,
      reintentar: 0,
      segmentar: 0,
    };

    for (const lead of data.preview) {
      const leadCategories = getLeadCategories(lead, fuzzionRules);
      const descartar = leadCategories.includes("DESCARTAR");
      const contactado = leadCategories.includes("CONTACTADO");
      const noSaturado = leadCategories.includes("NO_SATURADO");
      const reintentar = leadCategories.includes("REINTENTAR_MEJOR_FRANJA");
      const buzonSinContacto = leadCategories.includes("BUZON_SIN_CONTACTO");

      if (descartar) summary.noLlamar += 1;
      if (!descartar && !contactado && !noSaturado) summary.pausar += 1;
      if (!descartar && reintentar) summary.reintentar += 1;
      if (!descartar && (contactado || buzonSinContacto)) summary.segmentar += 1;
    }

    return summary;
  }, [data, fuzzionRules]);
  const cardDetailSummary = useMemo(() => {
    const empty = {
      contactosEfectivos: 0,
      contactosSegmentables: 0,
      contactosNoLlamar: 0,
      descartes: 0,
      descarteIntentos: 0,
      descarteComercial: 0,
      descarteUnallocatedRejected: 0,
    };
    if (!data) return empty;

    return data.preview.reduce((summary, lead) => {
      const leadCategories = getLeadCategories(lead, fuzzionRules);
      const contactado = leadCategories.includes("CONTACTADO");
      const descartar = leadCategories.includes("DESCARTAR");
      const descartePorIntentos = lead.intentosTotales >= fuzzionRules.intentosDescartar;
      const descartePorUnallocatedRejected =
        lead.invalidos >= fuzzionRules.unallocatedDescartar ||
        (lead.rechazados >= fuzzionRules.rejectedDescartar && lead.contactosEfectivos === 0);

      if (contactado) summary.contactosEfectivos += 1;
      if (contactado && !descartar) summary.contactosSegmentables += 1;
      if (contactado && descartar) summary.contactosNoLlamar += 1;
      if (descartar) summary.descartes += 1;
      if (descartePorIntentos) summary.descarteIntentos += 1;
      if (lead.exclusionComercial) summary.descarteComercial += 1;
      if (descartePorUnallocatedRejected) summary.descarteUnallocatedRejected += 1;

      return summary;
    }, { ...empty });
  }, [data, fuzzionRules]);

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

  const flatDbName = data?.fileName
    ? data.fileName.replace(/\.[^.]+$/, "")
    : "Sin base cargada";
  const flatTotalRows = data?.validRows ?? 0;
  const flatUniqueRows = data?.uniqueAnis ?? 0;
  const flatRemainingRows = selectedExportCount ?? displayedComposition?.loteDepurado ?? 0;
  const flatEliminatedRows = displayedComposition?.descartadas ?? 0;
  const flatRangeLabel = rangeDays > 0 ? `Últimos ${rangeDays} días` : "Todo el historial";
  const flatCatalogLabel = filterMode === "CATALOGACION"
    ? filterValues.length === 0
      ? "Todas"
      : `${filterValues.length} seleccionadas`
    : "Todas";
  const flatGatewayLabel = filterMode === "ESTADO"
    ? filterValues.length === 0
      ? "Todos"
      : `${filterValues.length} seleccionados`
    : "Todos";

  const matrixColumns = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lead of visiblePreview) {
      const key = lead.ultimoEstado || "Sin estado";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([label]) => label);
  }, [visiblePreview]);

  const matrixRows = useMemo(() => {
    const rows = new Map<string, { label: string; total: number; byGateway: Map<string, number> }>();

    for (const lead of visiblePreview) {
      const catalog = lead.catalogacionesGestion[0];
      const label = catalog
        ? `${catalog.resultado || "Sin resultado"} · ${catalog.subresultado || "Sin subresultado"}`
        : lead.resultadoGestion || lead.subresultadoGestion
          ? `${lead.resultadoGestion || "Sin resultado"} · ${lead.subresultadoGestion || "Sin subresultado"}`
          : "Sin catalogación";
      const gateway = lead.ultimoEstado || "Sin estado";
      const current = rows.get(label) ?? { label, total: 0, byGateway: new Map<string, number>() };
      current.total += 1;
      current.byGateway.set(gateway, (current.byGateway.get(gateway) ?? 0) + 1);
      rows.set(label, current);
    }

    return Array.from(rows.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [visiblePreview]);

  const remainingBreakdown = useMemo(() => (
    matrixRows.slice(0, 4).map((row) => ({
      label: row.label,
      count: row.total,
    }))
  ), [matrixRows]);

  const segmentChips = useMemo(() => {
    const counts = {
      buzones: 0,
      contacto: 0,
      noContesta: 0,
      answerGw: 0,
      cancelled: 0,
      unallocated: 0,
    };

    for (const lead of visiblePreview) {
      const stateText = `${lead.ultimoEstado} ${lead.ultimoSubestado}`.toUpperCase();
      if (lead.buzones > 0 && lead.contactosEfectivos === 0) counts.buzones += 1;
      if (lead.contactosEfectivos > 0) counts.contacto += 1;
      if (lead.noAnswer > 0) counts.noContesta += 1;
      if (lead.ultimoEstado === "ANSWER") counts.answerGw += 1;
      if (stateText.includes("CANCEL")) counts.cancelled += 1;
      if (stateText.includes("UNALLOCATED") || lead.invalidos > 0) counts.unallocated += 1;
    }

    return [
      { label: "Buzones", count: counts.buzones },
      { label: "Contacto hist.", count: counts.contacto },
      { label: "No contesta", count: counts.noContesta },
      { label: "Answer GW", count: counts.answerGw },
      { label: "Cancelled", count: counts.cancelled },
      { label: "UNALLOCATED", count: counts.unallocated },
    ];
  }, [visiblePreview]);

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

  function handleExport() {
    if (!data) return;
    setExportReviewOpen(true);
  }

  async function performExport() {
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
      setExportReviewOpen(false);

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
      setQuickExportCount(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo descargar";
      toast({ title: "Error al exportar", description: message, variant: "destructive" });
    } finally {
      setQuickExporting(false);
    }
  }

  return (
    <Card className="border-0 bg-transparent text-foreground shadow-none">
      <CardHeader className="hidden">
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

      <CardContent className="space-y-4 p-0">
        <div className="space-y-5">
          <section className="soft-cyan-hover overflow-hidden rounded-md border border-primary/25 bg-card/80 dark:bg-[#05090b]">
            <div className="flex flex-col gap-3 border-b border-primary/20 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.14em] text-foreground">
                  <SlidersHorizontal className="h-4 w-4 text-primary" />
                  Filtrar · Depurar lote para Neotel
                </h2>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Cruzá la base cargada contra SQLite y decidí qué queda para llamar.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={flatInputRef}
                  className="hidden"
                  type="file"
                  accept=".xls,.xlsx,.csv,.txt"
                  onChange={(event) => handleFile(event.target.files?.[0])}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-none border-primary/40 bg-transparent px-4 text-[11px] font-bold uppercase tracking-[0.14em] text-foreground hover:bg-primary/10 hover:shadow-[0_0_18px_hsl(var(--primary)/0.18)]"
                  onClick={() => flatInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {uploading ? "Cruzando..." : "Cargar base"}
                </Button>
                <Button
                  type="button"
                  className="h-9 rounded-none px-5 text-[11px] font-bold uppercase tracking-[0.14em] hover:shadow-[0_0_22px_hsl(var(--primary)/0.22)]"
                  disabled={!data || flatRemainingRows === 0}
                  onClick={handleExport}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Descargar resultado
                </Button>
              </div>
            </div>

            <div className="grid border-b border-primary/20 md:grid-cols-4">
              {[
                { label: "Nombre DB", value: flatDbName, tone: "text-foreground" },
                { label: "Q datos iniciales", value: flatTotalRows.toLocaleString("es-AR"), tone: "text-foreground" },
                { label: "Restante post-filtro", value: flatRemainingRows.toLocaleString("es-AR"), tone: "text-primary" },
                { label: "Eliminados", value: flatEliminatedRows.toLocaleString("es-AR"), tone: "text-destructive" },
              ].map((item) => (
                <div key={item.label} className="soft-cyan-hover relative min-h-[82px] border-b border-primary/10 px-5 py-4 hover:bg-primary/[0.045] md:border-b-0 md:border-r md:border-primary/20 last:border-r-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    {item.label}
                  </p>
                  <p className={`mt-2 truncate font-display text-2xl font-black tracking-tight ${item.tone}`}>
                    {item.value}
                  </p>
                  {item.label === "Restante post-filtro" && remainingBreakdown.length > 0 ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="absolute right-4 top-4 text-[10px] font-black uppercase tracking-[0.12em] text-primary hover:text-primary/80"
                        >
                          Ver desglose →
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-80 rounded-none border-primary/25 bg-popover p-4">
                        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                          Detalle del restante
                        </p>
                        <div className="space-y-2">
                          {remainingBreakdown.map((row) => (
                            <div key={row.label} className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 text-xs last:border-b-0 last:pb-0">
                              <span className="truncate text-muted-foreground">{row.label}</span>
                              <strong className="text-foreground">{row.count.toLocaleString("es-AR")}</strong>
                            </div>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="grid gap-3 px-5 py-5 lg:grid-cols-3">
              <label className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Rango histórico
                </span>
                <FlatSelect
                  value={String(rangeDays)}
                  onChange={(value) => setRangeDays(Number(value))}
                  options={[
                    { value: "0", label: "Todo el historial" },
                    { value: "7", label: "Ultimos 7 dias" },
                    { value: "30", label: "Ultimos 30 dias" },
                    { value: "60", label: "Ultimos 60 dias" },
                    { value: "90", label: "Ultimos 90 dias" },
                  ]}
                />
              </label>

              <label className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Mirada del filtro
                </span>
                <FlatSelect value={filterMode} onChange={(value) => { setFilterMode(value as FuzzionFilterMode); setFilterValues([]); setSelectedCategories([]); }} options={[{ value: "RECOMENDACION", label: "Recomendacion operativa" }, { value: "CATALOGACION", label: "Catalogacion comercial" }, { value: "ESTADO", label: "Estado gateway" }]} />
              </label>

              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Valores
                </span>
                <MultiCheckSelect
                  options={multiOptions}
                  values={filterMode === "RECOMENDACION" ? selectedCategories : filterValues}
                  disabled={!data}
                  onChange={(values) => {
                    if (filterMode === "RECOMENDACION") {
                      setSelectedCategories(values as FuzzionCategory[]);
                    } else {
                      setFilterValues(values);
                    }
                  }}
                />
              </div>
            </div>

            <div className="px-5 pb-5">
              <div className="mb-3 grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-3">
                <div className="soft-cyan-hover border border-primary/20 px-3 py-2 hover:bg-primary/[0.045]">
                  <span className="block uppercase tracking-[0.16em]">Desde · hasta</span>
                  <strong className="mt-1 block text-foreground">{flatRangeLabel}</strong>
                </div>
                <div className="soft-cyan-hover border border-primary/20 px-3 py-2 hover:bg-primary/[0.045]">
                  <span className="block uppercase tracking-[0.16em]">Catalogaciones</span>
                  <strong className="mt-1 block text-foreground">{flatCatalogLabel}</strong>
                </div>
                <div className="soft-cyan-hover border border-primary/20 px-3 py-2 hover:bg-primary/[0.045]">
                  <span className="block uppercase tracking-[0.16em]">Estado gateways</span>
                  <strong className="mt-1 block text-foreground">{flatGatewayLabel}</strong>
                </div>
              </div>

              <div className="soft-cyan-hover border border-primary/25">
                <div className="flex items-center justify-between border-b border-primary/20 px-3 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    Matriz de resultado · catalogaciones x gateways
                  </p>
                  <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    {matrixColumns.length} col x {matrixRows.length} filas
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead className="bg-primary/5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      <tr>
                        <th className="px-3 py-3">Catalogación</th>
                        {matrixColumns.map((column) => (
                          <th key={column} className="px-3 py-3 text-right">{column}</th>
                        ))}
                        <th className="px-3 py-3 text-right text-primary">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrixRows.length > 0 ? (
                        matrixRows.map((row) => (
                          <tr key={row.label} className="border-t border-primary/10 transition-colors hover:bg-primary/[0.045]">
                            <td className="max-w-[360px] truncate px-3 py-3 font-semibold text-foreground">{row.label}</td>
                            {matrixColumns.map((column) => (
                              <td key={column} className="px-3 py-3 text-right text-muted-foreground">
                                {(row.byGateway.get(column) ?? 0).toLocaleString("es-AR")}
                              </td>
                            ))}
                            <td className="px-3 py-3 text-right font-bold text-primary">{row.total.toLocaleString("es-AR")}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="px-3 py-8 text-center text-muted-foreground" colSpan={matrixColumns.length + 2}>
                            Cargá una base Fuzzión para ver la matriz de depuración.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-md border border-primary/25 bg-card/80 dark:bg-[#05090b]">
            <button
              type="button"
              className="soft-cyan-hover flex w-full items-center justify-between gap-3 border-b border-primary/20 px-5 py-3 text-left"
              onClick={() => setConfigOpen((current) => !current)}
              aria-expanded={configOpen}
            >
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
                  <SlidersHorizontal className="h-4 w-4 text-primary" />
                  Configurar lote
                </span>
                <Badge variant="outline" className="rounded px-2 text-[11px]">
                  {exportMode === "DEPURADO"
                    ? "Lote depurado"
                    : rangeDays > 0
                      ? `Ultimos ${rangeDays} dias`
                      : "Grupo puntual"}
                </Badge>
                <Badge variant="outline" className="rounded border-primary/30 px-2 text-[11px] text-primary">
                  {countingSelection
                    ? "Contando..."
                    : selectedExportCount === null
                      ? "Conteo pendiente"
                      : `${selectedExportCount.toLocaleString("es-AR")} lineas quedan`}
                </Badge>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${configOpen ? "rotate-180" : ""}`} />
            </button>

            {configOpen ? (
              <div className="space-y-3 px-5 py-4">
                <div className="grid gap-3 lg:grid-cols-4">
                  <label className="space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      Quiero descargar
                    </span>
                    <FlatSelect
                      value={exportMode}
                      onChange={(value) => {
                        const mode = value as FuzzionExportMode;
                        setExportMode(mode);
                        if (mode === "DEPURADO") {
                          setFilterMode("RECOMENDACION");
                          setSelectedCategories([]);
                          setFilterValues([]);
                          setRangeDays(0);
                        }
                      }}
                      options={[
                        { value: "DEPURADO", label: "Lote depurado para llamar" },
                        { value: "SEGMENTO", label: "Un grupo puntual" },
                      ]}
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      Filtrar segun
                    </span>
                    <FlatSelect
                      disabled={exportMode === "DEPURADO"}
                      value={filterMode}
                      onChange={(value) => {
                        setFilterMode(value as FuzzionFilterMode);
                        setSelectedCategories([]);
                        setFilterValues([]);
                      }}
                      options={[
                        { value: "RECOMENDACION", label: "Recomendacion operativa" },
                        { value: "CATALOGACION", label: "Catalogacion comercial" },
                        { value: "ESTADO", label: "Estado gateway" },
                      ]}
                    />
                  </label>

                  <div className="space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      Valores
                    </span>
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

                  <label className="space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      Rango historico
                    </span>
                    <FlatSelect
                      disabled={exportMode === "DEPURADO"}
                      value={String(rangeDays)}
                      onChange={(value) => setRangeDays(Number(value))}
                      options={[
                        { value: "0", label: "Todo el historial" },
                        { value: "7", label: "Ultimos 7 dias" },
                        { value: "30", label: "Ultimos 30 dias" },
                        { value: "60", label: "Ultimos 60 dias" },
                        { value: "90", label: "Ultimos 90 dias" },
                      ]}
                    />
                  </label>
                </div>

                <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                  <div className="soft-cyan-hover flex h-11 items-center gap-2 border border-primary/25 bg-background px-3">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Linea, nombre, DNI, estado o catalogacion..."
                      className="h-9 border-0 bg-transparent px-0 focus-visible:ring-0"
                    />
                  </div>
                  <Button
                    type="button"
                    className="h-11 rounded-none px-5 text-sm font-bold"
                    onClick={handleExport}
                    disabled={exporting || !data || selectedExportCount === 0}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {exporting
                      ? "Generando..."
                      : selectedExportCount === null
                        ? "Descargar seleccion"
                        : `Descargar (${selectedExportCount.toLocaleString("es-AR")})`}
                  </Button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="overflow-hidden rounded-md border border-primary/25 bg-card/80 dark:bg-[#05090b]">
            <button
              type="button"
              className="soft-cyan-hover flex w-full items-center justify-between gap-3 border-b border-primary/20 px-5 py-3 text-left"
              onClick={() => setRulesOpen((current) => !current)}
              aria-expanded={rulesOpen}
            >
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
                  <SlidersHorizontal className="h-4 w-4 text-primary" />
                  Reglas de depuracion
                </span>
                <Badge variant="outline" className="rounded px-2 text-[11px]">
                  UNALLOCATED {fuzzionRules.unallocatedDescartar}+ · REJECTED {fuzzionRules.rejectedDescartar}+ · Saturacion {fuzzionRules.totalSaturado} intentos
                </Badge>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${rulesOpen ? "rotate-180" : ""}`} />
            </button>

            {rulesOpen ? (
              <div className="space-y-4 px-5 py-4">
                <p className="text-xs text-muted-foreground">
                  Estas reglas afectan el conteo, el lote depurado y los grupos operativos. Ajustalas antes de descargar si queres endurecer o aflojar el criterio.
                </p>

                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                  {([
                    ["unallocatedDescartar", "Descartar UNALLOCATED desde"],
                    ["rejectedDescartar", "Descartar REJECTED desde"],
                    ["intentosDescartar", "Descartar intentos desde"],
                    ["totalSaturado", "Saturado por intentos desde"],
                    ["noAnswerSaturado", "Saturado NOANSWER desde"],
                    ["buzonSaturado", "Saturado buzon desde"],
                  ] as Array<[keyof FuzzionRules, string]>).map(([key, label]) => (
                    <label key={key} className="space-y-2 text-xs text-muted-foreground">
                      <span className="block min-h-[28px] text-[10px] font-bold uppercase tracking-[0.12em]">
                        {label}
                      </span>
                      <div className="grid h-10 grid-cols-[2.25rem_1fr_2.25rem] overflow-hidden border border-primary/25 bg-background transition-colors focus-within:border-primary/70 focus-within:ring-1 focus-within:ring-primary/50">
                        <button
                          type="button"
                          className="flex items-center justify-center border-r border-primary/20 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                          disabled={fuzzionRules[key] <= 1}
                          onClick={() => updateFuzzionRule(key, fuzzionRules[key] - 1)}
                          aria-label={`Bajar ${label}`}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <Input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={fuzzionRules[key]}
                          onChange={(event) => updateFuzzionRule(key, Number(event.target.value))}
                          className="h-10 rounded-none border-0 bg-transparent px-2 text-center font-semibold shadow-none focus-visible:ring-0"
                        />
                        <button
                          type="button"
                          className="flex items-center justify-center border-l border-primary/20 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                          onClick={() => updateFuzzionRule(key, fuzzionRules[key] + 1)}
                          aria-label={`Subir ${label}`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </label>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-none"
                  onClick={() => setFuzzionRules(DEFAULT_FUZZION_RULES)}
                >
                  Restaurar reglas estandar
                </Button>
              </div>
            ) : null}
          </section>

          <section className="soft-cyan-hover overflow-hidden rounded-md border border-primary/25 bg-card/80 dark:bg-[#05090b]">
            <div className="flex flex-col gap-3 border-b border-primary/20 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.14em] text-foreground">
                  <FileSpreadsheet className="h-4 w-4 text-primary" />
                  Descarga · Lote segmentado
                </h2>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Armá un lote puntual con nombre controlado y revisá el total antes de exportar.
                </p>
              </div>
              <Button
                type="button"
                className="h-9 rounded-none px-5 text-[11px] font-bold uppercase tracking-[0.14em] hover:shadow-[0_0_22px_hsl(var(--primary)/0.22)]"
                disabled={!data || flatRemainingRows === 0}
                onClick={handleExport}
              >
                <Download className="mr-2 h-4 w-4" />
                Descargar segmento
              </Button>
            </div>

            <div className="grid border-b border-primary/20 md:grid-cols-2">
              <div className="soft-cyan-hover relative min-h-[82px] border-b border-primary/10 px-5 py-4 hover:bg-primary/[0.045] md:border-b-0 md:border-r md:border-primary/20">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Total líneas
                </p>
                <p className="mt-2 font-display text-2xl font-black tracking-tight text-primary">{flatTotalRows.toLocaleString("es-AR")}</p>
                {segmentChips.some((chip) => chip.count > 0) ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="absolute right-4 top-4 text-[10px] font-black uppercase tracking-[0.12em] text-primary hover:text-primary/80"
                      >
                        Ver desglose →
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-80 rounded-none border-primary/25 bg-popover p-4">
                      <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                        Desglose por tipo
                      </p>
                      <div className="space-y-2">
                        {segmentChips.map((chip) => (
                          <div key={chip.label} className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 text-xs last:border-b-0 last:pb-0">
                            <span className="truncate text-muted-foreground">{chip.label}</span>
                            <strong className="text-foreground">{chip.count.toLocaleString("es-AR")}</strong>
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : null}
              </div>
              <div className="soft-cyan-hover min-h-[82px] px-5 py-4 hover:bg-primary/[0.045]">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Líneas únicas
                </p>
                <p className="mt-2 font-display text-2xl font-black tracking-tight text-foreground">{flatUniqueRows.toLocaleString("es-AR")}</p>
              </div>
            </div>

            <div className="grid gap-3 px-5 py-5 lg:grid-cols-3">
              <label className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Tipo de descarga
                </span>
                <FlatSelect value={exportMode} onChange={(value) => setExportMode(value as FuzzionExportMode)} options={[{ value: "DEPURADO", label: "Lote depurado para llamar" }, { value: "SEGMENTO", label: "Un grupo puntual" }]} />
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Buscar en lote
                </span>
                <div className="soft-cyan-hover flex h-11 items-center gap-2 border border-primary/25 bg-background px-3">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Linea, nombre, DNI, estado..."
                    className="h-9 border-0 bg-transparent px-0 focus-visible:ring-0"
                  />
                </div>
              </label>
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Total a descargar
                </span>
                <div className="soft-cyan-hover flex h-11 items-center border border-primary/25 bg-primary/5 px-3 text-lg font-black text-primary">
                  {countingSelection ? "Calculando..." : flatRemainingRows.toLocaleString("es-AR")}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 px-5 pb-5">
              {segmentChips.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  className="soft-cyan-hover rounded-none border border-primary/25 px-3 py-2 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:bg-primary/[0.045] hover:text-primary"
                >
                  {chip.label} <strong className="ml-1 text-foreground">{chip.count.toLocaleString("es-AR")}</strong>
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="hidden">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {[
            { category: "NUNCA_TRABAJADO" as const, label: "Sin historial en tickets SQLite", count: dynamicStats.nuncaTrabajados, valueClass: "text-foreground", cardClass: "border-border bg-background" },
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

        <div className="rounded-lg border border-border bg-background">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
            onClick={() => setCardDetailOpen((current) => !current)}
            aria-expanded={cardDetailOpen}
          >
            <span>
              <span className="block text-sm font-semibold text-foreground">
                Detalle de contacto efectivo y descarte
              </span>
              <span className="block text-xs text-muted-foreground">
                Explica por qué una línea puede haber atendido y aun así quedar marcada como no llamar.
              </span>
            </span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${cardDetailOpen ? "rotate-180" : ""}`} />
          </button>

          {cardDetailOpen ? (
            <div className="grid gap-3 border-t border-border p-3 lg:grid-cols-2">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Con contacto efectivo
                </p>
                <p className="mt-1 text-2xl font-bold text-foreground">
                  {cardDetailSummary.contactosEfectivos.toLocaleString("es-AR")}
                </p>
                <div className="mt-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Aptos para segmentar</span>
                    <strong className="text-foreground">{cardDetailSummary.contactosSegmentables.toLocaleString("es-AR")}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">También marcados como no llamar</span>
                    <strong className="text-destructive">{cardDetailSummary.contactosNoLlamar.toLocaleString("es-AR")}</strong>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Con señal de descarte
                </p>
                <p className="mt-1 text-2xl font-bold text-destructive">
                  {cardDetailSummary.descartes.toLocaleString("es-AR")}
                </p>
                <div className="mt-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{fuzzionRules.intentosDescartar}+ intentos</span>
                    <strong className="text-foreground">{cardDetailSummary.descarteIntentos.toLocaleString("es-AR")}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Compra / fraude / cliente molesto / Personal / prepago</span>
                    <strong className="text-foreground">{cardDetailSummary.descarteComercial.toLocaleString("es-AR")}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">UNALLOCATED / REJECTED</span>
                    <strong className="text-foreground">{cardDetailSummary.descarteUnallocatedRejected.toLocaleString("es-AR")}</strong>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Estos motivos pueden superponerse; por eso no siempre suman exactamente el total.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-foreground">
                Lectura operativa del lote
              </p>
              <p className="text-xs text-muted-foreground">
                Separa lo que conviene excluir de lo que puede trabajarse en otro momento o en lotes aparte. Algunos grupos pueden superponerse.
              </p>
            </div>
            <Badge variant="outline" className="w-fit">
              Criterio actual
            </Badge>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "No llamar",
                value: operationalSummary.noLlamar,
                description: "Compra, fraude, cliente molesto, Personal, prepago o descarte técnico.",
                className: "border-destructive/30 bg-destructive/5 text-destructive",
              },
              {
                label: "Llamar en otro momento",
                value: operationalSummary.pausar,
                description: "Sin contacto útil, pero saturado por intentos, no contesta o buzones.",
                className: "border-warning/30 bg-warning/5 text-warning",
              },
              {
                label: "Reintentar",
                value: operationalSummary.reintentar,
                description: "Sin contacto, no saturado y sin señal de descarte.",
                className: "border-primary/30 bg-primary/5 text-primary",
              },
              {
                label: "Segmentar aparte",
                value: operationalSummary.segmentar,
                description: "Buzones o contactos históricos para lotes controlados.",
                className: "border-border bg-background text-foreground",
              },
            ].map((item) => (
              <div key={item.label} className={`rounded-lg border p-3 ${item.className}`}>
                <p className="text-[11px] font-semibold uppercase text-muted-foreground">
                  {item.label}
                </p>
                <p className="mt-1 text-2xl font-bold">
                  {item.value.toLocaleString("es-AR")}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
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
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 text-left"
                          onClick={() => setHighAttemptsOpen((current) => !current)}
                          aria-expanded={highAttemptsOpen}
                        >
                          <span className="text-xs font-semibold uppercase text-destructive">
                            Muestra de lineas con mas intentos
                          </span>
                          <span className="flex items-center gap-2 text-xs font-semibold text-destructive">
                            {displayedComposition.intentosAltos.length.toLocaleString("es-AR")} visibles
                            <ChevronDown className={`h-4 w-4 transition-transform ${highAttemptsOpen ? "rotate-180" : ""}`} />
                          </span>
                        </button>

                        {highAttemptsOpen ? (
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
                        ) : null}
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
                    UNALLOCATED {fuzzionRules.unallocatedDescartar}+ · REJECTED {fuzzionRules.rejectedDescartar}+ · Descarte {fuzzionRules.intentosDescartar}+ intentos
                  </Badge>
                </span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${rulesOpen ? "rotate-180" : ""}`} />
              </button>

              {rulesOpen ? (
                <div className="space-y-3 border-t border-border p-3">
                  <p className="text-xs text-muted-foreground">
                    Estas reglas afectan el conteo, el lote depurado y los grupos operativos. Ajustalas antes de descargar si querés endurecer o aflojar el criterio.
                  </p>
                  <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
                    {([
                      ["unallocatedDescartar", "Descartar UNALLOCATED desde"],
                      ["rejectedDescartar", "Descartar REJECTED desde"],
                      ["intentosDescartar", "Descartar intentos desde"],
                      ["totalSaturado", "Saturado por intentos desde"],
                      ["noAnswerSaturado", "Saturado NOANSWER desde"],
                      ["buzonSaturado", "Saturado buzón desde"],
                    ] as Array<[keyof FuzzionRules, string]>).map(([key, label]) => (
                      <label key={key} className="space-y-1 text-xs text-muted-foreground">
                        <span>{label}</span>
                        <div className="grid h-10 grid-cols-[2.25rem_1fr_2.25rem] overflow-hidden rounded-lg border border-border bg-card/60 transition-colors focus-within:border-primary/70 focus-within:ring-1 focus-within:ring-primary/50">
                          <button
                            type="button"
                            className="flex items-center justify-center border-r border-border text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                            disabled={fuzzionRules[key] <= 1}
                            onClick={() => updateFuzzionRule(key, fuzzionRules[key] - 1)}
                            aria-label={`Bajar ${label}`}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <Input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={fuzzionRules[key]}
                            onChange={(event) => {
                              updateFuzzionRule(key, Number(event.target.value));
                            }}
                            className="h-10 rounded-none border-0 bg-transparent px-2 text-center font-semibold shadow-none focus-visible:ring-0"
                          />
                          <button
                            type="button"
                            className="flex items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                            onClick={() => updateFuzzionRule(key, fuzzionRules[key] + 1)}
                            aria-label={`Subir ${label}`}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
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
              <div className="grid grid-cols-[minmax(110px,1fr)_minmax(150px,1.5fr)_90px_110px_190px] gap-3 bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase text-muted-foreground">
                <span>Línea</span>
                <span>Cliente</span>
                <span>Intentos</span>
                <span>Último estado</span>
                <span>Lectura</span>
              </div>
              <div className="max-h-72 divide-y divide-border overflow-auto">
                {visiblePreview.slice(0, 100).map((lead) => {
                  const leadCategories = getLeadCategories(lead, fuzzionRules);
                  const reading = getLeadReading(lead, leadCategories, fuzzionRules);
                  const ReadingIcon = reading.icon;

                  return (
                  <div
                    key={`${lead.rowNumber}-${lead.linea}`}
                    className="grid grid-cols-[minmax(110px,1fr)_minmax(150px,1.5fr)_90px_110px_190px] gap-3 px-3 py-2 text-xs"
                  >
                    <span className="font-mono text-foreground">{lead.linea}</span>
                    <span className="truncate">{lead.razonSocial || "-"}</span>
                    <span>{lead.intentosTotales}</span>
                    <span className="truncate">{lead.ultimoEstado || "Sin historial"}</span>
                    <div>
                      <Badge
                        variant={reading.variant}
                        className={`max-w-full justify-start ${reading.className}`}
                        title={reading.label}
                      >
                        <ReadingIcon className="mr-1 h-3 w-3 shrink-0" />
                        <span className="truncate">{reading.label}</span>
                      </Badge>
                    </div>
                    <div className="hidden">
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
            {fuzzionRules.intentosDescartar}+ intentos totales,{" "}
            {fuzzionRules.unallocatedDescartar} UNALLOCATED o{" "}
            {fuzzionRules.rejectedDescartar} REJECTED sin contacto efectivo.
          </p>
        </div>

        </div>

        <Dialog
          open={exportReviewOpen}
          onOpenChange={(open) => {
            if (!exporting) setExportReviewOpen(open);
          }}
        >
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Resumen antes de descargar</DialogTitle>
              <DialogDescription>
                Revisá la composición del lote final antes de generar el archivo compatible con Neotel.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
                <p className="text-xs font-semibold uppercase text-primary">
                  {exportReviewLabel}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {countingSelection
                    ? "El conteo previo todavía se está actualizando; la descarga usará la configuración actual."
                    : selectedExportCount === null
                      ? "El conteo previo no respondió a tiempo, pero podés descargar igual."
                      : "Estos números corresponden a la selección actual."}
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[11px] uppercase text-muted-foreground">Total evaluado</p>
                  <p className="mt-1 text-2xl font-bold text-foreground">
                    {(exportReviewComposition?.totalLineas ?? data?.uniqueAnis ?? 0).toLocaleString("es-AR")}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[11px] uppercase text-muted-foreground">Se excluyen</p>
                  <p className="mt-1 text-2xl font-bold text-destructive">
                    {(exportReviewComposition?.descartadas ?? 0).toLocaleString("es-AR")}
                  </p>
                </div>
                <div className="rounded-lg border border-primary/35 p-3">
                  <p className="text-[11px] uppercase text-muted-foreground">Quedan para descargar</p>
                  <p className="mt-1 text-2xl font-bold text-primary">
                    {exportReviewCount.toLocaleString("es-AR")}
                  </p>
                </div>
              </div>

              {exportReviewComposition ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      Motivos de exclusión
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <span><strong className="text-foreground">{exportReviewComposition.descarteTecnico.toLocaleString("es-AR")}</strong> técnicas</span>
                      <span><strong className="text-foreground">{exportReviewComposition.descarteComercial.toLocaleString("es-AR")}</strong> comerciales</span>
                      <span><strong className="text-foreground">{exportReviewComposition.descarteTecnicoYComercial.toLocaleString("es-AR")}</strong> ambas</span>
                    </div>
                    <div className="mt-3 space-y-1">
                      {exportReviewComposition.descartesPorMotivo.length > 0 ? (
                        exportReviewComposition.descartesPorMotivo.slice(0, 8).map((item) => (
                          <div key={item.label} className="flex items-center justify-between gap-3 text-xs">
                            <span className="truncate text-muted-foreground">{item.label}</span>
                            <strong className="text-foreground">{item.count.toLocaleString("es-AR")}</strong>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground">No hay motivos de exclusión para esta selección.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      Estados de las líneas excluidas
                    </p>
                    <div className="mt-2 space-y-1">
                      {exportReviewComposition.descartesPorEstado.length > 0 ? (
                        exportReviewComposition.descartesPorEstado.slice(0, 8).map((item) => (
                          <div key={item.label} className="flex items-center justify-between gap-3 text-xs">
                            <span className="truncate text-muted-foreground">{item.label}</span>
                            <strong className="text-foreground">{item.count.toLocaleString("es-AR")}</strong>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground">No hay estados excluidos para esta selección.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedBreakdown.length > 0 ? (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <p className="text-xs font-semibold uppercase text-primary">Detalle seleccionado</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {selectedBreakdown.map((item) => (
                      <div key={item.value} className="flex items-center justify-between gap-3 border border-border/70 px-3 py-2 text-xs">
                        <span className="truncate text-muted-foreground">{item.label}</span>
                        <strong className="text-foreground">{item.count.toLocaleString("es-AR")}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {exportReviewComposition?.con20IntentosOMas ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  Atención: hay {exportReviewComposition.con20IntentosOMas.toLocaleString("es-AR")} líneas con 20+ intentos dentro de lo evaluado.
                </div>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={exporting}
                onClick={() => setExportReviewOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={exporting || !data || selectedExportCount === 0}
                onClick={performExport}
              >
                <Download className="mr-2 h-4 w-4" />
                {exporting
                  ? "Generando..."
                  : selectedExportCount === null
                    ? "Descargar lote"
                    : `Descargar lote (${exportReviewCount.toLocaleString("es-AR")})`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(quickCategory)}
          onOpenChange={(open) => {
            if (!open && !quickExporting) {
              setQuickCategory(null);
              setQuickExportCount(null);
            }
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
                {quickCounting
                  ? "..."
                  : (quickExportCount ?? quickCount).toLocaleString("es-AR")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {quickCounting
                  ? "calculando líneas con el rango seleccionado"
                  : quickExportCount === null
                    ? "líneas del grupo antes de aplicar el rango histórico"
                    : "líneas a descargar con el rango seleccionado"}
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
              <Button
                type="button"
                disabled={quickExporting || quickCounting || quickExportCount === 0}
                onClick={handleQuickExport}
              >
                <Download className="mr-2 h-4 w-4" />
                {quickExporting
                  ? "Generando..."
                  : quickCounting
                    ? "Calculando..."
                    : "Descargar lote"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

