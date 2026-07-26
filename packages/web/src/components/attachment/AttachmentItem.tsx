import { useState } from 'react';
import { Download, Trash2, File, FileText, Image, Archive, Code, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Attachment } from '@/hooks/useFileUpload';
import { isImage, formatFileSize } from '@/hooks/useFileUpload';
import { useAttachmentImage } from '@/hooks/useAttachmentImage';
import { downloadAttachment } from '@/services/attachments';
import api from '@/services/api';
import { toastError } from '@/stores/toastStore';

interface AttachmentItemProps {
  attachment: Attachment;
  currentUserId: string;
  onDelete: (id: string) => void;
  onImageClick?: (attachment: Attachment) => void;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (isImage(mimeType)) return <Image className="w-8 h-8 text-blue-400" />;
  if (mimeType === 'application/pdf') return <FileText className="w-8 h-8 text-red-400" />;
  if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('gzip'))
    return <Archive className="w-8 h-8 text-yellow-500" />;
  if (mimeType === 'application/json' || mimeType.startsWith('text/'))
    return <Code className="w-8 h-8 text-green-500" />;
  return <File className="w-8 h-8 text-gray-400" />;
}

export function AttachmentItem({ attachment, currentUserId, onDelete, onImageClick }: AttachmentItemProps) {
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const isOwn = attachment.uploadedById === currentUserId;
  const thumbnailUrl = useAttachmentImage(
    isImage(attachment.mimeType) ? attachment.id : null,
  );

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadAttachment(attachment);
    } catch {
      toastError('Could not download this attachment');
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${attachment.filename}"?`)) return;
    setDeleting(true);
    try {
      await api.delete(`/attachments/${attachment.id}`);
      onDelete(attachment.id);
    } catch {
      toastError(`Could not delete "${attachment.filename}"`);
      setDeleting(false);
    }
  };

  const uploaderInitial = attachment.uploadedBy.name?.charAt(0).toUpperCase() ?? '?';

  return (
    <div className="flex items-start gap-2 p-2 rounded-lg border border-gray-100 hover:bg-gray-50 group">
      {/* Thumbnail or icon */}
      <div
        className={`flex-shrink-0 w-10 h-10 rounded flex items-center justify-center bg-gray-100 overflow-hidden ${
          isImage(attachment.mimeType) ? 'cursor-pointer' : ''
        }`}
        onClick={() => isImage(attachment.mimeType) && onImageClick?.(attachment)}
      >
        {isImage(attachment.mimeType) && thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={attachment.filename}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <FileIcon mimeType={attachment.mimeType} />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div
          className={`text-xs font-medium text-gray-800 truncate ${
            isImage(attachment.mimeType) ? 'cursor-pointer hover:text-primary-600' : ''
          }`}
          title={attachment.filename}
          onClick={() => isImage(attachment.mimeType) && onImageClick?.(attachment)}
        >
          {attachment.filename}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {attachment.uploadedBy.avatarUrl ? (
            <img
              src={attachment.uploadedBy.avatarUrl}
              alt={attachment.uploadedBy.name}
              className="w-3.5 h-3.5 rounded-full"
            />
          ) : (
            <div className="w-3.5 h-3.5 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-[8px] font-medium">
              {uploaderInitial}
            </div>
          )}
          <span className="text-[11px] text-gray-400">
            {formatFileSize(attachment.size)} ·{' '}
            {formatDistanceToNow(new Date(attachment.createdAt), { addSuffix: true })}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          className="p-1 rounded hover:bg-gray-200 disabled:opacity-50"
          onClick={handleDownload}
          disabled={downloading}
          title="Download"
        >
          {downloading ? (
            <Loader2 className="w-3.5 h-3.5 text-gray-500 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5 text-gray-500" />
          )}
        </button>
        {isOwn && (
          <button
            className="p-1 rounded hover:bg-red-100 disabled:opacity-50"
            onClick={handleDelete}
            disabled={deleting}
            title="Delete"
          >
            {deleting ? (
              <Loader2 className="w-3.5 h-3.5 text-red-500 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
