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

// Undo-style confirmations are quiet and neutral, not an alert colour.
const ACTION_STYLE = 'bg-gray-900 dark:bg-gray-700 border-gray-800 dark:border-gray-600 text-white';

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const Icon = ICONS[toast.variant];
  const action = toast.action;

  return (
    <div
      role={toast.variant === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 px-4 py-3 rounded-lg border shadow-lg text-sm ${
        action ? ACTION_STYLE : STYLES[toast.variant]
      }`}
    >
      {!action && <Icon className="w-4 h-4 mt-0.5 shrink-0" />}
      <span className="flex-1">{toast.message}</span>
      {action && (
        <button
          className="font-semibold text-primary-300 hover:text-primary-200 focus:outline-hidden focus-visible:underline"
          onClick={() => {
            dismiss(toast.id);
            action.run();
          }}
        >
          {action.label}
        </button>
      )}
      <button
        aria-label="Dismiss notification"
        className="p-0.5 rounded-sm hover:bg-black/5"
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
      // Above the quick-add button in the bottom-right corner.
      className="fixed bottom-20 right-4 z-200 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>,
    document.body,
  );
}
