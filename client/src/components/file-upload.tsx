<<<<<<< HEAD
import { useState } from "react";
import type React from "react";
import { Upload, File as FileIcon, X } from "lucide-react";
=======
import { useCallback, useState } from "react";
import { Upload, FileText, X, Loader2 } from "lucide-react";
>>>>>>> 14997a7 (Intentando mejorar interfaz)
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void; // <-- ESTE File es el del browser (dom)
  isUploading?: boolean;
}

<<<<<<< HEAD
export function FileUpload({ onFilesSelected, isUploading = false }: FileUploadProps) {
=======
export function FileUpload({
  onFilesSelected,
  isUploading = false,
  acceptedFormats = [".csv", ".txt", ".xls", ".xlsx"],
  className,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
>>>>>>> 14997a7 (Intentando mejorar interfaz)
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

<<<<<<< HEAD
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
=======
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files || []);
      if (files.length > 0) {
        setSelectedFiles(files);
        onFilesSelected(files);
      }
    },
    [onFilesSelected]
  );
>>>>>>> 14997a7 (Intentando mejorar interfaz)

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

<<<<<<< HEAD
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
=======
  const removeFile = useCallback(
    (index: number) => {
      const updated = selectedFiles.filter((_, i) => i !== index);
      setSelectedFiles(updated);
    },
    [selectedFiles]
  );

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-6">
        <div className="mb-5 flex items-center gap-3">
          <Upload className="h-5 w-5 text-cyan-400" />
          <h2 className="text-[1.05rem] font-semibold text-white">Carga de archivos</h2>
>>>>>>> 14997a7 (Intentando mejorar interfaz)
        </div>

<<<<<<< HEAD
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
=======
        <div
          className={cn(
            "relative flex min-h-[160px] flex-col items-center justify-center rounded-[18px] border border-dashed px-6 py-10 text-center transition-all",
            isDragging
              ? "border-cyan-400/60 bg-cyan-400/5"
              : "border-white/12 bg-transparent",
            isUploading && "pointer-events-none opacity-70"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            type="file"
            multiple
            accept={acceptedFormats.join(",")}
            onChange={handleFileInput}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            disabled={isUploading}
          />

          {isUploading ? (
            <Loader2 className="mb-3 h-10 w-10 animate-spin text-slate-400" />
          ) : (
            <Upload className="mb-3 h-10 w-10 text-slate-500" />
          )}

          <p className="text-[1.05rem] font-medium text-white">
            {isUploading
              ? "Procesando archivos..."
              : "Arrastrá archivos aquí o hacé clic para seleccionar"}
          </p>
          <p className="mt-1 text-sm text-slate-400">Formatos: CSV, TXT, XLS, XLSX</p>
>>>>>>> 14997a7 (Intentando mejorar interfaz)
        </div>

        {selectedFiles.length > 0 && (
          <div className="mt-5">
            <p className="mb-3 text-sm text-slate-400">
              Archivos seleccionados: {selectedFiles.length}
            </p>

            <div className="flex flex-wrap gap-2">
              {selectedFiles.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-2 rounded-full border border-white/8 bg-white/5 px-3 py-2 text-sm text-slate-200"
                >
                  <FileText className="h-4 w-4 text-cyan-400" />
                  <span className="max-w-[230px] truncate">{file.name}</span>
                  <span className="text-xs text-slate-400">{formatFileSize(file.size)}</span>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-full text-slate-400 hover:bg-white/10 hover:text-white"
                    onClick={() => removeFile(index)}
                    disabled={isUploading}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}