import { useMemo } from "react";
import type { AnalysisResult } from "@shared/schema";

interface PrefijosTreemapProps {
  data: AnalysisResult;
}

interface TreemapItem {
  prefijo: string;
  total: number;
  pct: number;
  color: string;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--chart-5))",
  "hsl(var(--destructive))",
  "hsl(185 60% 42%)",
  "hsl(215 18% 58%)",
];

const PrefijosTreemap = ({ data }: PrefijosTreemapProps) => {
  const items = useMemo<TreemapItem[]>(() => {
    const prefijos = [...(data.prefijoDistribucion ?? [])]
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    const total = prefijos.reduce((acc, item) => acc + item.total, 0);

    if (total === 0) return [];

    return prefijos.map((item, index) => ({
      prefijo: item.prefijo,
      total: item.total,
      pct: (item.total / total) * 100,
      color: COLORS[index % COLORS.length],
    }));
  }, [data.prefijoDistribucion]);

  if (items.length === 0) {
    return (
      <div className="glass-card p-5 animate-slide-up hover-elevate">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-display font-semibold">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
          Treemap de prefijos
        </h3>

        <p className="py-8 text-center text-sm text-muted-foreground">
          No hay datos de prefijos suficientes para construir el treemap.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card p-5 animate-slide-up hover-elevate">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-display font-semibold">
        <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
        Treemap de prefijos
      </h3>

      <p className="mb-4 text-xs text-muted-foreground">
        Volumen relativo de ANIs por prefijo.
      </p>

      <div className="flex h-[300px] overflow-hidden rounded-xl border border-glass-border bg-background/30">
        {items.map((item) => (
          <div
            key={item.prefijo}
            className="group relative flex min-w-[70px] flex-col justify-between border-r border-background/50 p-3 transition-all hover:brightness-110"
            style={{
              flex: item.pct,
              backgroundColor: item.color,
            }}
          >
            <div>
              <p className="text-sm font-display font-extrabold text-background">
                {item.prefijo}
              </p>

              <p className="text-xs font-bold text-background/80">
                {item.total.toLocaleString("es-AR")}
              </p>
            </div>

            <p className="text-xs font-semibold text-background/80">
              {item.pct.toFixed(1)}%
            </p>

            <span className="pointer-events-none absolute left-3 top-12 z-20 rounded-lg border border-background/20 bg-card px-2 py-1 text-xs text-card-foreground opacity-0 shadow-xl transition group-hover:opacity-100">
              Prefijo {item.prefijo}
              <br />
              {item.total.toLocaleString("es-AR")} ANIs ·{" "}
              {item.pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PrefijosTreemap;