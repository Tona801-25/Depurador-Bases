import { cn } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  type LucideIcon,
} from "lucide-react";
import Sparkline from "@/components/dashboard/sparkline";
import InfoTooltip from "@/components/infoTooltip";
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
  index?: number;
  info?: string;
  infoSide?: "top" | "right" | "bottom" | "left";
  sparklineData?: number[];
  sparklineColor?: string;
}

export function KPICard({
  title,
  value,
  subtitle,
  info,
  infoSide = "top",
  icon: Icon,
  trend,
  variant = "default",
  className,
  testId,
  index = 0,
  sparklineData,
  sparklineColor,
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

  const trendDirection = getTrendDirection();

  const TrendIcon =
    trendDirection > 0
      ? TrendingUp
      : trendDirection < 0
        ? TrendingDown
        : Minus;

  const styles = {
    default: {
      card: "border-border/70",
      icon: "bg-primary/10 text-primary",
      glow: "from-primary/10",
      sparkline: "hsl(var(--primary))",
    },
    success: {
      card: "border-success/25",
      icon: "bg-success/10 text-success",
      glow: "from-success/10",
      sparkline: "hsl(var(--success))",
    },
    warning: {
      card: "border-warning/25",
      icon: "bg-warning/10 text-warning",
      glow: "from-warning/10",
      sparkline: "hsl(var(--warning))",
    },
    danger: {
      card: "border-destructive/25",
      icon: "bg-destructive/10 text-destructive",
      glow: "from-destructive/10",
      sparkline: "hsl(var(--destructive))",
    },
  }[variant];

  const shouldShowSparkline =
    Array.isArray(sparklineData) && sparklineData.length > 1;

  return (
    <div
      className={cn(
        "soft-cyan-hover group relative overflow-hidden rounded-2xl border p-4 shadow-sm",
        "bg-gradient-to-br from-card via-card to-muted/20",
        "transition-all duration-200",
        styles.card,
        className
      )}
      style={{ animationDelay: `${index * 70}ms` }}
      data-testid={testId}
    >
      <div
        className={cn(
          "pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-radial blur-2xl",
          styles.glow
        )}
      />

      {shouldShowSparkline && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 opacity-35 transition-opacity duration-300 group-hover:opacity-55">
          <Sparkline
            data={sparklineData}
            color={sparklineColor || styles.sparkline}
            gradientId={`sparkline-${String(title)
              .toLowerCase()
              .replace(/[^a-z0-9]+/gi, "-")}-${index}`}
            height={42}
          />
        </div>
      )}

      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-1.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {title}
            </p>

            {info && <InfoTooltip text={info} side={infoSide} />}
          </div>

          <div className="flex items-baseline gap-2">
            <h3 className="truncate text-2xl font-display font-extrabold tabular-nums text-foreground">
              {value}
            </h3>

            {trend && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
                  trendDirection > 0 &&
                    "bg-success/10 text-success",
                  trendDirection < 0 &&
                    "bg-destructive/10 text-destructive",
                  trendDirection === 0 &&
                    "bg-muted text-muted-foreground"
                )}
              >
                <TrendIcon className="h-3 w-3" />
                {Math.abs(trend.value)}%
              </span>
            )}
          </div>

          {(subtitle || trend?.label) && (
            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
              {subtitle || trend?.label}
            </p>
          )}
        </div>

        {Icon && (
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/5 shadow-sm",
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