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
    className: "bg-green-500/10 text-green-500 border-green-500/20",
  },
  INVALIDO: {
    label: "Inválido",
    className: "bg-red-500/10 text-red-500 border-red-500/20",
  },
  SEGUIR_INTENTANDO: {
    label: "Seguir Intentando",
    className: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  },
  SOLO_BUZON: {
    label: "Solo Buzón",
    className: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  },
  NO_ATIENDE: {
    label: "No Atiende",
    className: "bg-gray-500/10 text-gray-500 border-gray-500/20",
  },
  RECHAZA: {
    label: "Rechaza",
    className: "bg-pink-500/10 text-pink-500 border-pink-500/20",
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
      className={cn("font-medium border", config.className, className)}
    >
      {config.label}
    </Badge>
  );
}

export function getTagColor(tag: TagType): string {
  const colors: Record<TagType, string> = {
    CONTACTADO: "hsl(145, 65%, 42%)",
    INVALIDO: "hsl(0, 72%, 51%)",
    SEGUIR_INTENTANDO: "hsl(207, 90%, 54%)",
    SOLO_BUZON: "hsl(45, 93%, 47%)",
    NO_ATIENDE: "hsl(210, 10%, 55%)",
    RECHAZA: "hsl(340, 75%, 55%)",
  };
  return colors[tag] || "hsl(210, 10%, 55%)";
}
