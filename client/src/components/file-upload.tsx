import { useState } from "react";
import type React from "react";
import { Upload, File as FileIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void; // <-- ESTE File es el del browser (dom)
  isUploading?: boolean;
}

export function FileUpload({ onFilesSelected, isUploading = false }: FileUploadProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    const fileArray = Array.from(files);
    setSelectedFiles(fileArray);
    onFilesSelected(fileArray);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const removeFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    if (newFiles.length > 0) onFilesSelected(newFiles);
  };

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "glass-card p-8 border-2 border-dashed transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-border"
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="flex flex-col items-center justify-center text-center gap-4">
          <div className="p-4 rounded-full bg-muted">
            <Upload className="h-8 w-8 text-muted-foreground" />
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-1">
              Arrastrá archivos acá o hacé clic para seleccionar
            </h3>
            <p className="text-sm text-muted-foreground">
              Formatos: CSV, TXT, XLS, XLSX
            </p>
          </div>

          <input
            type="file"
            multiple
            accept=".csv,.txt,.xls,.xlsx"
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
            id="file-upload"
            disabled={isUploading}
          />

          <Button asChild disabled={isUploading}>
            <label htmlFor="file-upload" className="cursor-pointer">
              <FileIcon className="h-4 w-4 mr-2" />
              Seleccionar archivos
            </label>
          </Button>
        </div>
      </div>

      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            Archivos seleccionados: {selectedFiles.length}
          </p>

          <div className="flex flex-wrap gap-2">
            {selectedFiles.map((file, i) => (
              <div
                key={`${file.name}-${i}`}
                className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm"
              >
                <FileIcon className="h-4 w-4 text-muted-foreground" />
                <span className="max-w-[220px] truncate">{file.name}</span>
                <span className="text-muted-foreground">
                  {(file.size / (1024 * 1024)).toFixed(1)} MB
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Quitar archivo"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}