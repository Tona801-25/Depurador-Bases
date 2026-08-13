import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Clock3,
  Download,
  FileSpreadsheet,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Trash2,
  Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type {
  FuzzionAvailableCondition,
  FuzzionFilterConfig,
  FuzzionFilterCondition,
  FuzzionFilterCriteria,
  FuzzionHistoryRangeDays,
  FuzzionLotDecision,
  FuzzionMatrixCell,
  FuzzionOptionsV2,
} from "@shared/fuzzionFilters";
import {
  canSimulateFuzzionCriteria,
  fuzzionCriteriaSignature,
  fuzzionConfigSwitchAction,
  hasUnsavedFuzzionConfigChanges,
  isCurrentFuzzionResponse,
  matchesFuzzionPreviewSearch,
  parsePositiveIntegerInput,
} from "@shared/fuzzionV2Ui";

type V2LeadPreview = {
  linea: string;
  razonSocial?: string;
  documento?: string;
  mercadoActual?: string;
  ultimoEstado?: string;
  ultimoSubestado?: string;
  resultadoGestion?: string;
  subresultadoGestion?: string;
};

type V2Upload = {
  id: string;
  fileName: string;
  uniqueAnis: number;
  duplicateRows?: number;
  preview: V2LeadPreview[];
};

type V2Breakdown = {
  type: "CATALOG" | "GATEWAY";
  key: string;
  label: string;
  minimumCount: number;
  matchingAnis: number;
  protectedAnis: number;
};

type V2Simulation = {
  engine: "v2";
  criteria: FuzzionFilterCriteria;
  totals: {
    initial: number;
    included: number;
    excluded: number;
    protectedByEffectiveContact: number;
  };
  exportableLines: number;
  breakdown: V2Breakdown[];
  preview: FuzzionLotDecision[];
  metrics: {
    historyQueryMs: number;
    evaluationMs: number;
    totalMs: number;
  };
};

type FuzzionV2TabProps = {
  onLog?: (entry: {
    kind: "filter" | "export" | "error";
    title: string;
    detail: string;
    count?: number;
  }) => void;
};

const RANGE_OPTIONS = [
  { value: "7", label: "Últimos 7 días" },
  { value: "30", label: "Últimos 30 días" },
  { value: "60", label: "Últimos 60 días" },
  { value: "90", label: "Últimos 90 días" },
  { value: "0", label: "Todo el historial" },
];

function parseDownloadName(header: string | null) {
  return header?.match(/filename="?([^";]+)"?/i)?.[1] || "lote_neotel_v2.xls";
}

