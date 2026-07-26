import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';
import { useToastStore, type Toast } from '@/stores/toastStore';

const ICONS = {
  error: AlertCircle,
  success: CheckCircle,
  info: Info,
} as const;

const STYLES = {
  error: 'bg-red-50 border-red-200 text-red-800',
  success: 'bg-green-50 border-green-200 text-green-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
} as const;

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const Icon = ICONS[toast.variant];

  return (
    <div
      role="alert"
      className={`flex items-start gap-2 px-4 py-3 rounded-lg border shadow-lg text-sm ${STYLES[toast.variant]}`}
    >
      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span className="flex-1">{toast.message}</span>
      <button
        aria-label="Dismiss notification"
        className="p-0.5 rounded hover:bg-black/5"
        onClick={() => dismiss(toast.id)}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  if (toasts.length === 0) return null;

  return createPortal(
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>,
    document.body,
  );
}
