import {
  RadialBarChart,
  RadialBar,
  ResponsiveContainer,
  PolarAngleAxis,
} from "recharts";
import type { AnalysisResult } from "@shared/schema";

interface EffectivenessRadialProps {
  data: AnalysisResult;
}

type EstadoOperativoKey =
  | "CONTACTO_EFECTIVO"
  | "CONTESTADOR_BUZON"
  | "NO_CONTESTA"
  | "OCUPADO_RECHAZO"
  | "INVALIDO"
  | "OTROS_TECNICOS";

type AnalysisResultWithEstadoOperativo = AnalysisResult & {
  estadoOperativoDistribucion?: Partial<Record<EstadoOperativoKey, number>>;
};

type MetricItem = {
  name: string;
  value: number;
  count: number;
  detail: string;
  color: string;
  description: string;
};

function formatPercentage(value: number) {
  if (!Number.isFinite(value)) return "0.0";
  return value.toFixed(1);
}

function formatCount(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Math.round(value).toLocaleString("es-AR");
}

function pct(value: number, total: number) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }

  return (value / total) * 100;
}

function pctToCount(total: number, percentage: number) {
  if (!Number.isFinite(total) || !Number.isFinite(percentage)) return 0;
  return (total * percentage) / 100;
}

function getOperationalValue(
  distribution: Partial<Record<EstadoOperativoKey, number>> | undefined,
  key: EstadoOperativoKey
) {
  return distribution?.[key] ?? 0;
}

const Ring = ({ value, color }: { value: number; color: string }) => (
  <ResponsiveContainer width="100%" height={140}>
    <RadialBarChart
      innerRadius="72%"
      outerRadius="100%"
      data={[{ value }]}
      startAngle={90}
      endAngle={-270}
    >
      <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />

      <RadialBar
        dataKey="value"
        cornerRadius={10}
        fill={color}
        background={{ fill: "hsl(var(--secondary))" }}
      />
    </RadialBarChart>
  </ResponsiveContainer>
);

