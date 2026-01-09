import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/data-table";
import type { AnalysisResult } from "@shared/schema";

interface PrefijosPorHoraTabProps {
  data: AnalysisResult;
}

export function PrefijosPorHoraTab({ data }: PrefijosPorHoraTabProps) {
  const tableData = useMemo(() => {
    return data.prefijoPorHora.map((item) => ({
      ...item,
      rango: `${item.hora.toString().padStart(2, "0")}:00 - ${item.hora
        .toString()
        .padStart(2, "0")}:59`,
    }));
  }, [data.prefijoPorHora]);

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