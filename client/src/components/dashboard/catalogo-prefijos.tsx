import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/data-table";
import { BookOpen } from "lucide-react";
import type { PrefijoCatalogo } from "@shared/schema";

interface CatalogoPrefijosProps {
  prefijos: PrefijoCatalogo[];
}

const defaultPrefijos: PrefijoCatalogo[] = [
  { prefijo: "11", areaLocal: "Buenos Aires / AMBA" },
  { prefijo: "221", areaLocal: "La Plata" },
  { prefijo: "223", areaLocal: "Mar del Plata" },
  { prefijo: "261", areaLocal: "Mendoza" },
  { prefijo: "264", areaLocal: "San Juan" },
  { prefijo: "266", areaLocal: "San Luis" },
  { prefijo: "299", areaLocal: "Neuquén" },
  { prefijo: "341", areaLocal: "Rosario" },
  { prefijo: "343", areaLocal: "Paraná" },
  { prefijo: "351", areaLocal: "Córdoba" },
  { prefijo: "353", areaLocal: "Villa María" },
  { prefijo: "358", areaLocal: "Río Cuarto" },
  { prefijo: "362", areaLocal: "Resistencia" },
  { prefijo: "370", areaLocal: "Formosa" },
  { prefijo: "376", areaLocal: "Posadas" },
  { prefijo: "379", areaLocal: "Corrientes" },
  { prefijo: "380", areaLocal: "La Rioja" },
  { prefijo: "381", areaLocal: "San Miguel de Tucumán" },
  { prefijo: "383", areaLocal: "Catamarca" },
  { prefijo: "385", areaLocal: "Santiago del Estero" },
  { prefijo: "387", areaLocal: "Salta" },
  { prefijo: "388", areaLocal: "San Salvador de Jujuy" },
  { prefijo: "2901", areaLocal: "Ushuaia" },
  { prefijo: "2902", areaLocal: "Río Gallegos" },
  { prefijo: "2920", areaLocal: "Viedma" },
  { prefijo: "2954", areaLocal: "Santa Rosa" },
  { prefijo: "2965", areaLocal: "Rawson / Trelew" },
  { prefijo: "2966", areaLocal: "Río Grande" },
];

export function CatalogoPrefijosTab({ prefijos }: CatalogoPrefijosProps) {
  const data = prefijos.length > 0 ? prefijos : defaultPrefijos;

  const columns: Column<PrefijoCatalogo>[] = [
    { key: "prefijo", header: "Prefijo", sortable: true },
    { key: "areaLocal", header: "Área Local", sortable: true },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold flex items-center justify-center gap-2">
          <BookOpen className="h-5 w-5 text-chart-3" />
          Catálogo de prefijos interurbanos
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Referencia de prefijos telefónicos de Argentina
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <span className="text-chart-1">*</span>
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
            searchPlaceholder="Buscar por prefijo o área..."
            searchKeys={["prefijo", "areaLocal"]}
            pageSize={15}
            testId="table-catalogo-prefijos"
          />
        </CardContent>
      </Card>
    </div>
  );
}
