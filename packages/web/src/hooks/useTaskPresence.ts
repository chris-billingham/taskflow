import { useEffect, useState } from 'react';
import { getSocket, leaveTask, viewTask } from '@/services/socket';
import { useSocketStore } from '@/stores/socketStore';
import { useAuthStore } from '@/stores/authStore';

export interface TaskViewer {
  id: string;
  name: string;
}

/**
 * Announce that this task is open here, and return the other people who have
 * it open right now. Re-announced after a reconnect, since the server only
 * knows about sockets in the task's room.
 */
export function useTaskPresence(taskId: string): TaskViewer[] {
  const status = useSocketStore((s) => s.status);
  const me = useAuthStore((s) => s.user?.id);
  const [viewers, setViewers] = useState<TaskViewer[]>([]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || status !== 'connected') return;
    const onViewers = (payload: { taskId: string; users: TaskViewer[] }) => {
      if (payload.taskId === taskId) setViewers(payload.users);
    };
    socket.on('task:viewers', onViewers);
    viewTask(taskId);
    return () => {
      socket.off('task:viewers', onViewers);
      leaveTask(taskId);
      setViewers([]);
    };
  }, [taskId, status]);

  return viewers.filter((v) => v.id !== me);
}
