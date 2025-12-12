import { Database } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container max-w-7xl mx-auto flex h-16 items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight" data-testid="text-app-title">
              DEPURADOR DE BASES
            </h1>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Subí archivos de Neotel (CSV / TXT / XLS / XLSX) y filtrá como en Excel
            </p>
          </div>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
