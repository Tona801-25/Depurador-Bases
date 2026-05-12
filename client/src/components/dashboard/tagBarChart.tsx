import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { chartTooltipStyle } from "./chartStyles";

const data = [
  { name: "CONTACTADO", value: 75000, color: "hsl(185, 80%, 50%)" },
  { name: "CAIDO/INEFECTIVO", value: 45000, color: "hsl(152, 60%, 45%)" },
  { name: "NO ATENDIÓ", value: 12000, color: "hsl(38, 92%, 50%)" },
  { name: "SOLO BUZÓN", value: 8000, color: "hsl(185, 60%, 40%)" },
  { name: "RECHAZADA", value: 3000, color: "hsl(0, 72%, 51%)" },
];

const TagBarChart = () => (
  <div className="glass-card p-5 animate-slide-up">
    <h3 className="text-sm font-display font-semibold mb-4 flex items-center gap-2">
      <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
      ANIs por TAG de depuración
    </h3>
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
        <XAxis type="number" tick={{ fill: "currentColor", fontSize: 11 }} axisLine={false} tickLine={false} className="text-muted-foreground" />
        <YAxis type="category" dataKey="name" tick={{ fill: "currentColor", fontSize: 10 }} axisLine={false} tickLine={false} width={110} className="text-muted-foreground" />
        <Tooltip contentStyle={chartTooltipStyle} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18}>
          {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>
);

export default TagBarChart;
