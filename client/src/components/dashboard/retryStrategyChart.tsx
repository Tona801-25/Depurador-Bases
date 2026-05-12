import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell, LabelList } from "recharts";
import { chartTooltipStyle } from "./chartStyles";

const data = [
  { intento: "1", valor: 5804, color: "hsl(185, 80%, 50%)" },
  { intento: "2", valor: 2160, color: "hsl(185, 70%, 45%)" },
  { intento: "3", valor: 807, color: "hsl(185, 60%, 40%)" },
  { intento: "4", valor: 322, color: "hsl(185, 50%, 35%)" },
  { intento: "5", valor: 131, color: "hsl(185, 40%, 30%)" },
  { intento: "6", valor: 30, color: "hsl(185, 30%, 25%)" },
];

const RetryStrategyChart = () => (
  <div className="glass-card p-5 animate-slide-up">
    <h3 className="text-sm font-display font-semibold mb-1 flex items-center gap-2">
      <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
      Estrategia de reintentos
    </h3>
    <p className="text-xs text-muted-foreground mb-4">Intento del primer ANSWER-AGENT</p>
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 20 }}>
        <XAxis dataKey="intento" tick={{ fill: "currentColor", fontSize: 11 }} axisLine={false} tickLine={false} className="text-muted-foreground" />
        <YAxis tick={{ fill: "currentColor", fontSize: 11 }} axisLine={false} tickLine={false} className="text-muted-foreground" />
        <Tooltip contentStyle={chartTooltipStyle} />
        <Bar dataKey="valor" radius={[4, 4, 0, 0]} barSize={40}>
          {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          <LabelList dataKey="valor" position="top" className="fill-foreground" fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>
);

export default RetryStrategyChart;
