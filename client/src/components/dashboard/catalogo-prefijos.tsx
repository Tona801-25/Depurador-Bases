import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/data-table";
import { BookOpen } from "lucide-react";
import type { PrefijoCatalogo } from "@shared/schema";
import { ARGENTINA_PREFIJOS_CATALOGO } from "@shared/prefijos";

interface CatalogoPrefijosProps {
  prefijos: PrefijoCatalogo[];
}

export function CatalogoPrefijosTab({ prefijos }: CatalogoPrefijosProps) {
  const data = prefijos.length > 0 ? prefijos : ARGENTINA_PREFIJOS_CATALOGO;

  const columns: Column<PrefijoCatalogo>[] = [
    { key: "prefijo", header: "Prefijo", sortable: true },
    { key: "areaLocal", header: "Area local", sortable: true },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="section-title">
          <BookOpen className="h-5 w-5 text-warning" />
          Catalogo de prefijos interurbanos
        </h2>
        <p className="section-subtitle">
          Referencia de prefijos telefonicos de Argentina usados para clasificar ANIs.
        </p>
      </div>

      <Card className="glass-card border-glass-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display font-bold flex items-center gap-2">
            <span className="dot-indicator bg-primary" />
            Prefijos registrados
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Total: {data.length} prefijos
          </p>
        </CardHeader>
        <CardContent>
          <DataTable
            data={data}
            columns={columns}
            searchPlaceholder="Buscar por prefijo o area..."
            searchKeys={["prefijo", "areaLocal"]}
            pageSize={15}
            testId="table-catalogo-prefijos"
          />
        </CardContent>
      </Card>
    </div>
  );
}
