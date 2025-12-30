import { ThemeToggle } from "@/components/theme-toggle";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container max-w-7xl mx-auto grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-4 px-6">
        {/* Izquierda vacía para balancear */}
        <div aria-hidden="true" />

        {/* Centro: logo + título */}
        <div className="flex items-center justify-center gap-3">
            <img
              src="/osar.png"
              alt="Logo de la empresa"
              className="h-6 w-6 rounded-[4px]"
              />
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
    </header>
  );
}