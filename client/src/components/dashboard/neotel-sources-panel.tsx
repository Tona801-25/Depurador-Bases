import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  Database,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Search,
  Tags,
  Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type NeotelSourceStats = {
  totalImports: number;
  gestionImports: number;
  productivityImports: number;
  latestGestionDate: string | null;
  latestProductivityDate: string | null;
  totalGestiones: number;
  totalGestionAnis: number;
  excludedAnis: number;
  mailboxAnis: number;
  productivityRows: number;
  totalAgents: number;
};

type NeotelReportDate = {
  reportDate: string;
  totalGestiones: number;
  totalAnis: number;
  excludedAnis: number;
  mailboxAnis: number;
  totalAgents: number;
};
type NeotelSourceStatus = {
  ftp: {
    configured: boolean;
    host: string;
    port: number;
    user: string;
    remotePath: string;
    secure: boolean;
    autoSync: {
      enabled: boolean;
      intervalMinutes: number;
      running: boolean;
      lastAttemptAt: string;
      lastSuccessAt: string;
      lastError: string;
    };
  };
  localReportsDir?: string;
  stats: NeotelSourceStats;
};

type CatalogItem = {
  resultado: string;
  subresultado: string;
  accionComercial: "EXCLUIR" | "BUZON" | "PRIORIZAR" | "REVISAR";
  motivoAccion: string;
  totalGestiones: number;
  totalAnis: number;
  ultimaGestion: string;
};

type NeotelSourcesPanelProps = {
  onLog?: (entry: {
    kind: "filter" | "export" | "error";
    title: string;
    detail: string;
    count?: number;
  }) => void;
  onLocalImportComplete?: () => void;
  sidebar?: boolean;
};

function actionLabel(action: CatalogItem["accionComercial"]) {
  if (action === "EXCLUIR") return "Excluir";
  if (action === "BUZON") return "Buzón";
  if (action === "PRIORIZAR") return "Priorizar";
  return "Revisar";
}

function actionClass(action: CatalogItem["accionComercial"]) {
  if (action === "EXCLUIR") return "border-destructive/30 text-destructive";
  if (action === "BUZON") return "border-warning/30 text-warning";
  if (action === "PRIORIZAR") return "border-success/30 text-success";
  return "border-border text-muted-foreground";
}

function downloadName(header: string | null) {
  return header?.match(/filename="?([^";]+)"?/i)?.[1] || "catalogacion_neotel.xls";
}

function formatSyncDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NeotelSourcesPanel({
  onLog,
  onLocalImportComplete,
  sidebar = false,
}: NeotelSourcesPanelProps) {
  const reportInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [status, setStatus] = useState<NeotelSourceStatus | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [reportDates, setReportDates] = useState<NeotelReportDate[]>([]);
  const [datesOpen, setDatesOpen] = useState(false);
  const [selectedReportDate, setSelectedReportDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [importingLocal, setImportingLocal] = useState(false);
  const [localImportProgress, setLocalImportProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("TODAS");
  const [exportingKey, setExportingKey] = useState("");

  async function refresh() {
    const dateQuery = selectedReportDate
      ? `?reportDate=${encodeURIComponent(selectedReportDate)}`
      : "";
    const [statusResponse, catalogResponse, datesResponse] = await Promise.all([
      fetch("/api/neotel-sync/status"),
      fetch(`/api/neotel-reports/catalog${dateQuery}`),
      fetch("/api/neotel-reports/dates"),
    ]);

    if (!statusResponse.ok || !catalogResponse.ok || !datesResponse.ok) {
      throw new Error("No se pudo leer el estado de las fuentes Neotel.");
    }

    setStatus(await statusResponse.json());
    setCatalog(await catalogResponse.json());
    setReportDates(await datesResponse.json());
  }

  async function handleReportDateChange(reportDate: string) {
    setSelectedReportDate(reportDate);
    const query = reportDate ? `?reportDate=${encodeURIComponent(reportDate)}` : "";
    const response = await fetch(`/api/neotel-reports/catalog${query}`);
    if (!response.ok) {
      throw new Error("No se pudieron leer las catalogaciones de esa fecha.");
    }
    setCatalog(await response.json());
    setCatalogOpen(true);
    onLog?.({
      kind: "filter",
      title: reportDate ? "Fecha FTP seleccionada" : "Historial FTP completo",
      detail: reportDate || "Todas las fechas sincronizadas",
    });
  }

  useEffect(() => {
    refresh()
      .catch((error) => {
        onLog?.({
          kind: "error",
          title: "Conexión Neotel no disponible",
          detail: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      refresh().catch((error) => {
        onLog?.({
          kind: "error",
          title: "Conexion Neotel no disponible",
          detail: error instanceof Error ? error.message : String(error),
        });
      });
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [selectedReportDate]);

  const visibleCatalog = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    return catalog.filter((item) => {
      if (actionFilter !== "TODAS" && item.accionComercial !== actionFilter) {
        return false;
      }
      if (!query) return true;
      return [item.resultado, item.subresultado, item.motivoAccion]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [actionFilter, catalog, catalogSearch]);

  async function handleSync() {
    setSyncing(true);
    try {
      const response = await fetch("/api/neotel-sync/run", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || payload.message);

      await refresh();
      onLog?.({
        kind: "filter",
        title: "FTP Neotel sincronizado",
        detail: `${payload.imported} nuevos · ${payload.duplicates} duplicados · ${payload.errors} errores`,
        count: payload.imported,
      });
      toast({
        title: "Sincronización terminada",
        description: `${payload.imported} reportes nuevos guardados en SQLite.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onLog?.({ kind: "error", title: "Falló la sincronización FTP", detail: message });
      toast({ title: "No se pudo sincronizar", description: message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }

  async function handleLocalImport() {
    setImportingLocal(true);
    try {
      const response = await fetch("/api/neotel-reports/import-local", {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || payload.message);

      await refresh();
      onLocalImportComplete?.();

      const ticketText =
        payload.ticketFiles > 0
          ? ` · ${payload.ticketFiles} tickets revisados`
          : "";

      onLog?.({
        kind: "filter",
        title: "Reportes locales importados",
        detail: `${payload.imported} nuevos · ${payload.duplicates} duplicados · ${payload.errors} errores${ticketText}`,
        count: payload.imported,
      });
      toast({
        title: "Carpeta local procesada",
        description: `${payload.imported} archivos nuevos, ${payload.duplicates} duplicados y ${payload.errors} errores.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onLog?.({ kind: "error", title: "Fallo la importacion local", detail: message });
      toast({ title: "No se pudo importar la carpeta", description: message, variant: "destructive" });
    } finally {
      setImportingLocal(false);
    }
  }

  async function handleReportUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);

    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("files", file));
      const response = await fetch("/api/neotel-reports/upload", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "No se pudieron importar los reportes.");

      await refresh();
      onLog?.({
        kind: "filter",
        title: "Reportes Neotel importados",
        detail: `${payload.imported} nuevos · ${payload.duplicates} duplicados`,
        count: payload.imported,
      });
      toast({
        title: "Reportes guardados",
        description: `${payload.imported} nuevos y ${payload.duplicates} duplicados.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onLog?.({ kind: "error", title: "Falló la importación de reportes", detail: message });
      toast({ title: "Error al importar", description: message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (reportInputRef.current) reportInputRef.current.value = "";
    }
  }

  async function handleLocalFolderImport() {
    setImportingLocal(true);

    try {
      const scanResponse = await fetch("/api/neotel-reports/local-files");
      const scanPayload = await scanResponse.json();
      if (!scanResponse.ok) {
        throw new Error(scanPayload.detail || scanPayload.message);
      }

      const files = Array.isArray(scanPayload.files) ? scanPayload.files : [];
      if (files.length === 0) {
        throw new Error("No se encontraron archivos compatibles en la carpeta.");
      }

      let imported = 0;
      let duplicates = 0;
      let errors = 0;
      setLocalImportProgress({ current: 0, total: files.length });

      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        setLocalImportProgress({ current: index + 1, total: files.length });

        try {
          const response = await fetch("/api/neotel-reports/import-local-file", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ relativePath: file.relativePath }),
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.detail || payload.message);

          if (payload.result?.status === "IMPORTADO") imported++;
          else if (payload.result?.status === "DUPLICADO") duplicates++;
          else errors++;
        } catch {
          errors++;
        }
      }

      await refresh();
      onLocalImportComplete?.();

      onLog?.({
        kind: "filter",
        title: "Carpeta local procesada",
        detail: `${imported} nuevos · ${duplicates} duplicados · ${errors} errores · ${scanPayload.ticketFiles} tickets revisados`,
        count: imported,
      });
      toast({
        title: "Carpeta local procesada",
        description: `${imported} archivos nuevos, ${duplicates} duplicados y ${errors} errores.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onLog?.({
        kind: "error",
        title: "Fallo la importacion local",
        detail: message,
      });
      toast({
        title: "No se pudo importar la carpeta",
        description: message,
        variant: "destructive",
      });
    } finally {
      setImportingLocal(false);
      setLocalImportProgress(null);
    }
  }

  async function exportCatalog(item: CatalogItem) {
    const key = `${item.resultado}|${item.subresultado}`;
    setExportingKey(key);
    try {
      const response = await fetch("/api/neotel-reports/catalog/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resultado: item.resultado,
          subresultado: item.subresultado,
          reportDate: selectedReportDate || undefined,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || "No se pudo generar el lote.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = downloadName(response.headers.get("Content-Disposition"));
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      onLog?.({
        kind: "export",
        title: "Catalogación exportada",
        detail: `${item.resultado} · ${item.subresultado}`,
        count: item.totalAnis,
      });
    } catch (error) {
      toast({
        title: "Error al exportar",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setExportingKey("");
    }
  }

  const stats = status?.stats;
  const selectedDateSummary = reportDates.find(
    (item) => item.reportDate === selectedReportDate,
  );
  const displayedStats = selectedDateSummary
    ? {
        totalGestiones: selectedDateSummary.totalGestiones,
        totalGestionAnis: selectedDateSummary.totalAnis,
        excludedAnis: selectedDateSummary.excludedAnis,
        mailboxAnis: selectedDateSummary.mailboxAnis,
        totalAgents: selectedDateSummary.totalAgents,
      }
    : stats;
  const syncStatus = status?.ftp.autoSync;
  const syncState = !status?.ftp.configured
    ? "pending"
    : syncStatus?.running || syncing
      ? "running"
      : syncStatus?.lastError
        ? "error"
        : syncStatus?.lastSuccessAt
          ? "synced"
          : "pending";
  const syncStateText =
    syncState === "running"
      ? "Sincronizando ahora"
      : syncState === "synced"
        ? "Sincronizado"
        : syncState === "error"
          ? "Revisar sincronizacion"
          : "Pendiente de sincronizar";
  const syncStateClass =
    syncState === "running"
      ? "border-primary/30 text-primary"
      : syncState === "synced"
        ? "border-success/30 text-success"
        : syncState === "error"
          ? "border-destructive/40 text-destructive"
          : "border-warning/30 text-warning";
  const syncDetail = syncStatus?.running || syncing
    ? "Leyendo reportes nuevos del FTP."
    : syncStatus?.lastError
      ? `Ultimo error: ${syncStatus.lastError}`
      : syncStatus?.lastSuccessAt
        ? `Ultima sincronizacion correcta: ${formatSyncDate(syncStatus.lastSuccessAt)}`
        : syncStatus?.lastAttemptAt
          ? `Ultimo intento: ${formatSyncDate(syncStatus.lastAttemptAt)}`
          : "Todavia no se registro una sincronizacion.";

  return (
    <Card className={cn(sidebar ? "h-full rounded-none border-0 bg-transparent shadow-none" : "glass-card border-primary/15 bg-background/70")}>
      <CardContent className={sidebar ? "p-3" : "p-4"}>
        <div className={cn("flex gap-4", sidebar ? "flex-col" : "flex-col lg:flex-row lg:items-start lg:justify-between")}>
          <div className="flex min-w-0 items-start gap-3">
            <div className="rounded-lg border border-primary/20 bg-primary/10 p-2.5 text-primary">
              <Database className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold uppercase text-foreground">Conexión Neotel</h2>
                <Badge
                  variant="outline"
                  className={
                    status?.ftp.configured
                      ? "border-success/30 text-success"
                      : "border-warning/30 text-warning"
                  }
                >
                  {status?.ftp.configured ? "FTP disponible" : "FTP sin configurar"}
                </Badge>
                {status?.ftp.autoSync.enabled ? (
                  <Badge variant="outline" className="border-primary/30 text-primary">
                    {status.ftp.autoSync.running
                      ? "Sincronizando"
                      : `Automático · ${status.ftp.autoSync.intervalMinutes} min`}
                  </Badge>
                ) : null}
                {status ? (
                  <Badge variant="outline" className={syncStateClass}>
                    {syncStateText}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {status
                  ? `${status.ftp.user}@${status.ftp.host}:${status.ftp.port}${status.ftp.remotePath}`
                  : "Leyendo configuración..."}
              </p>
              {status ? (
                <p
                  className={cn(
                    "mt-1 text-xs",
                    syncState === "error" ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {syncDetail}
                </p>
              ) : null}
            </div>
          </div>

          <div className={cn("gap-2", sidebar ? "grid grid-cols-1 sm:grid-cols-2" : "flex flex-wrap")}>
            <input
              ref={reportInputRef}
              type="file"
              multiple
              accept=".csv"
              className="hidden"
              onChange={(event) => handleReportUpload(event.target.files)}
            />
            <Button
              type="button"
              size="sm"
              disabled={!status?.ftp.configured || syncing}
              onClick={handleSync}
              title="Leer todos los reportes nuevos del FTP"
              className={sidebar ? "min-w-0 w-full" : undefined}
            >
              {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Sincronizar FTP
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => reportInputRef.current?.click()}
            >
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Importar archivo
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={importingLocal}
              onClick={handleLocalFolderImport}
              title={status?.localReportsDir || "Carpeta local de respaldo"}
              className={sidebar ? "w-full sm:col-span-2" : undefined}
            >
              {importingLocal ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
              {localImportProgress
                ? "Respaldo " + localImportProgress.current + "/" + localImportProgress.total
                : "Carpeta de respaldo"}
            </Button>
          </div>
        </div>

        <p className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
          La sincronizacion recorre todos los reportes compatibles del FTP y guarda en SQLite
          solamente los archivos nuevos. Los duplicados no se vuelven a cargar.
        </p>
        <div className={cn("mt-4 grid grid-cols-2 gap-3 border-t border-border/60 pt-4", !sidebar && "md:grid-cols-5")}>
          {[
            ["Gestiones", displayedStats?.totalGestiones ?? 0],
            ["Líneas únicas (ANIs)", displayedStats?.totalGestionAnis ?? 0],
            ["Excluir", displayedStats?.excludedAnis ?? 0],
            ["Buzones", displayedStats?.mailboxAnis ?? 0],
            ["Asesores", displayedStats?.totalAgents ?? 0],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {Number(value).toLocaleString("es-AR")}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-border/60 pt-3">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left"
            onClick={() => setDatesOpen((current) => !current)}
            aria-expanded={datesOpen}
          >
            <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
              <CalendarDays className="h-4 w-4 text-primary" />
              Fechas sincronizadas
              <Badge variant="outline">{reportDates.length}</Badge>
              {selectedReportDate ? (
                <Badge className="border-primary/25 bg-primary/10 text-primary">
                  {new Date(`${selectedReportDate}T12:00:00`).toLocaleDateString("es-AR")}
                </Badge>
              ) : null}
            </span>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", datesOpen && "rotate-180")} />
          </button>

          {datesOpen ? (
            <div className="mt-3 space-y-3">
              <select
                value={selectedReportDate}
                onChange={(event) => {
                  void handleReportDateChange(event.target.value).catch((error) => {
                    toast({
                      title: "No se pudo aplicar la fecha",
                      description: error instanceof Error ? error.message : String(error),
                      variant: "destructive",
                    });
                  });
                }}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="">Todas las fechas sincronizadas</option>
                {reportDates.map((item) => (
                  <option key={item.reportDate} value={item.reportDate}>
                    {new Date(`${item.reportDate}T12:00:00`).toLocaleDateString("es-AR")} · {item.totalGestiones.toLocaleString("es-AR")} gestiones · {item.totalAnis.toLocaleString("es-AR")} ANIs
                  </option>
                ))}
              </select>

              {selectedDateSummary ? (
                <div className={cn("grid grid-cols-2 gap-x-4 gap-y-2 text-xs", !sidebar && "sm:grid-cols-5")}>
                  <span><strong>{selectedDateSummary.totalGestiones.toLocaleString("es-AR")}</strong> gestiones</span>
                  <span><strong>{selectedDateSummary.totalAnis.toLocaleString("es-AR")}</strong> ANIs</span>
                  <span><strong>{selectedDateSummary.mailboxAnis.toLocaleString("es-AR")}</strong> buzones</span>
                  <span><strong>{selectedDateSummary.excludedAnis.toLocaleString("es-AR")}</strong> para excluir</span>
                  <span><strong>{selectedDateSummary.totalAgents.toLocaleString("es-AR")}</strong> asesores</span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Seleccioná un día para ver y descargar únicamente sus catalogaciones.
                </p>
              )}

              <p className="text-xs text-muted-foreground">
                La fecha elegida también filtra las catalogaciones de asesores y cada lote Neotel descargado.
              </p>
            </div>
          ) : null}
        </div>
        <div className="mt-4 border-t border-border/60 pt-3">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left"
            onClick={() => setCatalogOpen((current) => !current)}
            aria-expanded={catalogOpen}
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Tags className="h-4 w-4 text-primary" />
              Catalogaciones de asesores
              <Badge variant="outline">{catalog.length}</Badge>
              {selectedReportDate ? (
                <span className="text-xs font-normal text-primary">
                  Solo {new Date(`${selectedReportDate}T12:00:00`).toLocaleDateString("es-AR")}
                </span>
              ) : null}
            </span>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", catalogOpen && "rotate-180")} />
          </button>

          {catalogOpen ? (
            <div className="mt-3 space-y-3">
              <div className={cn("grid gap-2", !sidebar && "sm:grid-cols-[1fr_180px]")}>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={catalogSearch}
                    onChange={(event) => setCatalogSearch(event.target.value)}
                    placeholder="Buscar resultado o subresultado..."
                    className="pl-9"
                  />
                </div>
                <select
                  value={actionFilter}
                  onChange={(event) => setActionFilter(event.target.value)}
                  className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
                >
                  <option value="TODAS">Todas las acciones</option>
                  <option value="EXCLUIR">Excluir</option>
                  <option value="BUZON">Buzón</option>
                  <option value="PRIORIZAR">Priorizar</option>
                  <option value="REVISAR">Revisar</option>
                </select>
              </div>

              <div className="max-h-72 overflow-auto rounded-lg border border-border">
                {visibleCatalog.length === 0 ? (
                  <p className="px-3 py-5 text-sm text-muted-foreground">Todavía no hay catalogaciones importadas.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {visibleCatalog.map((item) => {
                      const key = `${item.resultado}|${item.subresultado}`;
                      return (
                        <div key={key} className={cn("grid gap-3 px-3 py-2.5 text-xs", !sidebar && "sm:grid-cols-[1fr_auto_auto] sm:items-center")}>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-foreground">
                              {item.resultado || "Sin resultado"} · {item.subresultado || "Sin subresultado"}
                            </p>
                            <p className="mt-0.5 text-muted-foreground">{item.motivoAccion}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={actionClass(item.accionComercial)}>
                              {actionLabel(item.accionComercial)}
                            </Badge>
                            <span className="whitespace-nowrap font-semibold">
                              {item.totalAnis.toLocaleString("es-AR")} ANIs
                            </span>
                          </div>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-8 w-8"
                            title="Descargar lote Neotel"
                            disabled={exportingKey === key}
                            onClick={() => exportCatalog(item)}
                          >
                            {exportingKey === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
