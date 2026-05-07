import { useCallback, useState } from "react";
import {
  Upload,
  X,
  Loader2,
  Plus,
  FileSpreadsheet,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  isUploading?: boolean;
  acceptedFormats?: string[];
  className?: string;
}

export function FileUpload({
  onFilesSelected,
  isUploading = false,
  acceptedFormats = [".csv", ".txt", ".xls", ".xlsx", ".xlsm", ".xlsb"],
  className,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);

      if (files.length > 0) {
        const mergedFiles = [...selectedFiles, ...files];
        setSelectedFiles(mergedFiles);
        onFilesSelected(mergedFiles);
      }
    },
    [onFilesSelected, selectedFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);

      if (files.length > 0) {
        const mergedFiles = [...selectedFiles, ...files];
        setSelectedFiles(mergedFiles);
        onFilesSelected(mergedFiles);
      }

      e.target.value = "";
    },
    [onFilesSelected, selectedFiles]
  );

  const removeFile = useCallback(
    (index: number) => {
      const newFiles = selectedFiles.filter((_, i) => i !== index);
      setSelectedFiles(newFiles);
      onFilesSelected(newFiles);
    },
    [selectedFiles, onFilesSelected]
  );

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const hasFiles = selectedFiles.length > 0;

  const acceptedFormatsLabel = acceptedFormats
    .map((format) => format.replace(".", "").toUpperCase())
    .join(" · ");

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/70 bg-card/80 p-6 shadow-sm backdrop-blur-sm",
        "transition-all duration-300 hover:shadow-md",
        className
      )}
    >
      {/* Decorative gradient blob */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-primary/5 blur-3xl" />

      <div className="relative mb-4 flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Upload className="h-4 w-4" />
          </span>
          Carga de archivos
        </h2>

        {hasFiles && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {selectedFiles.length} archivo
            {selectedFiles.length !== 1 ? "s" : ""} listo
            {selectedFiles.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed text-center",
          "transition-all duration-300",
          hasFiles ? "min-h-[120px] gap-2 p-5" : "min-h-[175px] gap-3 p-8",
          isDragging
            ? "scale-[1.01] border-primary bg-primary/5 shadow-[0_0_30px_-5px_hsl(var(--primary)/0.35)]"
            : "border-border hover:border-primary/50 hover:bg-primary/[0.02]",
          isUploading && "pointer-events-none opacity-50"
        )}
        data-testid="file-upload-dropzone"
      >
        <input
          type="file"
          multiple
          accept={acceptedFormats.join(",")}
          onChange={handleFileInput}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          disabled={isUploading}
          data-testid="input-file-upload"
        />

        <div
          className={cn(
            "mb-1 inline-flex items-center justify-center rounded-2xl transition-all duration-300",
            hasFiles ? "h-11 w-11" : "h-14 w-14",
            isDragging
              ? "scale-110 bg-primary/20 text-primary"
              : "bg-secondary/50 text-muted-foreground group-hover:scale-105 group-hover:bg-primary/10 group-hover:text-primary"
          )}
        >
          {isUploading ? (
            <Loader2
              className={cn(
                "animate-spin text-primary",
                hasFiles ? "h-6 w-6" : "h-7 w-7"
              )}
            />
          ) : hasFiles ? (
            <Plus className="h-6 w-6 text-primary" />
          ) : (
            <Upload className="h-6 w-6" />
          )}
        </div>

        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">
            {isUploading
              ? "Procesando archivos..."
              : hasFiles
                ? "Agregá más archivos"
                : "Arrastrá archivos aquí o hacé clic para seleccionar"}
          </p>

          <p className="text-xs text-muted-foreground">
            {hasFiles
              ? "Podés seguir sumando archivos sin perder los ya cargados."
              : (
                <>
                  Formatos:{" "}
                  <span className="font-mono text-foreground/70">
                    {acceptedFormatsLabel}
                  </span>
                </>
              )}
          </p>
        </div>
      </div>

      {selectedFiles.length > 0 && (
        <div className="relative mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              Archivos seleccionados
            </p>

            <p className="text-xs tabular-nums text-muted-foreground">
              {selectedFiles.length} total
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {selectedFiles.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className={cn(
                  "group/chip flex items-center gap-2 rounded-lg border border-border bg-secondary/60 px-3 py-2 text-xs",
                  "transition-all duration-200 hover:border-primary/40 hover:bg-secondary hover:shadow-sm",
                  isUploading && "opacity-70"
                )}
                style={{ animationDelay: `${index * 60}ms` }}
                data-testid={`file-item-${index}`}
              >
                <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-primary" />

                <span className="max-w-[210px] truncate font-medium text-secondary-foreground">
                  {file.name}
                </span>

                <span className="tabular-nums text-muted-foreground">
                  {formatFileSize(file.size)}
                </span>

                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-5 w-5 text-muted-foreground opacity-60 transition-all",
                    "hover:bg-destructive/10 hover:text-destructive group-hover/chip:opacity-100"
                  )}
                  onClick={() => removeFile(index)}
                  disabled={isUploading}
                  aria-label="Eliminar archivo"
                  data-testid={`button-remove-file-${index}`}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}