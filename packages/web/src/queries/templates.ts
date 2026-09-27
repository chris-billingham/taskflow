import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import type { Template, TemplateData } from '@taskflow/contract';
import type { Project } from '@/types/project';
import { projectKeys } from './projects';
import { errorMessage } from './tasks';
import { reportMutationError } from '@/utils/reportError';

export type { Template, TemplateData };
export type TemplateTask = TemplateData['tasks'][number];

export const templateKeys = {
  all: ['templates'] as const,
  mine: () => ['templates', 'mine'] as const,
  gallery: () => ['templates', 'gallery'] as const,
  workspace: (workspaceId: string) => ['templates', 'workspace', workspaceId] as const,
};

const fetchList = (url: string) => async () => (await api.get(url)).data.data as Template[];

/** Your own templates. */
export function useMyTemplates(enabled = true) {
  const query = useQuery({ queryKey: templateKeys.mine(), queryFn: fetchList('/templates'), enabled });
  return {
    templates: query.data ?? [],
    loading: query.isLoading,
    error: errorMessage(query.error, 'Failed to load templates'),
  };
}

/** The instance's public gallery. */
export function useGalleryTemplates(enabled = true) {
  const query = useQuery({ queryKey: templateKeys.gallery(), queryFn: fetchList('/templates/gallery'), enabled });
  return { templates: query.data ?? [], loading: query.isLoading };
}

/** A workspace's shared templates. */
export function useWorkspaceTemplates(workspaceId: string | undefined, enabled = true) {
  const query = useQuery({
    queryKey: templateKeys.workspace(workspaceId ?? ''),
    queryFn: fetchList(`/templates/workspace/${workspaceId}`),
    enabled: enabled && Boolean(workspaceId),
  });
  return { templates: query.data ?? [], loading: query.isLoading };
}

export function useTemplateActions() {
  const qc = useQueryClient();
  return useMemo(() => {
    // failure: the toast to show, or null where the caller shows its own error.
    async function run<R>(request: () => Promise<R>, failure: string | null): Promise<R> {
      try {
        return await request();
      } catch (err) {
        if (failure) reportMutationError(err, failure);
        throw err;
      } finally {
        void qc.invalidateQueries({ queryKey: templateKeys.all });
      }
    }
    return {
      createTemplate: (input: { name: string; description?: string; projectId: string; workspaceId?: string }) =>
        run(async () => (await api.post('/templates', input)).data.data as Template, null),
      updateTemplate: (id: string, input: { name?: string; description?: string }) =>
        run(async () => (await api.patch(`/templates/${id}`, input)).data.data as Template, 'That change could not be saved'),
      deleteTemplate: (id: string) =>
        run(() => api.delete(`/templates/${id}`), 'The template could not be deleted'),
      /** Create a project from a template; returns the new project. */
      applyTemplate: async (id: string, input: { name: string; workspaceId?: string }) => {
        const project = (await api.post(`/templates/${id}/apply`, input)).data.data as Project;
        void qc.invalidateQueries({ queryKey: projectKeys.all });
        return project;
      },
    };
  }, [qc]);
}
