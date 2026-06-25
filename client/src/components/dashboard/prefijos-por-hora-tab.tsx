import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data-table";
import type { AnalysisResult } from "@shared/schema";
import { extractPrefijoArgentina } from "@shared/prefijos";
import HourlyAreaChart from "@/components/dashboard/hourlyAreaChart";
import PrefijoHeatmap from "@/components/dashboard/prefijosHeatmap";

interface PrefijosPorHoraTabProps {
  data: AnalysisResult;
}

function getStrategyLabel(strategy: string) {
  if (strategy === "PRIORIZAR_TARDE") return "Lote tarde";
  if (strategy === "PRIORIZAR_MANANA") return "Lote mañana";
  if (strategy === "MANTENER_MIXTO") return "Lote mixto";
  if (strategy === "AMPLIAR_PRUEBA_TARDE") return "Ampliar prueba";
  return "Muestra insuficiente";
}

function getStrategyClass(strategy: string) {
  if (strategy === "PRIORIZAR_TARDE") {
    return "border-success/30 bg-success/10 text-success";
  }

  if (strategy === "PRIORIZAR_MANANA") {
    return "border-primary/30 bg-primary/10 text-primary";
  }

  if (strategy === "MANTENER_MIXTO") {
    return "border-warning/30 bg-warning/10 text-warning";
  }

  return "border-border bg-muted/40 text-muted-foreground";
}

