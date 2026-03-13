import { Database } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header() {
  return (
<<<<<<< HEAD
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
=======
    <header className="w-full border-b border-white/8 bg-black">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-500/15 bg-cyan-500/10">
            <Database className="h-5 w-5 text-cyan-400" />
          </div>

          <div className="leading-tight">
            <h1 className="text-[1.95rem] font-semibold tracking-tight text-cyan-400">
>>>>>>> 14997a7 (Intentando mejorar interfaz)
              Depurador de Bases
            </h1>
            <p className="text-[0.95rem] text-slate-400">
              Subí archivos de Neotel (CSV / TXT / XLS / XLSX) y filtrá como en Excel
            </p>
          </div>
        </div>
<<<<<<< HEAD
        {/* Derecha: toggle */}
        <div className="flex items-center justify-end">
          <ThemeToggle />
        </div>
=======

        <ThemeToggle />
>>>>>>> 14997a7 (Intentando mejorar interfaz)
      </div>
    </header>
  );
}