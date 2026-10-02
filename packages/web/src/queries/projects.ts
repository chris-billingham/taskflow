import { useMemo } from 'react';
import { queryOptions, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { reportMutationError } from '@/utils/reportError';
import { buildProjectTree, type Project, type ProjectSection } from '@/types/project';
import { taskKeys } from './taskKeys';
import { errorMessage } from './tasks';
import { bySortOrder } from './optimistic';

export const projectKeys = {
  all: ['projects'] as const,
  list: () => ['projects', 'list'] as const,
  detail: (id: string) => ['projects', 'detail', id] as const,
};

type ProjectFieldsInput = Partial<{
  name: string;
  description: string | null;
  parentId: string | null;
  color: string;
  viewStyle: string;
  isFavorite: boolean;
  isArchived: boolean;
  sortOrder: number;
}>;

/** Apply a change to a project in the list and its detail. */
export function patchCachedProject(
  qc: QueryClient,
  id: string,
  fn: (project: Project) => Project | null,
): void {
  qc.setQueryData<Project[]>(projectKeys.list(), (list) =>
    list?.flatMap((p) => {
      if (p.id !== id) return [p];
      const next = fn(p);
      return next ? [next] : [];
    }),
  );
  qc.setQueryData<Project>(projectKeys.detail(id), (project) =>
    project ? (fn(project) ?? project) : project,
  );
}

/** Every project you can see. */
export const projectListQuery = queryOptions({
  queryKey: projectKeys.list(),
  queryFn: async () => (await api.get('/projects')).data.data as Project[],
});

/** Every project you can see, and the views of them the sidebar needs. */
export function useProjects() {
  const query = useQuery(projectListQuery);
  return useMemo(() => {
    const projects = [...(query.data ?? [])].sort(bySortOrder);
    return {
      projects,
      active: projects.filter((p) => !p.isArchived),
      archived: projects.filter((p) => p.isArchived),
      favorites: projects.filter((p) => p.isFavorite && !p.isArchived),
      tree: buildProjectTree(projects),
      loading: query.isLoading,
      error: errorMessage(query.error, 'Failed to load projects'),
    };
  }, [query.data, query.isLoading, query.error]);
}

/** One project with its sections (and their open-task counts). */
export function useProject(id: string | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: projectKeys.detail(id ?? ''),
    queryFn: async () => (await api.get(`/projects/${id}`)).data.data as Project,
    enabled: Boolean(id),
    placeholderData: () => qc.getQueryData<Project[]>(projectKeys.list())?.find((p) => p.id === id),
    retry: false,
  });
  const sections = useMemo(
    () => [...(query.data?.sections ?? [])].sort(bySortOrder),
    [query.data?.sections],
  );
  return { project: query.data, sections, loading: query.isLoading };
}

export function useProjectActions() {
  const qc = useQueryClient();
  return useMemo(() => {
    const refresh = () => void qc.invalidateQueries({ queryKey: projectKeys.all });

    /** Optimistic change to one project; rolls back and reports on failure. */
    async function change<R>(
      id: string,
      apply: ((project: Project) => Project | null) | null,
      request: () => Promise<R>,
      failure: string,
    ): Promise<R> {
      await qc.cancelQueries({ queryKey: projectKeys.all });
      const snapshot = qc.getQueriesData({ queryKey: projectKeys.all });
      if (apply) patchCachedProject(qc, id, apply);
      try {
        return await request();
      } catch (err) {
        for (const [key, data] of snapshot) qc.setQueryData(key, data);
        reportMutationError(err, failure);
        throw err;
      } finally {
        refresh();
      }
    }

    return {
      /** Throws without a toast: the create dialog shows its own error. */
      createProject: async (input: {
        name: string;
        color?: string;
        parentId?: string;
        viewStyle?: string;
        workspaceId?: string;
      }) => {
        try {
          return (await api.post('/projects', input)).data.data as Project;
        } finally {
          refresh();
        }
      },
      updateProject: (id: string, input: ProjectFieldsInput) =>
        change(
          id,
          (p) => ({ ...p, ...input }) as Project,
          async () => (await api.patch(`/projects/${id}`, input)).data.data as Project,
          'That change could not be saved',
        ),
      deleteProject: async (id: string) => {
        await change(id, () => null, () => api.delete(`/projects/${id}`), 'The project could not be deleted');
        // Its tasks leave Today, Upcoming and filters too.
        void qc.invalidateQueries({ queryKey: taskKeys.all });
      },
      archiveProject: (id: string) =>
        change(id, (p) => ({ ...p, isArchived: true }), () => api.post(`/projects/${id}/archive`), 'That change could not be saved'),
      unarchiveProject: (id: string) =>
        change(id, (p) => ({ ...p, isArchived: false }), () => api.post(`/projects/${id}/unarchive`), 'That change could not be saved'),
      duplicateProject: async (id: string, name?: string) => {
        try {
          return (await api.post(`/projects/${id}/duplicate`, { name })).data.data as Project;
        } catch (err) {
          reportMutationError(err, 'The project could not be duplicated');
          throw err;
        } finally {
          refresh();
        }
      },
      reorderProjects: async (projectIds: string[]) => {
        const order = new Map(projectIds.map((id, index) => [id, index]));
        await qc.cancelQueries({ queryKey: projectKeys.list() });
        const previous = qc.getQueryData<Project[]>(projectKeys.list());
        qc.setQueryData<Project[]>(projectKeys.list(), (list) =>
          list?.map((p) => (order.has(p.id) ? { ...p, sortOrder: order.get(p.id)! } : p)),
        );
        try {
          await api.put('/projects/reorder', { projectIds });
        } catch (err) {
          qc.setQueryData(projectKeys.list(), previous);
          reportMutationError(err, 'The new order could not be saved');
          throw err;
        } finally {
          refresh();
        }
      },
    };
  }, [qc]);
}

/** Section changes for one project. Sections live on the project payloads. */
export function useSectionActions(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMemo(() => {
    async function run<R>(request: () => Promise<R>, failure: string, tasksToo = false): Promise<R> {
      try {
        return await request();
      } catch (err) {
        reportMutationError(err, failure);
        throw err;
      } finally {
        void qc.invalidateQueries({ queryKey: projectKeys.all });
        if (tasksToo) void qc.invalidateQueries({ queryKey: taskKeys.all });
      }
    }
    return {
      createSection: (name: string) =>
        run(
          async () => (await api.post(`/projects/${projectId}/sections`, { name })).data.data as ProjectSection,
          'The section could not be added',
        ),
      updateSection: (sectionId: string, updates: Partial<{ name: string; isCollapsed: boolean }>) =>
        run(
          async () => (await api.patch(`/sections/${sectionId}`, updates)).data.data as ProjectSection,
          'That change could not be saved',
        ),
      // Deleting a section moves its tasks out of it.
      deleteSection: (sectionId: string) =>
        run(() => api.delete(`/sections/${sectionId}`).then(() => undefined), 'The section could not be deleted', true),
      reorderSections: (sectionIds: string[]) =>
        run(() => api.put('/sections/reorder', { sectionIds }).then(() => undefined), 'The new order could not be saved'),
    };
  }, [qc, projectId]);
}
