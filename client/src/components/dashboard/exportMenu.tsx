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

function getExportNode() {
  const node = document.querySelector(
    "[data-summary-export-root]"
  ) as HTMLElement | null;

  if (!node) {
    throw new Error("No se encontró el resumen ejecutivo para exportar");
  }

  return node;
}

function safeCsvValue(value: string | number | undefined | null) {
  const text = String(value ?? "");

  if (
    text.includes(";") ||
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n")
  ) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function formatPct(value: number) {
  if (!Number.isFinite(value)) return "0.0%";
  return `${value.toFixed(1)}%`;
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
      valor: formatPct(data.pctAnswer),
    },
    {
      metrica: "% No contacto",
      valor: formatPct(data.pctNoAnswer),
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
      seccion: "Estados técnicos",
      metrica: estado,
      valor: cantidad,
    })
  );
}

function buildEstadoOperativoRows(data: AnalysisResult) {
  const estadoOperativoDistribucion =
    "estadoOperativoDistribucion" in data
      ? (data.estadoOperativoDistribucion as Record<string, number> | undefined)
      : undefined;

  return Object.entries(estadoOperativoDistribucion ?? {}).map(
    ([estado, cantidad]) => ({
      seccion: "Estados operativos",
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
    )}% | Buzón: ${(base.pctBuzon * 100).toFixed(
      1
    )}% | Inválidos: ${(base.pctInvalidos * 100).toFixed(
      1
    )}% | Score: ${base.scoreCalidad.toFixed(2)} | Recomendación: ${
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
        ...buildEstadoOperativoRows(data),
        ...buildEstadoRows(data),
        ...buildTagRows(data),
        ...buildPrefijoRows(data),
        ...buildTurnoRows(data),
        ...buildBaseRows(data),
      ];

      const separator = ";";
      const header = `sep=${separator}\nSección${separator}Métrica${separator}Valor\n`;

      const body = rows
        .map((row) =>
          [
            safeCsvValue(row.seccion),
            safeCsvValue(row.metrica),
            safeCsvValue(row.valor),
          ].join(separator)
        )
        .join("\n");

      const blob = new Blob(["\uFEFF" + header + body], {
        type: "text/csv;charset=utf-8;",
      });

      downloadBlob(blob, `depurador-resumen-ejecutivo-${timestamp()}.csv`);

      toast.success("CSV descargado", {
        description: "Resumen ejecutivo exportado correctamente.",
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

      const node = getExportNode();

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
      anchor.download = `depurador-resumen-ejecutivo-${timestamp()}.png`;
      anchor.click();

      toast.success("PNG descargado", {
        description: "Imagen del resumen ejecutivo exportada correctamente.",
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

      const node = getExportNode();

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
          const sliceHeight = Math.min(
            sourceSliceHeight,
            image.height - sourceY
          );

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

      pdf.save(`depurador-resumen-ejecutivo-${timestamp()}.pdf`);

      toast.success("PDF descargado", {
        description: "Resumen ejecutivo exportado correctamente.",
      });
    } catch (error) {
      console.error(error);

      toast.error("No se pudo exportar el PDF");
    } finally {
      setLoading(null);
    }
  };

  const isLoading = !!loading;

  return (
    <div
      className="flex flex-wrap items-center justify-center gap-2 sm:justify-end"
      data-export-ignore="true"
    >
      <Button
        size="sm"
        variant="outline"
        onClick={exportPNG}
        disabled={isLoading}
        className="gap-2 rounded-lg font-display text-xs"
      >
        {loading === "png" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileImage className="h-4 w-4" />
        )}
        PNG
      </Button>

      <Button
        size="sm"
        variant="outline"
        onClick={exportCSV}
        disabled={isLoading}
        className="gap-2 rounded-lg font-display text-xs"
      >
        {loading === "csv" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileSpreadsheet className="h-4 w-4" />
        )}
        CSV
      </Button>

      <Button
        size="sm"
        onClick={exportPDF}
        disabled={isLoading}
        className="gap-2 rounded-lg bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-[0_4px_20px_hsl(var(--glow-primary))] hover:opacity-90"
      >
        {loading === "pdf" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        PDF
      </Button>

      {loading && (
        <span className="text-xs text-muted-foreground">
          Exportando {loading.toUpperCase()}...
        </span>
      )}
    </div>
  );
}