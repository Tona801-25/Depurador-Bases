import { useMemo } from "react";
import type { AnalysisResult } from "@shared/schema";
import { extractPrefijoArgentina } from "@shared/prefijos";
import { cn } from "@/lib/utils";

interface PrefijoHeatmapProps {
  data: AnalysisResult;
}

interface HeatmapCell {
  prefijo: string;
  hora: number;
  total: number;
  contactos: number;
  pctContacto: number;
  intensidad: number;
}

function parseDateValue(value?: unknown): Date | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    if (value > 20000) {
      const ms = (value - 25569) * 86400 * 1000;
      const date = new Date(ms);

      return Number.isNaN(date.getTime()) ? null : date;
    }

    return null;
  }

  const text = String(value).trim();

  if (!text) return null;

  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text);

    if (Number.isFinite(serial) && serial > 20000) {
      const ms = (serial - 25569) * 86400 * 1000;
      const date = new Date(ms);

      return Number.isNaN(date.getTime()) ? null : date;
    }
  }

  const isoDate = new Date(text);

  if (!Number.isNaN(isoDate.getTime())) return isoDate;

  const [datePart, timePart] = text.split(" ");

  if (!datePart) return null;

  const separator = datePart.includes("-")
    ? "-"
    : datePart.includes("/")
      ? "/"
      : null;

  if (!separator) return null;

  const [dayText, monthText, yearText] = datePart.split(separator);

  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);

  let hour = 0;
  let minute = 0;
  let second = 0;

  if (timePart) {
    const timeParts = timePart.split(":").map(Number);

    hour = timeParts[0] ?? 0;
    minute = timeParts[1] ?? 0;
    second = timeParts[2] ?? 0;
  }

  if (![day, month, year, hour, minute, second].every(Number.isFinite)) {
    return null;
  }

  const date = new Date(year, month - 1, day, hour, minute, second);

  return Number.isNaN(date.getTime()) ? null : date;
}

function isContactoEfectivo(record: AnalysisResult["rawRecords"][number]) {
  const estado = String(record.estado || "").toUpperCase().trim();
  const subestado = String(record.subestado || "").toUpperCase().trim();

  return estado === "ANSWER" && subestado.includes("AGENT");
}

function cellColor(intensidad: number, total: number) {
  if (total === 0) {
    return "hsl(var(--secondary) / 0.35)";
  }

  const alpha = 0.18 + intensidad * 0.78;

  return `hsl(var(--primary) / ${alpha.toFixed(2)})`;
}

function cellTextColor(intensidad: number) {
  return intensidad > 0.62
    ? "text-primary-foreground"
    : "text-muted-foreground";
}

