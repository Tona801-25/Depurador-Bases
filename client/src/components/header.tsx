import { Database, History, Menu } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

type HeaderProps = {
  onMenuClick?: () => void;
  onHistoryClick?: () => void;
  historyCount?: number;
};

export function Header({ onMenuClick, onHistoryClick, historyCount = 0 }: HeaderProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 h-[64px] border-b border-primary/20 bg-background/95 shadow-[0_8px_24px_rgba(0,0,0,0.08)] backdrop-blur-xl dark:bg-[#05090b]/95">
      <div className="flex h-full w-full items-center justify-between px-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-none border border-primary/25 bg-transparent text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            aria-label="Menu principal"
            title="Menu principal"
            onClick={onMenuClick}
          >
            <Menu className="h-4.5 w-4.5" />
          </button>

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary shadow-[0_0_18px_rgba(0,229,255,0.14)] dark:bg-primary dark:text-primary-foreground">
            <Database className="h-5 w-5" />
          </div>

          <div className="min-w-0 leading-none">
            <h1
              className="truncate font-display text-[16px] font-extrabold uppercase tracking-tight text-foreground"
              data-testid="text-app-title"
            >
              Depurador de Bases
            </h1>
            <p className="mt-1 truncate text-[11px] font-medium text-muted-foreground">
              Protocolo de Limpieza v4.2 · Neotel
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {onHistoryClick ? (
            <button
              type="button"
              className="hidden h-9 items-center gap-2 rounded-md border border-primary/20 bg-background/70 px-3 text-sm font-bold text-foreground transition-colors hover:border-primary/45 hover:bg-primary/10 hover:text-primary sm:inline-flex"
              onClick={onHistoryClick}
              title="Abrir historial de tickets"
            >
              <History className="h-4 w-4 text-primary" />
              <span>Historial</span>
              <span className="text-muted-foreground">({historyCount.toLocaleString("es-AR")})</span>
            </button>
          ) : null}
          <span className="hidden items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-primary sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Sistema operativo
          </span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
