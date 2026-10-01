import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import type { ProjectCollaborator, ProjectRole, ProjectSharing } from '@taskflow/contract';
import { reportMutationError } from '@/utils/reportError';
import { errorMessage } from './tasks';
import { projectKeys } from './projects';
import { taskKeys } from './taskKeys';

export const sharingKeys = {
  project: (projectId: string) => ['projects', 'sharing', projectId] as const,
};

/** Who a project is shared with, and whether you may change that. */
export function useProjectSharing(projectId: string | undefined, enabled = true) {
  const query = useQuery({
    queryKey: sharingKeys.project(projectId ?? ''),
    queryFn: async () => (await api.get(`/projects/${projectId}/collaborators`)).data.data as ProjectSharing,
    enabled: Boolean(projectId) && enabled,
  });
  return { sharing: query.data, loading: query.isLoading, error: errorMessage(query.error, 'Sharing could not be loaded') };
}

export function useSharingActions(projectId: string) {
  const qc = useQueryClient();
  return useMemo(() => {
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: sharingKeys.project(projectId) });
      // Assignee and @mention lists include collaborators.
      void qc.invalidateQueries({ queryKey: ['projects', 'members', projectId] });
    };
    return {
      /** Throws without a toast: the dialog shows its own error. */
      share: async (email: string, role: ProjectRole) => {
        try {
          return (await api.post(`/projects/${projectId}/collaborators`, { email, role })).data.data as ProjectCollaborator;
        } finally {
          refresh();
        }
      },
      changeRole: async (userId: string, role: ProjectRole) => {
        try {
          await api.patch(`/projects/${projectId}/collaborators/${userId}`, { role });
        } catch (err) {
          reportMutationError(err, 'The role could not be changed');
          throw err;
        } finally {
          refresh();
        }
      },
      remove: async (userId: string) => {
        try {
          await api.delete(`/projects/${projectId}/collaborators/${userId}`);
        } catch (err) {
          reportMutationError(err, 'They could not be removed');
          throw err;
        } finally {
          refresh();
        }
      },
      /** Take yourself off a project shared with you. */
      leave: async (userId: string) => {
        try {
          await api.delete(`/projects/${projectId}/collaborators/${userId}`);
        } catch (err) {
          reportMutationError(err, 'You could not leave the project');
          throw err;
        } finally {
          void qc.invalidateQueries({ queryKey: projectKeys.all });
          void qc.invalidateQueries({ queryKey: taskKeys.all });
        }
      },
    };
  }, [qc, projectId]);
}
