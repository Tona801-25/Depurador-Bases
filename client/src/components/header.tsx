import { Database } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container max-w-7xl mx-auto grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-4 px-6">
        {/* Izquierda vacía para balancear */}
        <div aria-hidden="true" />

        {/* Centro: ícono + título */}
        <div className="flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            {/* 👇 fuerza el color del ícono */}
            <Database className="h-5 w-5 text-primary-foreground" />
          </div>

          <div className="text-center">
            <h1 className="text-lg font-bold tracking-tight" data-testid="text-app-title">
              DEPURADOR DE BASES
            </h1>
            <p className="hidden text-xs text-muted-foreground sm:block">
              Subí archivos de Neotel (CSV / TXT / XLS / XLSX) y filtrá como en Excel
            </p>
          </div>
        </div>

        {/* Derecha: toggle */}
        <div className="flex justify-end">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}