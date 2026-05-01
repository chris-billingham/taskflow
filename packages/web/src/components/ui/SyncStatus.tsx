import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { useSocketStore } from '@/stores/socketStore';
import { initSocket } from '@/services/socket';
import { getAccessToken } from '@/services/api';

export function SyncStatus() {
  const status = useSocketStore((s) => s.status);

  const handleRetry = () => {
    const token = getAccessToken();
    if (token) initSocket(token);
  };

  if (status === 'connected') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-green-600" title="Real-time sync active">
        <Wifi className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Live</span>
      </div>
    );
  }

  if (status === 'connecting') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-yellow-600" title="Connecting...">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span className="hidden sm:inline">Connecting</span>
      </div>
    );
  }

  return (
    <button
      onClick={handleRetry}
      className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition-colors"
      title="Disconnected — click to retry"
    >
      <WifiOff className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">Offline</span>
    </button>
  );
}
