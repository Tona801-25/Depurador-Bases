import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/data-table";
import type { AnalysisResult } from "@shared/schema";

interface PrefijosPorHoraTabProps {
  data: AnalysisResult;
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

// Misma lógica que backend, compacta
function extractPrefijoClient(ani: string): string {
  const digits = (ani || "").replace(/\D/g, "");
  if (digits.startsWith("54")) {
    const rest = digits.slice(2);
    if (rest.startsWith("9")) {
      const afterNine = rest.slice(1);
      if (afterNine.startsWith("11")) return "11";
      for (const len of [4, 3, 2]) if (afterNine.length >= len) return afterNine.slice(0, len);
    }
    if (rest.startsWith("11")) return "11";
    for (const len of [4, 3, 2]) if (rest.length >= len) return rest.slice(0, len);
  }
  if (digits.startsWith("11")) return "11";
  for (const len of [4, 3, 2]) if (digits.length >= len) return digits.slice(0, len);
  return digits.slice(0, 2) || "00";
}

export function PrefijosPorHoraTab({ data }: PrefijosPorHoraTabProps) {

  console.log("prefijoPorHora:", data.prefijoPorHora);
  console.log("rawRecords sample:", data.rawRecords?.[0]); 

  const tableData = useMemo(() => {
    // 1) Si el backend ya lo manda, usamos eso
    const server = data.prefijoPorHora ?? [];
    if (server.length > 0) {
      return server.map((item) => ({
        ...item,
        rango: `${item.hora.toString().padStart(2, "0")}:00 - ${item.hora
          .toString()
          .padStart(2, "0")}:59`,
      }));
    }

    // 2) Fallback: lo calculamos desde rawRecords
    const prefijoPorHoraMap: Record<number, Record<string, number>> = {};
    const raw = data.rawRecords ?? [];

    for (const r of raw) {
      const d = parseTicketDateClient(r.fecha);
      if (!d) continue;

      const hour = d.getHours();
      const prefijo = extractPrefijoClient(r.ani || "");

      if (!prefijoPorHoraMap[hour]) prefijoPorHoraMap[hour] = {};
      prefijoPorHoraMap[hour][prefijo] = (prefijoPorHoraMap[hour][prefijo] || 0) + 1;
    }

    const computed = Object.entries(prefijoPorHoraMap)
      .map(([hora, counts]) => {
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        return {
          hora: Number(hora),
          prefijo: top?.[0] ?? "",
          total: top?.[1] ?? 0,
        };
      })
      .sort((a, b) => a.hora - b.hora);

    return computed.map((item) => ({
      ...item,
      rango: `${item.hora.toString().padStart(2, "0")}:00 - ${item.hora
        .toString()
        .padStart(2, "0")}:59`,
    }));
  }, [data.prefijoPorHora, data.rawRecords]);

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
        <h2 className="text-xl font-semibold flex items-center justify-center gap-2">
          Prefijo predominante por hora
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Detectá en qué horario domina cada prefijo para ajustar tu estrategia.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">Resumen por hora</CardTitle>
        </CardHeader>
        <CardContent>
          {tableData.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay datos horarios disponibles para mostrar.
            </p>
          ) : (
            <DataTable
              data={tableData}
              columns={columns}
              searchable={false}
              pageSize={12}
              testId="table-prefijos-por-hora"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}