const EffectivenessRadial = ({ data }: EffectivenessRadialProps) => {
  const safeData = data as AnalysisResultWithEstadoOperativo;
  const estadoOperativo = safeData.estadoOperativoDistribucion;

  const hasEstadoOperativo =
    !!estadoOperativo &&
    Object.values(estadoOperativo).some((value) => Number(value) > 0);

  let metrics: MetricItem[] = [];

  /**
   * Modo profesional:
   * Si el backend ya devuelve estadoOperativoDistribucion,
   * mostramos el análisis abierto en categorías entendibles para usuarios externos.
   */
  if (hasEstadoOperativo) {
    const contactoEfectivo = getOperationalValue(
      estadoOperativo,
      "CONTACTO_EFECTIVO"
    );

    const contestadorBuzon = getOperationalValue(
      estadoOperativo,
      "CONTESTADOR_BUZON"
    );

    const noContesta = getOperationalValue(estadoOperativo, "NO_CONTESTA");

    const ocupadoRechazo = getOperationalValue(
      estadoOperativo,
      "OCUPADO_RECHAZO"
    );

    const invalido = getOperationalValue(estadoOperativo, "INVALIDO");

    const otrosTecnicos = getOperationalValue(
      estadoOperativo,
      "OTROS_TECNICOS"
    );

    const totalOperativo =
      contactoEfectivo +
      contestadorBuzon +
      noContesta +
      ocupadoRechazo +
      invalido +
      otrosTecnicos;

    metrics = [
      {
        name: "Contacto efectivo",
        value: pct(contactoEfectivo, totalOperativo),
        count: contactoEfectivo,
        detail: "ANSWER + AGENT",
        color: "hsl(var(--success))",
        description:
          "Conversaciones reales atendidas por agente. Es la métrica principal de contactabilidad útil.",
      },
      {
        name: "Contestador / buzón",
        value: pct(contestadorBuzon, totalOperativo),
        count: contestadorBuzon,
        detail: "ANSWERING_MACHINE",
        color: "hsl(var(--warning))",
        description:
          "Llamadas respondidas por contestador o buzón. No deben leerse como contacto efectivo.",
      },
      {
        name: "No contesta",
        value: pct(noContesta, totalOperativo),
        count: noContesta,
        detail: "NOANSWER",
        color: "hsl(var(--primary))",
        description:
          "Llamadas sin respuesta del cliente. Ayuda a revisar horario, prefijo y estrategia de reintentos.",
      },
      {
        name: "Ocupado / rechazo",
        value: pct(ocupadoRechazo, totalOperativo),
        count: ocupadoRechazo,
        detail: "BUSY + REJECTED",
        color: "hsl(0 78% 58%)",
        description:
          "Registros con línea ocupada o llamada rechazada. Conviene controlar intensidad de reintento.",
      },
      {
        name: "Inválidos",
        value: pct(invalido, totalOperativo),
        count: invalido,
        detail: "UNALLOCATED",
        color: "hsl(0 78% 58%)",
        description:
          "Números no asignados o inválidos. Son candidatos fuertes a depuración.",
      },
      {
        name: "Otros técnicos",
        value: pct(otrosTecnicos, totalOperativo),
        count: otrosTecnicos,
        detail: "QUEUED / RINGING / vacíos",
        color: "hsl(var(--muted-foreground))",
        description:
          "Estados técnicos o ambiguos que no conviene mezclar con contacto efectivo ni con no contacto directo.",
      },
    ];
  }

  /**
   * Fallback seguro:
   * Si el backend todavía no devuelve estadoOperativoDistribucion,
   * mantenemos la lógica actual para no romper la pantalla.
   */
  if (!hasEstadoOperativo) {
    const total = data.totalRecords || 0;

    const contactoEfectivoPct = data.pctAnswer || 0;
    const noContactoPct = data.pctNoAnswer || 0;
    const otrosTecnicosPct = Math.max(
      100 - contactoEfectivoPct - noContactoPct,
      0
    );

    const contactoEfectivoCantidad = pctToCount(total, contactoEfectivoPct);
    const noContactoCantidad = pctToCount(total, noContactoPct);
    const otrosTecnicosCantidad = Math.max(
      total - contactoEfectivoCantidad - noContactoCantidad,
      0
    );

    metrics = [
      {
        name: "Contacto efectivo",
        value: contactoEfectivoPct,
        count: contactoEfectivoCantidad,
        detail: "ANSWER + AGENT",
        color: "hsl(var(--success))",
        description:
          "Llamadas donde hubo contacto real con agente. No incluye buzón ni estados técnicos.",
      },
      {
        name: "No contacto / buzón",
        value: noContactoPct,
        count: noContactoCantidad,
        detail: "NOANSWER + BUZÓN + RECHAZO",
        color: "hsl(var(--primary))",
        description:
          "Agrupa registros improductivos. Para mayor precisión, conviene habilitar la distribución operativa por estado.",
      },
      {
        name: "Otros técnicos",
        value: otrosTecnicosPct,
        count: otrosTecnicosCantidad,
        detail: "QUEUED / RINGING / otros",
        color: "hsl(var(--warning))",
        description:
          "Incluye estados técnicos o ambiguos como QUEUED, RINGING, ANSWER sin subestado u otros no clasificados.",
      },
    ];
  }

  return (
    <div className="glass-card p-5 animate-slide-up hover-elevate">
      <div className="mb-4 flex flex-col gap-1">
        <h3 className="flex items-center gap-2 text-sm font-display font-semibold">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
          Tasas operativas por registro
        </h3>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Lectura clara de los estados del archivo. Separa contacto real,
          buzón, no respuesta y eventos técnicos para evitar interpretar ANSWER
          como contacto útil cuando no corresponde.
        </p>
      </div>

      <div
        className={
          hasEstadoOperativo
            ? "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
            : "grid grid-cols-1 gap-4 sm:grid-cols-3"
        }
      >
        {metrics.map((metric) => (
          <div
            key={metric.name}
            title={metric.description}
            className="soft-cyan-hover rounded-xl border border-border bg-secondary/30 p-3 text-center"
          >
            <div className="relative mx-auto h-[140px]">
              <Ring value={metric.value} color={metric.color} />

              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span
                  className="text-xl font-display font-extrabold tabular-nums"
                  style={{ color: metric.color }}
                >
                  {formatPercentage(metric.value)}%
                </span>
              </div>
            </div>

            <span className="mt-1 block text-xs font-semibold text-foreground">
              {metric.name}
            </span>

            <span className="mt-1 block text-[11px] text-muted-foreground">
              {formatCount(metric.count)} registros
            </span>

            <span className="mt-1 block text-[10px] uppercase tracking-wide text-muted-foreground/80">
              {metric.detail}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-border/70 bg-secondary/20">
        <div className="border-b border-border/70 px-4 py-3">
          <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Detalle operativo de estados
          </h4>
        </div>

        <div className="divide-y divide-border/60">
          {metrics.map((metric) => (
            <div
              key={`detail-${metric.name}`}
              className="grid grid-cols-1 gap-2 px-4 py-3 text-sm sm:grid-cols-[1.4fr_0.8fr_0.8fr_1.2fr]"
            >
              <div>
                <p className="font-semibold text-foreground">{metric.name}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {metric.description}
                </p>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Registros
                </p>
                <p className="mt-1 font-semibold tabular-nums text-foreground">
                  {formatCount(metric.count)}
                </p>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Peso
                </p>
                <p className="mt-1 font-semibold tabular-nums text-foreground">
                  {formatPercentage(metric.value)}%
                </p>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Criterio técnico
                </p>
                <p className="mt-1 text-xs font-medium text-muted-foreground">
                  {metric.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">Criterio:</span>{" "}
          el estado ANSWER no se toma como contacto por sí solo. Solo se
          considera contacto efectivo cuando el registro es{" "}
          <span className="font-semibold text-foreground">ANSWER + AGENT</span>.
          Esto evita mezclar conversaciones reales con buzones, contestadores o
          eventos técnicos.
        </p>
      </div>
    </div>
  );
};

export default EffectivenessRadial;