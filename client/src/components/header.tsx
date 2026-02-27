import { Database } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-glass-border bg-card/60 backdrop-blur-2xl supports-[backdrop-filter]:bg-card/40">
      <div className="max-w-7xl mx-auto flex h-16 items-center justify-between px-6">
        {/* Izquierda: ícono + título + subtítulo */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 ring-1 ring-primary/20">
            <Database className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1
              className="text-lg font-display font-extrabold tracking-tight truncate gradient-text"
              data-testid="text-app-title"
            >
              Depurador de Bases
            </h1>
            <p className="hidden text-xs text-muted-foreground sm:block truncate">
              Subí archivos de Neotel (CSV / TXT / XLS / XLSX) y filtrá como en Excel
            </p>
          </div>
        </div>
        {/* Derecha: toggle */}
        <div className="flex items-center justify-end">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}