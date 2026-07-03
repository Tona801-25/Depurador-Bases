import { Database } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header() {
  return (
    <header className="sticky top-0 z-50 h-12 border-b border-primary/20 bg-background/95 backdrop-blur-xl">
      <div className="flex h-full w-full items-center justify-between px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10">
            <Database className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 leading-none">
            <h1 className="truncate text-xs font-extrabold uppercase text-foreground" data-testid="text-app-title">
              Depurador de Bases
            </h1>
            <p className="mt-1 truncate text-[10px] text-muted-foreground">
              Propósito de limpieza v4.2 · Neotel
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-1.5 text-[10px] font-bold uppercase text-primary sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Sistema operativo
          </span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}