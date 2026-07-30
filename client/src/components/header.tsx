import { useCallback, useEffect, useState } from "react";
import { Database, History, Menu } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type HeaderProps = {
  onMenuClick?: () => void;
  onHistoryClick?: () => void;
  historyCount?: number;
};

type SystemState = "checking" | "operational" | "degraded" | "offline";

type SystemMonitor = {
  state: SystemState;
  backend: string;
  sqlite: string;
  neotel: string;
  checkedAt: string;
};

const SYSTEM_STATE_VIEW: Record<
  SystemState,
  { label: string; textClass: string; dotClass: string }
> = {
  checking: {
    label: "Verificando conexión",
    textClass: "text-primary",
    dotClass: "bg-primary animate-pulse",
  },
  operational: {
    label: "Sistema operativo",
    textClass: "text-success",
    dotClass: "bg-success",
  },
  degraded: {
    label: "Sistema degradado",
    textClass: "text-warning",
    dotClass: "bg-warning",
  },
  offline: {
    label: "Sin conexión",
    textClass: "text-destructive",
    dotClass: "bg-destructive",
  },
};

const INITIAL_SYSTEM_MONITOR: SystemMonitor = {
  state: "checking",
  backend: "Verificando...",
  sqlite: "Verificando...",
  neotel: "Verificando...",
  checkedAt: "",
};

export function Header({ onMenuClick, onHistoryClick, historyCount = 0 }: HeaderProps) {
  const [systemMonitor, setSystemMonitor] = useState<SystemMonitor>(
    INITIAL_SYSTEM_MONITOR,
  );

  const checkSystem = useCallback(async (showChecking = false) => {
    if (showChecking) {
      setSystemMonitor((current) => ({
        ...current,
        state: "checking",
      }));
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 6_000);
    const checkedAt = new Date().toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    try {
      const statusResponse = await fetch("/api/system/status", {
        cache: "no-store",
        signal: controller.signal,
      });

      if (!statusResponse.ok) {
        throw new Error(`Backend HTTP ${statusResponse.status}`);
      }

      const payload = await statusResponse.json();
      const sqliteOk = Boolean(payload?.sqlite?.ok);
      const ftpError = String(payload?.neotel?.lastError ?? "").trim();
      const ftpConfigured = Boolean(payload?.neotel?.configured);
      const ftpRunning = Boolean(payload?.neotel?.running);
      const neotelOk = Boolean(payload?.neotel?.ok);

      setSystemMonitor({
        state: sqliteOk && neotelOk ? "operational" : "degraded",
        backend: "Disponible",
        sqlite: sqliteOk
          ? "Disponible"
          : `Error: ${String(payload?.sqlite?.detail ?? "No responde")}`,
        neotel: !ftpConfigured
          ? "FTP sin configurar"
          : ftpError
            ? `Error FTP: ${ftpError}`
            : ftpRunning
              ? "Sincronizando ahora"
              : "FTP disponible",
        checkedAt,
      });
    } catch {
      setSystemMonitor({
        state: "offline",
        backend: "No responde",
        sqlite: "Sin verificar",
        neotel: "Sin verificar",
        checkedAt,
      });
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    void checkSystem(true);
    const timer = window.setInterval(() => {
      void checkSystem();
    }, 30_000);
    const handleOnline = () => void checkSystem(true);
    const handleFocus = () => void checkSystem();

    window.addEventListener("online", handleOnline);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", handleFocus);
    };
  }, [checkSystem]);

  const systemView = SYSTEM_STATE_VIEW[systemMonitor.state];

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
              title="Abrir historial operativo de las últimas 48 horas"
            >
              <History className="h-4 w-4 text-primary" />
              <span>Historial</span>
              <span className="text-muted-foreground">({historyCount.toLocaleString("es-AR")})</span>
            </button>
          ) : null}
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "hidden items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition-opacity hover:opacity-75 sm:flex",
                    systemView.textClass,
                  )}
                  onClick={() => void checkSystem(true)}
                  aria-label={`${systemView.label}. Comprobar nuevamente`}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      systemView.dotClass,
                    )}
                  />
                  {systemView.label}
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                align="end"
                className="w-80 border-primary/25 p-3 text-xs"
              >
                <p className="font-bold uppercase tracking-[0.12em] text-foreground">
                  Estado de servicios
                </p>
                <div className="mt-2 space-y-1.5 text-muted-foreground">
                  <p>
                    <strong className="text-foreground">Backend:</strong>{" "}
                    {systemMonitor.backend}
                  </p>
                  <p>
                    <strong className="text-foreground">SQLite:</strong>{" "}
                    {systemMonitor.sqlite}
                  </p>
                  <p className="break-words">
                    <strong className="text-foreground">Neotel:</strong>{" "}
                    {systemMonitor.neotel}
                  </p>
                </div>
                <p className="mt-2 border-t border-border pt-2 text-[10px] text-muted-foreground">
                  {systemMonitor.checkedAt
                    ? `Última comprobación: ${systemMonitor.checkedAt}`
                    : "Comprobando servicios..."}{" "}
                  · Hacé clic para actualizar.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
