import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { chartTooltipStyle } from "./chartStyles";

const data = [
  { intentos: "1", cantidad: 38000, color: "hsl(185, 80%, 50%)" },
  { intentos: "2", cantidad: 12000, color: "hsl(185, 70%, 45%)" },
  { intentos: "3", cantidad: 5500, color: "hsl(185, 60%, 40%)" },
  { intentos: "4", cantidad: 2800, color: "hsl(185, 50%, 35%)" },
  { intentos: "5", cantidad: 1200, color: "hsl(185, 40%, 30%)" },
  { intentos: "6", cantidad: 400, color: "hsl(185, 30%, 25%)" },
  { intentos: "7", cantidad: 100, color: "hsl(185, 20%, 20%)" },
];

const AttemptsPerANIChart = () => (
  <div className="glass-card p-5 animate-slide-up">
    <h3 className="text-sm font-display font-semibold mb-1 flex items-center gap-2">
      <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
      Distribución de intentos totales por ANI
    </h3>
    <p className="text-xs text-muted-foreground mb-4">Cantidad de ANIs</p>
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 10 }}>
        <XAxis dataKey="intentos" tick={{ fill: "currentColor", fontSize: 11 }} axisLine={false} tickLine={false} className="text-muted-foreground" />
        <YAxis tick={{ fill: "currentColor", fontSize: 11 }} axisLine={false} tickLine={false} className="text-muted-foreground" />
        <Tooltip contentStyle={chartTooltipStyle} />
        <Bar dataKey="cantidad" radius={[4, 4, 0, 0]} barSize={40}>
          {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>
);

export default AttemptsPerANIChart;
