import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    label?: string;
  };
  variant?: "default" | "success" | "warning" | "danger";
  className?: string;
  testId?: string;
}

export function KPICard({
  title,
  value,
  subtitle,
  trend,
  variant = "default",
  className,
  testId,
}: KPICardProps) {
  const getTrendIcon = () => {
    if (!trend) return null;
    if (trend.value > 0) return <TrendingUp className="h-3 w-3" />;
    if (trend.value < 0) return <TrendingDown className="h-3 w-3" />;
    return <Minus className="h-3 w-3" />;
  };

  const getTrendColor = () => {
    if (!trend) return "";
    if (trend.value > 0) return "text-green-500";
    if (trend.value < 0) return "text-red-500";
    return "text-muted-foreground";
  };

  const getValueColor = () => {
    switch (variant) {
      case "success":
        return "text-green-500";
      case "warning":
        return "text-yellow-500";
      case "danger":
        return "text-red-500";
      default:
        return "";
    }
  };

  return (
    <Card className={cn("", className)} data-testid={testId}>
      <CardContent className="p-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            {title}
          </p>
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className={cn("text-2xl font-bold", getValueColor())}>
              {typeof value === "number" ? value.toLocaleString("es-AR") : value}
            </p>
            {subtitle && (
              <span className="text-sm text-muted-foreground">{subtitle}</span>
            )}
          </div>
          {trend && (
            <div className={cn("flex items-center gap-1 text-xs", getTrendColor())}>
              {getTrendIcon()}
              <span>
                {trend.value > 0 ? "+" : ""}
                {trend.value.toFixed(1)}%
              </span>
              {trend.label && (
                <span className="text-muted-foreground">{trend.label}</span>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
