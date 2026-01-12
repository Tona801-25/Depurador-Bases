import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { DataTable, type Column } from "@/components/data-table";
import type { AnalysisResult } from "@shared/schema";

interface TurnosPrefijosProps {
  data: AnalysisResult;
}

export function TurnosPrefijosTab({ data }: TurnosPrefijosProps) {
  const prefijoAnswerData = (
    data as AnalysisResult & {
      prefijoDistribucionAnswer?: { prefijo: string; total: number; pctSobreTotal: number }[];
    }
  ).prefijoDistribucionAnswer ?? [];
  const turnoChartData = useMemo(() => {
    return Object.entries(data.turnoDistribucion).map(([turno, stats]) => ({
      turno,
      Total: stats.total,
      Answer: stats.answer,
      "No Answer": stats.noAnswer,
      pctAnswer: stats.total > 0 ? ((stats.answer / stats.total) * 100).toFixed(1) : "0",
      pctNoAnswer: stats.total > 0 ? ((stats.noAnswer / stats.total) * 100).toFixed(1) : "0",
    }));
  }, [data]);

  const turnoColumns: Column<typeof turnoChartData[0]>[] = [
    { key: "turno", header: "Turno", sortable: true },
    { key: "Total", header: "Total", sortable: true },
    { key: "Answer", header: "Answer", sortable: true },
    { key: "No Answer", header: "No Answer", sortable: true },
    {
      key: "pctAnswer",
      header: "% Answer",
      sortable: true,
      render: (item) => `${item.pctAnswer}%`,
    },
    {
      key: "pctNoAnswer",
      header: "% No Answer",
      sortable: true,
      render: (item) => `${item.pctNoAnswer}%`,
    },
  ];

  const prefijoColumns: Column<(typeof prefijoAnswerData)[0]>[] = [
    { key: "prefijo", header: "Prefijo", sortable: true },
    {
      key: "total",
      header: "Total",
      sortable: true,
      render: (item) => item.total.toLocaleString("es-AR"),
    },
    {
      key: "pctSobreTotal",
      header: "% Sobre Total",
      sortable: true,
      render: (item) => `${item.pctSobreTotal.toFixed(2)}%`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold flex items-center justify-center gap-2">
          <span className="text-chart-2">*</span>
          Análisis por turnos y prefijos
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <span className="text-chart-1">*</span>
              Distribución por turno
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              data={turnoChartData}
              columns={turnoColumns}
              searchable={false}
              pageSize={5}
              testId="table-turnos"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <span className="text-chart-2">*</span>
              Contactabilidad por turno
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={turnoChartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis dataKey="turno" />
                  <YAxis />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "0.5rem",
                    }}
                  />
                  <Legend />
                  <Bar
                    dataKey="Answer"
                    fill="hsl(var(--chart-2))"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="No Answer"
                    fill="hsl(var(--chart-1))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <span className="text-chart-5">*</span>
            Análisis por prefijos (atendidos)
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Prefijos con mayor volumen de llamados atendidos (ANSWER)
          </p>
        </CardHeader>
        <CardContent>
          <DataTable
            data={prefijoAnswerData}
            columns={prefijoColumns}
            searchPlaceholder="Buscar prefijo..."
            pageSize={10}
            testId="table-prefijos"
          />
        </CardContent>
      </Card>
    </div>
  );
}