function SelectField({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const label = options.find((option) => option.value === value)?.label ?? "Seleccionar";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-11 w-full justify-between rounded-none border-primary/25 bg-background px-3 text-sm font-semibold">
          <span className="truncate">{label}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] rounded-none border-primary/25 p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={cn(
              "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-primary/10",
              option.value === value && "bg-primary/10 text-primary",
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            {option.value === value ? <Check className="h-4 w-4" /> : null}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function ConditionField({
  title,
  options,
  selected,
  loading,
  onChange,
}: {
  title: string;
  options: FuzzionAvailableCondition[];
  selected: FuzzionFilterCondition[];
  loading: boolean;
  onChange: (conditions: FuzzionFilterCondition[]) => void;
}) {
  const availableKeys = useMemo(() => new Set(options.map((option) => option.key)), [options]);
  const toggle = (option: FuzzionAvailableCondition) => {
    const exists = selected.some((item) => item.key === option.key);
    onChange(exists
      ? selected.filter((item) => item.key !== option.key)
      : [...selected, { key: option.key, label: option.label, minimumCount: 1 }]);
  };

  return (
    <div className="space-y-2">
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{title}</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" disabled={loading} className="h-11 w-full justify-between rounded-none border-primary/25 bg-background px-3 text-sm font-semibold">
            <span className="truncate">
              {loading ? "Cargando opciones..." : selected.length ? `${selected.length} seleccionadas` : "Seleccionar condiciones"}
            </span>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="max-h-80 w-[var(--radix-popover-trigger-width)] overflow-y-auto rounded-none border-primary/25 p-1">
          {options.length ? options.map((option) => {
            const checked = selected.some((item) => item.key === option.key);
            return (
              <button key={option.key} type="button" className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-primary/10" onClick={() => toggle(option)}>
                <Checkbox checked={checked} className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-xs text-foreground">{option.label}</strong>
                  <span className="text-[10px] text-muted-foreground">
                    {option.uniqueAnis.toLocaleString("es-AR")} ANI · {option.occurrences.toLocaleString("es-AR")} ocurrencias
                  </span>
                </span>
              </button>
            );
          }) : (
            <p className="px-3 py-4 text-xs text-muted-foreground">No hay condiciones disponibles en este rango.</p>
          )}
        </PopoverContent>
      </Popover>

      {selected.length ? (
        <div className="space-y-1.5 border border-primary/15 p-2">
          {selected.map((condition) => {
            const available = availableKeys.has(condition.key);
            return (
              <div key={condition.key} className="grid grid-cols-[minmax(0,1fr)_116px_24px] items-center gap-2 text-xs">
                <span className="min-w-0">
                  <strong className="block truncate text-foreground">{condition.label}</strong>
                  {!available ? <span className="text-[10px] text-warning">Sin coincidencias en el lote y rango actual</span> : null}
                </span>
                <label className="grid grid-cols-[1fr_42px] items-center gap-1 text-[9px] uppercase tracking-wide text-muted-foreground">
                  Mínimo
                  <Input
                    value={condition.minimumCount}
                    inputMode="numeric"
                    className="h-8 rounded-none px-1 text-center text-xs"
                    aria-label={`Cantidad mínima de ${condition.label}`}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => {
                      const minimumCount = parsePositiveIntegerInput(event.target.value);
                      if (minimumCount === null) return;
                      onChange(selected.map((item) => item.key === condition.key ? { ...item, minimumCount } : item));
                    }}
                  />
                </label>
                <button type="button" className="text-lg text-muted-foreground hover:text-destructive" aria-label={`Quitar ${condition.label}`} onClick={() => onChange(selected.filter((item) => item.key !== condition.key))}>×</button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function rangeLabel(days: number) {
  return days === 0 ? "Todo el historial" : `Últimos ${days} días`;
}

export function FuzzionV2Tab({ onLog }: FuzzionV2TabProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const simulationRequestId = useRef(0);
  const optionsRequestId = useRef(0);
  const visibleSignatureRef = useRef("");
  const { toast } = useToast();
  const [data, setData] = useState<V2Upload | null>(null);
  const [uploading, setUploading] = useState(false);
  const [downloadType, setDownloadType] = useState<"DEPURADO" | "SEGMENTO">("DEPURADO");
  const [rangeDays, setRangeDays] = useState<FuzzionHistoryRangeDays>(0);
  const [catalogConditions, setCatalogConditions] = useState<FuzzionFilterCondition[]>([]);
  const [gatewayConditions, setGatewayConditions] = useState<FuzzionFilterCondition[]>([]);
  const [protectEffectiveContact, setProtectEffectiveContact] = useState(true);
  const [options, setOptions] = useState<FuzzionOptionsV2 | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState("");
  const [simulation, setSimulation] = useState<V2Simulation | null>(null);
  const [simulationState, setSimulationState] = useState<"idle" | "stale" | "loading" | "ready" | "blocked" | "error">("idle");
  const [simulationError, setSimulationError] = useState("");
  const [lastValidSignature, setLastValidSignature] = useState("");
  const [lastValidCriteria, setLastValidCriteria] = useState<FuzzionFilterCriteria | null>(null);
  const [search, setSearch] = useState("");
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [simulationOpen, setSimulationOpen] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [configs, setConfigs] = useState<FuzzionFilterConfig[]>([]);
  const [configsLoading, setConfigsLoading] = useState(true);
  const [configOperation, setConfigOperation] = useState("");
  const [selectedConfigId, setSelectedConfigId] = useState("");
  const [loadedConfig, setLoadedConfig] = useState<FuzzionFilterConfig | null>(null);
  const [configName, setConfigName] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newConfigName, setNewConfigName] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [switchDialogOpen, setSwitchDialogOpen] = useState(false);
  const [pendingConfigId, setPendingConfigId] = useState("");
  const [configApplicationRevision, setConfigApplicationRevision] = useState(0);
  const defaultAppliedRef = useRef(false);

  const criteria = useMemo<FuzzionFilterCriteria>(() => ({
    downloadType,
    rangeDays,
    catalogConditions,
    gatewayConditions,
    protectEffectiveContact: downloadType === "DEPURADO" ? protectEffectiveContact : false,
  }), [catalogConditions, downloadType, gatewayConditions, protectEffectiveContact, rangeDays]);
  const signature = useMemo(() => fuzzionCriteriaSignature(criteria), [criteria]);
  visibleSignatureRef.current = signature;
  const canSimulate = canSimulateFuzzionCriteria(criteria);
  const optionsCurrent = Boolean(
    data &&
    options &&
    options.rangeDays === rangeDays &&
    !optionsLoading &&
    !optionsError,
  );
  const simulationCurrent = simulationState === "ready" &&
    lastValidSignature === signature &&
    optionsCurrent;
  const currentSimulation = simulationCurrent ? simulation : null;
  const hasUnsavedConfigChanges = hasUnsavedFuzzionConfigChanges(
    loadedConfig,
    configName,
    criteria,
  );

  function applyConfig(config: FuzzionFilterConfig) {
    setLastValidSignature("");
    setLastValidCriteria(null);
    setSelectedConfigId(config.id);
    setLoadedConfig(config);
    setConfigName(config.name);
    setDownloadType(config.criteria.downloadType);
    setRangeDays(config.criteria.rangeDays);
    setCatalogConditions(config.criteria.catalogConditions);
    setGatewayConditions(config.criteria.gatewayConditions);
    setProtectEffectiveContact(
      config.criteria.downloadType === "DEPURADO"
        ? config.criteria.protectEffectiveContact
        : false,
    );
    setConfigApplicationRevision((current) => current + 1);
  }

  async function readConfigResponse(response: Response) {
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.message || "No se pudo administrar la configuración.");
    }
    return payload;
  }

  async function refreshConfigs(applyDefault = false) {
    setConfigsLoading(true);
    try {
      const response = await fetch("/api/fuzzion/filter-configs-v2", { cache: "no-store" });
      const payload = await readConfigResponse(response);
      const nextConfigs = payload.configs as FuzzionFilterConfig[];
      setConfigs(nextConfigs);
      if (applyDefault && !defaultAppliedRef.current) {
        defaultAppliedRef.current = true;
        const defaultConfig = nextConfigs.find((config) => config.isDefault);
        if (defaultConfig) applyConfig(defaultConfig);
      }
      if (selectedConfigId && !nextConfigs.some((config) => config.id === selectedConfigId)) {
        setSelectedConfigId("");
        setLoadedConfig(null);
        setConfigName("");
      }
    } catch (error) {
      toast({
        title: "No se pudieron cargar las configuraciones",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setConfigsLoading(false);
    }
  }

  useEffect(() => {
    void refreshConfigs(true);
  }, []);

  async function createConfig() {
    const name = newConfigName.trim();
    if (!name) return;
    setConfigOperation("create");
    try {
      const response = await fetch("/api/fuzzion/filter-configs-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, criteria }),
      });
      const payload = await readConfigResponse(response);
      const config = payload.config as FuzzionFilterConfig;
      setConfigs((current) => [...current, config].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedConfigId(config.id);
      setLoadedConfig(config);
      setConfigName(config.name);
      setNewConfigName("");
      setCreateDialogOpen(false);
      toast({ title: "Configuración creada", description: `${config.name} quedó guardada en SQLite.` });
    } catch (error) {
      toast({ title: "No se pudo crear", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setConfigOperation("");
    }
  }

  async function saveConfigChanges() {
    if (!selectedConfigId || !loadedConfig) return false;
    setConfigOperation("save");
    try {
      const response = await fetch(`/api/fuzzion/filter-configs-v2/${selectedConfigId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: configName, criteria }),
      });
      const payload = await readConfigResponse(response);
      const config = payload.config as FuzzionFilterConfig;
      setConfigs((current) => current.map((item) => item.id === config.id ? config : item));
      setLoadedConfig(config);
      setConfigName(config.name);
      toast({ title: "Cambios guardados", description: `${config.name} se actualizó en SQLite.` });
      return true;
    } catch (error) {
      toast({ title: "No se pudieron guardar los cambios", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
      return false;
    } finally {
      setConfigOperation("");
    }
  }

  function requestConfigSwitch(id: string) {
    if (!id || id === selectedConfigId) return;
    if (fuzzionConfigSwitchAction(hasUnsavedConfigChanges) === "CONFIRM") {
      setPendingConfigId(id);
      setSwitchDialogOpen(true);
      return;
    }
    const config = configs.find((item) => item.id === id);
    if (config) applyConfig(config);
  }

  function reapplySelectedConfig() {
    if (!selectedConfigId) return;
    if (hasUnsavedConfigChanges) {
      setPendingConfigId(selectedConfigId);
      setSwitchDialogOpen(true);
      return;
    }
    const config = configs.find((item) => item.id === selectedConfigId);
    if (config) applyConfig(config);
  }

  function discardAndSwitch() {
    const config = configs.find((item) => item.id === pendingConfigId);
    if (config) applyConfig(config);
    setPendingConfigId("");
    setSwitchDialogOpen(false);
  }

  async function saveAndSwitch() {
    const saved = await saveConfigChanges();
    if (saved) discardAndSwitch();
  }

  async function deleteSelectedConfig() {
    if (!selectedConfigId) return;
    setConfigOperation("delete");
    try {
      const response = await fetch(`/api/fuzzion/filter-configs-v2/${selectedConfigId}`, { method: "DELETE" });
      await readConfigResponse(response);
      setConfigs((current) => current.filter((config) => config.id !== selectedConfigId));
      setSelectedConfigId("");
      setLoadedConfig(null);
      setConfigName("");
      setDeleteDialogOpen(false);
      toast({ title: "Configuración eliminada", description: "Los criterios visibles se mantienen como configuración manual sin guardar." });
    } catch (error) {
      toast({ title: "No se pudo eliminar", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setConfigOperation("");
    }
  }

  async function markSelectedAsDefault() {
    if (!selectedConfigId) return;
    setConfigOperation("default");
    try {
      const response = await fetch(`/api/fuzzion/filter-configs-v2/${selectedConfigId}/default`, { method: "POST" });
      const payload = await readConfigResponse(response);
      const config = payload.config as FuzzionFilterConfig;
      setConfigs((current) => current.map((item) => ({
        ...item,
        isDefault: item.id === config.id,
        updatedAt: item.id === config.id ? config.updatedAt : item.updatedAt,
      })));
      setLoadedConfig(config);
      toast({ title: "Configuración predeterminada", description: "Se aplicará automáticamente al abrir la interfaz V2." });
    } catch (error) {
      toast({ title: "No se pudo marcar como predeterminada", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setConfigOperation("");
    }
  }

  useEffect(() => {
    if (!data) {
      setOptions(null);
      setOptionsError("");
      return;
    }
    const controller = new AbortController();
    const requestId = ++optionsRequestId.current;
    setOptionsLoading(true);
    setOptionsError("");
    fetch(`/api/fuzzion/${data.id}/options-v2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rangeDays }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || "No se pudieron cargar las opciones V2.");
        return payload as FuzzionOptionsV2;
      })
      .then((payload) => {
        if (requestId !== optionsRequestId.current || payload.rangeDays !== rangeDays) return;
        setOptions(payload);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (requestId === optionsRequestId.current) setOptionsError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (requestId === optionsRequestId.current) setOptionsLoading(false);
      });
    return () => controller.abort();
  }, [data, rangeDays]);

  useEffect(() => {
    const requestId = ++simulationRequestId.current;
    setLastValidSignature("");
    setLastValidCriteria(null);
    setSimulationError("");
    if (!data) {
      setSimulation(null);
      setSimulationState("idle");
      return;
    }
    if (!canSimulate) {
      setSimulation(null);
      setSimulationState("blocked");
      return;
    }

    const controller = new AbortController();
    setSimulationState("stale");
    const timer = window.setTimeout(() => {
      setSimulationState("loading");
      const requestSignature = signature;
      const endpoint = simulationOpen ? "stats-v2" : "count-v2";
      fetch(`/api/fuzzion/${data.id}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ criteria }),
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.message || "No se pudo simular el lote V2.");
          return payload as V2Simulation;
        })
        .then((payload) => {
          if (!isCurrentFuzzionResponse(requestId, simulationRequestId.current, requestSignature, visibleSignatureRef.current)) return;
          setSimulation(payload);
          setLastValidSignature(requestSignature);
          setLastValidCriteria(payload.criteria);
          setSimulationState("ready");
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          if (requestId !== simulationRequestId.current) return;
          setSimulationState("error");
          setSimulationError(error instanceof Error ? error.message : String(error));
        });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [canSimulate, configApplicationRevision, criteria, data, signature, simulationOpen]);

  async function handleFile(file?: File) {
    if (!file) return;
    setUploading(true);
    setData(null);
    setCatalogConditions([]);
    setGatewayConditions([]);
    setSearch("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/fuzzion/preview", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || payload.message || "No se pudo cargar el lote.");
      setData(payload);
      onLog?.({ kind: "filter", title: "Base Fuzzión V2 cargada", detail: `${payload.fileName} · ${payload.uniqueAnis.toLocaleString("es-AR")} ANI únicos`, count: payload.uniqueAnis });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast({ title: "No se pudo cargar la base", description: message, variant: "destructive" });
      onLog?.({ kind: "error", title: "Falló la carga Fuzzión V2", detail: message });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function performExport() {
    if (!data || !simulationCurrent || !lastValidCriteria || !simulation) return;
    setExporting(true);
    try {
      const response = await fetch(`/api/fuzzion/${data.id}/export-v2`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ criteria: lastValidCriteria }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || "No se pudo generar el lote V2.");
      }
      const exportedCount = Number(response.headers.get("X-Exported-Count"));
      if (exportedCount !== simulation.exportableLines) {
        throw new Error(`La descarga informó ${exportedCount} filas y la simulación vigente ${simulation.exportableLines}.`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = parseDownloadName(response.headers.get("Content-Disposition"));
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Lote V2 descargado", description: `${exportedCount.toLocaleString("es-AR")} ANI exportados con la última simulación válida.` });
      onLog?.({ kind: "export", title: "Lote Fuzzión V2 exportado", detail: rangeLabel(lastValidCriteria.rangeDays), count: exportedCount });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast({ title: "Error al exportar", description: message, variant: "destructive" });
      onLog?.({ kind: "error", title: "Falló la descarga Fuzzión V2", detail: message });
    } finally {
      setExporting(false);
    }
  }

  const baseLeadByAni = useMemo(() => new Map((data?.preview ?? []).map((lead) => [lead.linea, lead])), [data]);
  const visiblePreview = useMemo(() => (currentSimulation?.preview ?? []).filter((decision) => {
    const lead = baseLeadByAni.get(decision.ani);
    return matchesFuzzionPreviewSearch([
      decision.ani,
      lead?.razonSocial,
      lead?.documento,
      lead?.mercadoActual,
      lead?.ultimoEstado,
      lead?.ultimoSubestado,
      lead?.resultadoGestion,
      lead?.subresultadoGestion,
      ...decision.reasons.map((reason) => reason.label),
    ], search);
  }), [baseLeadByAni, currentSimulation, search]);

  const matrixGateways = useMemo(() => Array.from(new Map((options?.matrix ?? []).map((cell) => [cell.gatewayKey, cell.gatewayLabel])).entries()), [options]);
  const matrixCatalogs = useMemo(() => Array.from(new Map((options?.matrix ?? []).map((cell) => [cell.catalogKey, cell.catalogLabel])).entries()), [options]);
  const matrixMap = useMemo(() => new Map((options?.matrix ?? []).map((cell) => [`${cell.catalogKey}\u001f${cell.gatewayKey}`, cell.uniqueAnis])), [options]);

  const initial = currentSimulation?.totals.initial ?? data?.uniqueAnis ?? 0;
  const exportable = currentSimulation?.exportableLines ?? 0;
  const changing = optionsLoading || simulationState === "stale" || simulationState === "loading";

  return (
    <Card className="border-0 bg-transparent text-foreground shadow-none">
      <CardContent className="space-y-4 p-0">
        <div className="flex items-center justify-between border border-warning/35 bg-warning/5 px-4 py-2 text-xs">
          <span><strong>Integración local V2.</strong> Para comparar o volver temporalmente al flujo anterior, abrí <code>?fuzzion-ui=legacy</code>.</span>
          <Badge variant="outline" className="rounded-none border-warning/50 text-warning">Sólo desarrollo local</Badge>
        </div>

        <section className="overflow-hidden rounded-md border border-primary/25 bg-card/80 dark:bg-[#05090b]">
          <div className="flex flex-col gap-3 border-b border-primary/20 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.14em]"><SlidersHorizontal className="h-4 w-4 text-primary" />Filtrar · Depurar lote para Neotel <Badge variant="outline">V2</Badge></h2>
              <p className="mt-1 text-[11px] text-muted-foreground">Las decisiones y los totales provienen exclusivamente del backend V2.</p>
            </div>
            <input ref={inputRef} className="hidden" type="file" accept=".xls,.xlsx,.csv,.txt" onChange={(event) => handleFile(event.target.files?.[0])} />
            <Button type="button" variant="outline" className="h-9 rounded-none" disabled={uploading} onClick={() => inputRef.current?.click()}><Upload className="mr-2 h-4 w-4" />{uploading ? "Cruzando..." : "Cargar base"}</Button>
          </div>

          <div className="grid border-b border-primary/20 md:grid-cols-5">
            {[
              ["Cantidad inicial", initial, "text-foreground"],
              ["Restante post-filtro", currentSimulation?.totals.included ?? 0, "text-primary"],
              [downloadType === "DEPURADO" ? "Eliminados" : "Incluidos", downloadType === "DEPURADO" ? currentSimulation?.totals.excluded ?? 0 : currentSimulation?.totals.included ?? 0, downloadType === "DEPURADO" ? "text-destructive" : "text-primary"],
              ["Protegidos por contacto", currentSimulation?.totals.protectedByEffectiveContact ?? 0, "text-success"],
              ["Total exportable", exportable, "text-primary"],
            ].map(([label, value, tone]) => (
              <div key={String(label)} className="min-h-[82px] border-b border-primary/10 px-4 py-4 md:border-b-0 md:border-r last:border-r-0">
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
                <p className={cn("mt-2 font-display text-2xl font-black", String(tone))}>{Number(value).toLocaleString("es-AR")}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-3 px-5 py-5 lg:grid-cols-4">
            <label className="space-y-2"><span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Quiero descargar</span><SelectField value={downloadType} onChange={(value) => setDownloadType(value as "DEPURADO" | "SEGMENTO")} options={[{ value: "DEPURADO", label: "Lote depurado para llamar" }, { value: "SEGMENTO", label: "Un grupo puntual" }]} /></label>
            <label className="space-y-2"><span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Rango histórico</span><SelectField value={String(rangeDays)} onChange={(value) => setRangeDays(Number(value) as FuzzionHistoryRangeDays)} options={RANGE_OPTIONS} /></label>
            <ConditionField title="Catalogación comercial" options={options?.catalogOptions ?? []} selected={catalogConditions} loading={optionsLoading} onChange={setCatalogConditions} />
            <ConditionField title="Estado Gateway" options={options?.gatewayOptions ?? []} selected={gatewayConditions} loading={optionsLoading} onChange={setGatewayConditions} />
          </div>

          {data && optionsLoading ? (
            <div aria-live="polite" className="flex items-center gap-3 border-t border-primary/20 bg-primary/5 px-5 py-3 text-xs text-primary">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              <span><strong>Analizando opciones históricas del lote.</strong> La carga todavía no terminó; la simulación vigente y la descarga permanecen bloqueadas.</span>
            </div>
          ) : null}

          <div className="grid gap-3 border-t border-primary/15 px-5 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
            {downloadType === "DEPURADO" ? (
              <label className="flex items-center gap-3 text-sm"><Switch checked={protectEffectiveContact} onCheckedChange={setProtectEffectiveContact} /><span><strong>Proteger líneas con contacto efectivo</strong><small className="block text-muted-foreground">ANSWER + subestado AGENT dentro de {rangeLabel(rangeDays).toLowerCase()}.</small></span></label>
            ) : (
              <p className="text-xs text-muted-foreground"><ShieldCheck className="mr-2 inline h-4 w-4" />La protección de contacto efectivo no aplica a grupos puntuales.</p>
            )}
            <span className="text-right text-[10px] text-muted-foreground">{optionsError || (options?.metrics ? `Opciones backend: ${options.metrics.totalMs.toLocaleString("es-AR")} ms` : "")}</span>
          </div>

          {!canSimulate ? <div className="border-t border-warning/30 bg-warning/5 px-5 py-3 text-xs font-semibold text-warning">Para un grupo puntual seleccioná al menos una catalogación o un estado Gateway. La simulación y la descarga están bloqueadas.</div> : null}

          <div className="border-t border-primary/20 px-5 py-4">
            <div className="flex h-11 items-center gap-2 border border-primary/25 bg-background px-3"><Search className="h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Línea, nombre, DNI, estado o motivo..." className="h-9 border-0 bg-transparent px-0 focus-visible:ring-0" /></div>
            <p className="mt-1 text-[10px] text-muted-foreground">El buscador sólo modifica la vista previa; no cambia la simulación, los totales ni el archivo.</p>
          </div>

          <div className="border-t border-primary/20 px-5 py-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Vista previa V2 · {visiblePreview.length.toLocaleString("es-AR")} de hasta 250 ANI</p>
            <div className="max-h-64 overflow-auto border border-primary/15">
              {visiblePreview.length ? visiblePreview.map((decision) => {
                const lead = baseLeadByAni.get(decision.ani);
                return <div key={decision.ani} className="grid gap-2 border-b border-primary/10 px-3 py-2 text-xs last:border-b-0 md:grid-cols-[130px_1fr_110px_2fr]">
                  <span className="font-mono font-semibold">{decision.ani}</span>
                  <span className="truncate text-muted-foreground">{lead?.razonSocial || "Sin nombre"}</span>
                  <Badge variant="outline" className={cn("w-fit rounded-none", decision.included ? "border-primary/40 text-primary" : "border-destructive/40 text-destructive")}>{decision.included ? "Exportable" : "No exportable"}</Badge>
                  <span className="text-muted-foreground">{decision.reasons.length ? decision.reasons.map((reason) => `${reason.label}: ${reason.foundCount}/${reason.minimumCount} (${rangeLabel(reason.rangeDays)})`).join(" · ") : "Sin condiciones coincidentes"}{decision.protectedByEffectiveContact ? " · Conservado por contacto efectivo" : ""}</span>
                </div>;
              }) : <p className="px-3 py-6 text-center text-xs text-muted-foreground">{data ? "No hay resultados visibles para la búsqueda." : "Cargá una base para ver la vista previa."}</p>}
            </div>
          </div>

          <div className="border-t border-primary/20">
            <button type="button" className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-primary/[0.045]" onClick={() => setMatrixOpen((current) => !current)} aria-expanded={matrixOpen}><span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Matriz de resultado · catalogaciones × gateways</span><ChevronDown className={cn("h-4 w-4 transition-transform", matrixOpen && "rotate-180")} /></button>
            {matrixOpen ? <div className="border-t border-primary/20 px-5 py-4">
              <p className="mb-3 text-[11px] text-muted-foreground">Un mismo ANI puede aparecer en más de una combinación. Los valores de la matriz no deben sumarse para obtener el total general.</p>
              <div className="max-h-96 overflow-auto border border-primary/15"><table className="w-full min-w-[720px] text-xs"><thead className="sticky top-0 bg-card"><tr><th className="px-3 py-2 text-left">Catalogación</th>{matrixGateways.map(([key, label]) => <th key={key} className="px-3 py-2 text-right">{label}</th>)}</tr></thead><tbody>{matrixCatalogs.length ? matrixCatalogs.map(([catalogKey, catalogLabel]) => <tr key={catalogKey} className="border-t border-primary/10"><td className="px-3 py-2 font-semibold">{catalogLabel}</td>{matrixGateways.map(([gatewayKey]) => <td key={gatewayKey} className="px-3 py-2 text-right text-muted-foreground">{(matrixMap.get(`${catalogKey}\u001f${gatewayKey}`) ?? 0).toLocaleString("es-AR")}</td>)}</tr>) : <tr><td colSpan={matrixGateways.length + 1} className="px-3 py-6 text-center text-muted-foreground">No hay combinaciones históricas en este rango.</td></tr>}</tbody></table></div>
            </div> : null}
          </div>
        </section>

        <section className="overflow-hidden rounded-md border border-primary/25 bg-card/80 dark:bg-[#05090b]">
          <div className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex flex-wrap items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              <strong className="text-sm">Configuraciones de filtrado</strong>
              {loadedConfig?.isDefault ? <Badge className="rounded-none"><Star className="mr-1 h-3 w-3" />Predeterminada</Badge> : null}
              {hasUnsavedConfigChanges ? <Badge variant="outline" className="rounded-none border-warning/50 text-warning">Hay cambios sin guardar</Badge> : null}
              {!loadedConfig ? <Badge variant="outline" className="rounded-none">Configuración manual</Badge> : null}
            </span>
            <Button type="button" variant="ghost" size="sm" disabled={configsLoading} onClick={() => void refreshConfigs(false)}>
              <RefreshCw className={cn("mr-2 h-3.5 w-3.5", configsLoading && "animate-spin")} />Actualizar desde SQLite
            </Button>
          </div>

          <div className="grid gap-3 border-t border-primary/20 px-5 py-4 lg:grid-cols-[minmax(240px,1fr)_minmax(220px,1fr)_auto] lg:items-end">
            <label className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Configuración disponible</span>
              <SelectField
                value={selectedConfigId}
                onChange={requestConfigSwitch}
                options={configs.map((config) => ({
                  value: config.id,
                  label: `${config.isDefault ? "★ " : ""}${config.name}`,
                }))}
              />
            </label>
            <label className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Nombre</span>
              <Input
                value={configName}
                disabled={!loadedConfig}
                maxLength={120}
                placeholder="Seleccioná o creá una configuración"
                className="h-11 rounded-none border-primary/25"
                onChange={(event) => setConfigName(event.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="h-11 rounded-none" disabled={!loadedConfig || Boolean(configOperation)} onClick={reapplySelectedConfig}>Aplicar guardada</Button>
              <Button type="button" variant="outline" className="h-11 rounded-none" disabled={Boolean(configOperation)} onClick={() => setCreateDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Crear nueva</Button>
              <Button type="button" className="h-11 rounded-none" disabled={!loadedConfig || !hasUnsavedConfigChanges || Boolean(configOperation)} onClick={() => void saveConfigChanges()}><Save className="mr-2 h-4 w-4" />Guardar cambios</Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-primary/15 px-5 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground">
              {configsLoading
                ? "Consultando SQLite..."
                : configs.length
                  ? `${configs.length.toLocaleString("es-AR")} configuraciones disponibles para todos los usuarios de este backend.`
                  : "Todavía no hay configuraciones guardadas en SQLite."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="rounded-none" disabled={!loadedConfig || loadedConfig.isDefault || hasUnsavedConfigChanges || Boolean(configOperation)} onClick={() => void markSelectedAsDefault()}><Star className="mr-2 h-3.5 w-3.5" />Marcar predeterminada</Button>
              <Button type="button" variant="outline" size="sm" className="rounded-none border-destructive/40 text-destructive hover:text-destructive" disabled={!loadedConfig || Boolean(configOperation)} onClick={() => setDeleteDialogOpen(true)}><Trash2 className="mr-2 h-3.5 w-3.5" />Eliminar</Button>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-md border border-primary/25 bg-card/80 dark:bg-[#05090b]">
          <button type="button" className={cn("flex w-full items-center justify-between px-5 py-4 text-left", simulationOpen && "border-b border-primary/20")} onClick={() => setSimulationOpen((current) => !current)}><span><strong className="flex items-center gap-2 text-sm uppercase tracking-[0.14em]"><Clock3 className="h-4 w-4 text-primary" />Simulación previa del lote</strong><small className="mt-1 block text-muted-foreground">La descarga sólo se habilita con esta misma simulación vigente.</small></span><span className="flex items-center gap-2">{changing ? <Badge variant="outline">Recalculando</Badge> : null}<ChevronDown className={cn("h-4 w-4 transition-transform", simulationOpen && "rotate-180")} /></span></button>
          {simulationOpen ? <div className="space-y-3 px-5 py-4">
            {simulationState === "error" ? <p className="text-xs text-destructive">{simulationError}</p> : null}
            {currentSimulation?.breakdown.length ? <div className="space-y-2">{currentSimulation.breakdown.map((item) => <div key={`${item.type}-${item.key}`} className="grid gap-2 border border-primary/15 px-3 py-2 text-xs md:grid-cols-[1fr_140px_150px_170px]"><strong>{item.label}</strong><span className="text-muted-foreground">Coinciden: {item.matchingAnis.toLocaleString("es-AR")}</span><span className="text-muted-foreground">Cantidad mínima: {item.minimumCount}</span><span className="text-muted-foreground">{rangeLabel(criteria.rangeDays)}{item.protectedAnis ? ` · ${item.protectedAnis.toLocaleString("es-AR")} protegidos` : ""}</span></div>)}</div> : <p className="text-xs text-muted-foreground">{canSimulate ? "No hay condiciones seleccionadas o la simulación está recalculándose." : "Seleccioná una condición para simular el grupo puntual."}</p>}
            {currentSimulation?.metrics ? <p className="text-[10px] text-muted-foreground">Consulta histórica: {currentSimulation.metrics.historyQueryMs.toLocaleString("es-AR")} ms · Evaluación: {currentSimulation.metrics.evaluationMs.toLocaleString("es-AR")} ms · Total: {currentSimulation.metrics.totalMs.toLocaleString("es-AR")} ms</p> : null}
          </div> : null}
        </section>

        <section className="grid overflow-hidden rounded-md border border-primary/35 bg-card/80 lg:grid-cols-[1fr_270px_auto] dark:bg-[#05090b]">
          <div className="border-b border-primary/20 px-5 py-4 lg:border-b-0 lg:border-r"><h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em]"><FileSpreadsheet className="h-4 w-4 text-primary" />Resumen final de descarga</h2><p className="mt-1 text-[11px] text-muted-foreground">{simulationCurrent ? "La configuración visible coincide con la última simulación válida." : "La simulación está pendiente o desactualizada; la descarga permanece bloqueada."}</p></div>
          <div className="border-b border-primary/20 px-5 py-4 lg:border-b-0 lg:border-r"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">ANI únicos a descargar</p><p className="mt-2 text-3xl font-black text-primary">{changing ? "Calculando..." : exportable.toLocaleString("es-AR")}</p></div>
          <div className="flex items-center px-5 py-4"><Button type="button" className="h-11 rounded-none" disabled={!data || !simulationCurrent || exportable === 0 || exporting} onClick={performExport}>{exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}{exporting ? "Generando..." : `Descargar (${exportable.toLocaleString("es-AR")})`}</Button></div>
        </section>

        <Dialog open={createDialogOpen} onOpenChange={(open) => {
          if (!configOperation) setCreateDialogOpen(open);
          if (!open && !configOperation) setNewConfigName("");
        }}>
          <DialogContent className="rounded-none border-primary/30">
            <DialogHeader>
              <DialogTitle>Crear configuración</DialogTitle>
              <DialogDescription>Se guardarán en SQLite todos los criterios visibles. No quedará como predeterminada automáticamente.</DialogDescription>
            </DialogHeader>
            <label className="space-y-2 text-xs font-semibold">
              Nombre
              <Input autoFocus value={newConfigName} maxLength={120} className="rounded-none" placeholder="Ej.: Lote diario comercial" onChange={(event) => setNewConfigName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && newConfigName.trim()) void createConfig(); }} />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={Boolean(configOperation)} onClick={() => setCreateDialogOpen(false)}>Cancelar</Button>
              <Button type="button" disabled={!newConfigName.trim() || Boolean(configOperation)} onClick={() => void createConfig()}>{configOperation === "create" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Guardar configuración</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => { if (!configOperation) setDeleteDialogOpen(open); }}>
          <AlertDialogContent className="rounded-none border-destructive/35">
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar {loadedConfig?.name}?</AlertDialogTitle>
              <AlertDialogDescription>Se eliminarán la configuración y sus condiciones. El lote, el historial y los criterios visibles no se modificarán.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={Boolean(configOperation)}>Cancelar</AlertDialogCancel>
              <Button type="button" variant="destructive" disabled={Boolean(configOperation)} onClick={() => void deleteSelectedConfig()}>{configOperation === "delete" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}Eliminar</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={switchDialogOpen} onOpenChange={(open) => {
          if (!configOperation) setSwitchDialogOpen(open);
          if (!open && !configOperation) setPendingConfigId("");
        }}>
          <AlertDialogContent className="rounded-none border-warning/40">
            <AlertDialogHeader>
              <AlertDialogTitle>Hay cambios sin guardar</AlertDialogTitle>
              <AlertDialogDescription>Antes de aplicar otra configuración podés cancelar, descartar el borrador actual o guardar los cambios y continuar.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 sm:space-x-0">
              <AlertDialogCancel disabled={Boolean(configOperation)}>Cancelar</AlertDialogCancel>
              <AlertDialogAction className="bg-muted text-foreground hover:bg-muted/80" disabled={Boolean(configOperation)} onClick={discardAndSwitch}>Descartar cambios</AlertDialogAction>
              <Button type="button" disabled={Boolean(configOperation)} onClick={() => void saveAndSwitch()}>{configOperation === "save" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Guardar y continuar</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
