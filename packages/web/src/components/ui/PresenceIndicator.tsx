import { useEffect, useState } from 'react';
import { getSocket } from '@/services/socket';
import { useSocketStore } from '@/stores/socketStore';

interface PresenceUser {
  userId: string;
  userName: string;
  taskId?: string;
  projectId?: string;
}

interface PresenceIndicatorProps {
  taskId: string;
  className?: string;
}

export function PresenceIndicator({ taskId, className = '' }: PresenceIndicatorProps) {
  const [viewers, setViewers] = useState<PresenceUser[]>([]);
  const status = useSocketStore((s) => s.status);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onPresenceUpdated = ({
      users,
    }: {
      workspaceId: string;
      users: PresenceUser[];
    }) => {
      setViewers(users.filter((u) => u.taskId === taskId));
    };

    socket.on('presence:updated', onPresenceUpdated);
    return () => {
      socket.off('presence:updated', onPresenceUpdated);
    };
  }, [taskId, status]);

  if (viewers.length === 0) return null;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <div className="flex -space-x-1">
        {viewers.slice(0, 3).map((user) => (
          <div
            key={user.userId}
            className="w-6 h-6 rounded-full bg-indigo-500 border-2 border-white flex items-center justify-center"
            title={`${user.userName} is viewing`}
          >
            <span className="text-white text-xs font-medium leading-none">
              {user.userName[0].toUpperCase()}
            </span>
          </div>
        ))}
        {viewers.length > 3 && (
          <div
            className="w-6 h-6 rounded-full bg-gray-400 border-2 border-white flex items-center justify-center"
            title={`${viewers.length - 3} more viewing`}
          >
            <span className="text-white text-xs font-medium leading-none">
              +{viewers.length - 3}
            </span>
          </div>
        )}
      </div>
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {viewers.length === 1
          ? `${viewers[0].userName} is viewing`
          : `${viewers.length} viewing`}
      </span>
    </div>
  );
}
