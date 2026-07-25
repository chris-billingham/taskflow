import api from '@/services/api';

// Attachment content is served by the authenticated API download endpoint, so
// plain <img src> / window.open can't be used (they don't carry the Bearer
// token). Content is fetched as a blob and handed to the browser instead.

/** Fetch attachment bytes and return an object URL. Caller must revoke it. */
export async function fetchAttachmentObjectUrl(
  attachmentId: string,
  inline = false,
): Promise<string> {
  const { data } = await api.get(
    `/attachments/${attachmentId}/download${inline ? '?inline=1' : ''}`,
    { responseType: 'blob' },
  );
  return URL.createObjectURL(data);
}

/** Download an attachment via a temporary anchor, preserving its filename. */
export async function downloadAttachment(attachment: {
  id: string;
  filename: string;
}): Promise<void> {
  const url = await fetchAttachmentObjectUrl(attachment.id);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = attachment.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