// Parser simple y robusto para: "DD-MM-YYYY HH:mm:ss" o "DD/MM/YYYY HH:mm:ss"
function parseTicketDateClient(dateStr?: string): Date | null {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (!s) return null;

  // YYYYMMDD
  if (/^\d{8}$/.test(s)) {
    const year = Number(s.slice(0, 4));
    const month = Number(s.slice(4, 6));
    const day = Number(s.slice(6, 8));
    const d = new Date(year, month - 1, day, 0, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // ISO (por si alguna vez llega bien)
  const isoTry = new Date(s);
  if (!Number.isNaN(isoTry.getTime())) return isoTry;

  const [datePart, timePart] = s.split(" ");
  if (!datePart) return null;

  const sep = datePart.includes("-") ? "-" : datePart.includes("/") ? "/" : null;
  if (!sep) return null;

  const [ddStr, mmStr, yyyyStr] = datePart.split(sep);
  const dd = Number(ddStr);
  const mm = Number(mmStr);
  const yyyy = Number(yyyyStr);

  let hh = 0,
    mi = 0,
    ss = 0;
  if (timePart) {
    const t = timePart.split(":").map(Number);
    hh = t[0] ?? 0;
    mi = t[1] ?? 0;
    ss = t[2] ?? 0;
  }

  if (![dd, mm, yyyy, hh, mi, ss].every(Number.isFinite)) return null;

  const d = new Date(yyyy, mm - 1, dd, hh, mi, ss);
  return Number.isNaN(d.getTime()) ? null : d;
}

  export function PrefijosPorHoraTab({ data }: PrefijosPorHoraTabProps) {

  const estrategia = data.estrategiaPrefijos;
  const prefijosConMuestra =
    estrategia?.items.filter((item) => item.estrategia !== "VALIDAR_MUESTRA") ??
    [];
  const prefijosTarde = prefijosConMuestra.filter(
    (item) => item.estrategia === "PRIORIZAR_TARDE"
  );

const tableData = useMemo(() => {
  const raw = data.rawRecords ?? [];
  if (raw.length === 0) return [];

  // Excel serial -> Date (UTC base)
  const excelSerialToDate = (serial: number) => {
    const ms = (serial - 25569) * 86400 * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  };

  // Parser robusto: number serial / string numérica / ISO / DD-MM-YYYY HH:mm:ss / DD/MM/YYYY HH:mm:ss
  const parseAnyDate = (v?: unknown): Date | null => {
    if (v === null || v === undefined) return null;

    if (typeof v === "number") {
      if (v > 20000) return excelSerialToDate(v);
      return null;
    }

    const s = String(v).trim();
    if (!s) return null;

    // string numérica serial
    if (/^\d+(\.\d+)?$/.test(s)) {
      const n = Number(s);
      if (Number.isFinite(n) && n > 20000) return excelSerialToDate(n);
    }

    // ISO
    const isoTry = new Date(s);
    if (!isNaN(isoTry.getTime())) return isoTry;

    // DD-MM-YYYY o DD/MM/YYYY + hora
    const [datePart, timePart] = s.split(" ");
    if (!datePart) return null;
    const sep = datePart.includes("-") ? "-" : datePart.includes("/") ? "/" : null;
    if (!sep) return null;

    const [ddStr, mmStr, yyyyStr] = datePart.split(sep);
    const dd = Number(ddStr);
    const mm = Number(mmStr);
    const yyyy = Number(yyyyStr);

    let hh = 0, mi = 0, ss = 0;
    if (timePart) {
      const t = timePart.split(":").map(Number);
      hh = t[0] ?? 0;
      mi = t[1] ?? 0;
      ss = t[2] ?? 0;
    }

    if (![dd, mm, yyyy, hh, mi, ss].every(Number.isFinite)) return null;

    const d = new Date(yyyy, mm - 1, dd, hh, mi, ss);
    return isNaN(d.getTime()) ? null : d;
  };

  const prefijoPorHoraMap: Record<number, Record<string, number>> = {};

  for (const r of raw) {
    const d = parseAnyDate(r.fecha as any);
    if (!d) continue;

    const hour = d.getHours();
    const prefijo = extractPrefijoArgentina(r.ani);

    if (!prefijoPorHoraMap[hour]) prefijoPorHoraMap[hour] = {};
    prefijoPorHoraMap[hour][prefijo] = (prefijoPorHoraMap[hour][prefijo] || 0) + 1;
  }

  const rows = Object.entries(prefijoPorHoraMap)
    .map(([hora, counts]) => {
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      const h = Number(hora);
      return {
        hora: h,
        rango: `${String(h).padStart(2, "0")}:00 - ${String(h).padStart(2, "0")}:59`,
        prefijo: top?.[0] ?? "",
        total: top?.[1] ?? 0,
      };
    })
    .sort((a, b) => a.hora - b.hora);

  return rows;
  }, [data.rawRecords]);

  const columns: Column<(typeof tableData)[0]>[] = [
  { key: "rango", header: "Horario", sortable: true },
  { key: "prefijo", header: "Prefijo predominante", sortable: true },
  {
    key: "total",
    header: "Cantidad",
    sortable: true,
    render: (item) => item.total.toLocaleString("es-AR"),
  },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="section-title">
          <span className="dot-indicator bg-primary" />
          Prefijo predominante por hora
        </h2>
        <p className="section-subtitle">
          Detectá en qué horario domina cada prefijo para ajustar tu estrategia.
        </p>
      </div>

      {estrategia && (
        <Card className="glass-card border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-display font-bold">
              Estrategia de lotes por prefijo
            </CardTitle>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Usa todos los ANIs del prefijo y compara contacto efectivo por turno.
              Solo recomienda un turno cuando existe muestra suficiente.
            </p>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-background/60 p-3">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                  Mañana
                </p>
                <p className="mt-1 text-xl font-bold text-foreground">
                  {estrategia.pctContactoMananaGlobal.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground">
                  contacto por ANI único
                </p>
              </div>

              <div className="rounded-lg border border-success/25 bg-success/5 p-3">
                <p className="text-[10px] font-semibold uppercase text-success">
                  Tarde desde {estrategia.horaInicioTarde}:00
                </p>
                <p className="mt-1 text-xl font-bold text-foreground">
                  {estrategia.pctContactoTardeGlobal.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground">
                  contacto por ANI único
                </p>
              </div>

              <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
                <p className="text-[10px] font-semibold uppercase text-primary">
                  Prefijos para lote tarde
                </p>
                <p className="mt-1 text-xl font-bold text-foreground">
                  {prefijosTarde.length.toLocaleString("es-AR")}
                </p>
                <p className="text-xs text-muted-foreground">
                  con ventaja confirmada
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background/50 p-3 text-sm leading-relaxed text-muted-foreground">
              {estrategia.recomendacionGeneral}
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Recomendación por prefijo
                </p>
                <p className="text-xs text-muted-foreground">
                  Mínimo: {estrategia.minimoAnisPrefijo} ANIs por prefijo y{" "}
                  {estrategia.minimoAnisTurno} por turno
                </p>
              </div>

              <div className="grid gap-2 lg:grid-cols-2">
                {prefijosConMuestra.slice(0, 12).map((item) => (
                  <div
                    key={item.prefijo}
                    className="rounded-lg border border-border/70 bg-background/60 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-foreground">
                          Prefijo {item.prefijo}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.totalAnis.toLocaleString("es-AR")} ANIs · Buzón sin
                          contacto {item.pctBuzonSinContacto.toFixed(1)}%
                        </p>
                      </div>

                      <Badge className={getStrategyClass(item.estrategia)}>
                        {getStrategyLabel(item.estrategia)}
                      </Badge>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Mañana</p>
                        <p className="font-semibold text-foreground">
                          {item.pctContactoManana.toFixed(1)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Tarde</p>
                        <p className="font-semibold text-foreground">
                          {item.pctContactoTarde.toFixed(1)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Diferencia</p>
                        <p
                          className={
                            item.diferenciaPp > 0
                              ? "font-semibold text-success"
                              : item.diferenciaPp < 0
                                ? "font-semibold text-warning"
                                : "font-semibold text-foreground"
                          }
                        >
                          {item.diferenciaPp > 0 ? "+" : ""}
                          {item.diferenciaPp.toFixed(1)} pp
                        </p>
                      </div>
                    </div>

                    <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                      {item.motivo}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <HourlyAreaChart data={data} />

      <Card className="glass-card border-glass-border">

      <PrefijoHeatmap data={data} />
      
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display font-bold">Resumen por hora</CardTitle>
        </CardHeader>
        <CardContent>
          {tableData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No hay datos horarios disponibles para mostrar.
            </p>
          ) : (
            <DataTable data={tableData} columns={columns} searchable={false} pageSize={12} testId="table-prefijos-por-hora" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
