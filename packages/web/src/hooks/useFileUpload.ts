import { useState, useRef, useEffect } from 'react';
import api from '@/services/api';

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  taskId: string | null;
  commentId: string | null;
  uploadedById: string;
  createdAt: string;
  uploadedBy: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
}

// Keep in sync with ALLOWED_MIME_TYPES in the API (packages/api/src/schemas/attachment.ts).
// image/svg+xml is intentionally excluded (stored-XSS risk when opened top-level).
export const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv', 'text/markdown',
  'application/zip', 'application/x-zip-compressed', 'application/x-tar', 'application/gzip',
  'application/json',
]);

// Fallback only. The real limit is MAX_FILE_SIZE_MB on the API and is fetched
// at runtime by useUploadLimits() — hardcoding it here meant raising the
// server limit changed nothing for the browser.
export const DEFAULT_MAX_FILE_SIZE_MB = 25;

export interface UploadLimits {
  maxFileSizeMb: number;
  allowedMimeTypes: Set<string>;
}

let cachedLimits: UploadLimits | null = null;
let inFlight: Promise<UploadLimits> | null = null;

async function fetchLimits(): Promise<UploadLimits> {
  if (cachedLimits) return cachedLimits;
  inFlight ??= api
    .get('/attachments/limits')
    .then(({ data }) => {
      cachedLimits = {
        maxFileSizeMb: data.data.maxFileSizeMb,
        allowedMimeTypes: new Set<string>(data.data.allowedMimeTypes),
      };
      return cachedLimits;
    })
    .catch(() => {
      // Server unreachable — fall back to the shipped defaults rather than
      // blocking uploads entirely; the API re-validates regardless.
      cachedLimits = {
        maxFileSizeMb: DEFAULT_MAX_FILE_SIZE_MB,
        allowedMimeTypes: ALLOWED_TYPES,
      };
      return cachedLimits;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Upload limits as configured on the server, with the defaults until loaded. */
export function useUploadLimits(): UploadLimits {
  const [limits, setLimits] = useState<UploadLimits>({
    maxFileSizeMb: cachedLimits?.maxFileSizeMb ?? DEFAULT_MAX_FILE_SIZE_MB,
    allowedMimeTypes: cachedLimits?.allowedMimeTypes ?? ALLOWED_TYPES,
  });

  useEffect(() => {
    let active = true;
    void fetchLimits().then((l) => {
      if (active) setLimits(l);
    });
    return () => {
      active = false;
    };
  }, []);

  return limits;
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

  const upload = async (file: File, endpoint: string): Promise<Attachment> => {
    const limits = await fetchLimits();

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
      throw new Error(msg);
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
