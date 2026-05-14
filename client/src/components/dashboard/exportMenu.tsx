import { useState } from "react";
import {
  Download,
  FileImage,
  FileText,
  FileSpreadsheet,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AnalysisResult } from "@shared/schema";

interface ExportMenuProps {
  data: AnalysisResult;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}

function timestamp() {
  const date = new Date();

  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}${String(date.getDate()).padStart(2, "0")}-${String(
    date.getHours()
  ).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}`;
}

function safeCsvValue(value: string | number | undefined | null) {
  const text = String(value ?? "");

  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function buildKpiRows(data: AnalysisResult) {
  return [
    {
      metrica: "ANIs totales",
      valor: data.totalAnis,
    },
    {
      metrica: "ANIs con contacto efectivo",
      valor: data.anisContactados,
    },
    {
      metrica: "ANIs con baja recontactabilidad",
      valor: data.anisADepurar,
    },
    {
      metrica: "% Contacto efectivo",
      valor: `${data.pctAnswer.toFixed(1)}%`,
    },
    {
      metrica: "% No contacto",
      valor: `${data.pctNoAnswer.toFixed(1)}%`,
    },
    {
      metrica: "Registros procesados",
      valor: data.totalRecords,
    },
  ];
}

function buildEstadoRows(data: AnalysisResult) {
  return Object.entries(data.estadoDistribucion ?? {}).map(
    ([estado, cantidad]) => ({
      seccion: "Estados",
      metrica: estado,
      valor: cantidad,
    })
  );
}

function buildTagRows(data: AnalysisResult) {
  return Object.entries(data.tagDistribucion ?? {}).map(([tag, cantidad]) => ({
    seccion: "Tags de depuración",
    metrica: tag,
    valor: cantidad,
  }));
}

function buildPrefijoRows(data: AnalysisResult) {
  return (data.prefijoDistribucion ?? []).map((item) => ({
    seccion: "Prefijos",
    metrica: item.prefijo,
    valor: item.total,
  }));
}

function buildTurnoRows(data: AnalysisResult) {
  return Object.entries(data.turnoDistribucion ?? {}).flatMap(
    ([turno, values]) => [
      {
        seccion: "Turnos",
        metrica: `${turno} - Total`,
        valor: values.total,
      },
      {
        seccion: "Turnos",
        metrica: `${turno} - Answer`,
        valor: values.answer,
      },
      {
        seccion: "Turnos",
        metrica: `${turno} - No Answer`,
        valor: values.noAnswer,
      },
    ]
  );
}

function buildBaseRows(data: AnalysisResult) {
  return (data.baseInsights ?? []).map((base) => ({
    seccion: "Ranking de bases",
    metrica: base.base,
    valor: `Registros: ${base.totalRegistros} | ANIs: ${
      base.totalAnis
    } | Contacto efectivo: ${(base.pctContactoEfectivo * 100).toFixed(
      1
    )}% | Score: ${base.scoreCalidad.toFixed(2)} | ${
      base.recomendacion
    } | Muestra: ${base.confiabilidadMuestra ?? "N/D"}`,
  }));
}

export default function ExportMenu({ data }: ExportMenuProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const exportCSV = () => {
    setLoading("csv");

    try {
      const rows = [
        ...buildKpiRows(data).map((row) => ({
          seccion: "KPIs principales",
          metrica: row.metrica,
          valor: row.valor,
        })),
        ...buildEstadoRows(data),
        ...buildTagRows(data),
        ...buildPrefijoRows(data),
        ...buildTurnoRows(data),
        ...buildBaseRows(data),
      ];

      const header = "Sección,Métrica,Valor\n";

      const body = rows
        .map((row) =>
          [
            safeCsvValue(row.seccion),
            safeCsvValue(row.metrica),
            safeCsvValue(row.valor),
          ].join(",")
        )
        .join("\n");

      const blob = new Blob(["\uFEFF" + header + body], {
        type: "text/csv;charset=utf-8;",
      });

      downloadBlob(blob, `depurador-resumen-${timestamp()}.csv`);

      toast.success("CSV descargado", {
        description: "Resumen exportado con datos reales del archivo cargado.",
      });
    } catch (error) {
      console.error(error);

      toast.error("No se pudo exportar el CSV");
    } finally {
      setLoading(null);
    }
  };

  const exportPNG = async () => {
    setLoading("png");

    try {
      const { toPng } = await import("html-to-image");

      const node =
        (document.querySelector("[data-export-root]") as HTMLElement | null) ??
        (document.querySelector("main") as HTMLElement | null);

      if (!node) {
        throw new Error("Tablero no encontrado");
      }

      const backgroundColor = getComputedStyle(document.body).backgroundColor;

      const dataUrl = await toPng(node, {
        backgroundColor,
        pixelRatio: 2,
        cacheBust: true,
        filter: (nodeElement: HTMLElement) =>
          !nodeElement.dataset?.exportIgnore,
      });

      const anchor = document.createElement("a");

      anchor.href = dataUrl;
      anchor.download = `depurador-tablero-${timestamp()}.png`;
      anchor.click();

      toast.success("PNG descargado", {
        description: "Captura del tablero exportada correctamente.",
      });
    } catch (error) {
      console.error(error);

      toast.error("No se pudo exportar el PNG");
    } finally {
      setLoading(null);
    }
  };

  const exportPDF = async () => {
    setLoading("pdf");

    try {
      const { toPng } = await import("html-to-image");
      const { jsPDF } = await import("jspdf");

      const node =
        (document.querySelector("[data-export-root]") as HTMLElement | null) ??
        (document.querySelector("main") as HTMLElement | null);

      if (!node) {
        throw new Error("Tablero no encontrado");
      }

      const backgroundColor = getComputedStyle(document.body).backgroundColor;

      const dataUrl = await toPng(node, {
        backgroundColor,
        pixelRatio: 2,
        cacheBust: true,
        filter: (nodeElement: HTMLElement) =>
          !nodeElement.dataset?.exportIgnore,
      });

      const image = new Image();
      image.src = dataUrl;

      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("No se pudo cargar la imagen"));
      });

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "a4",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const margin = 20;
      const imageWidth = pageWidth - margin * 2;
      const imageHeight = (image.height * imageWidth) / image.width;

      if (imageHeight <= pageHeight - margin * 2) {
        pdf.addImage(dataUrl, "PNG", margin, margin, imageWidth, imageHeight);
      } else {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("No se pudo crear el canvas");
        }

        const pageImageHeight = pageHeight - margin * 2;
        const sourceSliceHeight = (pageImageHeight * image.width) / imageWidth;

        canvas.width = image.width;

        let sourceY = 0;
        let firstPage = true;

        while (sourceY < image.height) {
          const sliceHeight = Math.min(sourceSliceHeight, image.height - sourceY);

          canvas.height = sliceHeight;
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(
            image,
            0,
            sourceY,
            image.width,
            sliceHeight,
            0,
            0,
            image.width,
            sliceHeight
          );

          const sliceDataUrl = canvas.toDataURL("image/png");

          if (!firstPage) {
            pdf.addPage();
          }

          pdf.addImage(
            sliceDataUrl,
            "PNG",
            margin,
            margin,
            imageWidth,
            (sliceHeight * imageWidth) / image.width
          );

          sourceY += sliceHeight;
          firstPage = false;
        }
      }

      pdf.save(`depurador-tablero-${timestamp()}.pdf`);

      toast.success("PDF descargado", {
        description: "Reporte visual exportado correctamente.",
      });
    } catch (error) {
      console.error(error);

      toast.error("No se pudo exportar el PDF");
    } finally {
      setLoading(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          className="gap-2 bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-[0_4px_20px_hsl(var(--glow-primary))] hover:opacity-90"
          disabled={!!loading}
          data-export-ignore="true"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}

          {loading ? "Exportando…" : "Exportar"}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="glass-card !bg-card/90 w-56">
        <DropdownMenuLabel className="font-display">
          Descargar tablero
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={exportPNG} className="gap-2 cursor-pointer">
          <FileImage className="h-4 w-4 text-primary" />

          <div className="flex flex-col">
            <span className="text-sm font-medium">PNG</span>
            <span className="text-[11px] text-muted-foreground">
              Imagen del tablero
            </span>
          </div>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={exportCSV} className="gap-2 cursor-pointer">
          <FileSpreadsheet className="h-4 w-4 text-success" />

          <div className="flex flex-col">
            <span className="text-sm font-medium">CSV</span>
            <span className="text-[11px] text-muted-foreground">
              KPIs y métricas reales
            </span>
          </div>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={exportPDF} className="gap-2 cursor-pointer">
          <FileText className="h-4 w-4 text-warning" />

          <div className="flex flex-col">
            <span className="text-sm font-medium">PDF</span>
            <span className="text-[11px] text-muted-foreground">
              Reporte completo
            </span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}