import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  | "PAUSADO_TEMPORAL"
  | "NO_SATURADO"
  | "REINTENTAR_MEJOR_FRANJA"
  | "DESCARTAR";

type FuzzionFilterMode = "RECOMENDACION" | "ESTADO" | "CATALOGACION";
type FuzzionExportMode = "DEPURADO" | "SEGMENTO";

type FuzzionStats = {
  nuncaTrabajados: number;
  contactados: number;
  buzonesSinContacto: number;
  pausadosTemporales: number;
  noSaturados: number;
  reintentarMejorFranja: number;
  descartar: number;
};

type FuzzionRules = {
  unallocatedDescartar: number;
  rejectedDescartar: number;
  intentos24hPausa: number;
  pausa24hHoras: number;
  intentos7dPausa: number;
  pausa7dDias: number;
  noAnswer7dPausa: number;
  pausaNoAnswerDias: number;
  buzon14dPausa: number;
  pausaBuzonDias: number;
  intentos30dPausa: number;
  pausa30dDias: number;
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
  intentos24h: number;
  intentos7d: number;
  intentos14d: number;
  intentos30d: number;
  noAnswer7d: number;
  buzones14d: number;
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
  pausadasSaturacion?: number;
  descarteTecnico: number;
  descarteComercial: number;
  descarteTecnicoYComercial: number;
  con20IntentosOMas: number;
  maxIntentos: number;
  proximaReactivacion?: string;
  pausasPorMotivo?: Array<{ label: string; count: number }>;
  ventanas?: {
    conActividad24h: number;
    conActividad7d: number;
    conActividad14d: number;
    conActividad30d: number;
  };
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
  invalidRows?: number;
  duplicateRows?: number;
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
    description:
      "El ANI no tiene llamadas registradas en el historial SQLite y puede ingresar como linea nueva.",
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
    value: "PAUSADO_TEMPORAL",
    label: "En pausa temporal",
    description:
      "Supero una regla reciente de 24 h, 7, 14 o 30 dias. No se exporta hoy y vuelve a habilitarse al vencer.",
    stat: "pausadosTemporales",
  },
  {
    value: "NO_SATURADO",
    label: "Sin saturación",
    description:
      "No alcanzan los límites de intentos, NOANSWER o buzón configurados.",
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
      "Tienen descarte técnico o catalogación comercial de no llamada.",
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
    normalized.includes("DEUDA") ||
    normalized.includes("FRAUDE") ||
    normalized.includes("CLIENTE MOLESTO") ||
    normalized.includes("ES PREPAGO") ||
    normalized.includes("ES PERSONAL");
}

type MultiOption = {
  value: string;
  label: string;
  description?: string;
};

const DEFAULT_FUZZION_RULES: FuzzionRules = {
  unallocatedDescartar: 3,
  rejectedDescartar: 3,
  intentos24hPausa: 3,
  pausa24hHoras: 24,
  intentos7dPausa: 9,
  pausa7dDias: 7,
  noAnswer7dPausa: 6,
  pausaNoAnswerDias: 5,
  buzon14dPausa: 5,
  pausaBuzonDias: 3,
  intentos30dPausa: 20,
  pausa30dDias: 21,
};

const MAX_LEGACY_EXCEL_DATA_ROWS = 65_535;
const FUZZION_RULES_STORAGE_KEY = "depurador:fuzzion-rules:v2";
const FUZZION_RULE_KEYS: Array<keyof FuzzionRules> = [
  "unallocatedDescartar",
  "rejectedDescartar",
  "intentos24hPausa",
  "pausa24hHoras",
  "intentos7dPausa",
  "pausa7dDias",
  "noAnswer7dPausa",
  "pausaNoAnswerDias",
  "buzon14dPausa",
  "pausaBuzonDias",
  "intentos30dPausa",
  "pausa30dDias",
];
const FUZZION_RULE_FIELDS: Array<{
  key: keyof FuzzionRules;
  label: string;
}> = [
  { key: "unallocatedDescartar", label: "Descartar UNALLOCATED desde" },
  { key: "rejectedDescartar", label: "Descartar REJECTED desde" },
  { key: "intentos24hPausa", label: "Intentos en 24 h para pausar" },
  { key: "pausa24hHoras", label: "Duracion pausa 24 h (horas)" },
  { key: "intentos7dPausa", label: "Intentos en 7 dias para pausar" },
  { key: "pausa7dDias", label: "Duracion pausa 7 dias" },
  { key: "noAnswer7dPausa", label: "NOANSWER en 7 dias para pausar" },
  { key: "pausaNoAnswerDias", label: "Duracion pausa NOANSWER (dias)" },
  { key: "buzon14dPausa", label: "Buzones en 14 dias para pausar" },
  { key: "pausaBuzonDias", label: "Duracion pausa buzon (dias)" },
  { key: "intentos30dPausa", label: "Intentos en 30 dias para pausar" },
  { key: "pausa30dDias", label: "Duracion pausa 30 dias" },
];

