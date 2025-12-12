import { useCallback, useState } from "react";
import { Upload, File, X, Loader2 } from "lucide-react";
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
        setSelectedFiles(files);
        onFilesSelected(files);
      }
    },
    [onFilesSelected]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        setSelectedFiles(files);
        onFilesSelected(files);
      }
    },
    [onFilesSelected]
  );

  const removeFile = useCallback(
    (index: number) => {
      const newFiles = selectedFiles.filter((_, i) => i !== index);
      setSelectedFiles(newFiles);
      if (newFiles.length > 0) {
        onFilesSelected(newFiles);
      }
    },
    [selectedFiles, onFilesSelected]
  );

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative border-2 border-dashed rounded-lg p-8 transition-all duration-200",
          "flex flex-col items-center justify-center gap-3 text-center",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50",
          isUploading && "pointer-events-none opacity-50"
        )}
        data-testid="file-upload-dropzone"
      >
        <input
          type="file"
          multiple
          accept={acceptedFormats.join(",")}
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={isUploading}
          data-testid="input-file-upload"
        />
        
        {isUploading ? (
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
        ) : (
          <Upload className="h-10 w-10 text-muted-foreground" />
        )}
        
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {isUploading ? "Procesando archivos..." : "Arrastrá archivos aquí o hacé clic para seleccionar"}
          </p>
          <p className="text-xs text-muted-foreground">
            Formatos soportados: CSV, TXT, XLS, XLSX
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
                className="flex items-center gap-2 bg-muted rounded-md px-3 py-1.5 text-sm"
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
