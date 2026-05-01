import { useEffect, useState } from 'react';
import { X, Download, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { Attachment } from '@/hooks/useFileUpload';
import api from '@/services/api';

interface ImagePreviewProps {
  attachments: Attachment[];
  initialIndex: number;
  onClose: () => void;
}

export function ImagePreview({ attachments, initialIndex, onClose }: ImagePreviewProps) {
  const [index, setIndex] = useState(initialIndex);
  const [downloading, setDownloading] = useState(false);
  const current = attachments[index];

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(attachments.length - 1, i + 1));
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [attachments.length, onClose]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { data } = await api.get(`/attachments/${current.id}/download`);
      window.open(data.data.signedUrl, '_blank');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Toolbar */}
      <div className="absolute top-4 right-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
          onClick={handleDownload}
          disabled={downloading}
          title="Download"
        >
          {downloading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Download className="w-5 h-5" />
          )}
        </button>
        <button
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
          onClick={onClose}
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Filename */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-sm text-white/80">
        {current.filename}
        {attachments.length > 1 && (
          <span className="ml-2 text-white/50">
            {index + 1} / {attachments.length}
          </span>
        )}
      </div>

      {/* Prev/Next */}
      {attachments.length > 1 && (
        <>
          <button
            className="absolute left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-30"
            onClick={(e) => { e.stopPropagation(); setIndex((i) => Math.max(0, i - 1)); }}
            disabled={index === 0}
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-30"
            onClick={(e) => { e.stopPropagation(); setIndex((i) => Math.min(attachments.length - 1, i + 1)); }}
            disabled={index === attachments.length - 1}
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      {/* Image */}
      <div onClick={(e) => e.stopPropagation()}>
        <img
          src={current.signedUrl}
          alt={current.filename}
          className="max-w-[90vw] max-h-[85vh] object-contain rounded shadow-xl"
        />
      </div>
    </div>
  );
}
