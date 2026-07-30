import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Header } from "@/components/header";
import { FileUpload } from "@/components/file-upload";
import { KPICard } from "@/components/kpi-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  DashboardTabs,
  EstadoDistribucionChart,
  EstadoBarrasChart,
  TagDistribucionChart,
  PrefijosTopChart,
  PrefijosAnswerChart,
  HorariosPerformanceChart,
  CurvaContactacionChart,
  IntentosDistribucionChart,
} from "@/components/dashboard/dashboard-charts";
import { TurnosPrefijosTab } from "@/components/dashboard/turnos-prefijos";
import { DepuracionTab } from "@/components/dashboard/depuracion-tab";
import { FiltrosTab } from "@/components/dashboard/filtros-tab";
import { CatalogoPrefijosTab } from "@/components/dashboard/catalogo-prefijos";
import { SimuladorCortesTab } from "@/components/dashboard/simulador-cortes";
import { PrefijosPorHoraTab } from "@/components/dashboard/prefijos-por-hora-tab";
import { FuzzionTab } from "@/components/dashboard/fuzzion-tab";
import { NeotelSourcesPanel } from "@/components/dashboard/neotel-sources-panel";
import EffectivenessRadial from "@/components/dashboard/effectivenessRadial";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { AnalysisResult, RecordsFilter, BaseInsight } from "@shared/schema";
import {
  BarChart3,
  Clock,
  TrendingUp,
  Trash2,
  PlayCircle,
  Filter,
  BookOpen,
  Settings,
  Users,
  Phone,
  Target,
  PhoneOff,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Layers3,
  PieChart,
  Database,
  Eye,
  EyeOff,
  MoreVertical,
  ChevronDown,
  X,
} from "lucide-react";
import FilterChips from "@/components/dashboard/filterChips";
import ExportMenu from "@/components/dashboard/exportMenu";
import HourlyAreaChart from "@/components/dashboard/hourlyAreaChart";
import PrefijosTreemap from "@/components/dashboard/prefijosTreemap";
import MiniMapaArgentina from "@/components/dashboard/miniMapArgentina";
import InfoTooltip from "@/components/infoTooltip";
import AnalysisInsights from "@/components/dashboard/analysisInsights";
import DiagnosticoEjecutivo from "@/components/dashboard/diagnostico-ejecutivo";

type LocalHistoryStats = {
  dbPath: string;
  totalFiles: number;
  totalRecords: number;
  totalAnis: number;
  totalContactosEfectivos: number;
  totalAnalysisRuns: number;
};

type LocalHistoryFile = {
  id: number;
  fileName: string;
  fileHash: string;
  fechaArchivo: string | null;
  uploadedAt: string;
  totalRecords: number;
};

type OperationLogEntry = {
  id: string;
  time: string;
  timestamp: number;
  kind: "analysis" | "export" | "filter" | "error";
  title: string;
  detail: string;
  count?: number;
};

const OPERATION_LOG_STORAGE_KEY = "depurador:operation-log:v1";
const OPERATION_LOG_HOURS = 48;
const OPERATION_LOG_LIMIT = 100;
const OPERATION_LOG_WINDOW_MS = OPERATION_LOG_HOURS * 60 * 60 * 1000;

function formatOperationTime(timestamp: number) {
  return new Date(timestamp).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function normalizeOperationLog(
  entries: Array<Omit<OperationLogEntry, "time"> | OperationLogEntry>,
) {
  const cutoff = Date.now() - OPERATION_LOG_WINDOW_MS;
  const uniqueEntries = new Map<string, OperationLogEntry>();

  for (const entry of entries) {
    if (!Number.isFinite(entry.timestamp) || entry.timestamp < cutoff) continue;
    uniqueEntries.set(entry.id, {
      ...entry,
      time: formatOperationTime(entry.timestamp),
    });
  }

  return Array.from(uniqueEntries.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, OPERATION_LOG_LIMIT);
}

function loadRecentOperationLog() {
  if (typeof window === "undefined") return [];
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(OPERATION_LOG_STORAGE_KEY) || "[]",
    ) as OperationLogEntry[];
    return normalizeOperationLog(stored);
  } catch {
    return [];
  }
}

type FilterExportMeta = {
  visibleRows: number;
  activeFilters: number;
  selectedBases: string[];
  selectedEstados: string[];
  selectedSubestados: string[];
};

type HistoryPeriodType = "day" | "week" | "month";

type HistoryPeriodOption = {
  key: string;
  label: string;
  fileIds: number[];
  fileCount: number;
  totalRecords: number;
  sortValue: number;
};

function parseHistoryFileDate(value?: string | null) {
  if (!value) return null;

  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);

  return Number.isNaN(date.getTime()) ? null : date;
}

const historyNameCollator = new Intl.Collator("es", {
  numeric: true,
  sensitivity: "base",
});

function compareHistoryFiles(a: LocalHistoryFile, b: LocalHistoryFile) {
  const getParts = (file: LocalHistoryFile) => {
    const normalized = file.fileName.replace(/\\/g, "/");
    const separator = normalized.lastIndexOf("/");
    const directory = separator >= 0 ? normalized.slice(0, separator) : "";
    const baseName = separator >= 0 ? normalized.slice(separator + 1) : normalized;
    const dateNamed = /^\d{1,2}[-_.]\d{1,2}(?:[-_.]\d{2,4})?\.(?:xls|xlsx)$/i.test(baseName);
    const date = parseHistoryFileDate(file.fechaArchivo);

    return { directory, baseName, dateNamed, timestamp: date?.getTime() ?? 0 };
  };

  const left = getParts(a);
  const right = getParts(b);
  const directoryOrder = historyNameCollator.compare(left.directory, right.directory);
  if (directoryOrder !== 0) return directoryOrder;

  if (left.dateNamed && right.dateNamed && left.timestamp !== right.timestamp) {
    return right.timestamp - left.timestamp;
  }
  if (left.dateNamed !== right.dateNamed) return left.dateNamed ? -1 : 1;

  return historyNameCollator.compare(left.baseName, right.baseName);
}
function formatShortDate(date: Date) {
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getMonday(date: Date) {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function buildHistoryPeriodKey(date: Date, type: HistoryPeriodType) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  if (type === "day") {
    return {
      key: `${year}-${month}-${day}`,
      label: formatShortDate(date),
      sortValue: date.getTime(),
    };
  }

  if (type === "month") {
    return {
      key: `${year}-${month}`,
      label: date.toLocaleDateString("es-AR", {
        month: "long",
        year: "numeric",
      }),
      sortValue: new Date(year, date.getMonth(), 1).getTime(),
    };
  }

  const monday = getMonday(date);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    key: `week-${monday.toISOString().slice(0, 10)}`,
    label: `Semana ${formatShortDate(monday)} al ${formatShortDate(sunday)}`,
    sortValue: monday.getTime(),
  };
}

