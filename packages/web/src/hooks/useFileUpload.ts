import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { ALLOWED_MIME_TYPES, type Attachment as ContractAttachment } from '@taskflow/contract';

export type Attachment = ContractAttachment;

// The API's own list (image/svg+xml is excluded: stored-XSS risk when opened
// top-level). Used until GET /attachments/limits answers.
export const ALLOWED_TYPES = ALLOWED_MIME_TYPES;

// Fallback only. The real limit is MAX_FILE_SIZE_MB on the API and is fetched
// at runtime by useUploadLimits() — hardcoding it here meant raising the
// server limit changed nothing for the browser.
export const DEFAULT_MAX_FILE_SIZE_MB = 25;

export interface UploadLimits {
  maxFileSizeMb: number;
  allowedMimeTypes: Set<string>;
}

/** Upload limits as configured on the server, with the defaults until loaded. */
export function useUploadLimits(): UploadLimits {
  const query = useQuery({
    queryKey: ['attachments', 'limits'],
    queryFn: async (): Promise<UploadLimits> => {
      try {
        const { data } = await api.get('/attachments/limits');
        return {
          maxFileSizeMb: data.data.maxFileSizeMb,
          allowedMimeTypes: new Set<string>(data.data.allowedMimeTypes),
        };
      } catch {
        // Server unreachable: keep the shipped defaults rather than blocking
        // uploads; the API re-validates regardless.
        return { maxFileSizeMb: DEFAULT_MAX_FILE_SIZE_MB, allowedMimeTypes: ALLOWED_TYPES };
      }
    },
    staleTime: Infinity,
  });
  return query.data ?? { maxFileSizeMb: DEFAULT_MAX_FILE_SIZE_MB, allowedMimeTypes: ALLOWED_TYPES };
}

export function isImage(mimeType: string) {
  return mimeType.startsWith('image/');
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function useFileUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<AbortController | null>(null);
  const limits = useUploadLimits();

  const upload = async (file: File, endpoint: string): Promise<Attachment> => {

    if (!limits.allowedMimeTypes.has(file.type)) {
      throw new Error(`File type "${file.type}" is not supported`);
    }
    if (file.size > limits.maxFileSizeMb * 1024 * 1024) {
      throw new Error(`File exceeds the ${limits.maxFileSizeMb}MB size limit`);
    }

    setUploading(true);
    setProgress(0);
    setError(null);
    cancelRef.current = new AbortController();

    const formData = new FormData();
    formData.append('file', file);

    try {
      const { data } = await api.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded * 100) / e.total));
        },
        signal: cancelRef.current.signal,
      });
      setProgress(100);
      return data.data as Attachment;
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Upload failed';
      setError(msg);
      throw new Error(msg, { cause: err });
    } finally {
      setUploading(false);
    }
  };

  const cancel = () => {
    cancelRef.current?.abort();
  };

  const reset = () => {
    setProgress(0);
    setError(null);
  };

  return { uploading, progress, error, upload, cancel, reset };
}
