import { useEffect, useState } from 'react';
import { X, Download, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { Attachment } from '@/hooks/useFileUpload';
import { useAttachmentImage } from '@/hooks/useAttachmentImage';
import { downloadAttachment } from '@/services/attachments';
import { toastError } from '@/stores/toastStore';
import { Modal } from '@/components/ui/Modal';

interface ImagePreviewProps {
  attachments: Attachment[];
  initialIndex: number;
  onClose: () => void;
}

export function ImagePreview({ attachments, initialIndex, onClose }: ImagePreviewProps) {
  const [index, setIndex] = useState(initialIndex);
  const [downloading, setDownloading] = useState(false);
  const current = attachments[index];
  const imageUrl = useAttachmentImage(current?.id ?? null);

  // Escape belongs to Modal; the lightbox only adds stepping through images.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(attachments.length - 1, i + 1));
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [attachments.length]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadAttachment(current);
    } catch {
      toastError('Could not download this attachment');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} ariaLabel="Image preview" size="full">
      <div className="absolute inset-0 flex items-center justify-center" onClick={onClose}>
        {/* Toolbar */}
        <div className="absolute top-4 right-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
            onClick={handleDownload}
            disabled={downloading}
            title="Download"
            aria-label="Download"
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
            aria-label="Close"
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
              aria-label="Previous image"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-30"
              onClick={(e) => { e.stopPropagation(); setIndex((i) => Math.min(attachments.length - 1, i + 1)); }}
              disabled={index === attachments.length - 1}
              aria-label="Next image"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}

        {/* Image */}
        <div onClick={(e) => e.stopPropagation()}>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={current.filename}
              className="max-w-[90vw] max-h-[85vh] object-contain rounded shadow-xl"
            />
          ) : (
            <Loader2 className="w-10 h-10 text-white/70 animate-spin" />
          )}
        </div>
      </div>
    </Modal>
  );
}
