import { Info } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface InfoTooltipProps {
  text: string;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

const InfoTooltip = ({ text, side = "top", className }: InfoTooltipProps) => {
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(event) => event.stopPropagation()}
            className={[
              "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
              "border border-border/80 bg-background/70 text-muted-foreground",
              "transition-all duration-200",
              "hover:border-primary/70 hover:bg-primary/15 hover:text-primary",
              "focus:outline-none focus:ring-2 focus:ring-primary/40",
              className,
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label="Ver información"
          >
            <Info className="h-3 w-3" />
          </button>
        </TooltipTrigger>

        <TooltipContent
          side={side}
          sideOffset={8}
          avoidCollisions
          collisionPadding={16}
          className="
            z-[99999]
            max-w-[300px]
            rounded-xl
            border border-primary/30
            bg-popover/95
            px-3 py-2
            text-xs leading-relaxed
            text-popover-foreground
            shadow-[0_12px_40px_-10px_hsl(var(--primary)/0.55)]
            backdrop-blur-md
          "
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default InfoTooltip;