import { Database } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted">
            <Database className="h-5 w-5 text-primary" />
          </div>

          <div className="min-w-0">
            <h1
              className="truncate text-lg font-display font-extrabold tracking-tight gradient-text"
              data-testid="text-app-title"
            >
              Depurador de Bases
            </h1>

            <p className="hidden truncate text-xs text-muted-foreground sm:block">
              Subí archivos de Neotel (CSV / TXT / XLS / XLSX) y filtrá como en Excel
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}