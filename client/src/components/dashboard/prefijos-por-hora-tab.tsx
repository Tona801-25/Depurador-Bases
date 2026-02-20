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

  const extractPrefijo = (ani: string) => {
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
  };

  const prefijoPorHoraMap: Record<number, Record<string, number>> = {};

  for (const r of raw) {
    const d = parseAnyDate(r.fecha as any);
    if (!d) continue;

    const hour = d.getHours();
    const prefijo = extractPrefijo(r.ani);

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