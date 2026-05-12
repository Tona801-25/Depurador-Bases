import { FunnelChart, Funnel, LabelList, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { chartTooltipStyle } from "./chartStyles";

const data = [
  { name: "ANIs Totales", value: 71984, fill: "hsl(var(--primary))" },
  { name: "Llamados", value: 58420, fill: "hsl(185, 75%, 45%)" },
  { name: "Contactados", value: 9254, fill: "hsl(var(--success))" },
  { name: "Efectivos", value: 4348, fill: "hsl(152, 65%, 38%)" },
];

const fmt = (n: number) => n.toLocaleString("es-AR");

const DepuracionFunnel = () => (
  <div className="glass-card p-5 animate-slide-up">
    <h3 className="text-sm font-display font-semibold mb-1 flex items-center gap-2">
      <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
      Embudo de depuración
    </h3>
    <p className="text-xs text-muted-foreground mb-4">
      Recorrido del ANI desde la base original hasta el contacto efectivo
    </p>

    <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-4 items-center">
      <ResponsiveContainer width="100%" height={260}>
        <FunnelChart>
          <Tooltip
            contentStyle={chartTooltipStyle}
            formatter={(v: number) => [fmt(v), "ANIs"]}
          />
          <Funnel dataKey="value" data={data} isAnimationActive animationDuration={900}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.fill} stroke="hsl(var(--background))" strokeWidth={2} />
            ))}
            <LabelList
              position="right"
              dataKey="name"
              className="fill-foreground"
              fontSize={11}
            />
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>

      {/* Tasas de conversión */}
      <div className="space-y-2">
        {data.map((d, i) => {
          const prev = i === 0 ? d.value : data[i - 1].value;
          const pct = i === 0 ? 100 : (d.value / prev) * 100;
          return (
            <div key={d.name} className="rounded-lg bg-secondary/40 p-2">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: d.fill }} />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  {d.name}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-display font-bold tabular-nums">{fmt(d.value)}</span>
                {i > 0 && (
                  <span className="text-[10px] tabular-nums text-success font-semibold">
                    {pct.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

export default DepuracionFunnel;