export default function Home() {
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [hideCallbackBases, setHideCallbackBases] = useState(true);
  const [baseDecisionFilter, setBaseDecisionFilter] = useState<
    "TODAS" | "UTILIZAR" | "REVISAR" | "DESCARTAR"
  >("TODAS");
  const [workspaceMode, setWorkspaceMode] = useState<"operar" | "analizar">("operar");
  const [activeDashboardTab, setActiveDashboardTab] = useState("filtros");
  const [historyPeriodType, setHistoryPeriodType] =
    useState<HistoryPeriodType>("day");
  const [selectedHistoryPeriodKey, setSelectedHistoryPeriodKey] = useState("");
  const [activeAnalysis, setActiveAnalysis] = useState<{
    scope: "upload" | "file" | "history";
    label: string;
  } | null>(null);
  const analysisRequestIdRef = useRef(0);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const uploadCancelledByUserRef = useRef(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastUploadInfo, setLastUploadInfo] = useState<{
    count: number;
    names: string[];
  } | null>(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [quickHistoryOpen, setQuickHistoryOpen] = useState(false);
  const [neotelModalOpen, setNeotelModalOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [operationLog, setOperationLog] =
    useState<OperationLogEntry[]>(loadRecentOperationLog);

    const { toast } = useToast();
    const queryClient = useQueryClient();

  const refreshOperationLog = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/operation-log?hours=${OPERATION_LOG_HOURS}&limit=${OPERATION_LOG_LIMIT}`,
      );
      if (!response.ok) return;

      const storedEntries = (await response.json()) as Array<
        Omit<OperationLogEntry, "time">
      >;
      setOperationLog((current) =>
        normalizeOperationLog([...storedEntries, ...current]),
      );
    } catch {
      // Conservamos la copia local si SQLite no está disponible temporalmente.
    }
  }, []);

  const pushOperationLog = useCallback(
    (entry: Omit<OperationLogEntry, "id" | "time" | "timestamp">) => {
      const timestamp = Date.now();
      const newEntry: OperationLogEntry = {
        ...entry,
        id: `${timestamp}-${Math.random().toString(16).slice(2)}`,
        time: formatOperationTime(timestamp),
        timestamp,
      };

      setOperationLog((current) =>
        normalizeOperationLog([newEntry, ...current]),
      );

      void fetch("/api/operation-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newEntry),
      }).catch(() => {
        // La copia del navegador queda como respaldo para sincronizar luego.
      });
    },
    []
  );

  useEffect(() => {
    const localEntries = loadRecentOperationLog();

    const synchronizeOperationLog = async () => {
      await Promise.allSettled(
        localEntries.map((entry) =>
          fetch("/api/operation-log", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(entry),
          }),
        ),
      );
      await refreshOperationLog();
    };

    void synchronizeOperationLog();
  }, [refreshOperationLog]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        OPERATION_LOG_STORAGE_KEY,
        JSON.stringify(operationLog.slice(0, OPERATION_LOG_LIMIT)),
      );
    } catch {
      // La bitacora sigue disponible durante la sesion si el navegador bloquea storage.
    }
  }, [operationLog]);

  const describeFilterMeta = useCallback((meta?: FilterExportMeta) => {
    if (!meta) return "Sin detalle de filtros";

    const parts = [
      meta.selectedBases.length > 0
        ? `bases ${meta.selectedBases.join(", ")}`
        : "todas las bases",
      meta.selectedEstados.length > 0
        ? `estados ${meta.selectedEstados.join(", ")}`
        : "todos los estados",
      meta.selectedSubestados.length > 0
        ? `subestados ${meta.selectedSubestados.join(", ")}`
        : "todos los subestados",
    ];

    return `${parts.join(" · ")} · ${meta.activeFilters} filtros activos`;
  }, []);

    const historyStatsQuery = useQuery<LocalHistoryStats>({
      queryKey: ["local-history-stats"],
      queryFn: async () => {
        const response = await fetch("/api/history/stats");

        if (!response.ok) {
          throw new Error("No se pudo leer el historial local");
        }

        return response.json();
      },
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 2,
    });

    const historyFilesQuery = useQuery<LocalHistoryFile[]>({
    queryKey: ["local-history-files"],
    queryFn: async () => {
      const response = await fetch("/api/history/files?limit=100");
      if (!response.ok) {
        throw new Error("No se pudieron leer los archivos importados");
      }

      return response.json();
    },
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 2,
  });

    const analyzeAllHistoryMutation = useMutation({
      mutationFn: async () => {
        const requestId = ++analysisRequestIdRef.current;
        const response = await fetch("/api/history/analyze-all", {
          method: "POST",
        });

        if (!response.ok) {
          let message = "No se pudo analizar el historial completo";

          try {
            const errorData = await response.json();
            if (errorData?.detail || errorData?.message) {
              message = errorData.detail || errorData.message;
            }
          } catch {
            // Dejamos el mensaje generico si el backend no responde JSON.
          }

          throw new Error(message);
        }

        return {
          data: await response.json(),
          requestId,
        };
      },
      onSuccess: ({ data, requestId }) => {
        if (requestId !== analysisRequestIdRef.current) return;

        setUploadError(null);
        setAnalysisResult(data);
        setActiveAnalysis({
          scope: "history",
          label: "Historial completo",
        });
        setWorkspaceMode("analizar");
        setActiveDashboardTab("resumen");
        pushOperationLog({
          kind: "analysis",
          title: "Historial completo analizado",
          detail: `${data.totalAnis.toLocaleString("es-AR")} ANIs · modo resumen`,
          count: data.totalRecords,
        });

        toast({
          title: "Historial completo analizado",
          description: `Se analizaron ${data.totalRecords.toLocaleString(
            "es-AR"
          )} registros guardados en SQLite.`,
        });
      },
      onError: (error) => {
        pushOperationLog({
          kind: "error",
          title: "Fallo al analizar historial",
          detail:
            error instanceof Error
              ? error.message
              : "Error no identificado al analizar SQLite",
        });

        toast({
          title:
            error instanceof Error
              ? error.message
              : "No se pudo analizar el historial",
          description: "Revisá la terminal o intentá nuevamente.",
          variant: "destructive",
        });
      },
    });

    const analyzeHistoryPeriodMutation = useMutation({
      mutationFn: async (period: HistoryPeriodOption) => {
        const requestId = ++analysisRequestIdRef.current;
        const response = await fetch("/api/history/analyze-selection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileIds: period.fileIds,
            label: period.label,
          }),
        });

        if (!response.ok) {
          let message = "No se pudo analizar el periodo seleccionado";

          try {
            const errorData = await response.json();
            if (errorData?.detail || errorData?.message) {
              message = errorData.detail || errorData.message;
            }
          } catch {
            // Dejamos el mensaje generico si el backend no responde JSON.
          }

          throw new Error(message);
        }

        return {
          data: await response.json(),
          period,
          requestId,
        };
      },
      onSuccess: ({ data, period, requestId }) => {
        if (requestId !== analysisRequestIdRef.current) return;

        setUploadError(null);
        setAnalysisResult(data);
        setWorkspaceMode(data.rawRecords?.length ? "operar" : "analizar");
        setActiveDashboardTab(data.rawRecords?.length ? "filtros" : "resumen");
        setActiveAnalysis({
          scope: "history",
          label: period.label,
        });
        pushOperationLog({
          kind: "analysis",
          title: "Periodo analizado",
          detail: `${period.label} · ${period.fileCount} ticket${period.fileCount === 1 ? "" : "s"}`,
          count: data.totalRecords,
        });

        toast({
          title: "Periodo analizado",
          description: `Se analizaron ${data.totalRecords.toLocaleString(
            "es-AR"
          )} registros de ${period.label}.`,
        });
      },
      onError: (error) => {
        pushOperationLog({
          kind: "error",
          title: "Fallo al analizar periodo",
          detail:
            error instanceof Error
              ? error.message
              : "Error no identificado al analizar periodo",
        });

        toast({
          title: "No se pudo analizar el periodo",
          description:
            error instanceof Error
              ? error.message
              : "Revisa la terminal o intenta nuevamente.",
          variant: "destructive",
        });
      },
    });

    const analyzeHistoryFileMutation = useMutation({
    mutationFn: async (file: LocalHistoryFile) => {
      const requestId = ++analysisRequestIdRef.current;
      const response = await fetch(`/api/history/files/${file.id}/analyze`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("No se pudo analizar el ticket guardado");
      }

      return {
        data: await response.json(),
        file,
        requestId,
      };
    },
    onSuccess: ({ data, file, requestId }) => {
      if (requestId !== analysisRequestIdRef.current) return;

      setUploadError(null);
      setAnalysisResult(data);
      setWorkspaceMode("operar");
      setActiveDashboardTab("filtros");
      setActiveAnalysis({
        scope: "file",
        label: `${file.fileName}${file.fechaArchivo ? ` · ${file.fechaArchivo}` : ""}`,
      });

      toast({
        title: "Ticket histórico analizado",
        description: `Se analizaron ${data.totalRecords.toLocaleString(
          "es-AR"
        )} registros desde SQLite.`,
      });
      pushOperationLog({
        kind: "analysis",
        title: "Ticket analizado",
        detail: `${file.fileName}${file.fechaArchivo ? ` · ${file.fechaArchivo}` : ""}`,
        count: data.totalRecords,
      });
    },
    onError: () => {
      toast({
        title: "No se pudo analizar",
        description: "Revisá la terminal o intentá nuevamente.",
        variant: "destructive",
      });
    },
  });

    const deleteHistoryFileMutation = useMutation({
      mutationFn: async (fileId: number) => {
        const confirmed = window.confirm(
          "¿Querés eliminar este ticket del historial local? Esta acción también elimina sus registros guardados en SQLite."
        );

        if (!confirmed) {
          throw new Error("Eliminación cancelada");
        }

        const response = await fetch(`/api/history/files/${fileId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          throw new Error("No se pudo eliminar el ticket guardado");
        }

        return response.json();
      },
      onSuccess: () => {
        historyStatsQuery.refetch();
        historyFilesQuery.refetch();

        toast({
          title: "Ticket eliminado",
          description: "El archivo y sus registros fueron eliminados del historial local.",
        });
      },
      onError: (error) => {
        if (error instanceof Error && error.message === "Eliminación cancelada") {
          return;
        }

        toast({
          title: "No se pudo eliminar",
          description: "Revisá la terminal o intentá nuevamente.",
          variant: "destructive",
        });
      },
    });

    const deleteAllHistoryMutation = useMutation({
      mutationFn: async () => {
        const confirmed = window.confirm(
          "¿Querés eliminar los tickets guardados? Los reportes FTP y sus gestiones se conservarán."
        );

        if (!confirmed) {
          throw new Error("Eliminación cancelada");
        }

        const secondConfirmed = window.confirm(
          "Confirmación final: se eliminarán solamente los tickets y sus análisis. Los datos sincronizados desde el FTP no se borrarán."
        );

        if (!secondConfirmed) {
          throw new Error("Eliminación cancelada");
        }
        
        const response = await fetch("/api/history/clear-tickets", {
          method: "DELETE",
        });

        if (!response.ok) {
          throw new Error("No se pudo eliminar el historial completo");
        }

        return response.json();
      },
      onSuccess: () => {
        setAnalysisResult(null);
        setActiveAnalysis(null);
        setUploadError(null);

        historyStatsQuery.refetch();
        historyFilesQuery.refetch();

        toast({
          title: "Historial eliminado",
          description: "Se eliminaron los tickets y análisis locales. Los reportes FTP siguen disponibles.",
        });
      },
      onError: (error) => {
        if (error instanceof Error && error.message === "Eliminación cancelada") {
          return;
        }

        toast({
          title: "No se pudo eliminar el historial",
          description: "Revisá la terminal o intentá nuevamente.",
          variant: "destructive",
        });
      },
    });

    const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const requestId = ++analysisRequestIdRef.current;
      const controller = new AbortController();
      uploadAbortControllerRef.current = controller;
      uploadCancelledByUserRef.current = false;
      const formData = new FormData();

      files.forEach((file) => {
        formData.append("files", file);
      });

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

    if (!response.ok) {
      let message = "Error al procesar los archivos";

      try {
        const error = await response.json();
        message = error.message || error.error || message;
      } catch {
        message = `Error del servidor (${response.status}) al procesar los archivos`;
      }

      throw new Error(message);
    }

      return {
        data: (await response.json()) as AnalysisResult,
        files,
        requestId,
      };
    },
      onSuccess: ({ data, files, requestId }) => {
        if (requestId !== analysisRequestIdRef.current) return;

        setUploadError(null);
        setAnalysisResult(data);
        setActiveAnalysis({
          scope: "upload",
          label:
            files.length === 1
              ? files[0].name
              : `${files.length.toLocaleString("es-AR")} archivos recién cargados`,
        });
        historyStatsQuery.refetch();
        historyFilesQuery.refetch();
        pushOperationLog({
          kind: "analysis",
          title: "Carga analizada",
          detail:
            files.length === 1
              ? files[0].name
              : `${files.length.toLocaleString("es-AR")} archivos cargados`,
          count: data.totalRecords,
        });

        toast({
          title: "Análisis completado",
          description: `Se procesaron ${data.totalRecords.toLocaleString(
            "es-AR"
          )} intentos de ${data.totalAnis.toLocaleString("es-AR")} líneas únicas (ANIs).`,
        });
      },

    onError: (error: Error) => {
      if (error.name === "AbortError" && uploadCancelledByUserRef.current) {
        setUploadError(null);
        setLastUploadInfo(null);
        pushOperationLog({
          kind: "filter",
          title: "Carga cancelada",
          detail: "El procesamiento se detuvo por solicitud del usuario.",
        });

        toast({
          title: "Carga cancelada",
          description: "Los archivos temporales fueron descartados.",
        });
        return;
      }

      setAnalysisResult(null);
      setUploadError(error.message);
      historyStatsQuery.refetch();
      historyFilesQuery.refetch();
      pushOperationLog({
        kind: "error",
        title: "Fallo al procesar carga",
        detail: error.message,
      });

      toast({
        title: "Error al procesar",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      uploadAbortControllerRef.current = null;
      uploadCancelledByUserRef.current = false;
    },
  });

  const handleCancelUpload = useCallback(() => {
    if (!uploadMutation.isPending || !uploadAbortControllerRef.current) return;

    uploadCancelledByUserRef.current = true;
    analysisRequestIdRef.current += 1;
    uploadAbortControllerRef.current.abort();
  }, [uploadMutation.isPending]);

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      if (
        uploadMutation.isPending ||
        analyzeHistoryFileMutation.isPending ||
        analyzeAllHistoryMutation.isPending
      ) {
        return;
      }

      setUploadError(null);

      setLastUploadInfo({
        count: files.length,
        names: files.map((file) => file.name),
      });

      uploadMutation.mutate(files);
    },
    [analyzeAllHistoryMutation.isPending, analyzeHistoryFileMutation.isPending, uploadMutation]
  );

  const handleExportResumen = useCallback(async () => {
    if (!analysisResult) return;

    try {
      const response = await fetch("/api/export/resumen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId: analysisResult.id }),
      });

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = url;
      a.download = "resumen_por_ani.csv";
      a.click();

      window.URL.revokeObjectURL(url);
    } catch {
      toast({
        title: "Error al exportar",
        description: "No se pudo generar el archivo",
        variant: "destructive",
      });
    }
  }, [analysisResult, toast]);

  const handleExportFiltrado = useCallback(
    async (tags: string[]) => {
      if (!analysisResult) return;

      try {
        const response = await fetch("/api/export/filtrado", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ analysisId: analysisResult.id, tags }),
        });

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");

        a.href = url;
        a.download = "base_filtrada.csv";
        a.click();

        window.URL.revokeObjectURL(url);
      } catch {
        toast({
          title: "Error al exportar",
          description: "No se pudo generar el archivo",
          variant: "destructive",
        });
      }
    },
    [analysisResult, toast]
  );

  const handleExportBaseFinal = useCallback(
    async (filters: {
      tags: string[];
      prioridad?: string;
      accion?: string;
      soloSaturados?: boolean;
      scoreMinimo?: number | null;
      busqueda?: string;
      fileName?: string;
    }) => {
      if (!analysisResult) return;

      try {
        const { fileName = "base_final_depurada.csv", ...requestFilters } = filters;

        const response = await fetch("/api/export/base-final", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysisId: analysisResult.id,
            ...requestFilters,
          }),
        });

        if (!response.ok) {
          let message = "No se pudo generar la base final depurada";

          try {
            const errorData = await response.json();
            if (errorData?.message) {
              message = errorData.message;
            }
          } catch {
            // Dejamos el mensaje genérico si la respuesta no trae JSON.
          }

          throw new Error(message);
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");

        a.href = url;
        a.download = fileName;
        a.click();

        window.URL.revokeObjectURL(url);
      } catch (error) {
        toast({
          title: "Error al exportar",
          description:
            error instanceof Error
              ? error.message
              : "No se pudo generar la base final depurada",
          variant: "destructive",
        });
      }
    },
    [analysisResult, toast]
  );

  const handleExportNeotel = useCallback(
  async (filters: {
    aniList?: string[];
    segmento?: "BUZONES_SIN_CONTACTO";
    tags: string[];
    prioridad?: string;
    accion?: string;
    soloSaturados?: boolean;
    scoreMinimo?: number | null;
    busqueda?: string;
    fileName?: string;
  }) => {
    if (!analysisResult) return;

    try {
      const {
        fileName = "contactos_neotel_depurados.xls",
        ...requestFilters
      } = filters;

      const response = await fetch("/api/export/neotel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: analysisResult.id,
          ...requestFilters,
        }),
      });

    if (!response.ok) {
      let message = "No se pudo generar el lote Neotel";

      try {
        const errorData = await response.json();
        if (errorData?.message) {
          message = errorData.message;
        }
      } catch {
        // Si no viene JSON, dejamos el mensaje genérico.
      }

      throw new Error(message);
    }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      const serverFileName = response.headers
        .get("Content-Disposition")
        ?.match(/filename="?([^";]+)"?/i)?.[1];
      const serverExtension = serverFileName?.match(/\.(xlsx?)$/i)?.[1];
      const downloadFileName = serverExtension
        ? fileName.match(/\.xlsx?$/i)
          ? fileName.replace(/\.xlsx?$/i, `.${serverExtension}`)
          : `${fileName}.${serverExtension}`
        : fileName;

      a.href = url;
      a.download = downloadFileName;
      a.click();

      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Error al exportar",
        description:
          error instanceof Error
            ? error.message
            : "No se pudo generar el lote Neotel",
        variant: "destructive",
      });
    }
  },
  [analysisResult, toast]
);

  const handleExportPorAccion = useCallback(
    async (accion: string) => {
      if (!analysisResult || !accion || accion === "TODAS") return;

      try {
        const response = await fetch("/api/export/accion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysisId: analysisResult.id,
            accion,
          }),
        });

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");

        a.href = url;
        a.download = `base_por_accion_${accion.toLowerCase()}.csv`;
        a.click();

        window.URL.revokeObjectURL(url);
      } catch {
        toast({
          title: "Error al exportar",
          description: "No se pudo exportar por acción sugerida",
          variant: "destructive",
        });
      }
    },
    [analysisResult, toast]
  );

  const handleExportRecords = useCallback(
    async (
      filters: RecordsFilter,
      format: "csv" | "txt" | "xlsx",
      meta?: FilterExportMeta
    ) => {
      if (!analysisResult) return;

      try {
        const lotLabel = activeAnalysis?.label || "Lote actual";
        const operationDetail = `${lotLabel} · ${describeFilterMeta(meta)}`;

        pushOperationLog({
          kind: "filter",
          title: `Filtro listo para ${format.toUpperCase()}`,
          detail: operationDetail,
          count: meta?.visibleRows,
        });

        const response = await fetch("/api/export/records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysisId: analysisResult.id,
            filters,
            format,
          }),
        });

        if (!response.ok) {
          let message = "No se pudo generar el archivo";

          try {
            const errorData = await response.json();
            if (errorData?.message) {
              message = errorData.message;
            }
          } catch {
            // Si el servidor no devuelve JSON, mantenemos el mensaje generico.
          }

          throw new Error(message);
        }

        const blob = await response.blob();
        if (blob.size === 0) {
          throw new Error("La exportacion no genero registros con los filtros actuales");
        }

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");

        a.href = url;
        a.download = `registros_filtrados.${format}`;
        a.click();

        window.URL.revokeObjectURL(url);
        pushOperationLog({
          kind: "export",
          title: `Descarga ${format.toUpperCase()} generada`,
          detail: operationDetail,
          count: meta?.visibleRows,
        });
      } catch (error) {
        pushOperationLog({
          kind: "error",
          title: `Fallo descarga ${format.toUpperCase()}`,
          detail:
            error instanceof Error
              ? error.message
              : "No se pudo generar el archivo",
          count: meta?.visibleRows,
        });

        toast({
          title: "Error al exportar",
          description:
            error instanceof Error
              ? error.message
              : "No se pudo generar el archivo",
          variant: "destructive",
        });
      }
    },
    [activeAnalysis, analysisResult, describeFilterMeta, pushOperationLog, toast]
  );

  const handleRegisterFilterLog = useCallback(
    (meta: FilterExportMeta) => {
      pushOperationLog({
        kind: "filter",
        title: "Filtro registrado",
        detail: `${activeAnalysis?.label || "Lote actual"} · ${describeFilterMeta(meta)}`,
        count: meta.visibleRows,
      });
    },
    [activeAnalysis, describeFilterMeta, pushOperationLog]
  );

  const allRankedBases = useMemo(() => {
    if (!analysisResult?.baseInsights) return [];

    return [...analysisResult.baseInsights].sort(
      (a: BaseInsight, b: BaseInsight) => b.scoreCalidad - a.scoreCalidad
    );
  }, [analysisResult]);

  const minimalSampleBases = useMemo(
    () => allRankedBases.filter((base) => base.totalAnis <= 10),
    [allRankedBases]
  );
  const callbackBasesCount = minimalSampleBases.length;

  const rankedBases = useMemo(
    () =>
      hideCallbackBases
        ? allRankedBases.filter((base) => base.totalAnis > 10)
        : allRankedBases,
    [allRankedBases, hideCallbackBases]
  );

  const resumenBases = useMemo(() => {
    const total = rankedBases.length;
    const utilizables = rankedBases.filter(
      (b) => b.recomendacion === "UTILIZAR"
    ).length;
    const revisar = rankedBases.filter((b) => b.recomendacion === "REVISAR").length;
    const descartar = rankedBases.filter(
      (b) => b.recomendacion === "DESCARTAR"
    ).length;

    return {
      total,
      utilizables,
      revisar,
      descartar,
      mejorBase: rankedBases[0]?.base ?? "-",
    };
  }, [rankedBases]);

  const discardedBaseNames = useMemo(
    () =>
      rankedBases
        .filter((base) => base.recomendacion === "DESCARTAR")
        .map((base) => base.base),
    [rankedBases]
  );

  const displayedRankedBases = useMemo(
    () =>
      baseDecisionFilter === "TODAS"
        ? rankedBases
        : rankedBases.filter(
            (base) => base.recomendacion === baseDecisionFilter
          ),
    [baseDecisionFilter, rankedBases]
  );

  const kpiSparklineData = useMemo(() => {
  const empty = {
    total: [] as number[],
    contactados: [] as number[],
    depurar: [] as number[],
    pctAnswer: [] as number[],
    pctNoAnswer: [] as number[],
  };

  if (!analysisResult?.rangoDistribucion) return empty;

  const rangos = Object.values(analysisResult.rangoDistribucion);

  if (rangos.length <= 1) return empty;

  const total = rangos.map((rango) => rango.total);
  const contactados = rangos.map((rango) => rango.answer);
  const noAnswer = rangos.map((rango) => rango.noAnswer);

  const depurar = rangos.map((rango) => Math.max(rango.noAnswer, 0));

  const pctAnswer = rangos.map((rango) =>
    rango.total > 0 ? Number(((rango.answer / rango.total) * 100).toFixed(1)) : 0
  );

  const pctNoAnswer = rangos.map((rango) =>
    rango.total > 0
      ? Number(((rango.noAnswer / rango.total) * 100).toFixed(1))
      : 0
  );

  return {
    total,
    contactados,
    depurar,
    pctAnswer,
    pctNoAnswer,
  };
}, [analysisResult]);

  const localHistoryStats = historyStatsQuery.data;
  const localHistoryFiles = historyFilesQuery.data ?? [];
  const sortedLocalHistoryFiles = useMemo(
    () => [...localHistoryFiles].sort(compareHistoryFiles),
    [localHistoryFiles],
  );

  const historyPeriodOptions = useMemo<HistoryPeriodOption[]>(() => {
    const groups = new Map<string, HistoryPeriodOption>();

    for (const file of localHistoryFiles) {
      const date = parseHistoryFileDate(file.fechaArchivo);
      if (!date) continue;

      const period = buildHistoryPeriodKey(date, historyPeriodType);
      const current =
        groups.get(period.key) ??
        {
          key: period.key,
          label: period.label,
          fileIds: [],
          fileCount: 0,
          totalRecords: 0,
          sortValue: period.sortValue,
        };

      current.fileIds.push(file.id);
      current.fileCount += 1;
      current.totalRecords += file.totalRecords;
      groups.set(period.key, current);
    }

    return Array.from(groups.values()).sort((a, b) => b.sortValue - a.sortValue);
  }, [historyPeriodType, localHistoryFiles]);

  const selectedHistoryPeriod =
    historyPeriodOptions.find((option) => option.key === selectedHistoryPeriodKey) ??
    historyPeriodOptions[0];
  const renderBadge = (recomendacion: string) => {
    if (recomendacion === "UTILIZAR") {
      return (
        <Badge className="border-success/25 bg-success/15 text-success hover:bg-success/15">
          UTILIZAR
        </Badge>
      );
    }

    if (recomendacion === "REVISAR") {
      return (
        <Badge className="border-warning/25 bg-warning/15 text-warning hover:bg-warning/15">
          REVISAR
        </Badge>
      );
    }

    return (
      <Badge className="border-destructive/25 bg-destructive/15 text-destructive hover:bg-destructive/15">
        DESCARTAR
      </Badge>
    );
  };

  const latestAnalysisLogIndex = operationLog.findIndex(
    (entry) => entry.kind === "analysis",
  );
  const hasCompletedExport = operationLog
    .slice(0, latestAnalysisLogIndex < 0 ? operationLog.length : latestAnalysisLogIndex)
    .some((entry) => entry.kind === "export");
  const workflowSteps = workspaceMode === "operar"
    ? [
        { label: "Datos cargados", status: "complete" as const, target: "history", tab: "filtros" },
        {
          label: "Filtrar y depurar",
          status: hasCompletedExport || activeDashboardTab === "depuracion"
            ? "complete" as const
            : activeDashboardTab === "filtros" ? "current" as const : "pending" as const,
          target: "dashboard",
          tab: "filtros",
        },
        {
          label: "Priorizar",
          status: hasCompletedExport
            ? "complete" as const
            : activeDashboardTab === "depuracion" ? "current" as const : "pending" as const,
          target: "dashboard",
          tab: "depuracion",
        },
        {
          label: "Exportar lote",
          status: hasCompletedExport ? "complete" as const : "pending" as const,
          target: "dashboard",
          tab: "depuracion",
        },
      ]
    : [
        {
          label: "Historial disponible",
          status: localHistoryFiles.length > 0 ? "complete" as const : "pending" as const,
          target: "history",
          tab: "resumen",
        },
        {
          label: "Alcance elegido",
          status: activeAnalysis ? "complete" as const : "current" as const,
          target: "history",
          tab: "resumen",
        },
        {
          label: "Análisis generado",
          status: analysisResult ? "complete" as const : "pending" as const,
          target: "dashboard",
          tab: "resumen",
        },
        {
          label: "Revisar prioridades",
          status: analysisResult ? "current" as const : "pending" as const,
          target: "dashboard",
          tab: "resumen",
        },
      ];

  const navigateWorkflow = (target: string, tab: string) => {
    if (target === "history") {
      setHistoryModalOpen(true);
      return;
    }
    if (target === "dashboard") setActiveDashboardTab(tab);
    window.requestAnimationFrame(() => {
      document.getElementById(
        "analysis-dashboard",
      )?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const openHistoryDrawerTarget = () => {
    setSidebarOpen(false);
    window.setTimeout(() => setHistoryModalOpen(true), 180);
  };

  const openNeotelDrawerTarget = () => {
    setSidebarOpen(false);
    window.setTimeout(() => setNeotelModalOpen(true), 180);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <Header
        onMenuClick={() => setSidebarOpen((current) => !current)}
        onHistoryClick={() => {
          setQuickHistoryOpen(true);
          void refreshOperationLog();
        }}
        historyCount={operationLog.length}
      />

      <main className="operational-workspace w-full pt-[64px]" data-export-root>
        <button
          type="button"
          aria-label="Cerrar fuentes de datos"
          className={cn(
            "fixed inset-0 z-[60] bg-black/70 backdrop-blur-[1px] transition-opacity duration-300 ease-out",
            sidebarOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
          )}
          onClick={() => setSidebarOpen(false)}
        />

        <div className="min-h-[calc(100vh-64px)]">
          <aside className={cn(
            "fixed inset-y-0 left-0 z-[70] w-[376px] max-w-[88vw] border-r border-primary/25 bg-background shadow-2xl shadow-black/35 transition-transform duration-300 ease-out dark:bg-[#05090b]",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}>
            <div className="flex h-11 items-center justify-between border-b border-primary/20 px-3 font-mono">
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-foreground">
                Fuentes de datos
              </p>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-primary/35 bg-primary/10 text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                onClick={() => setSidebarOpen(false)}
                aria-label="Cerrar fuentes de datos"
                title="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="h-[calc(100vh-44px)] overflow-auto border-b border-primary/20 px-3 py-4 font-mono">
              <div className="mb-5 -mx-1">
                <NeotelSourcesPanel
                  sidebar
                  onLog={pushOperationLog}
                  onLocalImportComplete={() => {
                    void queryClient.invalidateQueries({
                      queryKey: ["local-history-stats"],
                    });
                    void queryClient.invalidateQueries({
                      queryKey: ["local-history-files"],
                    });
                  }}
                />
              </div>

              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Carga manual
              </p>
              <FileUpload
                onFilesSelected={handleFilesSelected}
                onCancelUpload={handleCancelUpload}
                compact
                className="rounded-none border-0 bg-transparent p-0 shadow-none backdrop-blur-none hover:shadow-none [&_h2]:text-sm [&_h2]:tracking-tight [&_label]:rounded-none"
                title="Carga manual"
                description="Archivos externos al FTP."
                isUploading={
                  uploadMutation.isPending ||
                  analyzeHistoryFileMutation.isPending ||
                  analyzeAllHistoryMutation.isPending
                }
                uploadError={uploadError}
              />
              <button
                type="button"
                className="soft-cyan-hover mt-6 flex w-full items-center justify-between gap-3 rounded-md border border-primary/15 bg-background/70 px-3 py-3 text-left transition-colors hover:border-primary/45 hover:bg-primary/5 dark:bg-[#0b1114]"
                onClick={openHistoryDrawerTarget}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="rounded-md border border-primary/25 bg-primary/10 p-2 text-primary">
                    <Database className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-foreground">
                      Historial de tickets
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      Analizar días, semanas o meses.
                    </span>
                  </span>
                </span>
                <Badge variant="outline" className="rounded px-2 font-mono text-[11px]">
                  {localHistoryFiles.length.toLocaleString("es-AR")}
                </Badge>
              </button>
              <button
                type="button"
                className="hidden"
                onClick={openNeotelDrawerTarget}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="rounded-md border border-primary/25 bg-primary/10 p-2 text-primary">
                    <Database className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-foreground">
                      Conexión Neotel
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      FTP, fechas y catalogaciones.
                    </span>
                  </span>
                </span>
                <Badge variant="outline" className="rounded px-2 font-mono text-[11px]">FTP</Badge>
              </button>
            </div>
          </aside>

          <button
            type="button"
            aria-label="Cerrar historial rapido"
            className={cn(
              "fixed inset-0 z-[65] bg-black/72 backdrop-blur-[1px] transition-opacity duration-300 ease-out",
              quickHistoryOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
            )}
            onClick={() => setQuickHistoryOpen(false)}
          />

          <aside
            className={cn(
              "fixed inset-y-0 right-0 z-[75] w-[520px] max-w-[92vw] border-l border-primary/25 bg-background shadow-2xl shadow-black/40 transition-transform duration-300 ease-out dark:bg-[#0b1114]",
              quickHistoryOpen ? "translate-x-0" : "translate-x-full",
            )}
            aria-hidden={!quickHistoryOpen}
          >
            <div className="flex h-14 items-center justify-between border-b border-primary/20 px-5">
              <div className="min-w-0">
                <h2 className="font-display text-base font-bold text-foreground">
                  Historial operativo · últimas 48 h
                </h2>
                <p className="text-xs text-muted-foreground">
                  {operationLog.length.toLocaleString("es-AR")} movimientos guardados
                </p>
              </div>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/35 bg-primary/10 text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                onClick={() => setQuickHistoryOpen(false)}
                aria-label="Cerrar historial rapido"
                title="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex h-[calc(100vh-56px)] flex-col">
              <div className="grid grid-cols-[112px_1fr_auto] gap-3 border-b border-primary/20 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                <div>Fecha y hora</div>
                <div>Movimiento</div>
                <div className="text-right">Tipo</div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto">
                {operationLog.length === 0 ? (
                  <div className="px-5 py-8 text-sm text-muted-foreground">
                    Todavía no hubo movimientos operativos en las últimas 48 horas.
                    Las cargas, análisis, filtros, descargas y errores aparecerán acá.
                  </div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {operationLog.map((entry) => (
                      <div
                        key={entry.id}
                        className="grid grid-cols-[112px_1fr_auto] items-start gap-3 px-5 py-4 text-sm transition-colors hover:bg-primary/[0.045]"
                      >
                        <span className="font-mono text-xs text-muted-foreground">
                          {entry.time}
                        </span>

                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">{entry.title}</p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {entry.detail}
                          </p>
                          {typeof entry.count === "number" ? (
                            <p className="mt-2 text-xs font-bold text-primary">
                              {entry.count.toLocaleString("es-AR")} registros
                            </p>
                          ) : null}
                        </div>

                        <Badge
                          variant={
                            entry.kind === "error"
                              ? "destructive"
                              : entry.kind === "export"
                                ? "default"
                                : "outline"
                          }
                          className="rounded"
                        >
                          {entry.kind === "analysis"
                            ? "análisis"
                            : entry.kind === "export"
                              ? "descarga"
                              : entry.kind === "filter"
                                ? "filtro"
                                : "error"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-primary/20 p-4">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-md border border-primary/25 bg-primary/5 px-3 py-3 text-left text-sm font-bold text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10"
                  onClick={() => {
                    setQuickHistoryOpen(false);
                    window.setTimeout(() => setHistoryModalOpen(true), 180);
                  }}
                >
                  <span className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-primary" />
                    Abrir historial de tickets guardados
                  </span>
                  <Badge variant="outline" className="rounded">
                    {localHistoryFiles.length.toLocaleString("es-AR")}
                  </Badge>
                </button>
              </div>
            </div>
          </aside>

          <div className="min-w-0 px-4 pb-8 pt-4 lg:pr-16 xl:pl-5">
            <section className="mb-4">
              <FuzzionTab onLog={pushOperationLog} />
            </section>

            <Dialog open={neotelModalOpen} onOpenChange={setNeotelModalOpen}>
              <DialogContent className="max-h-[90vh] max-w-[min(1180px,calc(100vw-2rem))] overflow-auto p-0">
                <NeotelSourcesPanel
                  onLog={pushOperationLog}
                  onLocalImportComplete={() => {
                    void queryClient.invalidateQueries({
                      queryKey: ["local-history-stats"],
                    });
                    void queryClient.invalidateQueries({
                      queryKey: ["local-history-files"],
                    });
                  }}
                />
              </DialogContent>
            </Dialog>

        <section className="hidden">
          <Card className="glass-card overflow-hidden border-primary/15 bg-background/70">
            <CardContent className="p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl border border-primary/20 bg-primary/10 p-3 text-primary">
                    <Database className="h-5 w-5" />
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-foreground">
                        Historial local SQLite
                      </h2>

                      <Badge className="border-primary/25 bg-primary/10 text-primary hover:bg-primary/10">
                        activo
                      </Badge>
                    </div>

                    <p className="mt-1 text-xs text-muted-foreground">
                      Los tickets cargados quedan guardados localmente para futuras consultas y comparativas.
                    </p>
                  </div>
                </div>

                {historyStatsQuery.isLoading ? (
                  <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                    {[...Array(4)].map((_, index) => (
                      <div key={index} className="rounded-xl border border-border/60 bg-muted/20 p-3">
                        <Skeleton className="mb-2 h-3 w-20" />
                        <Skeleton className="h-5 w-14" />
                      </div>
                    ))}
                  </div>
                ) : localHistoryStats ? (
                  <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                    <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Archivos
                      </p>
                      <p className="mt-1 text-lg font-bold text-foreground">
                        {localHistoryStats.totalFiles.toLocaleString("es-AR")}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Intentos
                      </p>
                      <p className="mt-1 text-lg font-bold text-foreground">
                        {localHistoryStats.totalRecords.toLocaleString("es-AR")}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Líneas únicas (ANIs)
                      </p>
                      <p className="mt-1 text-lg font-bold text-foreground">
                        {localHistoryStats.totalAnis.toLocaleString("es-AR")}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Contactos efectivos
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-lg font-bold text-success">
                        <CheckCircle2 className="h-4 w-4" />
                        {localHistoryStats.totalContactosEfectivos.toLocaleString("es-AR")}
                      </p>
                    </div>
                  </div>
                ) : historyStatsQuery.isError ? (
                  <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    No se pudo conectar con el historial local SQLite. Revisá que el backend esté corriendo y que exista el endpoint /api/history/stats.
                  </div>
                ) : (
                  <div className="rounded-xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
                    Historial local inicializándose. Si es la primera vez, cargá un ticket para crear la base local.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        <Dialog open={historyModalOpen} onOpenChange={setHistoryModalOpen}>
          <DialogContent className="max-h-[90vh] max-w-[min(1180px,calc(100vw-2rem))] overflow-hidden p-0">
            <div id="history-tickets" className="max-h-[90vh] overflow-auto">
          <Card className="glass-card overflow-hidden border-border/70 bg-background/70">
            <CardContent className="p-4">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-bold uppercase text-foreground">
                        Historial de tickets
                      </h2>
                      <span className="text-xs text-muted-foreground">
                        {localHistoryFiles.length.toLocaleString("es-AR")} visibles
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Archivos importados al historial local para reutilizar sin volver a cargarlos.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-lg border border-primary bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={
                        analyzeAllHistoryMutation.isPending ||
                        analyzeHistoryPeriodMutation.isPending ||
                        analyzeHistoryFileMutation.isPending ||
                        uploadMutation.isPending ||
                        localHistoryFiles.length === 0
                      }
                      onClick={() => analyzeAllHistoryMutation.mutate()}>
                      <PlayCircle className="h-4 w-4" />
                      {analyzeAllHistoryMutation.isPending
                        ? "Analizando historial..."
                        : "Analizar todos los tickets"}
                    </button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          aria-label="Opciones del historial"
                          title="Opciones del historial"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                          disabled={
                            deleteAllHistoryMutation.isPending ||
                            analyzeHistoryPeriodMutation.isPending ||
                            localHistoryFiles.length === 0
                          }
                          onSelect={() => deleteAllHistoryMutation.mutate()}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {deleteAllHistoryMutation.isPending
                            ? "Eliminando..."
                            : "Eliminar tickets guardados"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {localHistoryFiles.length > 0 && (
                  <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
                    <div className="mb-3 flex flex-col gap-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                        Analizar por periodo
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Elegi si queres mirar un dia, una semana o un mes sin mezclar todo el historial.
                      </p>
                    </div>

                    <div className="grid gap-2 md:grid-cols-[160px_1fr_auto]">
                      <select
                        value={historyPeriodType}
                        onChange={(event) => {
                          setHistoryPeriodType(event.target.value as HistoryPeriodType);
                          setSelectedHistoryPeriodKey("");
                        }}
                        className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                      >
                        <option value="day">Dia</option>
                        <option value="week">Semana</option>
                        <option value="month">Mes</option>
                      </select>

                      <select
                        value={selectedHistoryPeriod?.key ?? ""}
                        onChange={(event) => setSelectedHistoryPeriodKey(event.target.value)}
                        className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                        disabled={historyPeriodOptions.length === 0}
                      >
                        {historyPeriodOptions.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label} · {option.fileCount} ticket{option.fileCount === 1 ? "" : "s"} · {option.totalRecords.toLocaleString("es-AR")} registros
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={
                          !selectedHistoryPeriod ||
                          analyzeHistoryPeriodMutation.isPending ||
                          analyzeAllHistoryMutation.isPending ||
                          analyzeHistoryFileMutation.isPending ||
                          uploadMutation.isPending
                        }
                        onClick={() => {
                          if (selectedHistoryPeriod) {
                            analyzeHistoryPeriodMutation.mutate(selectedHistoryPeriod);
                          }
                        }}
                      >
                        <PlayCircle className="h-4 w-4" />
                        {analyzeHistoryPeriodMutation.isPending
                          ? "Analizando..."
                          : "Analizar periodo"}
                      </button>
                    </div>
                  </div>
                )}

              {historyFilesQuery.isLoading ? (
                <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                  Cargando últimos tickets guardados...
                </div>
              ) : historyFilesQuery.isError ? (
                <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  No se pudo leer la lista de tickets guardados.
                </div>
              ) : localHistoryFiles.length === 0 ? (
                <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                  Todavía no hay tickets guardados. Cargá un archivo de Neotel para empezar a construir el historial.
                </div>
              ) : (
                  <div className="max-h-[520px] overflow-auto rounded-xl border border-border/60">
                  <div className="grid grid-cols-12 gap-3 border-b border-border/60 bg-muted/30 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <div className="col-span-4">Archivo</div>
                    <div className="col-span-2">Fecha archivo</div>
                    <div className="col-span-2 text-right">Intentos</div>
                    <div className="col-span-3 text-right">Cargado</div>
                    <div className="col-span-1 text-right">Acción</div>
                  </div>

                  <div className="divide-y divide-border/60">
                    {sortedLocalHistoryFiles.map((file) => (
                      <div
                        key={file.id}
                        className="grid grid-cols-12 gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/20">
                        <div className="col-span-4 min-w-0">
                          <p className="truncate font-medium text-foreground">
                            {file.fileName}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            Hash: {file.fileHash.slice(0, 10)}...
                          </p>
                        </div>

                        <div className="col-span-2 flex items-center text-muted-foreground">
                          {file.fechaArchivo || "Sin fecha"}
                        </div>

                        <div className="col-span-2 flex items-center justify-end font-semibold text-foreground">
                          {file.totalRecords.toLocaleString("es-AR")}
                        </div>

                        <div className="col-span-3 flex items-center justify-end text-xs text-muted-foreground">
                          {new Date(file.uploadedAt).toLocaleString("es-AR")}
                        </div>

                        <div className="col-span-1 flex items-center justify-end gap-2">
                          <button type="button"
                            className="rounded-lg border border-primary/20 bg-primary/10 p-2 text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
                            disabled={
                              analyzeHistoryFileMutation.isPending ||
                              analyzeAllHistoryMutation.isPending ||
                              uploadMutation.isPending
                            }
                            onClick={() => analyzeHistoryFileMutation.mutate(file)}
                            title="Analizar ticket guardado">
                            <PlayCircle className="h-4 w-4" />
                          </button>

                          <button type="button"
                            className="rounded-lg border border-destructive/20 bg-destructive/10 p-2 text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
                            disabled={deleteHistoryFileMutation.isPending}
                            onClick={() => deleteHistoryFileMutation.mutate(file.id)}
                            title="Eliminar ticket del historial">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
            </div>
          </DialogContent>
        </Dialog>

        {analysisResult && activeAnalysis && (
          <section className="mb-6">
            <div className="flex flex-col gap-2 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase text-primary">
                  Análisis activo
                </p>
                <p className="truncate text-sm font-semibold text-foreground">
                  {activeAnalysis.label}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">
                  {activeAnalysis.scope === "history"
                    ? "Historial completo"
                    : activeAnalysis.scope === "file"
                      ? "Solo este ticket"
                      : "Carga actual"}
                </Badge>
                <span>
                  {analysisResult.totalRecords.toLocaleString("es-AR")} registros ·{" "}
                  {analysisResult.totalAnis.toLocaleString("es-AR")} ANIs
                </span>
              </div>
            </div>
          </section>
        )}

        {uploadMutation.isPending && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
              {[...Array(5)].map((_, i) => (
                <Card key={i} className="glass-card">
                  <CardContent className="p-4">
                    <Skeleton className="mb-2 h-4 w-24" />
                    <Skeleton className="h-8 w-20" />
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="glass-card">
              <CardContent className="p-8">
                <div className="flex flex-col items-center justify-center gap-4">
                  <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
                  <p className="text-muted-foreground">
                    Procesando archivos... esto puede tomar unos segundos.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {analysisResult && !uploadMutation.isPending && (
          <Tabs
            id="analysis-dashboard"
            value={activeDashboardTab}
            onValueChange={setActiveDashboardTab}
            className="scroll-mt-[72px] space-y-6"
          >
            <section className="mb-2 grid grid-cols-2 overflow-hidden rounded-md border border-border bg-card/40">
              <button
                type="button"
                onClick={() => {
                  setWorkspaceMode("operar");
                  setActiveDashboardTab("filtros");
                }}
                className={cn(
                  "flex h-10 items-center justify-center gap-2 border-r border-border px-3 text-xs font-semibold transition-colors",
                  workspaceMode === "operar"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <Filter className="h-4 w-4" />
                Operar / Descargar
              </button>
              <button
                type="button"
                onClick={() => {
                  setWorkspaceMode("analizar");
                  setActiveDashboardTab("resumen");
                }}
                className={cn(
                  "flex h-10 items-center justify-center gap-2 px-3 text-xs font-semibold transition-colors",
                  workspaceMode === "analizar"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <BarChart3 className="h-4 w-4" />
                Analizar / Entender
              </button>
            </section>

            <section className="mb-3 overflow-x-auto border border-border bg-background/70" aria-label="Ruta de trabajo actual">
              <div className="flex min-w-[680px] items-stretch">
                <div className="flex w-32 shrink-0 items-center border-r border-border px-3 py-2">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">
                    {workspaceMode === "operar" ? "Ruta operativa" : "Ruta de análisis"}
                  </span>
                </div>
                {workflowSteps.map((step, index) => (
                  <button
                    key={step.label}
                    type="button"
                    onClick={() => navigateWorkflow(step.target, step.tab)}
                    className={cn(
                      "relative flex min-h-12 flex-1 items-center gap-2 border-r border-border px-3 py-2 text-left text-xs transition-colors last:border-r-0 hover:bg-muted/40",
                      step.status === "current" && "bg-primary/10 text-primary",
                      step.status === "complete" && "text-foreground",
                      step.status === "pending" && "text-muted-foreground",
                    )}
                    aria-current={step.status === "current" ? "step" : undefined}
                  >
                    {step.status === "complete" ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                          step.status === "current"
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border",
                        )}
                      >
                        {index + 1}
                      </span>
                    )}
                    <span className="font-semibold">{step.label}</span>
                    {step.status === "current" ? (
                      <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />
                    ) : null}
                  </button>
                ))}
              </div>
            </section>

            <div className="sticky top-12 z-40 mb-2 rounded-md bg-background/90 py-1 backdrop-blur lg:fixed lg:right-2 lg:top-14 lg:mb-0 lg:bg-transparent lg:p-0">
              <TabsList
                className={
                  workspaceMode === "operar"
                    ? "grid h-auto w-full grid-cols-2 gap-1 p-1 lg:flex lg:w-11 lg:flex-col"
                    : "grid h-auto w-full grid-cols-6 gap-1 p-1 lg:flex lg:w-11 lg:flex-col"
                }
              >
                <TabsTrigger
                  value="resumen"
                  className={workspaceMode === "analizar" ? "flex items-center gap-2 py-2" : "hidden"}
                >
                  <BarChart3 className="h-4 w-4" />
                  <span className="sr-only">Resumen ejecutivo</span>
                </TabsTrigger>

                <TabsTrigger
                  value="graficos"
                  className={workspaceMode === "analizar" ? "flex items-center gap-2 py-2" : "hidden"}
                >
                  <PieChart className="h-4 w-4" />
                  <span className="sr-only">Gráficos</span>
                </TabsTrigger>

                <TabsTrigger
                  value="turnos"
                  className={workspaceMode === "analizar" ? "flex items-center gap-2 py-2" : "hidden"}
                >
                  <TrendingUp className="h-4 w-4" />
                  <span className="sr-only">Turnos y prefijos</span>
                </TabsTrigger>

                <TabsTrigger
                  value="prefijos-hora"
                  className={workspaceMode === "analizar" ? "flex items-center gap-2 py-2" : "hidden"}
                >
                  <Clock className="h-4 w-4" />
                  <span className="sr-only">Prefijos por hora</span>
                </TabsTrigger>

                <TabsTrigger
                  value="depuracion"
                  className={workspaceMode === "operar" ? "order-2 flex items-center gap-2 py-2" : "hidden"}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">Motor de depuración</span>
                </TabsTrigger>

                <TabsTrigger
                  value="filtros"
                  className={workspaceMode === "operar" ? "order-1 flex items-center gap-2 py-2" : "hidden"}
                >
                  <Filter className="h-4 w-4" />
                  <span className="sr-only">Filtro detallado</span>
                </TabsTrigger>

                <TabsTrigger
                  value="simulador"
                  className={workspaceMode === "analizar" ? "flex items-center gap-2 py-2" : "hidden"}
                >
                  <Settings className="h-4 w-4" />
                  <span className="sr-only">Simulador</span>
                </TabsTrigger>
                
                <TabsTrigger
                  value="catalogo"
                  className={workspaceMode === "analizar" ? "flex items-center gap-2 py-2" : "hidden"}
                >
                  <BookOpen className="h-4 w-4" />
                  <span className="sr-only">Catálogo de prefijos</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="resumen" className="space-y-6">
              <div data-summary-export-root="true" className="mx-auto w-full max-w-[1120px] space-y-6 rounded-2xl bg-background p-6">
                <DiagnosticoEjecutivo data={analysisResult} />

                <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-start sm:justify-between">
                <div className="text-center sm:text-left">
                  <h2 className="gradient-text text-base font-display font-bold">
                    Detalle técnico del resumen
                  </h2>

                  <p className="mt-2 text-sm text-muted-foreground">
                    Indicadores complementarios para profundizar el diagnóstico de calidad, bases y estados operativos.
                  </p>
                </div>

                <div className="flex justify-center sm:justify-end">
                  <ExportMenu data={analysisResult} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                <KPICard
                  title="Bases analizadas"
                  value={resumenBases.total}
                  icon={Layers3}
                  infoSide="bottom"
                  info="Cantidad de bases distintas detectadas dentro del archivo cargado. Permite comparar calidad entre bases, campañas, segmentos o lotes de origen."
                />

                <KPICard
                  title="Bases utilizables"
                  value={resumenBases.utilizables}
                  icon={CheckCircle2}
                  variant="success"
                  infoSide="bottom"
                  info="Bases con indicadores suficientes para seguir gestionando. Generalmente combinan buen volumen, contacto efectivo aceptable y bajo nivel de señales negativas."
                />

                <KPICard
                  title="Bases a revisar"
                  value={resumenBases.revisar}
                  icon={AlertTriangle}
                  variant="warning"
                  infoSide="bottom"
                  info="Bases que no deberían descartarse automáticamente, pero requieren análisis antes de seguir insistiendo. Pueden tener baja contactabilidad, mucho buzón, pocos registros o muestra poco confiable."
                />

                <KPICard
                  title="Bases a descartar"
                  value={resumenBases.descartar}
                  icon={XCircle}
                  variant="danger"
                  infoSide="bottom"
                  info="Bases con señales fuertes de baja calidad o bajo potencial operativo. Ayuda a evitar consumo innecesario de intentos, tiempo y recursos del discador."
                />

                <KPICard
                  title="Mejor base"
                  value={resumenBases.mejorBase}
                  icon={TrendingUp}
                  infoSide="bottom"
                  info="Base con mejor score de calidad según los criterios del depurador. El score combina variables como contacto efectivo, buzón, inválidos, intentos promedio y confiabilidad de muestra."
                />
              </div>

              {discardedBaseNames.length > 0 && (
                <div className="flex flex-col gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase text-destructive">
                      Bases marcadas para descartar
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {discardedBaseNames.join(", ")}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="rounded-lg border border-destructive/30 px-3 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
                    onClick={() => setBaseDecisionFilter("DESCARTAR")}
                  >
                    Ver detalle
                  </button>
                </div>
              )}

              {allRankedBases.length > 0 && (
                <Card className="glass-card">
                  <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                    <CardTitle className="flex items-center gap-2 text-sm font-display font-bold">
                      Ranking de calidad de bases
                      <InfoTooltip
                        side="right"
                        text="Ordena las bases según su calidad operativa. El ranking considera contacto efectivo, volumen de ANIs, buzón, inválidos, intentos promedio y confiabilidad de la muestra. Sirve para decidir qué base priorizar, revisar o descartar."
                      />
                    </CardTitle>

                    {callbackBasesCount > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Muestras mínimas (&lt;= 10 ANIs):{" "}
                        <span className="font-semibold text-foreground">
                          {hideCallbackBases ? "ocultas" : "incluidas"}
                        </span>
                        {" · "}
                        {minimalSampleBases.map((base) => base.base).join(", ")}
                      </p>
                    )}
                    </div>

                    {callbackBasesCount > 0 && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
                        onClick={() => setHideCallbackBases((current) => !current)}
                      >
                        {hideCallbackBases ? (
                          <Eye className="h-4 w-4" />
                        ) : (
                          <EyeOff className="h-4 w-4" />
                        )}
                        {hideCallbackBases
                          ? `Mostrar ${callbackBasesCount} muestras mínimas`
                          : `Ocultar ${callbackBasesCount} muestras mínimas`}
                      </button>
                    )}
                  </CardHeader>

                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          ["TODAS", `Todas (${rankedBases.length})`],
                          ["UTILIZAR", `Utilizables (${resumenBases.utilizables})`],
                          ["REVISAR", `Revisar (${resumenBases.revisar})`],
                          ["DESCARTAR", `Descartar (${resumenBases.descartar})`],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          className={
                            baseDecisionFilter === value
                              ? "rounded-lg border border-primary/35 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary"
                              : "rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/25 hover:text-foreground"
                          }
                          onClick={() => setBaseDecisionFilter(value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {displayedRankedBases.length === 0 && (
                      <div className="rounded-lg border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                        No hay bases visibles para esta decisión con los filtros actuales.
                      </div>
                    )}

                    {displayedRankedBases
                      .slice(0, baseDecisionFilter === "TODAS" ? 5 : undefined)
                      .map((base: BaseInsight) => (
                      <div
                        key={base.base}
                        className="soft-cyan-hover flex flex-col gap-3 rounded-xl border border-border bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {base.base}
                            </p>

                            {renderBadge(base.recomendacion)}

                            {base.confiabilidadMuestra && (
                              <span className="rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Muestra {base.confiabilidadMuestra.toLowerCase()}
                              </span>
                            )}
                          </div>

                          <p className="mt-1 text-xs text-muted-foreground">
                            Registros: {base.totalRegistros.toLocaleString("es-AR")} · ANIs:{" "}
                            {base.totalAnis.toLocaleString("es-AR")} · Intentos prom.:{" "}
                            {base.intentosPromedio.toFixed(2)}
                          </p>

                          {base.advertenciaMuestra &&
                            base.confiabilidadMuestra !== "ALTA" && (
                              <p className="mt-1 text-[11px] text-warning">
                                {base.advertenciaMuestra}
                              </p>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4 lg:min-w-[500px]">
                          <div className="soft-cyan-hover rounded-lg border border-border bg-background px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                Contacto efectivo
                              </p>

                              <InfoTooltip
                                side="top"
                                text="Porcentaje de ANIs de esa base que lograron contacto efectivo. A mayor valor, mejor potencial operativo tiene la base." />
                            </div>

                            <p className="mt-1 font-semibold text-success">
                              {(base.pctContactoEfectivo * 100).toFixed(1)}%
                            </p>
                          </div>

                          <div className="soft-cyan-hover rounded-lg border border-border bg-background px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                Buzón
                              </p>

                              <InfoTooltip
                                side="top"
                                text="Porcentaje de ANIs que derivaron en buzón o contestador. Un valor alto puede indicar baja disponibilidad, mala calidad de datos o necesidad de ajustar horarios y reintentos." />
                            </div>

                            <p className="mt-1 font-semibold text-warning">
                              {(base.pctBuzon * 100).toFixed(1)}%
                            </p>
                          </div>

                          <div className="soft-cyan-hover rounded-lg border border-border bg-background px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                Inválidos
                              </p>

                              <InfoTooltip
                                side="top"
                                text="Porcentaje de registros con señales inválidas, rechazadas o no gestionables. Si este valor es alto, conviene depurar la base antes de seguir marcando." />
                            </div>

                            <p className="mt-1 font-semibold text-destructive">
                              {(base.pctInvalidos * 100).toFixed(1)}%
                            </p>
                          </div>

                          <div className="soft-cyan-hover rounded-lg border border-border bg-background px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                Score ajustado
                              </p>

                              <InfoTooltip
                                side="top"
                                text="Indicador resumen de calidad de la base. Combina métricas positivas y negativas para facilitar la decisión operativa. Cuanto más alto, mejor calidad relativa." />
                            </div>

                            <p className="mt-1 font-semibold text-foreground">
                              {base.scoreCalidad.toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
              </div>
            </TabsContent>

            <TabsContent value="graficos" className="space-y-6">
              <div className="pt-1 text-center">
                <h2 className="gradient-text text-center text-base font-display font-bold">
                  Gráficos y comportamiento de la base
                </h2>

                <p className="mt-2 text-sm text-muted-foreground">
                  Análisis visual de estados, TAGs, contactación, intentos, prefijos y cobertura regional.
                </p>
              </div>

              <EffectivenessRadial data={analysisResult} />

              <AnalysisInsights data={analysisResult} />

              <FilterChips data={analysisResult} />

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <EstadoDistribucionChart data={analysisResult} />
                <TagDistribucionChart data={analysisResult} />
              </div>

              <CurvaContactacionChart data={analysisResult} />

              <IntentosDistribucionChart data={analysisResult} />

              <MiniMapaArgentina data={analysisResult} />
            </TabsContent>

            <TabsContent value="turnos" className="space-y-6">
              <TurnosPrefijosTab data={analysisResult} />
            </TabsContent>

            <TabsContent value="prefijos-hora" className="space-y-6">
              <PrefijosPorHoraTab data={analysisResult} />
            </TabsContent>

            <TabsContent value="depuracion" className="space-y-6">
              <DepuracionTab
                data={analysisResult}
                onExportResumen={handleExportResumen}
                onExportFiltrado={handleExportFiltrado}
                onExportBaseFinal={handleExportBaseFinal}
                onExportNeotel={handleExportNeotel}
                onExportPorAccion={handleExportPorAccion}
              />
            </TabsContent>

            <TabsContent value="filtros" className="space-y-6">
              <FiltrosTab
                data={analysisResult}
                onExportFiltrado={handleExportRecords}
                onRegisterLog={handleRegisterFilterLog}
              />
            </TabsContent>

            <TabsContent value="catalogo" className="space-y-6">
              <CatalogoPrefijosTab prefijos={[]} />
            </TabsContent>

            <TabsContent value="simulador" className="space-y-6">
              <SimuladorCortesTab data={analysisResult} />
            </TabsContent>
          </Tabs>
        )}

        {!analysisResult && !uploadMutation.isPending && uploadError && (
          <Card className="glass-card border-destructive/30 bg-destructive/5">
            <CardContent className="flex min-h-[260px] flex-col items-center justify-center p-10 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-7 w-7 text-destructive" />
              </div>

              <h3 className="text-3xl font-bold text-foreground">
                No se pudo procesar la carga
              </h3>

              <p className="mt-3 max-w-[620px] text-base leading-relaxed text-muted-foreground">
                Se seleccionaron{" "}
                <span className="font-semibold text-foreground">
                  {lastUploadInfo?.count ?? 0}
                </span>{" "}
                archivo{lastUploadInfo?.count === 1 ? "" : "s"}, pero el backend devolvió
                un error durante el procesamiento.
              </p>

              <div className="mt-5 max-w-[720px] rounded-xl border border-destructive/25 bg-background/70 p-4 text-left">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-destructive">
                  Detalle del error
                </p>

                <p className="text-sm leading-relaxed text-foreground">
                  {uploadError}
                </p>
              </div>

              {lastUploadInfo?.names?.length ? (
                <div className="mt-4 flex max-w-[760px] flex-wrap justify-center gap-2">
                  {lastUploadInfo.names.slice(0, 6).map((name) => (
                    <Badge
                      key={name}
                      className="border-border bg-secondary/70 text-muted-foreground"
                    >
                      {name}
                    </Badge>
                  ))}
                </div>
              ) : null}

              <p className="mt-5 max-w-[640px] text-sm leading-relaxed text-muted-foreground">
                Probá cargar un archivo por vez para detectar cuál falla, o revisá la
                terminal de Visual Studio Code para ver el error técnico exacto.
              </p>
            </CardContent>
          </Card>
        )}

        {!analysisResult && !uploadMutation.isPending && !uploadError && (
          <Card className="border-primary/20 bg-card/70 shadow-none">
            <CardContent className="grid gap-5 p-5 md:grid-cols-[1fr_auto] md:items-center">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-primary/25 bg-primary/10 text-primary">
                  <BarChart3 className="h-5 w-5" />
                </div>

                <div className="min-w-0">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                    Análisis pendiente
                  </p>
                  <h3 className="mt-1 text-xl font-extrabold text-foreground">
                    Todavía no hay análisis activo
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    Para ver resultados podés analizar tickets guardados, elegir un período del historial o cargar una base puntual.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 md:justify-end">
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-primary bg-primary px-3 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    analyzeAllHistoryMutation.isPending ||
                    localHistoryFiles.length === 0
                  }
                  onClick={() => analyzeAllHistoryMutation.mutate()}
                >
                  <PlayCircle className="h-4 w-4" />
                  Analizar tickets
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-bold text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5"
                  onClick={() => setHistoryModalOpen(true)}
                >
                  <Database className="h-4 w-4 text-primary" />
                  Elegir período
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-bold text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5"
                  onClick={() => setNeotelModalOpen(true)}
                >
                  <Database className="h-4 w-4 text-primary" />
                  Ver conexión
                </button>
              </div>

              <div className="hidden">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <BarChart3 className="h-7 w-7 text-muted-foreground" />
              </div>

              <h3 className="text-3xl font-bold text-foreground">Sin datos para mostrar</h3>

              <p className="mt-3 max-w-[540px] text-base leading-relaxed text-muted-foreground">
                Subí al menos un archivo de Neotel (CSV, TXT, XLS o XLSX) para habilitar las pestañas de análisis.
              </p>
              </div>
            </CardContent>
          </Card>
        )}
          </div>
        </div>
      </main>

    </div>
  );
}
