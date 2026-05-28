import { useCallback, useState } from "react";
import {
  Upload,
  X,
  Loader2,
  Plus,
  FileSpreadsheet,
  CheckCircle2,
  Clock3,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  isUploading?: boolean;
  uploadError?: string | null;
  acceptedFormats?: string[];
  className?: string;
}

export function FileUpload({
  onFilesSelected,
  isUploading = false,
  uploadError = null,
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

    const getFileStatus = () => {
    if (uploadError) {
      return {
        label: "Error",
        icon: AlertCircle,
        chipClass:
          "border-destructive/35 bg-destructive/10 text-destructive shadow-[0_0_18px_rgba(239,68,68,0.10)]",
        iconClass: "text-destructive",
        pulse: false,
      };
    }

    if (isUploading) {
      return {
        label: "Procesando",
        icon: Loader2,
        chipClass:
          "border-primary/25 bg-primary/5 text-primary",
        iconClass: "animate-spin text-primary",
        pulse: false,
      };
    }

    return {
      label: "Leído / OK",
      icon: CheckCircle2,
      chipClass:
        "border-emerald-500/35 bg-emerald-500/10 text-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.12)]",
      iconClass: "text-emerald-400",
      pulse: false,
    };
  };

  const fileStatus = getFileStatus();
  const FileStatusIcon = fileStatus.icon;

  const acceptedFormatsLabel = acceptedFormats
    .map((format) => format.replace(".", "").toUpperCase())
    .join(" · ");

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-sm backdrop-blur-sm",
        "transition-all duration-300 hover:shadow-md",
        hasFiles ? "p-4" : "p-6",
        className
      )}
    >
      <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-primary/5 blur-3xl" />

      <div className="relative flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground sm:text-lg">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Upload className="h-4 w-4" />
          </span>
          Carga de archivos
        </h2>

        {hasFiles && (
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
              fileStatus.chipClass
            )}
          >
            <FileStatusIcon className={cn("h-3.5 w-3.5", fileStatus.iconClass)} />
            {selectedFiles.length} archivo
            {selectedFiles.length !== 1 ? "s" : ""} · {fileStatus.label}
          </span>
        )}
      </div>

      {!hasFiles ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "group relative mt-4 flex min-h-[175px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center",
            "transition-all duration-300",
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
              "mb-1 inline-flex h-14 w-14 items-center justify-center rounded-2xl transition-all duration-300",
              isDragging
                ? "scale-110 bg-primary/20 text-primary"
                : "bg-secondary/50 text-muted-foreground group-hover:scale-105 group-hover:bg-primary/10 group-hover:text-primary"
            )}
          >
            {isUploading ? (
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            ) : (
              <Upload className="h-6 w-6" />
            )}
          </div>

          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              {isUploading
                ? "Procesando archivos..."
                : "Arrastrá archivos aquí o hacé clic para seleccionar"}
            </p>

            <p className="text-xs text-muted-foreground">
              Formatos:{" "}
              <span className="font-mono text-foreground/70">
                {acceptedFormatsLabel}
              </span>
            </p>
          </div>
        </div>
      ) : (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "relative mt-4 rounded-xl border border-border/70 bg-background/35 p-3",
            "transition-all duration-300",
            isDragging &&
              "border-primary bg-primary/5 shadow-[0_0_26px_-8px_hsl(var(--primary)/0.35)]",
            isUploading && "opacity-70"
          )}
          data-testid="file-upload-dropzone"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <label
              className={cn(
                "group relative flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary",
                "transition-all duration-200 hover:bg-primary/15 hover:shadow-[0_0_22px_rgba(0,188,212,0.12)]",
                isUploading && "pointer-events-none opacity-60"
              )}>
              <input
                type="file"
                multiple
                accept={acceptedFormats.join(",")}
                onChange={handleFileInput}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                disabled={isUploading}
                data-testid="input-file-upload"
              />

              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}

              {isUploading ? "Procesando..." : "Agregar archivos"}
            </label>

            <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
              {selectedFiles.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className={cn(
                "group/chip relative flex max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-xs",
                "transition-all duration-200 hover:border-primary/35 hover:bg-secondary/80",                fileStatus.chipClass,
              )}
              style={{ animationDelay: `${index * 60}ms` }}
              data-testid={`file-item-${index}`}>
              <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                <FileSpreadsheet className="h-3.5 w-3.5 text-primary" />

                <span className={cn(
                    "absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full border border-background bg-background",
                    uploadError
                      ? "text-destructive"
                      : isUploading
                        ? "text-primary"
                        : "text-emerald-400"
                  )}>
                  {uploadError ? (
                    <AlertCircle className="h-3 w-3" />
                  ) : isUploading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                </span>
              </span>

                  <span className="max-w-[230px] truncate font-medium text-secondary-foreground">
                    {file.name}
                  </span>

              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatFileSize(file.size)}
              </span>

              <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  uploadError
                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                    : isUploading
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                )}>
                {uploadError ? "Error" : isUploading ? "Leyendo" : "OK"}
              </span>

                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-5 w-5 shrink-0 text-muted-foreground opacity-60 transition-all",
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

              <span className="ml-1 shrink-0 text-xs tabular-nums text-muted-foreground">
                {selectedFiles.length} total
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}