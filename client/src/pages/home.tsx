import { useState, useCallback, useMemo } from "react";
import { Header } from "@/components/header";
import { FileUpload } from "@/components/file-upload";
import { KPICard } from "@/components/kpi-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import EffectivenessRadial from "@/components/dashboard/effectivenessRadial";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
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

export default function Home() {
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastUploadInfo, setLastUploadInfo] = useState<{
    count: number;
    names: string[];
  } | null>(null);

    const { toast } = useToast();

    const historyStatsQuery = useQuery<LocalHistoryStats>({
      queryKey: ["local-history-stats"],
      queryFn: async () => {
        const response = await fetch("/api/history/stats");

        if (!response.ok) {
          throw new Error("No se pudo leer el historial local");
        }

        return response.json();
      },
      refetchOnWindowFocus: false,
      retry: false,
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
    refetchOnWindowFocus: false,
    retry: false,
  });

    const analyzeAllHistoryMutation = useMutation({
      mutationFn: async () => {
        const response = await fetch("/api/history/analyze-all", {
          method: "POST",
        });

        if (!response.ok) {
          throw new Error("No se pudo analizar el historial completo");
        }

        return response.json();
      },
      onSuccess: (data) => {
        setUploadError(null);
        setAnalysisResult(data);

        toast({
          title: "Historial completo analizado",
          description: `Se analizaron ${data.totalRecords.toLocaleString(
            "es-AR"
          )} registros guardados en SQLite.`,
        });
      },
      onError: () => {
        toast({
          title: "No se pudo analizar el historial",
          description: "Revisá la terminal o intentá nuevamente.",
          variant: "destructive",
        });
      },
    });

    const analyzeHistoryFileMutation = useMutation({
    mutationFn: async (fileId: number) => {
      const response = await fetch(`/api/history/files/${fileId}/analyze`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("No se pudo analizar el ticket guardado");
      }

      return response.json();
    },
    onSuccess: (data) => {
      setUploadError(null);
      setAnalysisResult(data);

      toast({
        title: "Ticket histórico analizado",
        description: `Se analizaron ${data.totalRecords.toLocaleString(
          "es-AR"
        )} registros desde SQLite.`,
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
          "¿Querés eliminar TODO el historial local SQLite? Esta acción borra todos los tickets y registros guardados, pero no elimina tus archivos Excel originales."
        );

        if (!confirmed) {
          throw new Error("Eliminación cancelada");
        }

        const secondConfirmed = window.confirm(
          "Confirmación final: se va a vaciar todo el historial local. Después vas a tener que volver a cargar los tickets."
        );

        if (!secondConfirmed) {
          throw new Error("Eliminación cancelada");
        }
        
        const response = await fetch("/api/history/clear-all", {
          method: "DELETE",
        });

        if (!response.ok) {
          throw new Error("No se pudo eliminar el historial completo");
        }

        return response.json();
      },
      onSuccess: () => {
        setAnalysisResult(null);
        setUploadError(null);

        historyStatsQuery.refetch();
        historyFilesQuery.refetch();

        toast({
          title: "Historial eliminado",
          description: "Se eliminaron todos los tickets y registros guardados en SQLite.",
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
      const formData = new FormData();

      files.forEach((file) => {
        formData.append("files", file);
      });

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
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

      return response.json() as Promise<AnalysisResult>;
    },
      onSuccess: (data) => {
        setUploadError(null);
        setAnalysisResult(data);
        historyStatsQuery.refetch();
        historyFilesQuery.refetch();

        toast({
          title: "Análisis completado",
          description: `Se procesaron ${data.totalRecords.toLocaleString(
            "es-AR"
          )} registros de ${data.totalAnis.toLocaleString("es-AR")} ANIs únicos.`,
        });
      },

    onError: (error: Error) => {
      setAnalysisResult(null);
      setUploadError(error.message);

      toast({
        title: "Error al procesar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      setUploadError(null);

      setLastUploadInfo({
        count: files.length,
        names: files.map((file) => file.name),
      });

      uploadMutation.mutate(files);
    },
    [uploadMutation]
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
    }) => {
      if (!analysisResult) return;

      try {
        const response = await fetch("/api/export/base-final", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysisId: analysisResult.id,
            ...filters,
          }),
        });

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");

        a.href = url;
        a.download = "base_final_depurada.csv";
        a.click();

        window.URL.revokeObjectURL(url);
      } catch {
        toast({
          title: "Error al exportar",
          description: "No se pudo generar la base final depurada",
          variant: "destructive",
        });
      }
    },
    [analysisResult, toast]
  );

  const handleExportNeotel = useCallback(
  async (filters: {
    aniList?: string[];
    tags: string[];
    prioridad?: string;
    accion?: string;
    soloSaturados?: boolean;
    scoreMinimo?: number | null;
    busqueda?: string;
  }) => {
    if (!analysisResult) return;

    try {
      const response = await fetch("/api/export/neotel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: analysisResult.id,
          ...filters,
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

      a.href = url;
      a.download = "contactos_neotel_depurados.xls";
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
    async (filters: RecordsFilter, format: "csv" | "txt" | "xlsx") => {
      if (!analysisResult) return;

      try {
        const response = await fetch("/api/export/records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysisId: analysisResult.id,
            filters,
            format,
          }),
        });

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");

        a.href = url;
        a.download = `registros_filtrados.${format}`;
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

  const rankedBases = useMemo(() => {
    if (!analysisResult?.baseInsights) return [];

    return [...analysisResult.baseInsights].sort(
      (a: BaseInsight, b: BaseInsight) => b.scoreCalidad - a.scoreCalidad
    );
  }, [analysisResult]);

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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      <main className="mx-auto w-full max-w-[1320px] px-5 py-6" data-export-root>
        <section className="mb-8">
          <FileUpload
            onFilesSelected={handleFilesSelected}
            isUploading={uploadMutation.isPending}
            uploadError={uploadError}
          />
        </section>

        <section className="mb-8">
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
                        Registros
                      </p>
                      <p className="mt-1 text-lg font-bold text-foreground">
                        {localHistoryStats.totalRecords.toLocaleString("es-AR")}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        ANIs únicos
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

        <section className="mb-8">
          <Card className="glass-card overflow-hidden border-border/70 bg-background/70">
            <CardContent className="p-4">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      Últimos tickets guardados
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Archivos importados al historial local para reutilizar sin volver a cargarlos.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={analyzeAllHistoryMutation.isPending || localHistoryFiles.length === 0}
                      onClick={() => analyzeAllHistoryMutation.mutate()}>
                      <PlayCircle className="h-4 w-4" />
                      {analyzeAllHistoryMutation.isPending
                        ? "Analizando historial..."
                        : "Analizar historial completo"}
                    </button>

                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={deleteAllHistoryMutation.isPending || localHistoryFiles.length === 0}
                      onClick={() => deleteAllHistoryMutation.mutate()}>
                      <Trash2 className="h-4 w-4" />
                      {deleteAllHistoryMutation.isPending
                        ? "Eliminando..."
                        : "Eliminar historial"}
                    </button>

                    <Badge variant="outline" className="w-fit">
                      {localHistoryFiles.length.toLocaleString("es-AR")} visibles
                    </Badge>
                  </div>
                </div>

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
                    <div className="col-span-2 text-right">Registros</div>
                    <div className="col-span-3 text-right">Cargado</div>
                    <div className="col-span-1 text-right">Acción</div>
                  </div>

                  <div className="divide-y divide-border/60">
                    {localHistoryFiles.map((file) => (
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
                            disabled={analyzeHistoryFileMutation.isPending}
                            onClick={() => analyzeHistoryFileMutation.mutate(file.id)}
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
        </section>

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
          <Tabs defaultValue="resumen" className="space-y-6">
            <div className="sticky top-[65px] z-40 -mx-1 rounded-2xl bg-background/80 px-1 py-2 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65">
              <TabsList className="grid h-auto w-full grid-cols-3 gap-1 p-1 lg:grid-cols-8">
                <TabsTrigger value="resumen" className="flex items-center gap-2 py-2">
                  <BarChart3 className="h-4 w-4" />
                  <span className="hidden sm:inline">Resumen ejecutivo</span>
                </TabsTrigger>

                <TabsTrigger value="graficos" className="flex items-center gap-2 py-2">
                  <PieChart className="h-4 w-4" />
                  <span className="hidden sm:inline">Gráficos</span>
                </TabsTrigger>

                <TabsTrigger value="turnos" className="flex items-center gap-2 py-2">
                  <TrendingUp className="h-4 w-4" />
                  <span className="hidden sm:inline">Turnos y prefijos</span>
                </TabsTrigger>

                <TabsTrigger value="prefijos-hora" className="flex items-center gap-2 py-2">
                  <Clock className="h-4 w-4" />
                  <span className="hidden sm:inline">Prefijos por hora</span>
                </TabsTrigger>

                <TabsTrigger value="depuracion" className="flex items-center gap-2 py-2">
                  <Trash2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Motor de depuración</span>
                </TabsTrigger>

                <TabsTrigger value="filtros" className="flex items-center gap-2 py-2">
                  <Filter className="h-4 w-4" />
                  <span className="hidden sm:inline">Filtro detallado</span>
                </TabsTrigger>

                <TabsTrigger value="simulador" className="flex items-center gap-2 py-2">
                  <Settings className="h-4 w-4" />
                  <span className="hidden sm:inline">Simulador</span>
                </TabsTrigger>
                
                <TabsTrigger value="catalogo" className="flex items-center gap-2 py-2">
                  <BookOpen className="h-4 w-4" />
                  <span className="hidden sm:inline">Catálogo de prefijos</span>
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

              {rankedBases.length > 0 && (
                <Card className="glass-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-display font-bold">
                      Ranking de calidad de bases
                      <InfoTooltip
                        side="right"
                        text="Ordena las bases según su calidad operativa. El ranking considera contacto efectivo, volumen de ANIs, buzón, inválidos, intentos promedio y confiabilidad de la muestra. Sirve para decidir qué base priorizar, revisar o descartar."
                      />
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {rankedBases.slice(0, 5).map((base: BaseInsight) => (
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
              <FiltrosTab data={analysisResult} onExportFiltrado={handleExportRecords} />
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
          <Card className="glass-card">
            <CardContent className="flex min-h-[280px] flex-col items-center justify-center p-10 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <BarChart3 className="h-7 w-7 text-muted-foreground" />
              </div>

              <h3 className="text-3xl font-bold text-foreground">Sin datos para mostrar</h3>

              <p className="mt-3 max-w-[540px] text-base leading-relaxed text-muted-foreground">
                Subí al menos un archivo de Neotel (CSV, TXT, XLS o XLSX) para habilitar las pestañas de análisis.
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}