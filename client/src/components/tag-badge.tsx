import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { TagType } from "@shared/schema";

interface TagBadgeProps {
  tag: TagType;
  className?: string;
}

const tagConfig: Record<TagType, { label: string; className: string }> = {
  CONTACTADO: {
    label: "Contactado",
    className: "bg-success/10 text-success border-success/20",
  },
  INVALIDO: {
    label: "Inválido",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  SEGUIR_INTENTANDO: {
    label: "Seguir Intentando",
    className: "bg-primary/10 text-primary border-primary/20",
  },
  SOLO_BUZON: {
    label: "Solo Buzón",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  NO_ATIENDE: {
    label: "No Atiende",
    className: "bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20",
  },
  RECHAZA: {
    label: "Rechaza",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
};

export function TagBadge({ tag, className }: TagBadgeProps) {
  const config = tagConfig[tag] || {
    label: tag,
    className: "bg-muted text-muted-foreground",
  };
  return (
    <Badge
      variant="outline"
      className={cn("font-display font-semibold text-[10px] border tracking-wide", config.className, className)}
    >
      {config.label}
    </Badge>
  );
};

export function getTagColor(tag: TagType): string {
  const colors: Record<TagType, string> = {
    CONTACTADO: "hsl(var(--success))",
    INVALIDO: "hsl(var(--destructive))",
    SEGUIR_INTENTANDO: "hsl(var(--primary))",
    SOLO_BUZON: "hsl(var(--warning))",
    NO_ATIENDE: "hsl(var(--muted-foreground))",
    RECHAZA: "hsl(var(--chart-5))",
  };
  return colors[tag] || "hsl(var(--muted-foreground))";
}