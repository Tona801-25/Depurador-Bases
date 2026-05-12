import { useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2 } from "lucide-react";
import { toast } from "sonner";

export interface PresentationHandle {
  toggle: () => void;
}

const PresentationButton = forwardRef<PresentationHandle>((_, ref) => {
  const [active, setActive] = useState(false);

  const toggle = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().then(() => {
        setActive(true);
        document.body.classList.add("presentation-mode");
        toast.success("Modo presentación activado", {
          description: "Pulsá Esc o ⌘P para salir",
        });
      }).catch(() => toast.error("No se pudo activar fullscreen"));
    } else {
      document.exitFullscreen?.();
    }
  };

  useImperativeHandle(ref, () => ({ toggle }), []);

  useEffect(() => {
    const onChange = () => {
      const fs = !!document.fullscreenElement;
      setActive(fs);
      document.body.classList.toggle("presentation-mode", fs);
    };
    document.addEventListener("fullscreenchange", onChange);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "p" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className="h-9 w-9 rounded-xl bg-secondary/80 border border-glass-border hover:bg-secondary hover:border-primary/30 transition-all"
      title="Modo presentación (⌘P)"
    >
      {active ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
    </Button>
  );
});

PresentationButton.displayName = "PresentationButton";
export default PresentationButton;