function loadStoredFuzzionRules() {
  if (typeof window === "undefined") return DEFAULT_FUZZION_RULES;
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(FUZZION_RULES_STORAGE_KEY) || "{}",
    ) as Partial<FuzzionRules>;
    return FUZZION_RULE_KEYS.reduce((rules, key) => {
      const value = Math.floor(Number(stored[key]));
      rules[key] = Number.isFinite(value) && value > 0
        ? Math.min(value, 100)
        : DEFAULT_FUZZION_RULES[key];
      return rules;
    }, { ...DEFAULT_FUZZION_RULES });
  } catch {
    return DEFAULT_FUZZION_RULES;
  }
}

type FuzzionPauseReason = {
  key: "INTENTOS_24H" | "INTENTOS_7D" | "NOANSWER_7D" | "BUZON_14D" | "INTENTOS_30D";
  label: string;
  hasta: string;
};

function getLeadPause(
  lead: FuzzionLeadPreview,
  rules: FuzzionRules,
  now = Date.now(),
) {
  if (lead.contactosEfectivos > 0) {
    return { pausado: false, pausadoHasta: "", motivos: [] as FuzzionPauseReason[] };
  }
  const lastCall = new Date(lead.ultimoLlamado).getTime();
  if (!Number.isFinite(lastCall)) {
    return { pausado: false, pausadoHasta: "", motivos: [] as FuzzionPauseReason[] };
  }

  const motivos: FuzzionPauseReason[] = [];
  const addReason = (
    active: boolean,
    key: FuzzionPauseReason["key"],
    label: string,
    durationMs: number,
  ) => {
    if (!active) return;
    const until = lastCall + durationMs;
    if (until <= now) return;
    motivos.push({ key, label, hasta: new Date(until).toISOString() });
  };

  addReason(
    lead.intentos24h >= rules.intentos24hPausa,
    "INTENTOS_24H",
    `${rules.intentos24hPausa}+ intentos en 24 h`,
    rules.pausa24hHoras * 60 * 60 * 1000,
  );
  addReason(
    lead.intentos7d >= rules.intentos7dPausa,
    "INTENTOS_7D",
    `${rules.intentos7dPausa}+ intentos en 7 dias`,
    rules.pausa7dDias * 24 * 60 * 60 * 1000,
  );
  addReason(
    lead.noAnswer7d >= rules.noAnswer7dPausa,
    "NOANSWER_7D",
    `${rules.noAnswer7dPausa}+ NOANSWER en 7 dias`,
    rules.pausaNoAnswerDias * 24 * 60 * 60 * 1000,
  );
  addReason(
    lead.buzones14d >= rules.buzon14dPausa,
    "BUZON_14D",
    `${rules.buzon14dPausa}+ buzones en 14 dias`,
    rules.pausaBuzonDias * 24 * 60 * 60 * 1000,
  );
  addReason(
    lead.intentos30d >= rules.intentos30dPausa,
    "INTENTOS_30D",
    `${rules.intentos30dPausa}+ intentos en 30 dias`,
    rules.pausa30dDias * 24 * 60 * 60 * 1000,
  );

  return {
    pausado: motivos.length > 0,
    pausadoHasta: motivos.map((reason) => reason.hasta).sort().at(-1) ?? "",
    motivos,
  };
}

