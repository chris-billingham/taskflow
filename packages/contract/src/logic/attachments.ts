// Kept free of Zod so the web app can import it without pulling the schema
// library into its first-load bundle.

export const ALLOWED_MIME_TYPES = new Set([
  // Images
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  // NOTE: image/svg+xml is intentionally excluded — an SVG can contain inline
  // <script> that executes when the file is opened top-level via its (same-origin)
  // signed URL, i.e. stored XSS. Re-add only behind sanitization + a forced
  // Content-Disposition: attachment.
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Text
  'text/plain',
  'text/csv',
  'text/markdown',
  // Archives
  'application/zip',
  'application/x-zip-compressed',
  'application/x-tar',
  'application/gzip',
  // Data
  'application/json',
]);
