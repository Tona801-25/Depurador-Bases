import type { AnalysisResult, BaseInsight } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CheckCircle2,
  CircleGauge,
  Database,
  Layers3,
  MousePointerClick,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import ComparativaMultiarchivoPanel from "@/components/dashboard/comparativa-multiarchivo-panel";

interface DiagnosticoEjecutivoProps {
  data: AnalysisResult;
}

function formatNumber(value: number) {
  return value.toLocaleString("es-AR");
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatPercentValue(value: number) {
  return `${value.toFixed(1)}%`;
}

function normalizePercent(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return value > 1 ? value / 100 : value;
}

function getTopKey(distribution?: Record<string, number>) {
  if (!distribution) return "-";

  const entries = Object.entries(distribution).filter(([, value]) => value > 0);

  if (entries.length === 0) return "-";

  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function getBaseSampleLabel(base?: BaseInsight) {
  if (!base) return "Sin base detectada";

  if (base.confiabilidadMuestra) {
    return `Muestra ${base.confiabilidadMuestra.toLowerCase()}`;
  }

  if (base.totalAnis < 100) return "Muestra baja";
  if (base.totalAnis < 500) return "Muestra media";

  return "Muestra alta";
}

function getScoreLabel(score: number) {
  if (score >= 0.9) return "Muy bueno";
  if (score >= 0.75) return "Bueno";
  if (score >= 0.6) return "Aceptable";
  if (score >= 0.4) return "Revisar";

  return "Bajo";
}

function getScoreBadgeClass(score: number) {
  if (score >= 0.75) {
    return "border-success/25 bg-success/15 text-success";
  }

  if (score >= 0.4) {
    return "border-warning/25 bg-warning/15 text-warning";
  }

  return "border-destructive/25 bg-destructive/15 text-destructive";
}

function getQualityState(data: AnalysisResult) {
  const resumen = data.resumenEjecutivo;
  const contactoEfectivo =
    data.totalAnis > 0 ? data.anisContactados / data.totalAnis : normalizePercent(data.pctAnswer);
  const depuracion =
    data.totalAnis > 0 ? data.anisADepurar / data.totalAnis : normalizePercent(resumen?.porcentajeADepurar);

  if (resumen?.semaforoCalidad === "VERDE") {
    return {
      label: "Base saludable",
      badge: "BAJO RIESGO",
      className: "border-success/25 bg-success/15 text-success",
      description:
        "La base muestra condiciones favorables para operar. Conviene priorizar los segmentos con mejor respuesta.",
    };
  }

  if (resumen?.semaforoCalidad === "ROJO") {
    return {
      label: "Base crítica",
      badge: "ALTO RIESGO",
      className: "border-destructive/25 bg-destructive/15 text-destructive",
      description:
        "La base concentra señales improductivas. Antes de seguir consumiendo intentos, conviene depurar o segmentar.",
    };
  }

  if (depuracion >= 0.55 || contactoEfectivo < 0.08) {
    return {
      label: "Base a revisar",
      badge: "RIESGO MEDIO",
      className: "border-warning/25 bg-warning/15 text-warning",
      description:
        "La base puede tener utilidad, pero no conviene trabajarla completa sin revisar estados, prefijos y franjas.",
    };
  }

  return {
    label: "Base usable con ajustes",
    badge: "RIESGO CONTROLADO",
    className: "border-primary/25 bg-primary/15 text-primary",
    description:
      "La base tiene señales aprovechables, pero requiere lectura operativa antes de definir la estrategia de marcado.",
  };
}

function getPrimaryProblem(data: AnalysisResult) {
  const resumen = data.resumenEjecutivo;

  if (resumen?.principalProblemaDetectado) {
    return resumen.principalProblemaDetectado;
  }

  if (resumen?.tagDominante) {
    return resumen.tagDominante;
  }

  if (resumen?.estadoDominante) {
    return resumen.estadoDominante;
  }

  const operativo = getTopKey(data.estadoOperativoDistribucion);
  if (operativo !== "-") return operativo;

  const estado = getTopKey(data.estadoDistribucion);
  if (estado !== "-") return estado;

  return "Sin concentración crítica detectada";
}

function getRecommendedAction(data: AnalysisResult) {
  const resumen = data.resumenEjecutivo;

  if (resumen?.accionRecomendada) return resumen.accionRecomendada;
  if (resumen?.accionDominante) return resumen.accionDominante;

  const pctDepurar = data.totalAnis > 0 ? data.anisADepurar / data.totalAnis : 0;
  const contactoEfectivo = data.totalAnis > 0 ? data.anisContactados / data.totalAnis : 0;

  if (pctDepurar >= 0.55) {
    return "Depurar y segmentar antes de volver a discar.";
  }

  if (contactoEfectivo < 0.08) {
    return "Revisar horarios, prefijos y estrategia de reintentos.";
  }

  return "Priorizar los segmentos con mejor contacto efectivo.";
}

function getNoActionImpact(data: AnalysisResult) {
  const pctDepurar = data.totalAnis > 0 ? data.anisADepurar / data.totalAnis : 0;

  if (pctDepurar >= 0.65) {
    return "Si se opera completa, puede consumir muchos intentos en registros de bajo valor.";
  }

  if (pctDepurar >= 0.4) {
    return "Si no se segmenta, puede mezclarse volumen útil con volumen improductivo.";
  }

  return "El riesgo principal es no priorizar los mejores segmentos y perder eficiencia operativa.";
}

function getBestBases(data: AnalysisResult) {
  const bases = [...(data.baseInsights ?? [])].sort(
    (a, b) => b.scoreCalidad - a.scoreCalidad
  );

  const mejorSenal = bases[0];

  const mejorConfiable =
    bases.find((base) => base.confiabilidadMuestra === "ALTA") ??
    bases.find((base) => base.totalAnis >= 500) ??
    undefined;

  return {
    mejorSenal,
    mejorConfiable,
  };
}

export default function DiagnosticoEjecutivo({ data }: DiagnosticoEjecutivoProps) {
  const quality = getQualityState(data);
  const primaryProblem = getPrimaryProblem(data);
  const recommendedAction = getRecommendedAction(data);
  const noActionImpact = getNoActionImpact(data);
  const { mejorSenal, mejorConfiable } = getBestBases(data);

  const contactoEfectivo =
    data.totalAnis > 0 ? data.anisContactados / data.totalAnis : normalizePercent(data.pctAnswer);

  const pctDepurar = data.totalAnis > 0 ? data.anisADepurar / data.totalAnis : 0;

  return (
    <section className="space-y-4">
      <Card className="glass-card overflow-hidden border-primary/20">
        <CardContent className="p-0">
          <div className="grid gap-0 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="space-y-5 p-5 md:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge className={quality.className}>{quality.badge}</Badge>

                    <Badge className="border-border bg-secondary/70 text-muted-foreground">
                      Diagnóstico inicial
                    </Badge>
                  </div>

                  <h2 className="gradient-text text-2xl font-display font-bold md:text-3xl">
                    {quality.label}
                  </h2>

                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                    {quality.description}
                  </p>
                </div>

                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 shadow-[0_0_24px_rgba(0,188,212,0.12)]">
                  <CircleGauge className="h-6 w-6 text-primary" />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="soft-cyan-hover rounded-xl border border-border bg-background/70 p-4">
                  <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                    <Database className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold uppercase tracking-wide">
                      Qué tengo
                    </span>
                  </div>

                  <p className="text-xl font-bold text-foreground">
                    {formatNumber(data.totalRecords)} registros
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatNumber(data.totalAnis)} ANIs únicos ·{" "}
                    {formatNumber(data.baseInsights?.length ?? 0)} bases detectadas
                  </p>
                </div>

                <div className="soft-cyan-hover rounded-xl border border-border bg-background/70 p-4">
                  <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span className="text-xs font-semibold uppercase tracking-wide">
                      Qué tan buena es
                    </span>
                  </div>

                  <p className="text-xl font-bold text-success">
                    {formatPercent(contactoEfectivo)}
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    Contacto efectivo sobre ANIs únicos
                  </p>
                </div>

                <div className="soft-cyan-hover rounded-xl border border-border bg-background/70 p-4">
                  <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                    <ShieldAlert className="h-4 w-4 text-warning" />
                    <span className="text-xs font-semibold uppercase tracking-wide">
                      Riesgo operativo
                    </span>
                  </div>

                  <p className="text-xl font-bold text-warning">
                    {formatPercent(pctDepurar)}
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    ANIs con señal de depuración o revisión
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-border bg-card/70 p-5 md:p-6 lg:border-l lg:border-t-0">
              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    Problema principal
                  </div>

                  <p className="text-base font-semibold text-foreground">
                    {primaryProblem}
                  </p>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <MousePointerClick className="h-4 w-4 text-primary" />
                    Qué hacer ahora
                  </div>

                  <p className="text-sm leading-relaxed text-foreground">
                    {recommendedAction}
                  </p>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    Si no hago nada
                  </div>

                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {noActionImpact}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

        <ComparativaMultiarchivoPanel data={data} />

      {(mejorSenal || mejorConfiable) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {mejorSenal && (
            <Card className="glass-card soft-cyan-hover">
              <CardContent className="p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">
                      Mejor señal preliminar
                    </h3>
                  </div>

                  <Badge className={getScoreBadgeClass(mejorSenal.scoreCalidad)}>
                    {getScoreLabel(mejorSenal.scoreCalidad)}
                  </Badge>
                </div>

                <p className="truncate text-base font-bold text-foreground">
                  {mejorSenal.base}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  {getBaseSampleLabel(mejorSenal)} · Score{" "}
                  {mejorSenal.scoreCalidad.toFixed(2)} · Contacto{" "}
                  {formatPercent(mejorSenal.pctContactoEfectivo)}
                </p>

                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  Útil para detectar una oportunidad, pero si la muestra es baja no debería
                  tomarse como mejor base definitiva.
                </p>
              </CardContent>
            </Card>
          )}

          {mejorConfiable && (
            <Card className="glass-card soft-cyan-hover">
              <CardContent className="p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Layers3 className="h-4 w-4 text-success" />
                    <h3 className="text-sm font-semibold text-foreground">
                      Mejor base confiable
                    </h3>
                  </div>

                  <Badge className={getScoreBadgeClass(mejorConfiable.scoreCalidad)}>
                    {getScoreLabel(mejorConfiable.scoreCalidad)}
                  </Badge>
                </div>

                <p className="truncate text-base font-bold text-foreground">
                  {mejorConfiable.base}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  {getBaseSampleLabel(mejorConfiable)} · Score{" "}
                  {mejorConfiable.scoreCalidad.toFixed(2)} · Contacto{" "}
                  {formatPercent(mejorConfiable.pctContactoEfectivo)}
                </p>

                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  Es la referencia más segura para priorizar operación porque combina score y
                  mayor confiabilidad de muestra.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </section>
  );
}