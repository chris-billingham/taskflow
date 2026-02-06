import { create } from 'zustand';
import api from '@/services/api';

export interface ProjectSection {
  id: string;
  name: string;
  projectId: string;
  sortOrder: number;
  isCollapsed: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { tasks: number };
}

export interface Project {
  id: string;
  name: string;
  color: string;
  description: string | null;
  ownerId: string | null;
  workspaceId: string | null;
  parentId: string | null;
  viewStyle: 'LIST' | 'BOARD' | 'CALENDAR';
  isFavorite: boolean;
  isArchived: boolean;
  isInbox: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  sections?: ProjectSection[];
  _count?: { tasks: number };
  children?: { id: string; name?: string; color?: string }[];
}

interface ProjectState {
  projects: Map<string, Project>;
  loading: boolean;
  error: string | null;

  // Actions
  fetchProjects: () => Promise<void>;
  createProject: (data: {
    name: string;
    color?: string;
    parentId?: string;
    viewStyle?: string;
  }) => Promise<Project>;
  updateProject: (
    id: string,
    data: Partial<{
      name: string;
      color: string;
      viewStyle: string;
      isFavorite: boolean;
      isArchived: boolean;
      sortOrder: number;
    }>,
  ) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  archiveProject: (id: string) => Promise<void>;
  unarchiveProject: (id: string) => Promise<void>;
  duplicateProject: (id: string, name?: string) => Promise<Project>;
  reorderProjects: (projectIds: string[]) => Promise<void>;
  setProject: (project: Project) => void;
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  projects: new Map(),
  loading: false,
  error: null,

  fetchProjects: async () => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.get('/projects');
      const projects = new Map<string, Project>();
      for (const p of data.data) {
        projects.set(p.id, p);
      }
      set({ projects, loading: false });
    } catch (err: any) {
      set({
        error: err.response?.data?.message || 'Failed to fetch projects',
        loading: false,
      });
    }
  },

  createProject: async (input) => {
    const { data } = await api.post('/projects', input);
    const project = data.data as Project;
    set((state) => {
      const projects = new Map(state.projects);
      projects.set(project.id, project);
      return { projects };
    });
    return project;
  },

  updateProject: async (id, input) => {
    // Optimistic update
    const prev = get().projects.get(id);
    if (prev) {
      set((state) => {
        const projects = new Map(state.projects);
        projects.set(id, { ...prev, ...input } as Project);
        return { projects };
      });
    }

    try {
      const { data } = await api.patch(`/projects/${id}`, input);
      const project = data.data as Project;
      set((state) => {
        const projects = new Map(state.projects);
        projects.set(id, project);
        return { projects };
      });
      return project;
    } catch (err) {
      // Revert optimistic update
      if (prev) {
        set((state) => {
          const projects = new Map(state.projects);
          projects.set(id, prev);
          return { projects };
        });
      }
      throw err;
    }
  },

  deleteProject: async (id) => {
    const prev = get().projects.get(id);
    // Optimistic remove
    set((state) => {
      const projects = new Map(state.projects);
      projects.delete(id);
      return { projects };
    });

    try {
      await api.delete(`/projects/${id}`);
    } catch (err) {
      // Revert
      if (prev) {
        set((state) => {
          const projects = new Map(state.projects);
          projects.set(id, prev);
          return { projects };
        });
      }
      throw err;
    }
  },

  archiveProject: async (id) => {
    const prev = get().projects.get(id);
    if (prev) {
      set((state) => {
        const projects = new Map(state.projects);
        projects.set(id, { ...prev, isArchived: true });
        return { projects };
      });
    }

    try {
      await api.post(`/projects/${id}/archive`);
    } catch (err) {
      if (prev) {
        set((state) => {
          const projects = new Map(state.projects);
          projects.set(id, prev);
          return { projects };
        });
      }
      throw err;
    }
  },

  unarchiveProject: async (id) => {
    const prev = get().projects.get(id);
    if (prev) {
      set((state) => {
        const projects = new Map(state.projects);
        projects.set(id, { ...prev, isArchived: false });
        return { projects };
      });
    }

    try {
      await api.post(`/projects/${id}/unarchive`);
    } catch (err) {
      if (prev) {
        set((state) => {
          const projects = new Map(state.projects);
          projects.set(id, prev);
          return { projects };
        });
      }
      throw err;
    }
  },

  duplicateProject: async (id, name) => {
    const { data } = await api.post(`/projects/${id}/duplicate`, { name });
    const project = data.data as Project;
    set((state) => {
      const projects = new Map(state.projects);
      projects.set(project.id, project);
      return { projects };
    });
    return project;
  },

  reorderProjects: async (projectIds) => {
    // Optimistic update
    const prevProjects = new Map(get().projects);
    set((state) => {
      const projects = new Map(state.projects);
      projectIds.forEach((id, index) => {
        const p = projects.get(id);
        if (p) {
          projects.set(id, { ...p, sortOrder: index });
        }
      });
      return { projects };
    });

    try {
      await api.put('/projects/reorder', { projectIds });
    } catch (err) {
      set({ projects: prevProjects });
      throw err;
    }
  },

  setProject: (project) => {
    set((state) => {
      const projects = new Map(state.projects);
      projects.set(project.id, project);
      return { projects };
    });
  },
}));

// Computed selectors
export const selectProjectsArray = (state: ProjectState) =>
  Array.from(state.projects.values()).sort((a, b) => a.sortOrder - b.sortOrder);

export const selectFavoriteProjects = (state: ProjectState) =>
  Array.from(state.projects.values())
    .filter((p) => p.isFavorite && !p.isArchived)
    .sort((a, b) => a.sortOrder - b.sortOrder);

export const selectArchivedProjects = (state: ProjectState) =>
  Array.from(state.projects.values())
    .filter((p) => p.isArchived)
    .sort((a, b) => a.sortOrder - b.sortOrder);

export const selectActiveProjects = (state: ProjectState) =>
  Array.from(state.projects.values())
    .filter((p) => !p.isArchived)
    .sort((a, b) => a.sortOrder - b.sortOrder);

export interface ProjectTreeNode extends Project {
  childNodes: ProjectTreeNode[];
}

export const selectProjectTree = (state: ProjectState): ProjectTreeNode[] => {
  const projects = Array.from(state.projects.values()).filter((p) => !p.isArchived);
  const map = new Map<string, ProjectTreeNode>();

  for (const p of projects) {
    map.set(p.id, { ...p, childNodes: [] });
  }

  const roots: ProjectTreeNode[] = [];
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.childNodes.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes: ProjectTreeNode[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const node of nodes) {
      sortNodes(node.childNodes);
    }
  };
  sortNodes(roots);

  return roots;
};
