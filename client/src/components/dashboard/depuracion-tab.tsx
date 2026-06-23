import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { KPICard } from "@/components/kpi-card";
import { DataTable, type Column } from "@/components/data-table";
import { TagBadge } from "@/components/tag-badge";
import BeforeAfterComparator from "@/components/dashboard/beforeAfterComparator";
import {
  Download,
  X,
  Target,
  AlertTriangle,
  PauseCircle,
  CheckCircle2,
  Layers3,
  Clock3,
} from "lucide-react";
import type {
  AnalysisResult,
  ANISummary,
  RecomendacionOperativa,
  TagType,
} from "@shared/schema";

interface DepuracionTabProps {
  data: AnalysisResult;
  onExportResumen: () => void;
  onExportFiltrado: (tags: string[]) => void;
  onExportBaseFinal: (filters: {
    tags: string[];
    prioridad?: string;
    accion?: string;
    soloSaturados?: boolean;
    scoreMinimo?: number | null;
    busqueda?: string;
    fileName?: string;
  }) => void;
  onExportNeotel: (filters: {
    aniList?: string[];
    segmento?: "BUZONES_SIN_CONTACTO";
    tags: string[];
    prioridad?: string;
    accion?: string;
    soloSaturados?: boolean;
    scoreMinimo?: number | null;
    busqueda?: string;
    fileName?: string;
  }) => void;
  onExportPorAccion: (accion: string) => void;
}

const allTags: TagType[] = [
  "SEGUIR_INTENTANDO",
  "CONTACTADO",
  "INVALIDO",
  "SOLO_BUZON",
  "NO_ATIENDE",
  "RECHAZA",
];

const descartesTags: TagType[] = ["INVALIDO", "SOLO_BUZON", "NO_ATIENDE", "RECHAZA"];

const prioridadOrder = ["ALTA", "MEDIA", "BAJA"];

