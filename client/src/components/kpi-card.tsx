import { cn } from "@/lib/utils";
<<<<<<< HEAD
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
=======
import { Card, CardContent } from "@/components/ui/card";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  LucideIcon,
} from "lucide-react";
>>>>>>> 14997a7 (Intentando mejorar interfaz)

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    label?: string;
  };
  icon?: LucideIcon;
  variant?: "default" | "success" | "warning" | "danger";
  className?: string;
  testId?: string;
}

export function KPICard({
  title,
  value,
  subtitle,
  trend,
  icon: Icon,
  variant = "default",
  className,
  testId,
}: KPICardProps) {
  const getTrendIcon = () => {
    if (!trend) return null;
    if (trend.value > 0) return <TrendingUp className="h-3.5 w-3.5" />;
    if (trend.value < 0) return <TrendingDown className="h-3.5 w-3.5" />;
    return <Minus className="h-3.5 w-3.5" />;
  };
  
  const getTrendColor = () => {
    if (!trend) return "";
<<<<<<< HEAD
    if (trend.value > 0) return "text-success";
    if (trend.value < 0) return "text-destructive";
    return "text-muted-foreground";
=======
    if (trend.value > 0) return "text-emerald-400";
    if (trend.value < 0) return "text-rose-400";
    return "text-slate-400";
>>>>>>> 14997a7 (Intentando mejorar interfaz)
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
<<<<<<< HEAD
        return "text-success";
      case "warning":
        return "text-warning";
      case "danger":
        return "text-destructive";
      default:
        return "text-foreground";
=======
        return "text-white";
      case "warning":
        return "text-white";
      case "danger":
        return "text-white";
      default:
        return "text-white";
>>>>>>> 14997a7 (Intentando mejorar interfaz)
    }
  };

  return (
<<<<<<< HEAD
    <div
      className={cn(
        "glass-card p-4 border-l-[3px] animate-slide-up",
        getAccentColor(),
        className
      )}
      data-testid={testId}
    >
      <div className="space-y-1.5">
        <p className="stat-label">{title}</p>
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className={cn("stat-value", getValueColor())}>
            {typeof value === "number" ? value.toLocaleString("es-AR") : value}
          </p>
          {subtitle && (
            <span className="text-sm font-medium text-muted-foreground">{subtitle}</span>
=======
    <Card className={cn("h-full", className)} data-testid={testId}>
      <CardContent className="p-4">
        <div className="mb-5 flex items-start justify-between gap-3">
          <p className="text-[0.76rem] font-medium uppercase tracking-[0.18em] text-slate-400">
            {title}
          </p>

          {Icon && (
            <div className="flex h-7 w-7 items-center justify-center text-cyan-400">
              <Icon className="h-4 w-4" />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className={cn("text-[2.05rem] font-semibold leading-none tracking-tight", getValueColor())}>
            {typeof value === "number" ? value.toLocaleString("es-AR") : value}
          </p>

          {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}

          {trend && (
            <div className={cn("flex items-center gap-1.5 text-sm font-medium", getTrendColor())}>
              {getTrendIcon()}
              <span>
                {trend.value > 0 ? "+" : ""}
                {trend.value.toFixed(1)}%
              </span>
              {trend.label && <span className="font-normal text-slate-400">{trend.label}</span>}
            </div>
>>>>>>> 14997a7 (Intentando mejorar interfaz)
          )}
        </div>
        {trend && (
          <div className={cn("flex items-center gap-1 text-xs font-medium", getTrendColor())}>
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
    </div>
  );
}