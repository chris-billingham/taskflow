import { useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

/**
 * The open task lives in the URL (`?task=<id>` on whatever page is showing),
 * so tasks can be linked to, reloading keeps the panel open, and the back
 * button closes it (or steps from a subtask back to its parent).
 */
export function useTaskPanel() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const openTaskId = params.get('task');

  const openTask = useCallback(
    (id: string) => {
      const next = new URLSearchParams(params);
      next.set('task', id);
      navigate({ search: next.toString() }, { state: { taskPanel: true } });
    },
    [params, navigate],
  );

  const closeTask = useCallback(() => {
    // Opened from within the app: step back, so the history doesn't fill up
    // with open/closed pairs. Arrived by link: just drop the parameter.
    if ((location.state as { taskPanel?: boolean } | null)?.taskPanel) {
      navigate(-1);
      return;
    }
    const next = new URLSearchParams(params);
    next.delete('task');
    navigate({ search: next.toString() }, { replace: true });
  }, [location.state, params, navigate]);

  return { openTaskId, openTask, closeTask };
}
