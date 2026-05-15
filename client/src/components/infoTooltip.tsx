import { Info } from "lucide-react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

interface InfoTooltipProps {
  text: string;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

const InfoTooltip = ({ text, side = "right", className }: InfoTooltipProps) => {
  return (
    <TooltipPrimitive.Provider delayDuration={120}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <button
            type="button"
            onClick={(event) => event.stopPropagation()}
            className={[
              "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
              "border border-primary/40 bg-background/80 text-primary",
              "transition-all duration-200",
              "hover:border-primary hover:bg-primary/15 hover:text-primary",
              "focus:outline-none focus:ring-2 focus:ring-primary/40",
              className,
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label="Ver información"
          >
            <Info className="h-3 w-3" />
          </button>
        </TooltipPrimitive.Trigger>

        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={10}
            collisionPadding={18}
            avoidCollisions
            className="
              z-[999999]
              max-w-[340px]
              rounded-xl
              border border-primary/40
              bg-[#10151d]
              px-3 py-2
              text-xs
              font-medium
              leading-relaxed
              text-white
              shadow-[0_16px_45px_-12px_hsl(var(--primary)/0.75)]
              backdrop-blur-md
              animate-in
              fade-in-0
              zoom-in-95
              data-[state=closed]:animate-out
              data-[state=closed]:fade-out-0
              data-[state=closed]:zoom-out-95
              data-[side=bottom]:slide-in-from-top-2
              data-[side=left]:slide-in-from-right-2
              data-[side=right]:slide-in-from-left-2
              data-[side=top]:slide-in-from-bottom-2
            "
          >
            {text}

            <TooltipPrimitive.Arrow className="fill-[#10151d]" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
};

export default InfoTooltip;