function formatPauseUntil(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

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
  const pause = getLeadPause(lead, rules);

  if (contactado) categories.push("CONTACTADO");
  if (lead.buzones > 0 && !contactado) categories.push("BUZON_SIN_CONTACTO");
  if (pause.pausado) categories.push("PAUSADO_TEMPORAL");
  if (!pause.pausado) categories.push("NO_SATURADO");
  if (!contactado && !descartar && !pause.pausado) {
    categories.push("REINTENTAR_MEJOR_FRANJA");
  }
  if (descartar) categories.push("DESCARTAR");
  return categories;
}

function isLeadSaturated(lead: FuzzionLeadPreview, rules: FuzzionRules) {
  return getLeadPause(lead, rules).pausado;
}

function isLeadCallable(lead: FuzzionLeadPreview, rules: FuzzionRules) {
  return !getLeadCategories(lead, rules).includes("DESCARTAR") &&
    (lead.contactosEfectivos > 0 || !isLeadSaturated(lead, rules));
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
    const pause = getLeadPause(lead, rules);
    return {
      label: "Pausar: buzón saturado",
      variant: "outline" as const,
      className: "text-warning",
      icon: pause.pausadoHasta ? Clock3 : PhoneOff,
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
    const pause = getLeadPause(lead, rules);
    return {
      label: pause.pausadoHasta
        ? `Pausa hasta ${formatPauseUntil(pause.pausadoHasta)}`
        : "Pausa temporal",
      variant: "outline" as const,
      className: "text-warning",
      icon: Clock3,
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
            <Tooltip key={option.value} delayDuration={250}>
              <TooltipTrigger asChild>
                <label className="flex cursor-pointer items-start gap-2 px-2 py-2 text-sm hover:bg-muted/50">
                  <Checkbox
                    checked={values.includes(option.value)}
                    onCheckedChange={() => toggle(option.value)}
                  />
                  <span className="leading-4">{option.label}</span>
                </label>
              </TooltipTrigger>
              {option.description ? (
                <TooltipContent
                  side="right"
                  align="start"
                  sideOffset={8}
                  className="z-[90] max-w-72 border-primary/30 bg-popover px-3 py-2 text-xs leading-relaxed shadow-xl"
                >
                  <p className="font-semibold text-foreground">{option.label}</p>
                  <p className="mt-1 text-muted-foreground">{option.description}</p>
                </TooltipContent>
              ) : null}
            </Tooltip>
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
  const [fuzzionRules, setFuzzionRules] = useState<FuzzionRules>(loadStoredFuzzionRules);
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
    pausadosTemporales: 0,
    noSaturados: 0,
    reintentarMejorFranja: 0,
    descartar: 0,
  };

  const quickCount = quickOption?.stat
    ? dynamicStats[quickOption.stat]
    : 0;

  const updateFuzzionRule = (key: keyof FuzzionRules, value: number) => {
    const nextValue = Math.min(
      100,
      Math.max(1, Math.floor(value || DEFAULT_FUZZION_RULES[key])),
    );
    setFuzzionRules((current) => ({ ...current, [key]: nextValue }));
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(
        FUZZION_RULES_STORAGE_KEY,
        JSON.stringify(fuzzionRules),
      );
    } catch {
      // El lote sigue operativo aunque el navegador bloquee almacenamiento local.
    }
  }, [fuzzionRules]);

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
        .map((option) => ({
          value: option.value,
          label: option.label,
          description: option.description,
        }));
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
      const reintentar = leadCategories.includes("REINTENTAR_MEJOR_FRANJA");
      const buzonSinContacto = leadCategories.includes("BUZON_SIN_CONTACTO");
      const callable = isLeadCallable(lead, fuzzionRules);

      if (descartar) summary.noLlamar += 1;
      if (!descartar && !callable) summary.pausar += 1;
      if (!descartar && reintentar) summary.reintentar += 1;
      if (callable && (contactado || buzonSinContacto)) summary.segmentar += 1;
    }

    return summary;
  }, [data, fuzzionRules]);
  const cardDetailSummary = useMemo(() => {
    const empty = {
      contactosEfectivos: 0,
      contactosSegmentables: 0,
      contactosNoLlamar: 0,
      descartes: 0,
      pausasTemporales: 0,
      descarteComercial: 0,
      descarteUnallocatedRejected: 0,
    };
    if (!data) return empty;

    return data.preview.reduce((summary, lead) => {
      const leadCategories = getLeadCategories(lead, fuzzionRules);
      const contactado = leadCategories.includes("CONTACTADO");
      const descartar = leadCategories.includes("DESCARTAR");
      const callable = isLeadCallable(lead, fuzzionRules);
      const descartePorUnallocatedRejected =
        lead.invalidos >= fuzzionRules.unallocatedDescartar ||
        (lead.rechazados >= fuzzionRules.rejectedDescartar && lead.contactosEfectivos === 0);

      if (contactado) summary.contactosEfectivos += 1;
      if (contactado && callable) summary.contactosSegmentables += 1;
      if (contactado && !callable) summary.contactosNoLlamar += 1;
      if (descartar) summary.descartes += 1;
      if (!descartar && getLeadPause(lead, fuzzionRules).pausado) {
        summary.pausasTemporales += 1;
      }
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
      if (exportMode === "DEPURADO" && !isLeadCallable(lead, fuzzionRules)) return false;
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
  const flatTotalRows = data?.uniqueAnis ?? 0;
  const flatRemainingRows = selectedExportCount ?? displayedComposition?.loteDepurado ?? 0;
  const flatEliminatedRows = data ? Math.max(0, flatTotalRows - flatRemainingRows) : 0;
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

  const eliminatedBreakdown = useMemo(() => {
    if (!data || !displayedComposition || flatEliminatedRows === 0) return [];

    if (exportMode === "DEPURADO") {
      const discarded = displayedComposition.descartadas;
      const paused = displayedComposition.pausadasSaturacion ?? 0;
      const other = Math.max(0, flatEliminatedRows - discarded - paused);
      return [
        { label: "Descarte definitivo", count: discarded },
        { label: "Pausa con vencimiento", count: paused },
        { label: "Otros filtros aplicados", count: other },
      ].filter((item) => item.count > 0);
    }

    const scopedTotal = displayedComposition.totalLineas;
    const outsideSelection = Math.max(0, flatTotalRows - scopedTotal);
    const notExportedInsideSelection = Math.max(
      0,
      scopedTotal - (selectedExportCount ?? 0),
    );
    return [
      { label: "Fuera del segmento elegido", count: outsideSelection },
      { label: "Excluidas dentro del segmento", count: notExportedInsideSelection },
    ].filter((item) => item.count > 0);
  }, [
    data,
    displayedComposition,
    exportMode,
    flatEliminatedRows,
    flatTotalRows,
    selectedExportCount,
  ]);

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
        count: payload.uniqueAnis,
      });
      toast({
        title: "Base Fuzzión lista",
        description: `Se cruzaron ${payload.uniqueAnis.toLocaleString(
          "es-AR",
        )} ANI únicos contra el historial SQLite${
          payload.duplicateRows
            ? `; se ignoraron ${payload.duplicateRows.toLocaleString("es-AR")} duplicados`
            : ""
        }.`,
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
                          className="absolute right-4 top-4 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.12em] text-primary hover:text-primary/80"
                        >
                          Ver desglose
                          <ChevronRight className="h-3 w-3" />
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
                  {item.label === "Eliminados" && eliminatedBreakdown.length > 0 ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="absolute right-4 top-4 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.12em] text-destructive transition-colors hover:text-destructive/75"
                        >
                          Ver desglose
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-96 rounded-none border-destructive/30 bg-popover p-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                          Detalle de lo que no se descarga
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                          Las pausas no borran el ANI: vuelven a habilitarse cuando vence el descanso.
                        </p>

                        <div className="mt-3 space-y-2">
                          {eliminatedBreakdown.map((row) => (
                            <div key={row.label} className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 text-xs last:border-b-0 last:pb-0">
                              <span className="text-muted-foreground">{row.label}</span>
                              <strong className={row.label === "Pausa con vencimiento" ? "text-warning" : "text-destructive"}>
                                {row.count.toLocaleString("es-AR")}
                              </strong>
                            </div>
                          ))}
                        </div>

                        {(displayedComposition?.descartesPorMotivo.length ?? 0) > 0 ? (
                          <div className="mt-4 border-t border-border/70 pt-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                              Motivos de descarte definitivo
                            </p>
                            <div className="mt-2 space-y-1.5">
                              {displayedComposition!.descartesPorMotivo.slice(0, 6).map((reason) => (
                                <div key={reason.label} className="flex items-center justify-between gap-3 text-xs">
                                  <span className="truncate text-muted-foreground">{reason.label}</span>
                                  <strong className="text-foreground">{reason.count.toLocaleString("es-AR")}</strong>
                                </div>
                              ))}
                            </div>
                            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                              Los motivos pueden superponerse si una misma linea tiene mas de una señal.
                            </p>
                          </div>
                        ) : null}

                        {(displayedComposition?.pausasPorMotivo?.length ?? 0) > 0 ? (
                          <div className="mt-4 border-t border-border/70 pt-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                              Motivos de pausa activa
                            </p>
                            <div className="mt-2 space-y-1.5">
                              {displayedComposition!.pausasPorMotivo!.slice(0, 6).map((reason) => (
                                <div key={reason.label} className="flex items-center justify-between gap-3 text-xs">
                                  <span className="truncate text-muted-foreground">{reason.label}</span>
                                  <strong className="text-warning">{reason.count.toLocaleString("es-AR")}</strong>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </PopoverContent>
                    </Popover>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="grid gap-3 px-5 py-5 lg:grid-cols-4">
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
                      setSearch("");
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
                  Rango histórico
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

              <label className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Mirada del filtro
                </span>
                <FlatSelect
                  disabled={exportMode === "DEPURADO"}
                  value={filterMode}
                  onChange={(value) => {
                    setFilterMode(value as FuzzionFilterMode);
                    setFilterValues([]);
                    setSelectedCategories([]);
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
                  options={multiOptions}
                  values={filterMode === "RECOMENDACION" ? selectedCategories : filterValues}
                  disabled={!data || exportMode === "DEPURADO"}
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
              <div className="soft-cyan-hover flex h-11 items-center gap-2 border border-primary/25 bg-background px-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  disabled={exportMode === "DEPURADO"}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={
                    exportMode === "DEPURADO"
                      ? "El lote depurado completo no necesita busqueda"
                      : "Linea, nombre, DNI, estado o catalogacion..."
                  }
                  className="h-9 border-0 bg-transparent px-0 focus-visible:ring-0"
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
                <div className="border-b border-primary/20 px-3 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    Matriz de resultado · catalogaciones x gateways
                  </p>
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
              onClick={() => setRulesOpen((current) => !current)}
              aria-expanded={rulesOpen}
            >
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
                  <SlidersHorizontal className="h-4 w-4 text-primary" />
                  Reglas de depuracion
                </span>
                <Badge variant="outline" className="rounded px-2 text-[11px]">
                  Ventanas 24 h · 7 d · 14 d · 30 d
                </Badge>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${rulesOpen ? "rotate-180" : ""}`} />
            </button>

            {rulesOpen ? (
              <div className="space-y-4 px-5 py-4">
                <p className="text-xs text-muted-foreground">
                  El descarte definitivo queda reservado para señales técnicas o
                  comerciales. Las ventanas recientes sólo pausan líneas sin contacto
                  efectivo y las reactivan automáticamente al vencer. La configuración
                  queda guardada en este navegador.
                </p>

                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
                  {FUZZION_RULE_FIELDS.map(({ key, label }) => (
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
                  Restaurar configuración recomendada
                </Button>
              </div>
            ) : null}
          </section>

          <section className="overflow-hidden rounded-md border border-primary/25 bg-card/80 dark:bg-[#05090b]">
            <div className="flex flex-col gap-2 border-b border-primary/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.14em] text-foreground">
                  <Clock3 className="h-4 w-4 text-primary" />
                  Simulacion previa del lote
                </h2>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  El conteo usa las mismas reglas que la descarga final.
                </p>
              </div>
              {displayedComposition?.proximaReactivacion ? (
                <Badge variant="outline" className="w-fit rounded border-warning/40 text-warning">
                  Proxima reactivacion {formatPauseUntil(displayedComposition.proximaReactivacion)}
                </Badge>
              ) : null}
            </div>

            {displayedComposition ? (
              <div className="space-y-4 px-5 py-4">
                <div className="grid gap-2 md:grid-cols-4">
                  {[
                    ["Entrada unica", displayedComposition.totalLineas, "text-foreground"],
                    ["Descarte definitivo", displayedComposition.descartadas, "text-destructive"],
                    ["Pausa con vencimiento", displayedComposition.pausadasSaturacion ?? 0, "text-warning"],
                    ["Listas para Neotel", displayedComposition.loteDepurado, "text-primary"],
                  ].map(([label, value, tone]) => (
                    <div key={String(label)} className="soft-cyan-hover border border-primary/20 px-3 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                        {label}
                      </p>
                      <p className={`mt-1 font-display text-2xl font-black ${tone}`}>
                        {Number(value).toLocaleString("es-AR")}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 lg:grid-cols-[1fr_1.35fr]">
                  <div className="border border-primary/20 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                      Actividad detectada por ventana
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {[
                        ["24 horas", displayedComposition.ventanas?.conActividad24h ?? 0],
                        ["7 dias", displayedComposition.ventanas?.conActividad7d ?? 0],
                        ["14 dias", displayedComposition.ventanas?.conActividad14d ?? 0],
                        ["30 dias", displayedComposition.ventanas?.conActividad30d ?? 0],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="bg-primary/5 px-3 py-2 text-xs">
                          <span className="text-muted-foreground">{label}</span>
                          <strong className="mt-1 block text-base text-foreground">
                            {Number(value).toLocaleString("es-AR")}
                          </strong>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border border-primary/20 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                      Motivos de pausa activos
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Una linea puede activar mas de una ventana; el total del lote no la duplica.
                    </p>
                    <div className="mt-3 space-y-2">
                      {(displayedComposition.pausasPorMotivo ?? []).length > 0 ? (
                        displayedComposition.pausasPorMotivo!.map((item) => (
                          <div key={item.label} className="flex items-center justify-between gap-3 border-b border-primary/10 pb-2 text-xs last:border-b-0 last:pb-0">
                            <span className="truncate text-muted-foreground">{item.label}</span>
                            <strong className="text-warning">{item.count.toLocaleString("es-AR")}</strong>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No hay pausas activas con esta configuracion.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                Carga una base para simular descartes, pausas y lineas exportables.
              </p>
            )}
          </section>

          <section className="soft-cyan-hover overflow-hidden rounded-md border border-primary/35 bg-card/80 dark:bg-[#05090b]">
            <div className="grid gap-0 lg:grid-cols-[1fr_260px_auto]">
              <div className="border-b border-primary/20 px-5 py-4 lg:border-b-0 lg:border-r">
                <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.14em] text-foreground">
                  <FileSpreadsheet className="h-4 w-4 text-primary" />
                  Resumen final de descarga
                </h2>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Usa exactamente la configuración definida arriba. Para cambiar el
                  resultado, modificá los filtros principales o Reglas de depuración.
                </p>
                <p className="mt-2 truncate text-xs font-semibold text-foreground">
                  {exportMode === "DEPURADO"
                    ? "Lote depurado para llamar"
                    : `Grupo puntual: ${exportReviewLabel}`}
                </p>
              </div>

              <div className="border-b border-primary/20 px-5 py-4 lg:border-b-0 lg:border-r">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  ANI únicos a descargar
                </p>
                <p className="mt-2 font-display text-3xl font-black tracking-tight text-primary">
                  {countingSelection
                    ? "Calculando..."
                    : flatRemainingRows.toLocaleString("es-AR")}
                </p>
              </div>

              <div className="flex items-center px-5 py-4">
                <Button
                  type="button"
                  className="h-11 w-full rounded-none px-6 text-[11px] font-bold uppercase tracking-[0.14em] hover:shadow-[0_0_22px_hsl(var(--primary)/0.22)] lg:w-auto"
                  disabled={exporting || !data || flatRemainingRows === 0}
                  onClick={handleExport}
                >
                  <Download className="mr-2 h-4 w-4" />
                  {exporting
                    ? "Generando..."
                    : exportMode === "DEPURADO"
                      ? `Descargar lote (${flatRemainingRows.toLocaleString("es-AR")})`
                      : `Descargar grupo (${flatRemainingRows.toLocaleString("es-AR")})`}
                </Button>
              </div>
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
              TODOS: data?.uniqueAnis ?? 0,
              NUNCA_TRABAJADO: dynamicStats.nuncaTrabajados,
              CONTACTADO: dynamicStats.contactados,
              BUZON_SIN_CONTACTO: dynamicStats.buzonesSinContacto,
              PAUSADO_TEMPORAL: dynamicStats.pausadosTemporales,
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
                    <span className="text-muted-foreground">Pausas temporales (no son descarte)</span>
                    <strong className="text-foreground">{cardDetailSummary.pausasTemporales.toLocaleString("es-AR")}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Compra / deuda / fraude / cliente molesto / Personal / prepago</span>
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
                description: "Compra, deuda, fraude, cliente molesto, Personal, prepago o descarte técnico.",
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
                      {displayedComposition.loteDepurado.toLocaleString("es-AR")} quedan · {(displayedComposition.pausadasSaturacion ?? 0).toLocaleString("es-AR")} se pausan · {displayedComposition.descartadas.toLocaleString("es-AR")} se descartan
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
                    <div className="mt-3 grid gap-2 md:grid-cols-5">
                      {[
                        [showingSelectionComposition ? "Total selección" : "Total cargado", displayedComposition.totalLineas],
                        ["Queda en lote depurado", displayedComposition.loteDepurado],
                        ["Pausa saturada sin contacto", displayedComposition.pausadasSaturacion ?? 0],
                        ["Descarte definitivo", displayedComposition.descartadas],
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
                        Se conservarán las líneas aptas, se pausarán las saturadas sin
                        contacto efectivo y se quitarán del archivo las
                        catalogadas como compra, deuda, fraude, cliente molesto, prepago o ya
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
                    Ventanas 24 h · 7 d · 14 d · 30 d
                  </Badge>
                </span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${rulesOpen ? "rotate-180" : ""}`} />
              </button>

              {rulesOpen ? (
                <div className="space-y-3 border-t border-border p-3">
                  <p className="text-xs text-muted-foreground">
                    Descarte quita una línea por señal técnica o comercial. Saturación pausa
                    líneas sin contacto efectivo para el lote diario, sin borrarlas del
                    historial. La configuración queda guardada en este navegador.
                  </p>
                  <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-4">
                    {FUZZION_RULE_FIELDS.map(({ key, label }) => (
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
                    Restaurar configuración recomendada
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
            Contacto efectivo = al menos 1 ANSWER + AGENT. Las pausas usan
            ventanas móviles de 24 horas, 7, 14 y 30 días y se levantan
            automáticamente al vencer. Descarte definitivo ={" "}
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

              {exportReviewCount > MAX_LEGACY_EXCEL_DATA_ROWS ? (
                <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
                  El lote supera el límite seguro del formato .xls. Se descargará
                  automáticamente como .xlsx para conservar todas las líneas.
                </div>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[11px] uppercase text-muted-foreground">Total evaluado</p>
                  <p className="mt-1 text-2xl font-bold text-foreground">
                    {(exportReviewComposition?.totalLineas ?? data?.uniqueAnis ?? 0).toLocaleString("es-AR")}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[11px] uppercase text-muted-foreground">Descartes definitivos</p>
                  <p className="mt-1 text-2xl font-bold text-destructive">
                    {(exportReviewComposition?.descartadas ?? 0).toLocaleString("es-AR")}
                  </p>
                </div>
                <div className="rounded-lg border border-amber-500/35 p-3">
                  <p className="text-[11px] uppercase text-muted-foreground">Pausas sin contacto</p>
                  <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {(exportReviewComposition?.pausadasSaturacion ?? 0).toLocaleString("es-AR")}
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
                      Motivos de descarte definitivo
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
                      Estados de los descartes definitivos
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
                  : "Las compras, deudas, fraudes, clientes molestos, líneas prepagas y líneas que ya pertenecen a Personal se excluirán por seguridad."}
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

