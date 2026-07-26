import { useRef, useState, useCallback } from 'react';
import { Upload, X, AlertCircle } from 'lucide-react';
import { useUploadLimits } from '@/hooks/useFileUpload';

interface FileUploadProps {
  onFiles: (files: File[]) => void;
  uploading?: boolean;
  progress?: number;
  error?: string | null;
  disabled?: boolean;
}

export function FileUpload({ onFiles, uploading, progress, error, disabled }: FileUploadProps) {
  const [dragging, setDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { maxFileSizeMb, allowedMimeTypes } = useUploadLimits();

  const validateAndFilter = useCallback(
    (files: FileList | File[]): File[] => {
      const arr = Array.from(files);
      const invalid = arr.filter((f) => !allowedMimeTypes.has(f.type));
      const oversized = arr.filter((f) => f.size > maxFileSizeMb * 1024 * 1024);

      if (invalid.length > 0) {
        setValidationError(`"${invalid[0].name}" is not a supported file type`);
        return [];
      }
      if (oversized.length > 0) {
        setValidationError(`"${oversized[0].name}" exceeds the ${maxFileSizeMb}MB size limit`);
        return [];
      }
      setValidationError(null);
      return arr;
    },
    [maxFileSizeMb, allowedMimeTypes],
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled || uploading) return;
    const valid = validateAndFilter(e.dataTransfer.files);
    if (valid.length > 0) onFiles(valid);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const valid = validateAndFilter(e.target.files);
    if (valid.length > 0) onFiles(valid);
    e.target.value = '';
  };

  const displayError = validationError || error;

  return (
    <div className="space-y-2">
      <div
        className={`relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          dragging
            ? 'border-primary-400 bg-primary-50'
            : disabled || uploading
              ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
              : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'
        }`}
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !uploading) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleChange}
          disabled={disabled || uploading}
        />

        {uploading ? (
          <div className="space-y-1.5">
            <div className="text-xs text-gray-500">Uploading...</div>
            <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-primary-500 h-1.5 rounded-full transition-all duration-200"
                style={{ width: `${progress ?? 0}%` }}
              />
            </div>
            <div className="text-[11px] text-gray-400">{progress ?? 0}%</div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <Upload className="w-5 h-5 text-gray-400" />
            <span className="text-xs text-gray-500">
              Drop files here or <span className="text-primary-600 font-medium">browse</span>
            </span>
            <span className="text-[11px] text-gray-400">
              Max {maxFileSizeMb}MB · Images, PDFs, documents, archives
            </span>
          </div>
        )}
      </div>

      {displayError && (
        <div className="flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{displayError}</span>
          <button
            className="ml-auto"
            onClick={() => setValidationError(null)}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