function getPrioridadBadgeClass(prioridad?: string) {
  switch (prioridad) {
    case "ALTA":
      return "bg-destructive/10 text-destructive border-destructive/20";
    case "MEDIA":
      return "bg-warning/10 text-warning border-warning/20";
    case "BAJA":
      return "bg-primary/10 text-primary border-primary/20";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function getAccionBadgeClass(accion?: string) {
  switch (accion) {
    case "ELIMINAR":
    case "EXCLUIR":
      return "bg-destructive/10 text-destructive border-destructive/20";
    case "PAUSAR_24H":
    case "NO_REINTENTAR_AUN":
    case "REVISAR_O_PAUSAR":
      return "bg-warning/10 text-warning border-warning/20";
    case "REINTENTAR_EN_MEJOR_FRANJA":
    case "REINTENTAR_CON_CONTROL":
    case "REINTENTAR":
      return "bg-success/10 text-success border-success/20";
    case "CAMBIAR_ESTRATEGIA":
    case "LIMITAR_REINTENTOS":
      return "bg-primary/10 text-primary border-primary/20";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function getScoreBadgeClass(score?: number) {
  if ((score ?? 0) >= 70) return "bg-success/10 text-success border-success/20";
  if ((score ?? 0) >= 45) return "bg-warning/10 text-warning border-warning/20";
  return "bg-destructive/10 text-destructive border-destructive/20";
}

function getRecBadgeClass(prioridad?: string) {
  return getPrioridadBadgeClass(prioridad);
}

export function DepuracionTab({
  data,
  onExportResumen,
  onExportFiltrado,
  onExportBaseFinal,
  onExportNeotel,
  onExportPorAccion,
}: DepuracionTabProps) {

  const [selectedTags, setSelectedTags] = useState<TagType[]>(["SEGUIR_INTENTANDO"]);
  const [selectedPrioridad, setSelectedPrioridad] = useState<string>("TODAS");
  const [selectedAccion, setSelectedAccion] = useState<string>("TODAS");
  const [soloSaturados, setSoloSaturados] = useState(false);
  const [scoreMinimo, setScoreMinimo] = useState<string>("");
  const [busqueda, setBusqueda] = useState("");

  const accionesDisponibles = useMemo(() => {
    const acciones = new Set(
      data.aniSummaries
        .map((item) => item.accionSugerida)
        .filter((value): value is string => Boolean(value))
    );

    return ["TODAS", ...Array.from(acciones).sort()];
  }, [data.aniSummaries]);

  const toggleTag = (tag: TagType) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const clearAdvancedFilters = () => {
    setSelectedPrioridad("TODAS");
    setSelectedAccion("TODAS");
    setSoloSaturados(false);
    setScoreMinimo("");
    setBusqueda("");
  };

  const filteredAnis = useMemo(() => {
    const scoreMin = scoreMinimo.trim() === "" ? null : Number(scoreMinimo);

    return data.aniSummaries
      .filter((ani) => selectedTags.includes(ani.tagTelefono as TagType))
      .filter((ani) =>
        selectedPrioridad === "TODAS"
          ? true
          : (ani.prioridad || "").toUpperCase() === selectedPrioridad
      )
      .filter((ani) =>
        selectedAccion === "TODAS"
          ? true
          : (ani.accionSugerida || "").toUpperCase() === selectedAccion
      )
      .filter((ani) => (soloSaturados ? ani.saturado === true : true))
      .filter((ani) =>
        scoreMin === null ? true : (ani.scoreRecontactabilidad ?? 0) >= scoreMin
      )
      .filter((ani) => {
        if (!busqueda.trim()) return true;
        const q = busqueda.toLowerCase();

        return [
          ani.ani,
          ani.basePrincipal,
          ani.prefijo,
          ani.mejorFranja,
          ani.prioridad,
          ani.accionSugerida,
          ani.motivoDepuracion,
          ani.ultimoEstadoNormalizado,
          ani.ultimoSubestadoNormalizado,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const prioridadA = prioridadOrder.indexOf((a.prioridad || "").toUpperCase());
        const prioridadB = prioridadOrder.indexOf((b.prioridad || "").toUpperCase());
        const pA = prioridadA === -1 ? 999 : prioridadA;
        const pB = prioridadB === -1 ? 999 : prioridadB;

        if (pA !== pB) return pA - pB;
        return (b.scoreRecontactabilidad ?? 0) - (a.scoreRecontactabilidad ?? 0);
      });
  }, [
    data.aniSummaries,
    selectedTags,
    selectedPrioridad,
    selectedAccion,
    soloSaturados,
    scoreMinimo,
    busqueda,
  ]);

  const scorePromedio =
    data.aniSummaries.length > 0
      ? data.aniSummaries.reduce(
          (acc, item) => acc + (item.scoreRecontactabilidad ?? 0),
          0
        ) / data.aniSummaries.length
      : 0;

  const altaPrioridad = data.aniSummaries.filter((a) => a.prioridad === "ALTA").length;
  const saturados = data.aniSummaries.filter((a) => a.saturado === true).length;
  const reintentarMejorFranja = data.aniSummaries.filter(
    (a) => a.accionSugerida === "REINTENTAR_EN_MEJOR_FRANJA"
  ).length;
  const descartables = data.aniSummaries.filter((a) =>
    descartesTags.includes(a.tagTelefono as TagType)
  ).length;
  const buzonesSinContacto = data.aniSummaries.filter(
    (a) => (a.intentosAnsweringMachine || 0) > 0 && (a.intentosAnswerAgent || 0) === 0
  );

  const columns: Column<ANISummary>[] = [
    { key: "ani", header: "ANI", sortable: true },
    { key: "basePrincipal", header: "Base", sortable: true },
    { key: "prefijo", header: "Prefijo", sortable: true },
    {
      key: "tagTelefono",
      header: "Tag",
      sortable: true,
      render: (item) => <TagBadge tag={item.tagTelefono as TagType} />,
    },
    {
      key: "scoreRecontactabilidad",
      header: "Score",
      sortable: true,
      render: (item) => (
        <Badge variant="outline" className={getScoreBadgeClass(item.scoreRecontactabilidad)}>
          {item.scoreRecontactabilidad ?? 0}
        </Badge>
      ),
    },
    {
      key: "prioridad",
      header: "Prioridad",
      sortable: true,
      render: (item) => (
        <Badge variant="outline" className={getPrioridadBadgeClass(item.prioridad)}>
          {item.prioridad || "-"}
        </Badge>
      ),
    },
    {
      key: "accionSugerida",
      header: "Acción",
      sortable: true,
      render: (item) => (
        <Badge variant="outline" className={getAccionBadgeClass(item.accionSugerida)}>
          {item.accionSugerida || "-"}
        </Badge>
      ),
    },
    { key: "mejorFranja", header: "Mejor franja", sortable: true },
    {
      key: "saturado",
      header: "Saturado",
      sortable: true,
      render: (item) => (
        <Badge
          variant="outline"
          className={
            item.saturado
              ? "bg-warning/10 text-warning border-warning/20"
              : "bg-success/10 text-success border-success/20"
          }
        >
          {item.saturado ? "Sí" : "No"}
        </Badge>
      ),
    },
    { key: "intentosTotales", header: "Intentos", sortable: true },
    {
      key: "motivoDepuracion",
      header: "Motivo",
      className: "min-w-[240px]",
    },
  ];

  const recomendacionesColumns: Column<RecomendacionOperativa>[] = [
    { key: "tipo", header: "Tipo", sortable: true },
    { key: "objetivo", header: "Objetivo", sortable: true },
    {
      key: "prioridad",
      header: "Prioridad",
      sortable: true,
      render: (item) => (
        <Badge variant="outline" className={getRecBadgeClass(item.prioridad)}>
          {item.prioridad}
        </Badge>
      ),
    },
    { key: "recomendacion", header: "Recomendación", sortable: true },
    {
      key: "score",
      header: "Score",
      sortable: true,
      render: (item) => (item.score !== undefined ? item.score : "-"),
    },
    {
      key: "contactoPct",
      header: "% contacto",
      sortable: true,
      render: (item) => (item.contactoPct !== undefined ? `${item.contactoPct}%` : "-"),
    },
    {
      key: "volumen",
      header: "Volumen",
      sortable: true,
      render: (item) => (item.volumen !== undefined ? item.volumen : "-"),
    },
    { key: "motivo", header: "Motivo", className: "min-w-[260px]" },
  ];

  return (
    <div className="space-y-6">
      <BeforeAfterComparator data={data} />

      <div className="mb-6 text-center">
        <h2 className="section-title">
          <span className="dot-indicator bg-[hsl(var(--chart-5))]" />
          Motor de depuración
        </h2>
        <p className="section-subtitle mx-auto max-w-3xl">
          El sistema ahora clasifica, prioriza, recomienda acciones y arma una base final
          lista para operar y exportar.
        </p>
      </div>

      {data.resumenEjecutivo && (
        <Card className="glass-card border-glass-border">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-display font-bold">
              <span className="dot-indicator bg-primary" />
              Vista ejecutiva automática
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-semibold text-foreground">
                {data.resumenEjecutivo.diagnosticoGeneral}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Foco principal: {data.resumenEjecutivo.focoPrincipal}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Mejor base
                </p>
                <p className="mt-2 text-sm font-semibold">{data.resumenEjecutivo.mejorBase}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Peor base
                </p>
                <p className="mt-2 text-sm font-semibold">{data.resumenEjecutivo.peorBase}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Mejor franja
                </p>
                <p className="mt-2 text-sm font-semibold">
                  {data.resumenEjecutivo.mejorFranja}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Acción dominante
                </p>
                <p className="mt-2 text-sm font-semibold">
                  {data.resumenEjecutivo.accionDominante}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <KPICard
          title="Score promedio"
          value={scorePromedio.toFixed(1)}
          subtitle="recontactabilidad"
          icon={Target}
          variant="success"
        />
        <KPICard
          title="Prioridad alta"
          value={altaPrioridad}
          subtitle={`${((altaPrioridad / data.totalAnis) * 100 || 0).toFixed(1)}%`}
          icon={AlertTriangle}
          variant="danger"
        />
        <KPICard
          title="Saturados"
          value={saturados}
          subtitle={`${((saturados / data.totalAnis) * 100 || 0).toFixed(1)}%`}
          icon={PauseCircle}
          variant="warning"
        />
        <KPICard
          title="Reintentar mejor franja"
          value={reintentarMejorFranja}
          subtitle="alta oportunidad"
          icon={Clock3}
          variant="success"
        />
        <KPICard
          title="ANIs filtrados"
          value={filteredAnis.length}
          subtitle="base final visible"
          icon={Layers3}
          variant="warning"
        />
      </div>

      <Card className="glass-card border-glass-border">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-display font-bold">
            <span className="dot-indicator bg-warning" />
            Filtros y exportación operativa
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {allTags.map((tag) => (
              <Button
                key={tag}
                variant={selectedTags.includes(tag) ? "default" : "outline"}
                size="sm"
                onClick={() => toggleTag(tag)}
                className="gap-1 rounded-lg text-xs"
              >
                {tag.replace(/_/g, " ")}
                {selectedTags.includes(tag) && <X className="h-3 w-3" />}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Prioridad
              </p>
              <div className="flex flex-wrap gap-2">
                {["TODAS", "ALTA", "MEDIA", "BAJA"].map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={selectedPrioridad === value ? "default" : "outline"}
                    className="rounded-lg text-xs"
                    onClick={() => setSelectedPrioridad(value)}
                  >
                    {value}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Acción sugerida
              </p>
              <div className="flex flex-wrap gap-2">
                {accionesDisponibles.map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={selectedAccion === value ? "default" : "outline"}
                    className="rounded-lg text-xs"
                    onClick={() => setSelectedAccion(value)}
                  >
                    {value}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Score mínimo
              </p>
              <Input
                type="number"
                min="0"
                max="100"
                value={scoreMinimo}
                onChange={(e) => setScoreMinimo(e.target.value)}
                placeholder="Ej: 50"
                className="h-9"
              />
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Búsqueda
              </p>
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="ANI, base, prefijo..."
                className="h-9"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={soloSaturados ? "default" : "outline"}
              className="rounded-lg text-xs"
              onClick={() => setSoloSaturados((prev) => !prev)}
            >
              Solo saturados
            </Button>

            <Button
              size="sm"
              variant="ghost"
              className="rounded-lg text-xs"
              onClick={clearAdvancedFilters}
            >
              Limpiar filtros avanzados
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onExportResumen} className="gap-2 rounded-lg">
              <Download className="h-4 w-4" />
              Resumen ANI
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onExportFiltrado(selectedTags)}
              className="gap-2 rounded-lg"
            >
              <Download className="h-4 w-4" />
              Base por tag
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={() =>
                onExportBaseFinal({
                  tags: selectedTags,
                  prioridad: selectedPrioridad,
                  accion: selectedAccion,
                  soloSaturados,
                  scoreMinimo: scoreMinimo.trim() === "" ? null : Number(scoreMinimo),
                  busqueda,
                })
              }
              className="gap-2 rounded-lg"
            >
              <Download className="h-4 w-4" />
              Base final depurada
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={descartables === 0}
              onClick={() =>
                onExportBaseFinal({
                  tags: descartesTags,
                  prioridad: "TODAS",
                  accion: "TODAS",
                  soloSaturados: false,
                  scoreMinimo: null,
                  busqueda: "",
                  fileName: "lineas_descartadas.csv",
                })
              }
              className="gap-2 rounded-lg border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Descartes CSV ({descartables.toLocaleString("es-AR")})
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={filteredAnis.length === 0}
              onClick={() =>
                onExportNeotel({
                  tags: selectedTags,
                  prioridad: selectedPrioridad,
                  accion: selectedAccion,
                  soloSaturados,
                  scoreMinimo: scoreMinimo.trim() === "" ? null : Number(scoreMinimo),
                  busqueda,
                })
              }
              className="gap-2 rounded-lg border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Lote Neotel (.xls)
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={buzonesSinContacto.length === 0}
              onClick={() =>
                onExportNeotel({
                  segmento: "BUZONES_SIN_CONTACTO",
                  tags: allTags,
                  prioridad: "TODAS",
                  accion: "TODAS",
                  soloSaturados: false,
                  scoreMinimo: null,
                  busqueda: "",
                  fileName: "buzones_sin_contacto_neotel.xls",
                })
              }
              className="gap-2 rounded-lg border-warning/30 bg-warning/5 text-warning hover:bg-warning/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Buzones Neotel ({buzonesSinContacto.length.toLocaleString("es-AR")})
            </Button>

            <Button
              variant="default"
              size="sm"
              disabled={!selectedAccion || selectedAccion === "TODAS"}
              onClick={() => onExportPorAccion(selectedAccion)}
              className="gap-2 rounded-lg"
            >
              <Download className="h-4 w-4" />
              Exportar por acción
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card border-glass-border">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-display font-bold">
            <span className="dot-indicator bg-success" />
            Tabla de decisión por ANI
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            data={filteredAnis}
            columns={columns}
            searchPlaceholder="Buscar ANI, base, acción..."
            searchKeys={[
              "ani",
              "basePrincipal",
              "prefijo",
              "accionSugerida",
              "prioridad",
              "motivoDepuracion",
              "mejorFranja",
            ]}
            pageSize={12}
            testId="table-ani-smart"
          />
        </CardContent>
      </Card>

      {data.recomendacionesOperativas && data.recomendacionesOperativas.length > 0 && (
        <Card className="glass-card border-glass-border">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-display font-bold">
              <span className="dot-indicator bg-[hsl(var(--chart-4))]" />
              Recomendaciones operativas por base y franja
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              data={data.recomendacionesOperativas}
              columns={recomendacionesColumns}
              searchPlaceholder="Buscar objetivo o recomendación..."
              searchKeys={["tipo", "objetivo", "recomendacion", "motivo"]}
              pageSize={8}
              testId="table-recomendaciones-operativas"
            />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Foco inmediato
          </p>
          <p className="mt-2 text-sm font-semibold text-foreground">
            {filteredAnis.filter((a) => a.prioridad === "ALTA").length} ANIs con prioridad alta
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Potencial de reintento
          </p>
          <p className="mt-2 text-sm font-semibold text-foreground">
            {
              filteredAnis.filter(
                (a) =>
                  a.accionSugerida === "REINTENTAR_EN_MEJOR_FRANJA" ||
                  a.accionSugerida === "REINTENTAR_CON_CONTROL"
              ).length
            }{" "}
            ANIs con oportunidad
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Enfriar o pausar
          </p>
          <p className="mt-2 text-sm font-semibold text-foreground">
            {
              filteredAnis.filter(
                (a) =>
                  a.accionSugerida === "PAUSAR_24H" ||
                  a.accionSugerida === "NO_REINTENTAR_AUN" ||
                  a.accionSugerida === "REVISAR_O_PAUSAR"
              ).length
            }{" "}
            ANIs para control
          </p>
        </div>
      </div>
    </div>
  );
}
