import { useState, useCallback } from "react";
import { Header } from "@/components/header";
import { FileUpload } from "@/components/file-upload";
import { KPICard } from "@/components/kpi-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EstadoDistribucionChart,
  TagDistribucionChart,
  CurvaContactacionChart,
  IntentosDistribucionChart,
} from "@/components/dashboard/dashboard-charts";
import { TurnosPrefijosTab } from "@/components/dashboard/turnos-prefijos";
import { DepuracionTab } from "@/components/dashboard/depuracion-tab";
import { FiltrosTab } from "@/components/dashboard/filtros-tab";
import { CatalogoPrefijosTab } from "@/components/dashboard/catalogo-prefijos";
import { SimuladorCortesTab } from "@/components/dashboard/simulador-cortes";
import { PrefijosPorHoraTab } from "@/components/dashboard/prefijos-por-hora-tab";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { AnalysisResult, RecordsFilter } from "@shared/schema";
import {
  BarChart3,
  Clock,
  TrendingUp,
  Trash2,
  Filter,
  BookOpen,
  Settings,
  Upload,
  Users,
  Phone,
  Target,
  PhoneOff,
} from "lucide-react";

export default function Home() {
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const { toast } = useToast();

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
        const error = await response.json();
        throw new Error(error.message || "Error al procesar los archivos");
      }
      return response.json() as Promise<AnalysisResult>;
    },
    onSuccess: (data) => {
      setAnalysisResult(data);
      toast({
        title: "Análisis completado",
        description: `Se procesaron ${data.totalRecords.toLocaleString("es-AR")} registros de ${data.totalAnis.toLocaleString("es-AR")} ANIs únicos.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error al procesar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFilesSelected = useCallback(
    (files: File[]) => {
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
    } catch (error) {
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
      } catch (error) {
        toast({
          title: "Error al exportar",
          description: "No se pudo generar el archivo",
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
          body: JSON.stringify({ analysisId: analysisResult.id, filters, format }),
        });
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `registros_filtrados.${format}`;
        a.click();
        window.URL.revokeObjectURL(url);
      } catch (error) {
        toast({
          title: "Error al exportar",
          description: "No se pudo generar el archivo",
          variant: "destructive",
        });
      }
    },
    [analysisResult, toast]
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />

          <main className="mx-auto w-full max-w-[1320px] px-5 py-6">        
          <section className="mb-8">
          <FileUpload
            onFilesSelected={handleFilesSelected}
            isUploading={uploadMutation.isPending}
          />
        </section>

        {uploadMutation.isPending && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {[...Array(5)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-8 w-20" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card>
              <CardContent className="p-8">
                <div className="flex flex-col items-center justify-center gap-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
                  <p className="text-muted-foreground">
                    Procesando archivos... esto puede tomar unos segundos.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {analysisResult && !uploadMutation.isPending && (
          <Tabs defaultValue="dashboard" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3 lg:grid-cols-7 h-auto gap-1 p-1">
              <TabsTrigger
                value="dashboard"
                className="flex items-center gap-2 py-2"
                data-testid="tab-dashboard"
              >
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Tablero visual</span>
              </TabsTrigger>
              <TabsTrigger
                value="turnos"
                className="flex items-center gap-2 py-2"
                data-testid="tab-turnos"
              >
                <TrendingUp className="h-4 w-4" />
                <span className="hidden sm:inline">Turnos y prefijos</span>
              </TabsTrigger>
              <TabsTrigger
                value="prefijos-hora"
                className="flex items-center gap-2 py-2"
                data-testid="tab-prefijos-hora"
              >
                <Clock className="h-4 w-4" />
                <span className="hidden sm:inline">Prefijos por hora</span>
              </TabsTrigger>
              <TabsTrigger
                value="depuracion"
                className="flex items-center gap-2 py-2"
                data-testid="tab-depuracion"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Depuración sugerida</span>
              </TabsTrigger>
              <TabsTrigger
                value="filtros"
                className="flex items-center gap-2 py-2"
                data-testid="tab-filtros"
              >
                <Filter className="h-4 w-4" />
                <span className="hidden sm:inline">Filtro detallado</span>
              </TabsTrigger>
              <TabsTrigger
                value="catalogo"
                className="flex items-center gap-2 py-2"
                data-testid="tab-catalogo"
              >
                <BookOpen className="h-4 w-4" />
                <span className="hidden sm:inline">Catálogo de prefijos</span>
              </TabsTrigger>
              <TabsTrigger
                value="simulador"
                className="flex items-center gap-2 py-2"
                data-testid="tab-simulador"
              >
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Simulador de cortes</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="space-y-6">
              <div className="pt-1 text-center">
                <h2 className="text-[1.7rem] font-semibold tracking-tight text-cyan-400">                  
                  Tablero visual de calidad de base
                </h2>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
              <KPICard
                title="ANIs totales"
                value={analysisResult.totalAnis}
                icon={Users}
                testId="kpi-anis-totales"
              />
              <KPICard
                title="ANIs contactados"
                value={analysisResult.anisContactados}
                icon={Phone}
                trend={{
                  value: (analysisResult.anisContactados / analysisResult.totalAnis) * 100,
                }}
                testId="kpi-anis-contactados"
              />
              <KPICard
                title="ANIs a depurar"
                value={analysisResult.anisADepurar}
                icon={Target}
                trend={{
                  value: (analysisResult.anisADepurar / analysisResult.totalAnis) * 100,
                }}
                testId="kpi-anis-depurar"
              />
              <KPICard
                title="% Answer"
                value={`${analysisResult.pctAnswer.toFixed(1)}%`}
                icon={Phone}
                testId="kpi-pct-answer"
              />
              <KPICard
                title="% No Answer"
                value={`${analysisResult.pctNoAnswer.toFixed(1)}%`}
                icon={PhoneOff}
                testId="kpi-pct-noanswer"
              />
            </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <EstadoDistribucionChart data={analysisResult} />
                <TagDistribucionChart data={analysisResult} />
              </div>

              <CurvaContactacionChart data={analysisResult} />
              <IntentosDistribucionChart data={analysisResult} />
            </TabsContent>

            <TabsContent value="turnos">
              <TurnosPrefijosTab data={analysisResult} />
            </TabsContent>

                        <TabsContent value="prefijos-hora">
              <PrefijosPorHoraTab data={analysisResult} />
            </TabsContent>
            <TabsContent value="depuracion">
              <DepuracionTab
                data={analysisResult}
                onExportResumen={handleExportResumen}
                onExportFiltrado={handleExportFiltrado}
              />
            </TabsContent>

            <TabsContent value="filtros">
              <FiltrosTab
                data={analysisResult}
                onExportFiltrado={handleExportRecords}
              />
            </TabsContent>

            <TabsContent value="catalogo">
              <CatalogoPrefijosTab prefijos={[]} />
            </TabsContent>

            <TabsContent value="simulador">
              <SimuladorCortesTab data={analysisResult} />
            </TabsContent>
          </Tabs>
        )}

        {!analysisResult && !uploadMutation.isPending && (
          <Card>
            <CardContent className="flex min-h-[280px] flex-col items-center justify-center p-10 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
                <BarChart3 className="h-7 w-7 text-slate-500" />
              </div>

              <h3 className="text-3xl font-semibold text-white">
                Sin datos para mostrar
              </h3>

              <p className="mt-3 max-w-[540px] text-base leading-relaxed text-slate-400">
                Subí al menos un archivo de Neotel (CSV, TXT, XLS o XLSX) para habilitar las pestañas de análisis.
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}