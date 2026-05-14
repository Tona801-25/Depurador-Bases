import { AlertTriangle, CheckCircle2, Lightbulb, TrendingUp } from "lucide-react";
import type { AnalysisResult } from "@shared/schema";

interface AnalysisInsightsProps {
  data: AnalysisResult;
}

function getTopEntry(record?: Record<string, number>) {
  const entries = Object.entries(record ?? {});

  if (entries.length === 0) return null;

  return entries.sort((a, b) => b[1] - a[1])[0];
}

function getRiskLevel(pctNoAnswer: number, pctAnswer: number) {
  if (pctNoAnswer >= 75 || pctAnswer < 10) {
    return {
      label: "Riesgo alto",
      tone: "danger" as const,
      description:
        "La base muestra baja capacidad de contacto. Conviene revisar calidad, horarios, origen de datos y estrategia de reintentos antes de seguir consumiendo gestión.",
    };
  }

  if (pctNoAnswer >= 55 || pctAnswer < 20) {
    return {
      label: "Riesgo medio",
      tone: "warning" as const,
      description:
        "La base tiene oportunidades de mejora. No necesariamente debe descartarse, pero conviene segmentar y priorizar los grupos con mejor respuesta.",
    };
  }

  return {
    label: "Riesgo controlado",
    tone: "success" as const,
    description:
      "La base presenta una contactabilidad aceptable. Se puede seguir gestionando, priorizando los segmentos con mejor rendimiento.",
  };
}

function getToneClass(tone: "success" | "warning" | "danger" | "default") {
  if (tone === "success") {
    return "border-success/30 bg-success/5 text-success";
  }

  if (tone === "warning") {
    return "border-warning/30 bg-warning/5 text-warning";
  }

  if (tone === "danger") {
    return "border-destructive/30 bg-destructive/5 text-destructive";
  }

  return "border-primary/30 bg-primary/5 text-primary";
}

const AnalysisInsights = ({ data }: AnalysisInsightsProps) => {
  const topEstado = getTopEntry(data.estadoDistribucion);
  const topTag = getTopEntry(data.tagDistribucion);
  const topBase = [...(data.baseInsights ?? [])].sort(
    (a, b) => b.scoreCalidad - a.scoreCalidad
  )[0];

  const risk = getRiskLevel(data.pctNoAnswer, data.pctAnswer);

  const pctContactados =
    data.totalAnis > 0 ? (data.anisContactados / data.totalAnis) * 100 : 0;

  const pctDepurar =
    data.totalAnis > 0 ? (data.anisADepurar / data.totalAnis) * 100 : 0;

  const insights = [
    {
      title: "Lectura general",
      icon: Lightbulb,
      tone: risk.tone,
      value: risk.label,
      description: risk.description,
    },
    {
      title: "Contacto efectivo",
      icon: CheckCircle2,
      tone: pctContactados >= 20 ? "success" : pctContactados >= 10 ? "warning" : "danger",
      value: `${pctContactados.toFixed(1)}% de ANIs contactados`,
      description:
        "Este indicador muestra qué proporción de teléfonos únicos logró contacto efectivo. Es clave para medir la calidad real de la base, más allá del volumen cargado.",
    },
    {
      title: "Principal concentración",
      icon: TrendingUp,
      tone: "default",
      value: topEstado
        ? `${topEstado[0]} · ${topEstado[1].toLocaleString("es-AR")}`
        : "Sin estado predominante",
      description:
        "Identifica el estado con mayor volumen dentro de la base. Ayuda a entender si el problema principal está en no respuesta, atención, rechazo, buzón u otros estados.",
    },
    {
      title: "Acción sugerida",
      icon: AlertTriangle,
      tone: pctDepurar >= 25 ? "danger" : pctDepurar >= 10 ? "warning" : "success",
      value:
        pctDepurar >= 25
          ? "Depurar antes de seguir marcando"
          : pctDepurar >= 10
            ? "Segmentar y controlar reintentos"
            : "Continuar con monitoreo",
      description:
        pctDepurar >= 25
          ? "Hay un volumen relevante de ANIs con baja recontactabilidad. Conviene filtrar o separar estos registros para evitar consumo innecesario de intentos."
          : pctDepurar >= 10
            ? "La base todavía puede trabajarse, pero conviene separar segmentos con bajo rendimiento y revisar horarios, prefijos o cantidad de intentos."
            : "El volumen a depurar no parece crítico. Se recomienda seguir monitoreando comportamiento por prefijo, turno y TAG.",
    },
  ];

  return (
    <div className="glass-card p-5 animate-slide-up hover-elevate">
      <div className="mb-4 flex flex-col gap-1">
        <h3 className="flex items-center gap-2 text-sm font-display font-semibold">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
          Lectura ejecutiva automática
        </h3>

        <p className="text-xs text-muted-foreground">
          Interpretación rápida de los datos cargados para facilitar la toma de decisión.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
        {insights.map((item) => {
          const Icon = item.icon;

          return (
            <div
              key={item.title}
              className="soft-cyan-hover rounded-xl border border-border bg-background/70 p-4"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {item.title}
                  </p>

                  <p className="mt-1 text-sm font-display font-bold text-foreground">
                    {item.value}
                  </p>
                </div>

                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${getToneClass(
                    item.tone
                  )}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
              </div>

              <p className="text-xs leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            </div>
          );
        })}
      </div>

      {(topTag || topBase) && (
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {topTag && (
            <div className="soft-cyan-hover rounded-xl border border-border bg-card/60 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                TAG predominante
              </p>

              <p className="mt-1 text-sm font-display font-bold">
                {topTag[0]} · {topTag[1].toLocaleString("es-AR")}
              </p>

              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Este TAG concentra el mayor volumen de registros. Sirve para entender
                qué tipo de comportamiento domina la base y orientar la estrategia de depuración.
              </p>
            </div>
          )}

          {topBase && (
            <div className="soft-cyan-hover rounded-xl border border-border bg-card/60 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Base prioritaria
              </p>

              <p className="mt-1 text-sm font-display font-bold">
                {topBase.base}
              </p>

              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Es la base con mejor score relativo dentro del archivo cargado. Conviene
                tomarla como prioridad de gestión o como referencia para comparar contra el resto.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AnalysisInsights;