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
  const numericValue =
    typeof value === "number"
      ? value
      : Number(String(value).replace(",", "."));

  const isZeroValue =
    Number.isFinite(numericValue) && numericValue === 0;

  const isLongTextValue =
    typeof value === "string" && value.length > 14;

  const visualVariant =
    variant === "danger" && isZeroValue ? "default" : variant;

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

    if (direction > 0) return <TrendingUp className="h-3.5 w-3.5" />;
    if (direction < 0) return <TrendingDown className="h-3.5 w-3.5" />;
    return <Minus className="h-3.5 w-3.5" />;
  };

  const getVariantStyles = () => {
    switch (visualVariant) {
      case "success":
        return {
          card: "border-success/25 bg-success/5 shadow-success/5",
          accent: "from-success/30 via-success/10 to-transparent",
          icon: "border-success/25 bg-success/10 text-success",
          value: "text-success",
          trend: "text-success",
        };

      case "warning":
        return {
          card: "border-warning/25 bg-warning/5 shadow-warning/5",
          accent: "from-warning/30 via-warning/10 to-transparent",
          icon: "border-warning/25 bg-warning/10 text-warning",
          value: "text-warning",
          trend: "text-warning",
        };

      case "danger":
        return {
          card: "border-destructive/25 bg-destructive/5 shadow-destructive/5",
          accent: "from-destructive/30 via-destructive/10 to-transparent",
          icon: "border-destructive/25 bg-destructive/10 text-destructive",
          value: "text-destructive",
          trend: "text-destructive",
        };

      default:
        return {
          card: "border-border bg-card/80 shadow-black/5",
          accent: "from-border via-border/40 to-transparent",
          icon: "border-border bg-muted/50 text-muted-foreground",
          value: "text-foreground",
          trend: "text-muted-foreground",
        };
    }
  };

  const getTrendColor = () => {
    const direction = getTrendDirection();

    if (direction === 0) return "text-muted-foreground";

    if (visualVariant === "danger") {
      return direction > 0 ? "text-destructive" : "text-success";
    }

    return getVariantStyles().trend;
  };

  const styles = getVariantStyles();

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border p-4 shadow-sm transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-md",
        "bg-gradient-to-br from-card via-card to-muted/20",
        styles.card,
        className
      )}
      data-testid={testId}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r",
          styles.accent
        )}
      />

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {title}
          </p>

          <div className="mt-3 flex flex-wrap items-end gap-x-2 gap-y-1">
            <p
              className={cn(
                "font-extrabold tracking-tight",
                isLongTextValue
                  ? "break-words text-2xl leading-tight"
                  : "text-2xl leading-none md:text-3xl",
                styles.value
              )}
            >
              {typeof value === "number"
                ? value.toLocaleString("es-AR")
                : value}
            </p>

            {subtitle && (
              <span className="pb-0.5 text-xs font-medium text-muted-foreground">
                {subtitle}
              </span>
            )}
          </div>

          {variant === "danger" && isZeroValue && (
            <p className="mt-2 text-xs font-medium text-muted-foreground">
              Sin bases para descartar
            </p>
          )}

          {trend && (
            <div
              className={cn(
                "mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs font-semibold",
                getTrendColor()
              )}
            >
              {getTrendIcon()}

              <span>
                {getTrendDirection() > 0 ? "+" : ""}
                {trend.value.toFixed(1)}%
              </span>

              {trend.label && (
                <span className="font-medium text-muted-foreground">
                  {trend.label}
                </span>
              )}
            </div>
          )}
        </div>

        {Icon && (
          <div
            className={cn(
              "shrink-0 rounded-xl border p-2.5 shadow-sm transition-transform duration-200 group-hover:scale-105",
              styles.icon
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}