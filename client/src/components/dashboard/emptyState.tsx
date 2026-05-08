import { FileSearch } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
}

const EmptyState = ({
  icon,
  title = "Sin datos para mostrar",
  description = "Cargá un archivo o ajustá los filtros para ver resultados aquí.",
  action,
}: EmptyStateProps) => (
  <div className="glass-card p-12 flex flex-col items-center justify-center text-center animate-slide-up">
    <div className="relative mb-4">
      <div className="absolute inset-0 rounded-full bg-primary/15 blur-2xl animate-pulse-glow" />
      <div className="relative h-14 w-14 rounded-full bg-secondary/70 border border-glass-border flex items-center justify-center text-primary">
        {icon ?? <FileSearch className="h-6 w-6" />}
      </div>
    </div>
    <h3 className="text-base font-display font-bold mb-1">{title}</h3>
    <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export default EmptyState;
