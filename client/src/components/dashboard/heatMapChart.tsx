import { useMemo } from "react";

const days = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const hours = Array.from({ length: 12 }, (_, i) => i + 8); // 08–19

// Mock: matriz [día][hora] con intensidad 0–100
const seed = (d: number, h: number) => {
  const peak = h >= 10 && h <= 12 ? 1.4 : h >= 15 && h <= 17 ? 1.6 : 1;
  const dayBoost = d >= 1 && d <= 3 ? 1.2 : d === 5 ? 0.5 : 1;
  const noise = ((d * 31 + h * 17) % 23) / 23;
  return Math.min(100, Math.round(20 + 70 * peak * dayBoost * noise));
};

const HeatmapChart = () => {
  const matrix = useMemo(
    () => days.map((_, d) => hours.map((h) => seed(d, h))),
    []
  );

  const cellColor = (v: number) => {
    // 0-100 → opacidad sobre primary
    const a = 0.08 + (v / 100) * 0.85;
    return `hsl(var(--primary) / ${a.toFixed(2)})`;
  };

  return (
    <div className="glass-card p-5 animate-slide-up">
      <h3 className="text-sm font-display font-semibold mb-1 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
        Mapa de calor · contactación por hora y día
      </h3>
      <p className="text-xs text-muted-foreground mb-4">
        Intensidad relativa (más oscuro = más contactos efectivos)
      </p>

      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* header de horas */}
          <div className="flex items-center gap-1 pl-10 mb-1">
            {hours.map((h) => (
              <div
                key={h}
                className="flex-1 min-w-[28px] text-center text-[10px] tabular-nums text-muted-foreground"
              >
                {String(h).padStart(2, "0")}
              </div>
            ))}
          </div>

          {/* filas */}
          {matrix.map((row, d) => (
            <div key={d} className="flex items-center gap-1 mb-1">
              <div className="w-10 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {days[d]}
              </div>
              {row.map((v, h) => (
                <div
                  key={h}
                  className="flex-1 min-w-[28px] h-7 rounded-md border border-glass-border/50 transition-all hover:scale-110 hover:ring-2 hover:ring-primary/40 cursor-pointer relative group"
                  style={{ backgroundColor: cellColor(v) }}
                >
                  <span className="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-popover text-[10px] tabular-nums text-popover-foreground border border-glass-border opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-10 shadow-lg">
                    {days[d]} {String(hours[h]).padStart(2, "0")}h · {v}
                  </span>
                </div>
              ))}
            </div>
          ))}

          {/* leyenda */}
          <div className="flex items-center justify-end gap-2 mt-3">
            <span className="text-[10px] text-muted-foreground">Bajo</span>
            <div className="flex h-2 w-32 rounded-full overflow-hidden">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1"
                  style={{ backgroundColor: cellColor(((i + 1) / 10) * 100) }}
                />
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground">Alto</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeatmapChart;
