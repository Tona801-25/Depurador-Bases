import { Database } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full bg-background/70 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/50">
      {/* Borde inferior con gradiente */}
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        {/* Izquierda: ícono + título */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
            {/* halo pulsante */}
            <span className="absolute inset-0 rounded-xl bg-primary/20 blur-md animate-pulse-glow" />
            <Database className="relative h-5 w-5 text-primary" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1
                className="truncate text-lg font-display font-extrabold tracking-tight gradient-text"
                data-testid="text-app-title"
              >
                Depurador de Bases
              </h1>
            </div>
              <p className="text-sm text-muted-foreground">
                Analizá, depurá y priorizá bases de llamadas para operar con mejor calidad.
              </p>
          </div>
        </div>

        {/* Derecha */}
        <div className="flex items-center justify-end">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}