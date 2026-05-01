import { useState, useRef } from 'react';
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
  signedUrl: string;
  uploadedBy: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
}

export const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
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

export const MAX_FILE_SIZE_MB = 25;

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
    if (!ALLOWED_TYPES.has(file.type)) {
      throw new Error(`File type "${file.type}" is not supported`);
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      throw new Error(`File exceeds the ${MAX_FILE_SIZE_MB}MB size limit`);
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
