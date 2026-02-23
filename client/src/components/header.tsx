import { Database } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-7xl mx-auto flex h-16 items-center justify-between px-6">
        {/* Izquierda: ícono + título + subtítulo */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Database className="h-5 w-5 text-primary" />
          </div>

          <div className="min-w-0">
            <h1
              className="text-lg font-bold tracking-tight truncate"
              data-testid="text-app-title"
            >
              DEPURADOR DE BASES
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