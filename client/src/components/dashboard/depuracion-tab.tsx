import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { KPICard } from "@/components/kpi-card";
import { DataTable, type Column } from "@/components/data-table";
import { TagBadge } from "@/components/tag-badge";
import { Download, X } from "lucide-react";
import type { AnalysisResult, ANISummary, TagType } from "@shared/schema";
import { cn } from "@/lib/utils";

interface DepuracionTabProps {
  data: AnalysisResult;
  onExportResumen: () => void;
  onExportFiltrado: (tags: string[]) => void;
}

const allTags: TagType[] = [
  "SEGUIR_INTENTANDO",
  "CONTACTADO",
  "INVALIDO",
  "SOLO_BUZON",
  "NO_ATIENDE",
  "RECHAZA",
];

export function DepuracionTab({
  data,
  onExportResumen,
  onExportFiltrado,
}: DepuracionTabProps) {
  const [selectedTags, setSelectedTags] = useState<TagType[]>(["SEGUIR_INTENTANDO"]);

  const toggleTag = (tag: TagType) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const filteredAnis = useMemo(() => {
    return data.aniSummaries.filter((ani) =>
      selectedTags.includes(ani.tagTelefono as TagType)
    );
  }, [data.aniSummaries, selectedTags]);

  const aColumns: Column<ANISummary>[] = [
    { key: "ani", header: "ANI", sortable: true },
    { key: "intentosTotales", header: "Intentos Totales", sortable: true },
    { key: "intentosAnswerAgent", header: "Answer Agent", sortable: true },
    { key: "intentosAnsweringMachine", header: "Answering Machine", sortable: true },
    { key: "intentosNoAnswer", header: "No Answer", sortable: true },
    { key: "intentosBusy", header: "Busy", sortable: true },
    { key: "intentosUnallocated", header: "Unallocated", sortable: true },
    { key: "intentosRejected", header: "Rejected", sortable: true },
    {
      key: "primerLlamado",
      header: "Primer Llamado",
      sortable: true,
      render: (item) =>
        item.primerLlamado
          ? new Date(item.primerLlamado).toLocaleString("es-AR")
          : "-",
    },
    {
      key: "ultimoLlamado",
      header: "Último Llamado",
      sortable: true,
      render: (item) =>
        item.ultimoLlamado
          ? new Date(item.ultimoLlamado).toLocaleString("es-AR")
          : "-",
    },
    {
      key: "tagTelefono",
      header: "Tag",
      sortable: true,
      render: (item) => <TagBadge tag={item.tagTelefono as TagType} />,
    },
  ];

  const tagDistribucionData = useMemo(() => {
    return Object.entries(data.tagDistribucion).map(([tag, cantidad]) => ({
      tag,
      cantidad,
    }));
  }, [data]);

  const anisNoContactadosYDepurar =
    data.anisADepurar > 0
      ? data.aniSummaries.filter(
          (a) => a.intentosAnswerAgent === 0 && a.tagTelefono !== "SEGUIR_INTENTANDO"
        ).length
      : 0;

  const anisNoContactadosSeguirIntentando = data.aniSummaries.filter(
    (a) => a.intentosAnswerAgent === 0 && a.tagTelefono === "SEGUIR_INTENTANDO"
  ).length;

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold flex items-center justify-center gap-2">
          <span className="text-chart-5">*</span>
          Depuración sugerida de contactos
        </h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl mx-auto">
          Este módulo analiza ANI por ANI y los clasifica según su comportamiento en
          los estados: ANSWER, NO ANSWER, busy, unallocated, rejected y subestados.
          La idea es identificar qué números conviene sacar de las bases para no
          seguir quemando intentos.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard
          title="ANIs totales en la base"
          value={data.totalAnis}
          testId="kpi-total-anis"
        />
        <KPICard
          title="ANIs contactados (ANSWER-AGENT)"
          value={data.anisContactados}
          subtitle={`${((data.anisContactados / data.totalAnis) * 100).toFixed(1)}%`}
          variant="success"
          testId="kpi-contactados"
        />
        <KPICard
          title="ANIs a depurar (TAGS != SEGUIR_INTENTANDO)"
          value={data.anisADepurar}
          subtitle={`${((data.anisADepurar / data.totalAnis) * 100).toFixed(1)}%`}
          variant="danger"
          testId="kpi-a-depurar"
        />
        <KPICard
          title="ANIs no contactados y a depurar"
          value={anisNoContactadosYDepurar}
          subtitle={`${((anisNoContactadosYDepurar / data.totalAnis) * 100).toFixed(1)}%`}
          testId="kpi-no-contactados-depurar"
        />
        <KPICard
          title="ANIs no contactados y a seguir intentando"
          value={anisNoContactadosSeguirIntentando}
          subtitle={`${((anisNoContactadosSeguirIntentando / data.totalAnis) * 100).toFixed(1)}%`}
          variant="success"
          testId="kpi-no-contactados-seguir"
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <span className="text-chart-4">*</span>
            Distribución por tag
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            data={tagDistribucionData}
            columns={[
              { key: "tag", header: "TAG", sortable: true },
              {
                key: "cantidad",
                header: "Cantidad",
                sortable: true,
                render: (item) => item.cantidad.toLocaleString("es-AR"),
              },
            ]}
            searchable={false}
            pageSize={10}
            testId="table-tag-distribucion"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <span className="text-chart-1">*</span>
            Filtro rápido por TAG para exportar
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Elegí qué TAGs querés mantener en la base de salida:
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {allTags.map((tag) => (
              <Button
                key={tag}
                variant={selectedTags.includes(tag) ? "default" : "outline"}
                size="sm"
                onClick={() => toggleTag(tag)}
                className="gap-1"
                data-testid={`button-toggle-tag-${tag}`}
              >
                {tag.replace(/_/g, " ")}
                {selectedTags.includes(tag) && <X className="h-3 w-3" />}
              </Button>
            ))}
          </div>

          <div className="flex items-center justify-between flex-wrap gap-4">
            <p className="text-sm text-muted-foreground">
              ANIs en la base filtrada:{" "}
              <span className="font-semibold text-foreground">
                {filteredAnis.length.toLocaleString("es-AR")}
              </span>
            </p>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={onExportResumen}
                className="gap-2"
                data-testid="button-export-resumen"
              >
                <Download className="h-4 w-4" />
                Descargar resumen por ANI (CSV)
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => onExportFiltrado(selectedTags)}
                className="gap-2"
                data-testid="button-export-filtrado"
              >
                <Download className="h-4 w-4" />
                Descargar base de llamados filtrada (CSV)
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <span className="text-chart-3">*</span>
            ANIs sugeridos para depurar
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Esta tabla resume, por ANI, cuántos intentos tuvo en cada categoría y
            qué tag final se le asignó.
          </p>
        </CardHeader>
        <CardContent>
          <DataTable
            data={filteredAnis}
            columns={aColumns}
            searchPlaceholder="Buscar ANI..."
            searchKeys={["ani"]}
            pageSize={15}
            testId="table-ani-summary"
          />
        </CardContent>
      </Card>
    </div>
  );
}
