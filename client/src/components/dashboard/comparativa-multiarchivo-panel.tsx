import { useMemo, useState } from "react";
import type { AnalysisResult } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  GitCompareArrows,
  Layers3,
  MapPin,
  Repeat2,
} from "lucide-react";

interface ComparativaMultiarchivoPanelProps {
  data: AnalysisResult;
}

type EnfoqueAnalisis = "base" | "franja" | "prefijo" | "segmento";

function getRecordHour(dateValue?: string) {
  if (!dateValue) return null;

  const date = new Date(dateValue);
  return Number.isNaN(date.getTime()) ? null : date.getHours();
}

function getRecordRange(dateValue?: string) {
  const hour = getRecordHour(dateValue);
  if (hour === null) return "Sin hora";
  if (hour < 9) return "Antes de 09:00";
  if (hour < 11) return "09:00-11:00";
  if (hour < 13) return "11:00-13:00";
  if (hour < 15) return "13:00-15:00";
  if (hour < 17) return "15:00-17:00";
  if (hour < 19) return "17:00-19:00";
  if (hour < 21) return "19:00-21:00";
  return "Después de 21:00";
}

function getRecordPrefix(ani?: string) {
  const digits = String(ani ?? "").replace(/\D/g, "");

  if (digits.startsWith("54")) {
    const rest = digits.slice(2);

    if (rest.startsWith("9")) {
      const mobile = rest.slice(1);
      if (mobile.startsWith("11")) return "11";
      for (const length of [4, 3, 2]) {
        if (mobile.length >= length) return mobile.slice(0, length);
      }
    }

    if (rest.startsWith("11")) return "11";
    for (const length of [4, 3, 2]) {
      if (rest.length >= length) return rest.slice(0, length);
    }
  }

  if (digits.startsWith("11")) return "11";
  for (const length of [4, 3, 2]) {
    if (digits.length >= length) return digits.slice(0, length);
  }

  return digits.slice(0, 2) || "00";
}

function formatNumber(value: number) {
  return value.toLocaleString("es-AR");
}

function formatPercentValue(value: number) {
  return `${value.toFixed(1)}%`;
}

function getActionBadgeClass(action: string) {
  if (action.includes("PRIORIZAR")) {
    return "border-success/25 bg-success/15 text-success";
  }

  if (action.includes("PAUSAR") || action.includes("EXCLUIR")) {
    return "border-destructive/25 bg-destructive/15 text-destructive";
  }

  return "border-warning/25 bg-warning/15 text-warning";
}

function getActionLabel(action: string) {
  if (action === "PRIORIZAR") return "Priorizar";
  if (action === "VALIDAR_MUESTRA") return "Validar muestra";
  if (action === "REINTENTAR_OTRA_FRANJA") return "Reintentar otra franja";
  if (action === "PAUSAR_O_SEGMENTAR") return "Pausar o segmentar";
  if (action === "EXCLUIR_INVALIDOS") return "Excluir inválidos";

  return action.replaceAll("_", " ").toLowerCase();
}

