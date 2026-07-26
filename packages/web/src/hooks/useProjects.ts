import { useEffect, useCallback, useRef } from 'react';
import {
  useProjectStore,
  selectProjectsArray,
  selectFavoriteProjects,
  selectProjectTree,
} from '@/stores/projectStore';
import { useSocketStore } from '@/stores/socketStore';
import api from '@/services/api';
import type { ProjectSection } from '@/stores/projectStore';

export function useProjects() {
  const projects = useProjectStore(selectProjectsArray);
  const favorites = useProjectStore(selectFavoriteProjects);
  const tree = useProjectStore(selectProjectTree);
  const loading = useProjectStore((s) => s.loading);
  const error = useProjectStore((s) => s.error);
  const fetchProjects = useProjectStore((s) => s.fetchProjects);
  const resyncEpoch = useSocketStore((s) => s.resyncEpoch);

  // Re-read on resync: project:created has no broadcast at all, so a project
  // shared with this user while their socket was down would otherwise stay
  // missing from the sidebar until a reload.
  useEffect(() => {
    fetchProjects();
  }, [fetchProjects, resyncEpoch]);

  return { projects, favorites, tree, loading, error, refetch: fetchProjects };
}

export function useProject(id: string | undefined) {
  const project = useProjectStore((s) => (id ? s.projects.get(id) : undefined));
  const setProject = useProjectStore((s) => s.setProject);
  const loading = useProjectStore((s) => s.loading);
  const resyncEpoch = useSocketStore((s) => s.resyncEpoch);

  const fetchProject = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await api.get(`/projects/${id}`);
      setProject(data.data);
    } catch {
      // Project may not exist
    }
  }, [id, setProject]);

  useEffect(() => {
    if (id && !project) {
      fetchProject();
    }
  }, [id, project, fetchProject]);

  // Separate from the effect above, which deliberately fetches only when the
  // project is absent. A resync has to re-read one already in the store —
  // sections live on this payload, so section events missed during the gap are
  // recovered here too.
  const fetchProjectRef = useRef(fetchProject);
  fetchProjectRef.current = fetchProject;

  useEffect(() => {
    if (resyncEpoch === 0) return;
    void fetchProjectRef.current();
  }, [resyncEpoch]);

  return { project, loading, refetch: fetchProject };
}

export function useCreateProject() {
  const createProject = useProjectStore((s) => s.createProject);
  return createProject;
}

export function useUpdateProject() {
  const updateProject = useProjectStore((s) => s.updateProject);
  return updateProject;
}

export function useDeleteProject() {
  const deleteProject = useProjectStore((s) => s.deleteProject);
  return deleteProject;
}

export function useProjectSections(projectId: string | undefined) {
  const project = useProjectStore((s) =>
    projectId ? s.projects.get(projectId) : undefined,
  );

  const sections = project?.sections ?? [];

  const createSection = useCallback(
    async (name: string) => {
      if (!projectId) return;
      const { data } = await api.post(`/projects/${projectId}/sections`, {
        name,
      });
      // Refetch project to get updated sections
      const projectRes = await api.get(`/projects/${projectId}`);
      useProjectStore.getState().setProject(projectRes.data.data);
      return data.data as ProjectSection;
    },
    [projectId],
  );

  const updateSection = useCallback(
    async (sectionId: string, updates: Partial<{ name: string; isCollapsed: boolean }>) => {
      const { data } = await api.patch(`/sections/${sectionId}`, updates);
      // Refetch project
      if (projectId) {
        const projectRes = await api.get(`/projects/${projectId}`);
        useProjectStore.getState().setProject(projectRes.data.data);
      }
      return data.data as ProjectSection;
    },
    [projectId],
  );

  const deleteSection = useCallback(
    async (sectionId: string) => {
      await api.delete(`/sections/${sectionId}`);
      if (projectId) {
        const projectRes = await api.get(`/projects/${projectId}`);
        useProjectStore.getState().setProject(projectRes.data.data);
      }
    },
    [projectId],
  );

  const reorderSections = useCallback(
    async (sectionIds: string[]) => {
      await api.put('/sections/reorder', { sectionIds });
      if (projectId) {
        const projectRes = await api.get(`/projects/${projectId}`);
        useProjectStore.getState().setProject(projectRes.data.data);
      }
    },
    [projectId],
  );

  return { sections, createSection, updateSection, deleteSection, reorderSections };
}
