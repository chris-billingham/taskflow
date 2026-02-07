import { useState, useEffect, useCallback } from 'react';
import api from '@/services/api';

export interface ActivityUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface ActivityItem {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  taskId: string | null;
  createdAt: string;
  user: ActivityUser;
}

export function useTaskActivity(taskId: string, limit?: number) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = limit ? `?limit=${limit}` : '';
      const { data } = await api.get(`/tasks/${taskId}/activity${params}`);
      setActivities(data.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch activity');
    } finally {
      setLoading(false);
    }
  }, [taskId, limit]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { activities, loading, error, refetch: fetch };
}

export function useProjectActivity(projectId: string, limit?: number) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = limit ? `?limit=${limit}` : '';
      const { data } = await api.get(`/projects/${projectId}/activity${params}`);
      setActivities(data.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch activity');
    } finally {
      setLoading(false);
    }
  }, [projectId, limit]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { activities, loading, error, refetch: fetch };
}
