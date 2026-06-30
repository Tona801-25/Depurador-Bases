import { useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
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
import { useToast } from "@/hooks/use-toast";

type FuzzionCategory =
  | "TODOS"
  | "NUNCA_TRABAJADO"
  | "CONTACTADO"
  | "BUZON_SIN_CONTACTO"
  | "NO_SATURADO"
  | "REINTENTAR_MEJOR_FRANJA"
  | "DESCARTAR";

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
};

type FuzzionPreview = {
  id: string;
  fileName: string;
  totalRows: number;
  validRows: number;
  uniqueAnis: number;
  stats: {
    nuncaTrabajados: number;
    contactados: number;
    buzonesSinContacto: number;
    noSaturados: number;
    reintentarMejorFranja: number;
    descartar: number;
  };
  preview: FuzzionLeadPreview[];
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

export function FuzzionTab({ onLog }: FuzzionTabProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [data, setData] = useState<FuzzionPreview | null>(null);
  const [selectedCategory, setSelectedCategory] =
    useState<FuzzionCategory>("TODOS");
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const visiblePreview = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();

    return data.preview.filter((lead) => {
      if (
        selectedCategory !== "TODOS" &&
        !lead.categorias.includes(selectedCategory)
      ) {
        return false;
      }

      if (!query) return true;

      return [
        lead.linea,
        lead.razonSocial,
        lead.documento,
        lead.mercadoActual,
        lead.planActual,
        ...lead.bases,
      ].some((value) => String(value).toLowerCase().includes(query));
    });
  }, [data, search, selectedCategory]);

  const selectedCount = useMemo(() => {
    if (!data) return 0;
    if (selectedCategory === "TODOS") return data.validRows;

    const option = categoryOptions.find(
      (item) => item.value === selectedCategory,
    );
    return option?.stat ? data.stats[option.stat] : 0;
  }, [data, selectedCategory]);

  async function handleFile(file?: File) {
    if (!file) return;

    setUploading(true);
    setData(null);
    setSelectedCategory("TODOS");

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
        detail: `${payload.fileName} · ${payload.uniqueAnis.toLocaleString("es-AR")} ANIs únicos`,
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
    if (!data || selectedCount === 0) return;

    setExporting(true);
    try {
      const response = await fetch(`/api/fuzzion/${data.id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: selectedCategory,
          search,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || "No se pudo generar el lote");
      }

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
        detail: categoryOptions.find((item) => item.value === selectedCategory)
          ?.label || selectedCategory,
        count: selectedCount,
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

  return (
    <Card className="glass-card border-glass-border">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
              Modo operativo
            </p>
            <CardTitle className="mt-1 flex items-center gap-2 text-base">
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
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-[11px] uppercase text-muted-foreground">Nunca trabajados</p>
            <p className="mt-1 text-xl font-bold">
              {(data?.stats.nuncaTrabajados ?? 0).toLocaleString("es-AR")}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-[11px] uppercase text-muted-foreground">
              Con contacto efectivo
            </p>
            <p className="mt-1 text-xl font-bold text-success">
              {(data?.stats.contactados ?? 0).toLocaleString("es-AR")}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-[11px] uppercase text-muted-foreground">
              Con buzón y sin contacto
            </p>
            <p className="mt-1 text-xl font-bold text-warning">
              {(data?.stats.buzonesSinContacto ?? 0).toLocaleString("es-AR")}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-[11px] uppercase text-muted-foreground">
              Aptos para reintento
            </p>
            <p className="mt-1 text-xl font-bold text-primary">
              {(data?.stats.reintentarMejorFranja ?? 0).toLocaleString("es-AR")}
            </p>
          </div>
          <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3">
            <p className="text-[11px] uppercase text-muted-foreground">
              Con señal de descarte
            </p>
            <p className="mt-1 text-xl font-bold text-destructive">
              {(data?.stats.descartar ?? 0).toLocaleString("es-AR")}
            </p>
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
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
              <div className="flex flex-wrap gap-2">
                {categoryOptions.map((option) => {
                  const count =
                    option.value === "TODOS"
                      ? data.validRows
                      : option.stat
                        ? data.stats[option.stat]
                        : 0;

                  return (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      variant={
                        selectedCategory === option.value ? "default" : "outline"
                      }
                      title={option.description}
                      onClick={() => setSelectedCategory(option.value)}
                    >
                      {option.label} ({count.toLocaleString("es-AR")})
                    </Button>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="pl-9"
                    placeholder="Buscar línea, nombre, DNI, compañía o base..."
                  />
                </div>
                <Button
                  type="button"
                  onClick={handleExport}
                  disabled={exporting || selectedCount === 0}
                >
                  <Download className="mr-2 h-4 w-4" />
                  {exporting
                    ? "Generando..."
                    : `Descargar Neotel (${selectedCount.toLocaleString("es-AR")})`}
                </Button>
              </div>
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
                {visiblePreview.slice(0, 100).map((lead) => (
                  <div
                    key={`${lead.rowNumber}-${lead.linea}`}
                    className="grid grid-cols-[minmax(110px,1fr)_minmax(150px,1.5fr)_100px_110px_130px] gap-3 px-3 py-2 text-xs"
                  >
                    <span className="font-mono text-foreground">{lead.linea}</span>
                    <span className="truncate">{lead.razonSocial || "-"}</span>
                    <span>{lead.intentosTotales}</span>
                    <span className="truncate">{lead.ultimoEstado || "Sin historial"}</span>
                    <div>
                      {lead.categorias.includes("DESCARTAR") ? (
                        <Badge variant="destructive">
                          <XCircle className="mr-1 h-3 w-3" />
                          Descartar
                        </Badge>
                      ) : lead.categorias.includes("CONTACTADO") ? (
                        <Badge variant="outline" className="text-success">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Contacto efectivo
                        </Badge>
                      ) : lead.categorias.includes("BUZON_SIN_CONTACTO") ? (
                        <Badge variant="outline" className="text-warning">
                          <PhoneOff className="mr-1 h-3 w-3" />
                          Buzón sin contacto
                        </Badge>
                      ) : lead.categorias.includes("NUNCA_TRABAJADO") ? (
                        <Badge variant="outline">Nunca trabajado</Badge>
                      ) : lead.categorias.includes("REINTENTAR_MEJOR_FRANJA") ? (
                        <Badge variant="outline" className="text-primary">
                          <PhoneCall className="mr-1 h-3 w-3" />
                          Apto para reintento
                        </Badge>
                      ) : (
                        <Badge variant="outline">Con historial</Badge>
                      )}
                    </div>
                  </div>
                ))}
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
            Contacto efectivo = al menos 1 ANSWER + AGENT. Saturación = 9
            intentos totales, 6 NOANSWER o 5 buzones. Descarte = 3 UNALLOCATED o
            3 REJECTED sin contacto efectivo.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