export default function ComparativaMultiarchivoPanel({
  data,
}: ComparativaMultiarchivoPanelProps) {
  const [enfoque, setEnfoque] = useState<EnfoqueAnalisis>("base");
  const [expandedBase, setExpandedBase] = useState<string | null>(null);
  const [copiedAlert, setCopiedAlert] = useState<string | null>(null);

  const comparativa = data.comparativaMultiarchivo;

  const segmentos = useMemo(() => {
    if (!comparativa) return [];

    return [
      ...comparativa.mejoresSegmentos,
      ...comparativa.segmentosARevisar,
    ];
  }, [comparativa]);

  const resumenPorBase = useMemo(() => {
    const map = new Map<
      string,
      {
        base: string;
        archivos: Set<string>;
        totalRegistros: number;
        contactoEfectivo: number;
        noContacto: number;
        mejorFranja: string;
        mejorPrefijo: string;
        accionSugerida: string;
        segmentosDestacados: number;
        segmentosOportunidad: number;
        segmentosRiesgo: number;
        segmentos: typeof segmentos;
      }
    >();

    segmentos.forEach((segmento) => {
      const current =
        map.get(segmento.base) ||
        {
          base: segmento.base,
          archivos: new Set<string>(),
          totalRegistros: 0,
          contactoEfectivo: 0,
          noContacto: 0,
          mejorFranja: segmento.franja,
          mejorPrefijo: segmento.prefijo,
          accionSugerida: segmento.accionSugerida,
          segmentosDestacados: 0,
          segmentosOportunidad: 0,
          segmentosRiesgo: 0,
          segmentos: [],
        };

      current.archivos.add(segmento.archivoOrigen);
      current.totalRegistros += segmento.totalRegistros;
      current.contactoEfectivo += segmento.contactoEfectivo;
      current.noContacto += segmento.noContacto;
      current.segmentosDestacados++;
      current.segmentos.push(segmento);

      if (segmento.accionSugerida === "PRIORIZAR") {
        current.segmentosOportunidad++;
      } else {
        current.segmentosRiesgo++;
      }

      const currentPct =
        current.totalRegistros > 0
          ? (current.contactoEfectivo / current.totalRegistros) * 100
          : 0;

      if (segmento.pctContactoEfectivo >= currentPct) {
        current.mejorFranja = segmento.franja;
        current.mejorPrefijo = segmento.prefijo;
      }

      if (
        segmento.accionSugerida === "PRIORIZAR" ||
        current.accionSugerida !== "PRIORIZAR"
      ) {
        current.accionSugerida = segmento.accionSugerida;
      }

      map.set(segmento.base, current);
    });

    return Array.from(map.values())
      .map((item) => {
        const globalBase = data.baseInsights?.find(
          (base) => base.base === item.base
        );
        const pctContacto =
          item.totalRegistros > 0
            ? (item.contactoEfectivo / item.totalRegistros) * 100
            : 0;

        const pctNoContacto =
          item.totalRegistros > 0
            ? (item.noContacto / item.totalRegistros) * 100
            : 0;

        let accionSugerida = item.accionSugerida;

        if (pctContacto >= 12) {
          accionSugerida = "PRIORIZAR";
        } else if (pctNoContacto >= 75) {
          accionSugerida = "PAUSAR_O_SEGMENTAR";
        } else if (pctContacto < 8) {
          accionSugerida = "REINTENTAR_OTRA_FRANJA";
        }

        return {
          ...item,
          archivos: Array.from(item.archivos),
          pctContacto,
          pctNoContacto,
          accionSugerida,
          globalTotalRegistros: globalBase?.totalRegistros ?? 0,
          globalTotalAnis: globalBase?.totalAnis ?? 0,
          globalPctContacto:
            typeof globalBase?.pctContactoEfectivo === "number"
              ? globalBase.pctContactoEfectivo * 100
              : null,
          coberturaDestacada:
            (globalBase?.totalRegistros ?? 0) > 0
              ? (item.totalRegistros / globalBase!.totalRegistros) * 100
              : 0,
        };
      })
      .sort((a, b) => {
        if (b.pctContacto !== a.pctContacto) {
          return b.pctContacto - a.pctContacto;
        }

        return b.totalRegistros - a.totalRegistros;
      });
  }, [data.baseInsights, segmentos]);

  const alertAnis = useMemo(() => {
    const result = new Map<string, string[]>();
    const highlightedSegments = resumenPorBase.flatMap((base) => base.segmentos);

    highlightedSegments.forEach((segmento) => {
      const key = [
        segmento.archivoOrigen,
        segmento.base,
        segmento.prefijo,
        segmento.franja,
      ].join("|||");
      result.set(key, []);
    });

    for (const record of data.rawRecords ?? []) {
      const key = [
        record.archivoOrigen || "Sin archivo identificado",
        (record.base || "SIN_BASE").trim() || "SIN_BASE",
        getRecordPrefix(record.ani),
        getRecordRange(record.fecha),
      ].join("|||");

      const anis = result.get(key);
      if (anis && record.ani && !anis.includes(record.ani)) {
        anis.push(record.ani);
      }
    }

    return result;
  }, [data.rawRecords, resumenPorBase]);

  const copyAnis = async (key: string, anis: string[]) => {
    await navigator.clipboard.writeText(anis.join("\n"));
    setCopiedAlert(key);
    window.setTimeout(() => setCopiedAlert(null), 1600);
  };

  const resumenPorFranja = useMemo(() => {
    const map = new Map<
      string,
      {
        franja: string;
        bases: Set<string>;
        prefijos: Set<string>;
        totalRegistros: number;
        contactoEfectivo: number;
        noContacto: number;
        mejorBase: string;
        prefijoDestacado: string;
      }
    >();

    segmentos.forEach((segmento) => {
      const current =
        map.get(segmento.franja) ||
        {
          franja: segmento.franja,
          bases: new Set<string>(),
          prefijos: new Set<string>(),
          totalRegistros: 0,
          contactoEfectivo: 0,
          noContacto: 0,
          mejorBase: segmento.base,
          prefijoDestacado: segmento.prefijo,
        };

      current.bases.add(segmento.base);
      current.prefijos.add(segmento.prefijo);
      current.totalRegistros += segmento.totalRegistros;
      current.contactoEfectivo += segmento.contactoEfectivo;
      current.noContacto += segmento.noContacto;

      const currentPct =
        current.totalRegistros > 0
          ? (current.contactoEfectivo / current.totalRegistros) * 100
          : 0;

      if (segmento.pctContactoEfectivo >= currentPct) {
        current.mejorBase = segmento.base;
        current.prefijoDestacado = segmento.prefijo;
      }

      map.set(segmento.franja, current);
    });

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        bases: Array.from(item.bases),
        prefijos: Array.from(item.prefijos),
        pctContacto:
          item.totalRegistros > 0
            ? (item.contactoEfectivo / item.totalRegistros) * 100
            : 0,
        pctNoContacto:
          item.totalRegistros > 0
            ? (item.noContacto / item.totalRegistros) * 100
            : 0,
      }))
      .sort((a, b) => {
        if (b.pctContacto !== a.pctContacto) {
          return b.pctContacto - a.pctContacto;
        }

        return b.totalRegistros - a.totalRegistros;
      });
  }, [segmentos]);

  const resumenPorPrefijo = useMemo(() => {
    const map = new Map<
      string,
      {
        prefijo: string;
        bases: Set<string>;
        franjas: Set<string>;
        totalRegistros: number;
        contactoEfectivo: number;
        noContacto: number;
        mejorBase: string;
        mejorFranja: string;
      }
    >();

    segmentos.forEach((segmento) => {
      const current =
        map.get(segmento.prefijo) ||
        {
          prefijo: segmento.prefijo,
          bases: new Set<string>(),
          franjas: new Set<string>(),
          totalRegistros: 0,
          contactoEfectivo: 0,
          noContacto: 0,
          mejorBase: segmento.base,
          mejorFranja: segmento.franja,
        };

      current.bases.add(segmento.base);
      current.franjas.add(segmento.franja);
      current.totalRegistros += segmento.totalRegistros;
      current.contactoEfectivo += segmento.contactoEfectivo;
      current.noContacto += segmento.noContacto;

      const currentPct =
        current.totalRegistros > 0
          ? (current.contactoEfectivo / current.totalRegistros) * 100
          : 0;

      if (segmento.pctContactoEfectivo >= currentPct) {
        current.mejorBase = segmento.base;
        current.mejorFranja = segmento.franja;
      }

      map.set(segmento.prefijo, current);
    });

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        bases: Array.from(item.bases),
        franjas: Array.from(item.franjas),
        pctContacto:
          item.totalRegistros > 0
            ? (item.contactoEfectivo / item.totalRegistros) * 100
            : 0,
        pctNoContacto:
          item.totalRegistros > 0
            ? (item.noContacto / item.totalRegistros) * 100
            : 0,
      }))
      .sort((a, b) => {
        if (b.pctContacto !== a.pctContacto) {
          return b.pctContacto - a.pctContacto;
        }

        return b.totalRegistros - a.totalRegistros;
      });
  }, [segmentos]);

  if (!comparativa) return null;

  const topBaseGlobal = [...(data.baseInsights ?? [])]
    .filter((base) => base.totalAnis > 10)
    .sort((a, b) => {
      if (b.scoreCalidad !== a.scoreCalidad) {
        return b.scoreCalidad - a.scoreCalidad;
      }

      return b.totalAnis - a.totalAnis;
    })[0];
  const topFranjaGlobal = Object.entries(data.rangoDistribucion ?? {})
    .map(([franja, stats]) => ({
      franja,
      total: stats.total,
      pctContacto: stats.total > 0 ? (stats.answer / stats.total) * 100 : 0,
    }))
    .filter((item) => item.total >= 20 && item.franja !== "Sin hora")
    .sort((a, b) => {
      if (b.pctContacto !== a.pctContacto) {
        return b.pctContacto - a.pctContacto;
      }

      return b.total - a.total;
    })[0];
  const topPrefijo = resumenPorPrefijo[0];
  const isMultiFile = comparativa.totalArchivos > 1;

  return (
    <Card className="glass-card soft-cyan-hover border-primary/15">
      <CardContent className="space-y-4 p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <GitCompareArrows className="h-4 w-4 text-primary" />
              {isMultiFile ? "Comparativa multiarchivo" : "Lectura segmentada del ticket"}
            </div>

            <h3 className="text-lg font-bold text-foreground">
              Dónde aparece la mejor señal comercial
            </h3>

            <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
              {isMultiFile
                ? comparativa.recomendacionGeneral
                : "Compara bases, horarios y prefijos dentro del ticket activo. Los resultados son relativos a este archivo y no representan una tendencia mensual."}
            </p>
          </div>

          <Badge className="border-primary/25 bg-primary/15 text-primary">
            {comparativa.totalArchivos} archivo
            {comparativa.totalArchivos !== 1 ? "s" : ""}
          </Badge>
        </div>

        <div className="flex gap-3 rounded-xl border border-warning/20 bg-warning/5 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-warning">
              Cómo leer este bloque
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              "Mejor" significa la señal más favorable dentro del alcance analizado, no
              necesariamente una base buena. La decisión final debe considerar volumen,
              contacto efectivo y no contacto.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-border bg-background/60 p-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Analizar por
            </p>

            <p className="text-xs text-muted-foreground">
              Elegí desde qué mirada querés decidir la operación.
            </p>
          </div>

          <select
            value={enfoque}
            onChange={(event) => setEnfoque(event.target.value as EnfoqueAnalisis)}
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground outline-none transition-colors hover:border-primary/50 focus:border-primary"
          >
            <option value="base">Base</option>
            <option value="franja">Franja horaria</option>
            <option value="prefijo">Prefijo</option>
            <option value="segmento">Segmento combinado</option>
          </select>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="soft-cyan-hover rounded-xl border border-border bg-background/60 p-3 transition-all duration-200">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Layers3 className="h-3.5 w-3.5 text-success" />
              Mejor base confiable
            </div>

            <p className="truncate text-xl font-bold text-foreground">
              {topBaseGlobal?.base || "-"}
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              {topBaseGlobal
                ? `${formatPercentValue(
                    topBaseGlobal.pctContactoEfectivo * 100
                  )} contacto · ${formatNumber(topBaseGlobal.totalAnis)} ANIs`
                : "Sin datos suficientes."}
            </p>
          </div>

          <div className="soft-cyan-hover rounded-xl border border-border bg-background/60 p-3 transition-all duration-200">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5 text-primary" />
              Franja con mayor contacto
            </div>

            <p className="truncate text-xl font-bold text-foreground">
              {topFranjaGlobal?.franja || comparativa.franjaMasConveniente || "-"}
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              {topFranjaGlobal
                ? `${formatPercentValue(
                    topFranjaGlobal.pctContacto
                  )} contacto · ${formatNumber(topFranjaGlobal.total)} registros`
                : "Horario con mejor contacto relativo."}
            </p>
          </div>

          <div className="soft-cyan-hover rounded-xl border border-border bg-background/60 p-3 transition-all duration-200">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 text-warning" />
              Prefijo destacado
            </div>

            <p className="truncate text-xl font-bold text-foreground">
              {topPrefijo?.prefijo || comparativa.prefijoMasEstable || "-"}
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              {topPrefijo
                ? `${formatPercentValue(topPrefijo.pctContacto)} contacto · ${topPrefijo.mejorFranja}`
                : "Sin prefijo destacado en los segmentos evaluados."}
            </p>
          </div>
        </div>

        {enfoque === "base" && (
          <div className="rounded-xl border border-success/20 bg-success/5 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-success">
              Base completa y alertas puntuales
            </p>

            <p className="mb-3 text-xs text-muted-foreground">
              La evaluación principal corresponde a la base completa. Las alertas son
              ejemplos de combinaciones de prefijo y horario con comportamiento extremo;
              no representan todo lo que debe revisarse o depurarse.
            </p>

            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {resumenPorBase.slice(0, 6).map((base) => (
                <div
                  key={base.base}
                  className="soft-cyan-hover rounded-lg border border-border/70 bg-background/60 p-3 transition-all duration-200">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {base.base}
                    </p>

                    <Badge className="border-warning/25 bg-warning/10 text-warning">
                      {base.segmentosDestacados} alerta
                      {base.segmentosDestacados !== 1 ? "s" : ""} puntual
                      {base.segmentosDestacados !== 1 ? "es" : ""}
                    </Badge>
                  </div>

                  <div className="mb-2 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-md border border-border/70 bg-background/70 p-2">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                        Base completa
                      </p>
                      <p className="mt-1 text-xs font-semibold text-foreground">
                        {formatNumber(base.globalTotalRegistros)} intentos ·{" "}
                        {formatNumber(base.globalTotalAnis)} ANIs
                      </p>
                      {base.globalPctContacto !== null && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {formatPercentValue(base.globalPctContacto)} contacto global
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      className="rounded-md border border-primary/20 bg-primary/5 p-2 text-left transition-colors hover:border-primary/40 hover:bg-primary/10"
                      onClick={() =>
                        setExpandedBase((current) =>
                          current === base.base ? null : base.base
                        )
                      }
                      aria-expanded={expandedBase === base.base}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[10px] font-semibold uppercase text-primary">
                            Alertas puntuales mostradas
                          </p>
                          <p className="mt-1 text-xs font-semibold text-foreground">
                            {formatNumber(base.segmentosDestacados)} segmento
                            {base.segmentosDestacados !== 1 ? "s" : ""} extremo
                            {base.segmentosDestacados !== 1 ? "s" : ""}
                          </p>
                        </div>

                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-primary transition-transform ${
                            expandedBase === base.base ? "rotate-180" : ""
                          }`}
                        />
                      </div>

                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {formatNumber(base.segmentosOportunidad)} oportunidad
                        {base.segmentosOportunidad !== 1 ? "es" : ""} ·{" "}
                        {formatNumber(base.segmentosRiesgo)} alerta
                        {base.segmentosRiesgo !== 1 ? "s" : ""} de revisión
                      </p>
                    </button>
                  </div>

                  {expandedBase === base.base && (
                    <div className="mb-3 space-y-2 rounded-lg border border-primary/20 bg-background/80 p-3">
                      <p className="text-[10px] font-semibold uppercase text-primary">
                        Detalle de alertas y ANIs
                      </p>

                      {base.segmentos.map((segmento) => {
                        const alertKey = [
                          segmento.archivoOrigen,
                          segmento.base,
                          segmento.prefijo,
                          segmento.franja,
                        ].join("|||");
                        const anis = alertAnis.get(alertKey) ?? [];

                        return (
                          <div
                            key={alertKey}
                            className="rounded-md border border-border/70 bg-card p-3"
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge
                                    className={getActionBadgeClass(
                                      segmento.accionSugerida
                                    )}
                                  >
                                    {getActionLabel(segmento.accionSugerida)}
                                  </Badge>
                                  <span className="text-xs font-semibold text-foreground">
                                    Prefijo {segmento.prefijo} · {segmento.franja}
                                  </span>
                                </div>

                                <p className="mt-2 text-xs text-muted-foreground">
                                  {formatNumber(segmento.totalRegistros)} intentos ·{" "}
                                  {formatNumber(segmento.totalAnis)} ANIs ·{" "}
                                  {formatPercentValue(
                                    segmento.pctContactoEfectivo
                                  )} contacto
                                </p>

                                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                                  {segmento.lectura}
                                </p>
                              </div>

                              <button
                                type="button"
                                className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                                onClick={() => copyAnis(alertKey, anis)}
                                disabled={anis.length === 0}
                              >
                                {copiedAlert === alertKey ? (
                                  <Check className="h-3.5 w-3.5 text-success" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                                {copiedAlert === alertKey
                                  ? "Copiados"
                                  : `Copiar ${formatNumber(anis.length)} ANIs`}
                              </button>
                            </div>

                            <div className="mt-3 max-h-28 overflow-y-auto rounded-md bg-muted/30 p-2 font-mono text-[11px] text-muted-foreground">
                              {anis.length > 0
                                ? anis.join(" · ")
                                : "No se pudieron reconstruir los ANIs de esta alerta."}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Ejemplo destacado: {base.mejorFranja} · Prefijo{" "}
                    {base.mejorPrefijo}
                  </p>

                  <p className="mt-2 text-xs text-muted-foreground">
                    Contacto efectivo:{" "}
                    <span className="font-semibold text-success">
                      {formatPercentValue(base.pctContacto)}
                    </span>{" "}
                    · No contacto:{" "}
                    <span className="font-semibold text-warning">
                      {formatPercentValue(base.pctNoContacto)}
                    </span>{" "}
                    · {base.archivos.length} archivo
                    {base.archivos.length !== 1 ? "s" : ""}
                  </p>

                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    Estas alertas sirven para investigar casos concretos. La cantidad
                    total a revisar se define en el ranking global y en el motor de
                    depuración, no sumando estos ejemplos.
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {enfoque === "franja" && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
              Análisis por franja horaria
            </p>

            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {resumenPorFranja.slice(0, 6).map((franja) => (
                <div
                  key={franja.franja}
                  className="soft-cyan-hover rounded-lg border border-border/70 bg-background/60 p-3 transition-all duration-200"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {franja.franja}
                    </p>

                    <Badge className="border-primary/25 bg-primary/15 text-primary">
                      Horario
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Mejor base {franja.mejorBase} · Prefijo {franja.prefijoDestacado}
                  </p>

                  <p className="mt-2 text-xs text-muted-foreground">
                    Contacto efectivo:{" "}
                    <span className="font-semibold text-success">
                      {formatPercentValue(franja.pctContacto)}
                    </span>{" "}
                    · Registros: {formatNumber(franja.totalRegistros)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {enfoque === "prefijo" && (
          <div className="rounded-xl border border-warning/20 bg-warning/5 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-warning">
              Análisis por prefijo
            </p>

            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {resumenPorPrefijo.slice(0, 6).map((prefijo) => (
                <div
                  key={prefijo.prefijo}
                  className="soft-cyan-hover rounded-lg border border-border/70 bg-background/60 p-3 transition-all duration-200"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">
                      Prefijo {prefijo.prefijo}
                    </p>

                    <Badge className="border-warning/25 bg-warning/15 text-warning">
                      Zona
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Mejor base {prefijo.mejorBase} · Franja {prefijo.mejorFranja}
                  </p>

                  <p className="mt-2 text-xs text-muted-foreground">
                    Contacto efectivo:{" "}
                    <span className="font-semibold text-success">
                      {formatPercentValue(prefijo.pctContacto)}
                    </span>{" "}
                    · Registros: {formatNumber(prefijo.totalRegistros)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {enfoque === "segmento" && (
          <div className="space-y-3">
            {comparativa.basesRepetidas.length > 0 && (
              <div className="rounded-xl border border-warning/20 bg-warning/5 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-warning">
                  Bases repetidas detectadas
                </p>

                <div className="space-y-2">
                  {comparativa.basesRepetidas.slice(0, 3).map((base) => (
                    <div
                      key={base.base}
                      className="flex flex-col gap-1 rounded-lg border border-border/70 bg-background/60 p-3 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {base.base}
                        </p>

                        <p className="text-xs text-muted-foreground">
                          {base.lectura}
                        </p>
                      </div>

                      <div className="shrink-0 text-xs text-muted-foreground md:text-right">
                        <p>{base.apariciones} archivos</p>
                        <p>{formatNumber(base.totalRegistros)} registros</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {comparativa.mejoresSegmentos.length > 0 && (
              <div className="rounded-xl border border-success/20 bg-success/5 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-success">
                  Segmentos para priorizar
                </p>

                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  {comparativa.mejoresSegmentos.slice(0, 4).map((segmento) => (
                    <div
                      key={`${segmento.archivoOrigen}-${segmento.base}-${segmento.prefijo}-${segmento.franja}`}
                      className="soft-cyan-hover rounded-lg border border-border/70 bg-background/60 p-3 transition-all duration-200"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {segmento.base}
                        </p>

                        <Badge className="border-success/25 bg-success/15 text-success">
                          Priorizar
                        </Badge>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        Prefijo {segmento.prefijo} · {segmento.franja}
                        {segmento.fechaArchivo ? ` · ${segmento.fechaArchivo}` : ""}
                      </p>

                      <p className="mt-2 text-xs text-muted-foreground">
                        Contacto efectivo:{" "}
                        <span className="font-semibold text-success">
                          {formatPercentValue(segmento.pctContactoEfectivo)}
                        </span>{" "}
                        · Registros: {formatNumber(segmento.totalRegistros)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {comparativa.segmentosARevisar.length > 0 && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-destructive">
                  Segmentos a revisar antes de operar
                </p>

                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  {comparativa.segmentosARevisar.slice(0, 4).map((segmento) => (
                    <div
                      key={`${segmento.archivoOrigen}-${segmento.base}-${segmento.prefijo}-${segmento.franja}`}
                      className="soft-cyan-hover rounded-lg border border-border/70 bg-background/60 p-3 transition-all duration-200"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {segmento.base}
                        </p>

                        <Badge className="border-destructive/25 bg-destructive/15 text-destructive">
                          {getActionLabel(segmento.accionSugerida)}
                        </Badge>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        Prefijo {segmento.prefijo} · {segmento.franja}
                        {segmento.fechaArchivo ? ` · ${segmento.fechaArchivo}` : ""}
                      </p>

                      <p className="mt-2 text-xs text-muted-foreground">
                        No contacto:{" "}
                        <span className="font-semibold text-destructive">
                          {formatPercentValue(segmento.pctNoContacto)}
                        </span>{" "}
                        · Registros: {formatNumber(segmento.totalRegistros)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="rounded-xl border border-border bg-background/50 p-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Repeat2 className="h-3.5 w-3.5 text-warning" />
            Bases repetidas
          </div>

          <p className="text-sm text-muted-foreground">
            Se detectaron{" "}
            <span className="font-semibold text-foreground">
              {comparativa.basesRepetidas.length}
            </span>{" "}
            bases presentes en más de un archivo. Esto permite revisar si un lote
            sigue rindiendo o si empieza a agotarse con los días.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
