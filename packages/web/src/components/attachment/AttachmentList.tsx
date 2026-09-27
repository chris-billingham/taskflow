import { useState } from 'react';
import { Paperclip, Loader2, AlertCircle } from 'lucide-react';
import type { Attachment } from '@/hooks/useFileUpload';
import { isImage, useFileUpload } from '@/hooks/useFileUpload';
import { useAuthStore } from '@/stores/authStore';
import { FileUpload } from './FileUpload';
import { AttachmentItem } from './AttachmentItem';
import { useAttachments } from '@/queries/taskExtras';
import { ImagePreview } from './ImagePreview';

interface AttachmentListProps {
  taskId: string;
}

export function AttachmentList({ taskId }: AttachmentListProps) {
  const { attachments, loading, error: fetchError, added, removed } = useAttachments(taskId);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const { uploading, progress, error: uploadError, upload } = useFileUpload();
  const user = useAuthStore((s) => s.user);

  const handleFiles = async (files: File[]) => {
    for (const file of files) {
      try {
        const attachment = await upload(file, `/tasks/${taskId}/attachments`);
        added(attachment);
      } catch {
        // error already shown by FileUpload
      }
    }
  };

  const handleDelete = (id: string) => {
    removed(id);
  };

  const imageAttachments = attachments.filter((a) => isImage(a.mimeType));

  const handleImageClick = (attachment: Attachment) => {
    const idx = imageAttachments.findIndex((a) => a.id === attachment.id);
    if (idx !== -1) setPreviewIndex(idx);
  };

  if (!user) return null;

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-1">
        <Paperclip className="w-4 h-4" />
        Attachments
        {attachments.length > 0 && (
          <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">({attachments.length})</span>
        )}
      </h3>

      <div className="mb-3">
        <FileUpload
          onFiles={handleFiles}
          uploading={uploading}
          progress={progress}
          error={uploadError}
        />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 text-gray-400 dark:text-gray-500 animate-spin" />
        </div>
      )}

      {fetchError && (
        <div className="flex items-center gap-2 py-2 text-xs text-red-500">
          <AlertCircle className="w-4 h-4" />
          {fetchError}
        </div>
      )}

      {!loading && !fetchError && attachments.length === 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic py-1">No attachments yet.</p>
      )}

      {attachments.length > 0 && (
        <div className="space-y-1.5">
          {attachments.map((attachment) => (
            <AttachmentItem
              key={attachment.id}
              attachment={attachment}
              currentUserId={user.id}
              onDelete={handleDelete}
              onImageClick={handleImageClick}
            />
          ))}
        </div>
      )}

      {previewIndex !== null && imageAttachments.length > 0 && (
        <ImagePreview
          attachments={imageAttachments}
          initialIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </div>
  );
}