const PrefijoHeatmap = ({ data }: PrefijoHeatmapProps) => {
  const { prefijos, horas, matrix } = useMemo(() => {
    const raw = data.rawRecords ?? [];

    const prefijoTotals = new Map<string, number>();
    const hoursSet = new Set<number>();

    const cellMap = new Map<
      string,
      {
        total: number;
        contactos: number;
      }
    >();

    for (const record of raw) {
      const date = parseDateValue(record.fecha);

      if (!date) continue;

      const hora = date.getHours();
      const prefijo = extractPrefijoArgentina(record.ani);
      const key = `${prefijo}-${hora}`;

      hoursSet.add(hora);
      prefijoTotals.set(prefijo, (prefijoTotals.get(prefijo) || 0) + 1);

      const current = cellMap.get(key) || {
        total: 0,
        contactos: 0,
      };

      current.total += 1;

      if (isContactoEfectivo(record)) {
        current.contactos += 1;
      }

      cellMap.set(key, current);
    }

    const topPrefijos = Array.from(prefijoTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([prefijo]) => prefijo);

    const observedHours = Array.from(hoursSet).sort((a, b) => a - b);

    const baseMatrix = topPrefijos.map((prefijo) =>
      observedHours.map((hora) => {
        const current = cellMap.get(`${prefijo}-${hora}`) || {
          total: 0,
          contactos: 0,
        };

        const pctContacto =
          current.total > 0 ? (current.contactos / current.total) * 100 : 0;

        return {
          prefijo,
          hora,
          total: current.total,
          contactos: current.contactos,
          pctContacto,
        };
      })
    );

    const flatCells = baseMatrix.flat();

    const maxPct = Math.max(...flatCells.map((cell) => cell.pctContacto), 0);
    const minPct = Math.min(
      ...flatCells
        .filter((cell) => cell.total > 0)
        .map((cell) => cell.pctContacto),
      0
    );
    const maxTotal = Math.max(...flatCells.map((cell) => cell.total), 0);

    const heatmapMatrix: HeatmapCell[][] = baseMatrix.map((row) =>
      row.map((cell) => {
        const pctRange = Math.max(maxPct - minPct, 1);

        const pctScore =
          cell.total > 0 ? (cell.pctContacto - minPct) / pctRange : 0;

        const volumeScore =
          maxTotal > 0 ? Math.min(cell.total / maxTotal, 1) : 0;

        const intensidad =
          cell.total > 0
            ? Math.max(0.12, Math.min(1, pctScore * 0.75 + volumeScore * 0.25))
            : 0;

        return {
          ...cell,
          intensidad,
        };
      })
    );

    return {
      prefijos: topPrefijos,
      horas: observedHours,
      matrix: heatmapMatrix,
    };
  }, [data.rawRecords]);

  if (prefijos.length === 0 || horas.length === 0) {
    return (
      <div className="glass-card p-5 animate-slide-up hover-elevate">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-display font-semibold">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
          Mapa de calor · contactación por prefijo y hora
        </h3>

        <p className="py-8 text-center text-sm text-muted-foreground">
          No hay datos suficientes para construir el mapa de calor.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card p-5 animate-slide-up hover-elevate">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-display font-semibold">
        <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
        Mapa de calor · contactación por prefijo y hora
      </h3>

      <p className="mb-4 text-xs text-muted-foreground">
        Intensidad real según contacto efectivo y volumen de gestión por prefijo
        y hora.
      </p>

      <div className="overflow-x-auto rounded-xl border border-border/60 bg-background/20 p-3">
        <div
          className="min-w-[760px] space-y-1.5"
          style={{
            display: "grid",
            gridTemplateColumns: `56px repeat(${horas.length}, minmax(52px, 1fr))`,
            gap: "6px",
          }}
        >
          <div />

          {horas.map((hora) => (
            <div
              key={hora}
              className="text-center text-[10px] font-medium tabular-nums text-muted-foreground"
            >
              {String(hora).padStart(2, "0")}
            </div>
          ))}

          {matrix.map((row, rowIndex) => (
            <>
              <div
                key={`${prefijos[rowIndex]}-label`}
                className="flex h-8 items-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground tabular-nums"
              >
                {prefijos[rowIndex]}
              </div>

              {row.map((cell) => (
                <div
                  key={`${cell.prefijo}-${cell.hora}`}
                  className={cn(
                    "group relative flex h-8 items-center justify-center rounded-lg border border-glass-border/60 transition-all duration-200",
                    "hover:z-20 hover:scale-110 hover:border-primary/70 hover:shadow-[0_0_18px_hsl(var(--primary)/0.35)]",
                    cellTextColor(cell.intensidad)
                  )}
                  style={{
                    backgroundColor: cellColor(cell.intensidad, cell.total),
                  }}
                >
                  {cell.total > 0 && (
                    <span className="text-[10px] font-semibold tabular-nums opacity-80">
                      {cell.pctContacto.toFixed(0)}%
                    </span>
                  )}

                  <span className="pointer-events-none absolute -top-14 left-1/2 z-30 min-w-max -translate-x-1/2 whitespace-nowrap rounded-lg border border-primary/40 bg-popover px-2 py-1 text-[10px] text-popover-foreground opacity-0 shadow-lg transition group-hover:opacity-100">
                    Pref. {cell.prefijo} ·{" "}
                    {String(cell.hora).padStart(2, "0")}h
                    <br />
                    {cell.pctContacto.toFixed(1)}% contacto ·{" "}
                    {cell.contactos.toLocaleString("es-AR")}/
                    {cell.total.toLocaleString("es-AR")} registros
                  </span>
                </div>
              ))}
            </>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <span className="text-[10px] text-muted-foreground">Bajo</span>

        <div className="flex h-2 w-36 overflow-hidden rounded-full border border-border/60">
          {Array.from({ length: 12 }).map((_, index) => (
            <div
              key={index}
              className="flex-1"
              style={{
                backgroundColor: cellColor((index + 1) / 12, 1),
              }}
            />
          ))}
        </div>

        <span className="text-[10px] text-muted-foreground">Alto</span>
      </div>
    </div>
  );
};

export default PrefijoHeatmap;
