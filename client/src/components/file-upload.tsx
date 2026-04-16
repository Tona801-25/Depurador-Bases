import { useCallback, useState } from "react";
import { Upload, File, X, Loader2, Plus } from "lucide-react";
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

  return (
    <div className={cn("space-y-4", className)}>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-all duration-200",
          hasFiles ? "min-h-[110px] gap-2 p-4" : "min-h-[160px] gap-3 p-8",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/30",
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

        {isUploading ? (
          <Loader2
            className={cn(
              "animate-spin text-primary",
              hasFiles ? "h-7 w-7" : "h-10 w-10"
            )}
          />
        ) : hasFiles ? (
          <Plus className="h-6 w-6 text-primary" />
        ) : (
          <Upload className="h-10 w-10 text-muted-foreground" />
        )}

        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            {isUploading
              ? "Procesando archivos..."
              : hasFiles
              ? "Agregá más archivos"
              : "Arrastrá archivos aquí o hacé clic para seleccionar"}
          </p>

          <p className="text-xs text-muted-foreground">
            {hasFiles
              ? "Podés seguir sumando archivos sin perder los ya cargados."
              : "Formatos soportados: CSV, TXT, XLS, XLSX"}
          </p>
        </div>
      </div>

      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Archivos seleccionados: {selectedFiles.length}
          </p>

          <div className="flex flex-wrap gap-2">
            {selectedFiles.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-1.5 text-sm text-foreground"
                data-testid={`file-item-${index}`}
              >
                <File className="h-4 w-4 text-primary" />
                <span className="max-w-[150px] truncate">{file.name}</span>
                <span className="text-xs text-muted-foreground">
                  {formatFileSize(file.size)}
                </span>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={() => removeFile(index)}
                  disabled={isUploading}
                  data-testid={`button-remove-file-${index}`}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}