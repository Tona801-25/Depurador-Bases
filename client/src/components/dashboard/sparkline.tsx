import { Area, AreaChart, ResponsiveContainer } from "recharts";

interface SparklineProps {
  data?: number[];
  color?: string;
  gradientId?: string;
  height?: number;
  className?: string;
}

const Sparkline = ({
  data = [],
  color = "hsl(var(--primary))",
  gradientId = "sparkline-gradient",
  height = 36,
  className,
}: SparklineProps) => {
  if (!Array.isArray(data) || data.length === 0) return null;

  const chartData = data.map((value, index) => ({
    index,
    value,
  }));

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart
          data={chartData}
          margin={{ top: 2, right: 0, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.5} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>

          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.75}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default Sparkline;