import { useEffect, useState } from 'react';
import { fetchAttachmentObjectUrl } from '@/services/attachments';

/**
 * Load an image attachment through the authenticated download endpoint and
 * expose it as an object URL for <img src>. Revokes the URL on unmount or
 * attachment change. Pass null to skip (non-image attachments).
 */
export function useAttachmentImage(attachmentId: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!attachmentId) return;

    let cancelled = false;
    let objectUrl: string | null = null;

    fetchAttachmentObjectUrl(attachmentId, true)
      .then((u) => {
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        objectUrl = u;
        setUrl(u);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [attachmentId]);

  return url;
}
