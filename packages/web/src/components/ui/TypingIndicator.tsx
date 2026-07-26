import { useEffect, useState, useRef } from 'react';
import { getSocket } from '@/services/socket';
import { useSocketStore } from '@/stores/socketStore';

interface TypingUser {
  userId: string;
  userName: string;
}

interface TypingIndicatorProps {
  taskId: string;
}

const TYPING_TIMEOUT_MS = 3000;

export function TypingIndicator({ taskId }: TypingIndicatorProps) {
  const [typingUsers, setTypingUsers] = useState<Map<string, TypingUser>>(new Map());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const status = useSocketStore((s) => s.status);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onTypingStart = ({
      userId,
      userName,
      taskId: eventTaskId,
    }: TypingUser & { taskId: string }) => {
      if (eventTaskId !== taskId) return;

      // Clear existing timer for this user
      const existing = timers.current.get(userId);
      if (existing) clearTimeout(existing);

      setTypingUsers((prev) => {
        const next = new Map(prev);
        next.set(userId, { userId, userName });
        return next;
      });

      // Auto-clear after timeout
      const timer = setTimeout(() => {
        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.delete(userId);
          return next;
        });
        timers.current.delete(userId);
      }, TYPING_TIMEOUT_MS);

      timers.current.set(userId, timer);
    };

    const onTypingStop = ({
      userId,
      taskId: eventTaskId,
    }: {
      userId: string;
      taskId: string;
    }) => {
      if (eventTaskId !== taskId) return;

      const existing = timers.current.get(userId);
      if (existing) {
        clearTimeout(existing);
        timers.current.delete(userId);
      }

      setTypingUsers((prev) => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
    };

    socket.on('typing:start', onTypingStart);
    socket.on('typing:stop', onTypingStop);

    return () => {
      socket.off('typing:start', onTypingStart);
      socket.off('typing:stop', onTypingStop);
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
    };
  }, [taskId, status]);

  const users = Array.from(typingUsers.values());
  if (users.length === 0) return null;

  const label =
    users.length === 1
      ? `${users[0].userName} is typing`
      : users.length === 2
        ? `${users[0].userName} and ${users[1].userName} are typing`
        : `${users.length} people are typing`;

  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 px-1 py-0.5">
      <span>{label}</span>
      <span className="flex gap-0.5">
        <span className="w-1 h-1 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
        <span className="w-1 h-1 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
        <span className="w-1 h-1 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
      </span>
    </div>
  );
}
