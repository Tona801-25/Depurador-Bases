import { cn } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  type LucideIcon,
} from "lucide-react";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: {
    value: number;
    label?: string;
    positive?: boolean;
  };
  variant?: "default" | "success" | "warning" | "danger";
  className?: string;
  testId?: string;
}

export function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = "default",
  className,
  testId,
}: KPICardProps) {
  const getTrendDirection = () => {
    if (!trend) return 0;

    if (typeof trend.positive === "boolean") {
      if (trend.value === 0) return 0;
      return trend.positive ? 1 : -1;
    }

    if (trend.value > 0) return 1;
    if (trend.value < 0) return -1;
    return 0;
  };

  const getTrendIcon = () => {
    const direction = getTrendDirection();

    if (direction > 0) return <TrendingUp className="h-3 w-3" />;
    if (direction < 0) return <TrendingDown className="h-3 w-3" />;
    return <Minus className="h-3 w-3" />;
  };

  const getTrendColor = () => {
    const direction = getTrendDirection();

    if (direction > 0) return "text-success";
    if (direction < 0) return "text-destructive";
    return "text-muted-foreground";
  };

  const getAccentColor = () => {
    switch (variant) {
      case "success":
        return "border-l-success";
      case "warning":
        return "border-l-warning";
      case "danger":
        return "border-l-destructive";
      default:
        return "border-l-primary";
    }
  };

  const getValueColor = () => {
    switch (variant) {
      case "success":
        return "text-success";
      case "warning":
        return "text-warning";
      case "danger":
        return "text-destructive";
      default:
        return "text-foreground";
    }
  };

  return (
    <div
      className={cn(
        "glass-card p-4 border-l-[3px] animate-slide-up",
        getAccentColor(),
        className
      )}
      data-testid={testId}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="stat-label">{title}</p>

          <div className="flex flex-wrap items-baseline gap-2">
            <p className={cn("stat-value", getValueColor())}>
              {typeof value === "number" ? value.toLocaleString("es-AR") : value}
            </p>

            {subtitle && (
              <span className="text-sm font-medium text-muted-foreground">
                {subtitle}
              </span>
            )}
          </div>

          {trend && (
            <div
              className={cn(
                "flex items-center gap-1 text-xs font-medium",
                getTrendColor()
              )}
            >
              {getTrendIcon()}

              <span>
                {getTrendDirection() > 0 ? "+" : ""}
                {trend.value.toFixed(1)}%
              </span>

              {trend.label && (
                <span className="text-muted-foreground">{trend.label}</span>
              )}
            </div>
          )}
        </div>

        {Icon && (
          <div className="shrink-0 rounded-lg border border-border bg-muted p-2 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}