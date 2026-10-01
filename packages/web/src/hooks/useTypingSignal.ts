import { useCallback, useEffect, useRef } from 'react';
import { emitTypingStart, emitTypingStop } from '@/services/socket';

const RESEND_MS = 2000; // the indicator clears itself after 3s without a signal
const IDLE_MS = 2500;

/**
 * Tell the others with this task open that you're typing a comment: a start
 * signal at most every couple of seconds while keys are pressed, and a stop
 * once you pause, send or leave.
 */
export function useTypingSignal(taskId: string | undefined) {
  const lastSent = useRef(0);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = null;
    if (taskId && lastSent.current) emitTypingStop(taskId);
    lastSent.current = 0;
  }, [taskId]);

  const typing = useCallback(() => {
    if (!taskId) return;
    const now = Date.now();
    if (now - lastSent.current > RESEND_MS) {
      emitTypingStart(taskId);
      lastSent.current = now;
    }
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(stop, IDLE_MS);
  }, [taskId, stop]);

  useEffect(() => stop, [stop]);

  return { typing, stop };
}
