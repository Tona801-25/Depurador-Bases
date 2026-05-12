import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import type { AnalysisResult } from "@shared/schema";
import { cn } from "@/lib/utils";

interface FilterChipsProps {
  data: AnalysisResult;
}

interface ChipDef {
  id: string;
  label: string;
  count?: number;
  group: "tag" | "prefijo" | "turno";
}

const groupLabel: Record<ChipDef["group"], string> = {
  tag: "Estado / TAG",
  prefijo: "Prefijo",
  turno: "Turno",
};

const groupColor: Record<ChipDef["group"], string> = {
  tag: "from-primary/30 to-primary/10 border-primary/40",
  prefijo:
    "from-[hsl(185,80%,50%)]/30 to-[hsl(185,80%,50%)]/10 border-[hsl(185,80%,50%)]/40",
  turno:
    "from-[hsl(38,92%,50%)]/30 to-[hsl(38,92%,50%)]/10 border-[hsl(38,92%,50%)]/40",
};

const fmt = (n: number) => n.toLocaleString("es-AR");

function formatTagLabel(tag: string) {
  return tag
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const FilterChips = ({ data }: FilterChipsProps) => {
  const [active, setActive] = useState<Set<string>>(new Set());

  const chips = useMemo<ChipDef[]>(() => {
    const tagChips: ChipDef[] = Object.entries(data.tagDistribucion ?? {})
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({
        id: `tag-${tag}`,
        label: formatTagLabel(tag),
        count,
        group: "tag",
      }));

    const prefijoChips: ChipDef[] = [...(data.prefijoDistribucion ?? [])]
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)
      .map((item) => ({
        id: `prefijo-${item.prefijo}`,
        label: `Pref. ${item.prefijo}`,
        count: item.total,
        group: "prefijo",
      }));

    const turnoChips: ChipDef[] = Object.entries(data.turnoDistribucion ?? {})
      .sort((a, b) => b[1].total - a[1].total)
      .map(([turno, values]) => ({
        id: `turno-${turno}`,
        label: turno,
        count: values.total,
        group: "turno",
      }));

    return [...tagChips, ...prefijoChips, ...turnoChips];
  }, [data]);

  const toggle = (id: string) =>
    setActive((prev) => {
      const next = new Set(prev);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });

  const clear = () => setActive(new Set());

  const groups: ChipDef["group"][] = ["tag", "prefijo", "turno"];

  if (chips.length === 0) return null;

  return (
    <div className="glass-card p-4 animate-slide-up hover-elevate">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />

          <div>
            <h3 className="text-sm font-display font-semibold">
              Filtros rápidos de lectura
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Segmentos reales detectados en el archivo cargado.
            </p>
          </div>

          {active.size > 0 && (
            <span className="animate-scale-in rounded-full border border-primary/30 bg-primary/20 px-2 py-0.5 text-[10px] tabular-nums text-primary">
              {active.size} activo{active.size > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {active.size > 0 && (
          <button
            type="button"
            onClick={clear}
            className="flex items-center gap-1 text-[11px] text-muted-foreground transition hover:text-foreground"
          >
            <X className="h-3 w-3" />
            Limpiar
          </button>
        )}
      </div>

      <div className="space-y-3">
        {groups.map((group) => {
          const groupChips = chips.filter((chip) => chip.group === group);

          if (groupChips.length === 0) return null;

          return (
            <div key={group}>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {groupLabel[group]}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {groupChips.map((chip) => {
                  const isActive = active.has(chip.id);

                  return (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => toggle(chip.id)}
                      className={cn(
                        "group relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all duration-200",
                        "hover:scale-105 active:scale-95",
                        isActive
                          ? `bg-gradient-to-r ${groupColor[chip.group]} text-foreground shadow-[0_0_12px_hsl(var(--glow-primary))]`
                          : "border-glass-border bg-secondary/50 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-3 w-3 items-center justify-center rounded-full transition-all",
                          isActive
                            ? "scale-100 bg-primary text-primary-foreground"
                            : "scale-0"
                        )}
                      >
                        <Check className="h-2 w-2" strokeWidth={3} />
                      </span>

                      <span>{chip.label}</span>

                      {chip.count !== undefined && (
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums transition-colors",
                            isActive
                              ? "bg-background/60 text-foreground"
                              : "bg-background/40 text-muted-foreground group-hover:bg-background/60"
                          )}
                        >
                          {fmt(chip.count)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FilterChips;