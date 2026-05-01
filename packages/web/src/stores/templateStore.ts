import { create } from 'zustand';
import api from '@/services/api';

export interface TemplateTask {
  content: string;
  description?: string;
  priority: number;
  sectionIndex?: number;
  labels: string[];
  sortOrder: number;
  subtasks: Array<{
    content: string;
    description?: string;
    priority: number;
    labels: string[];
    sortOrder: number;
  }>;
}

export interface TemplateData {
  project: { name: string; color: string; viewStyle: string };
  sections: Array<{ name: string; sortOrder: number }>;
  tasks: TemplateTask[];
}

export interface Template {
  id: string;
  name: string;
  description: string | null;
  data: TemplateData;
  userId: string | null;
  workspaceId: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; name: string; avatarUrl: string | null } | null;
}

interface TemplateState {
  userTemplates: Template[];
  workspaceTemplates: Map<string, Template[]>;
  publicTemplates: Template[];
  loading: boolean;
  error: string | null;

  fetchUserTemplates: () => Promise<void>;
  fetchWorkspaceTemplates: (workspaceId: string) => Promise<void>;
  fetchPublicTemplates: () => Promise<void>;
  createTemplate: (data: {
    name: string;
    description?: string;
    projectId: string;
    isPublic?: boolean;
    workspaceId?: string;
  }) => Promise<Template>;
  applyTemplate: (id: string, data: { name: string; workspaceId?: string }) => Promise<unknown>;
  updateTemplate: (id: string, data: { name?: string; description?: string; isPublic?: boolean }) => Promise<Template>;
  deleteTemplate: (id: string) => Promise<void>;
}

export const useTemplateStore = create<TemplateState>()((set) => ({
  userTemplates: [],
  workspaceTemplates: new Map(),
  publicTemplates: [],
  loading: false,
  error: null,

  fetchUserTemplates: async () => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.get('/templates');
      set({ userTemplates: data.data });
    } catch (err: any) {
      set({ error: err.response?.data?.message || 'Failed to load templates' });
    } finally {
      set({ loading: false });
    }
  },

  fetchWorkspaceTemplates: async (workspaceId: string) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.get(`/templates/workspace/${workspaceId}`);
      set((state) => {
        const next = new Map(state.workspaceTemplates);
        next.set(workspaceId, data.data);
        return { workspaceTemplates: next };
      });
    } catch (err: any) {
      set({ error: err.response?.data?.message || 'Failed to load workspace templates' });
    } finally {
      set({ loading: false });
    }
  },

  fetchPublicTemplates: async () => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.get('/templates/gallery');
      set({ publicTemplates: data.data });
    } catch (err: any) {
      set({ error: err.response?.data?.message || 'Failed to load public templates' });
    } finally {
      set({ loading: false });
    }
  },

  createTemplate: async (input) => {
    const { data } = await api.post('/templates', input);
    const template = data.data as Template;
    set((state) => ({ userTemplates: [template, ...state.userTemplates] }));
    return template;
  },

  applyTemplate: async (id: string, input) => {
    const { data } = await api.post(`/templates/${id}/apply`, input);
    return data.data;
  },

  updateTemplate: async (id: string, input) => {
    const { data } = await api.patch(`/templates/${id}`, input);
    const updated = data.data as Template;
    set((state) => ({
      userTemplates: state.userTemplates.map((t) => (t.id === id ? updated : t)),
    }));
    return updated;
  },

  deleteTemplate: async (id: string) => {
    await api.delete(`/templates/${id}`);
    set((state) => ({
      userTemplates: state.userTemplates.filter((t) => t.id !== id),
    }));
  },
}));
