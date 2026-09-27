import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import type { Attachment, MemberSummary, Reminder } from '@taskflow/contract';
import { errorMessage } from './tasks';

/**
 * The smaller pieces of data around a task and its project: who can be
 * assigned or mentioned, reminders and attachments.
 */
export const extraKeys = {
  projectMembers: (projectId: string) => ['projects', 'members', projectId] as const,
  reminders: (taskId: string) => ['reminders', taskId] as const,
  attachments: (taskId: string) => ['attachments', taskId] as const,
};

/**
 * People who can see a project (and so can be assigned or @mentioned).
 * Guests get names without email addresses.
 */
export function useProjectMembers(projectId: string | undefined, enabled = true) {
  const query = useQuery({
    queryKey: extraKeys.projectMembers(projectId ?? ''),
    queryFn: async () => (await api.get(`/projects/${projectId}/members`)).data.data as MemberSummary[],
    enabled: enabled && Boolean(projectId),
    staleTime: 5 * 60_000,
  });
  return { members: query.data ?? [], loading: query.isLoading };
}

export function useReminders(taskId: string) {
  const query = useQuery({
    queryKey: extraKeys.reminders(taskId),
    queryFn: async () => (await api.get(`/tasks/${taskId}/reminders`)).data.data as Reminder[],
  });
  return query.data ?? [];
}

/**
 * Reminder changes. Errors are left to the caller: the API's reason (e.g. a
 * relative reminder needs a due date) is what the user needs to see.
 */
export function useReminderActions(taskId: string) {
  const qc = useQueryClient();
  return useMemo(() => {
    const refresh = () => void qc.invalidateQueries({ queryKey: extraKeys.reminders(taskId) });
    return {
      addReminder: async (input: { type: 'RELATIVE'; minutesBefore: number } | { type: 'ABSOLUTE'; triggerAt: string }) => {
        try {
          await api.post(`/tasks/${taskId}/reminders`, input);
        } finally {
          refresh();
        }
      },
      removeReminder: async (id: string) => {
        qc.setQueryData<Reminder[]>(extraKeys.reminders(taskId), (list) => list?.filter((r) => r.id !== id));
        try {
          await api.delete(`/reminders/${id}`);
        } finally {
          refresh();
        }
      },
    };
  }, [qc, taskId]);
}

export function useAttachments(taskId: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: extraKeys.attachments(taskId),
    queryFn: async () => (await api.get(`/tasks/${taskId}/attachments`)).data.data as Attachment[],
  });
  return {
    attachments: query.data ?? [],
    loading: query.isLoading,
    error: errorMessage(query.error, 'Failed to load attachments'),
    /** Show a just-uploaded file at once, ahead of the refetch. */
    added: (attachment: Attachment) => {
      qc.setQueryData<Attachment[]>(extraKeys.attachments(taskId), (list) => [attachment, ...(list ?? [])]);
      void qc.invalidateQueries({ queryKey: extraKeys.attachments(taskId) });
    },
    removed: (id: string) => {
      qc.setQueryData<Attachment[]>(extraKeys.attachments(taskId), (list) => list?.filter((a) => a.id !== id));
      void qc.invalidateQueries({ queryKey: extraKeys.attachments(taskId) });
    },
  };
}
