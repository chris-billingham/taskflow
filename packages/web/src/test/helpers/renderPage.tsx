import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { useAuthStore } from '@/stores/authStore';
import { useCommentStore } from '@/stores/commentStore';
import { useFilterStore } from '@/stores/filterStore';
import { useLabelStore } from '@/stores/labelStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useProjectStore } from '@/stores/projectStore';
import { useSocketStore } from '@/stores/socketStore';
import { useTaskStore } from '@/stores/taskStore';
import { useTemplateStore } from '@/stores/templateStore';
import { useToastStore } from '@/stores/toastStore';
import { useUIStore } from '@/stores/uiStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { TEST_USER } from '../msw/fixtures';

// Stores are module singletons, so state would leak between tests. Snapshot
// each one's initial state at import and restore it before every render.
const stores = [
  useAuthStore,
  useCommentStore,
  useFilterStore,
  useLabelStore,
  useNotificationStore,
  useProjectStore,
  useSocketStore,
  useTaskStore,
  useTemplateStore,
  useToastStore,
  useUIStore,
  useWorkspaceStore,
] as const;
const initialStates = stores.map((store) => store.getState());

export function resetStores(): void {
  stores.forEach((store, i) => {
    (store.setState as (state: unknown, replace: boolean) => void)(initialStates[i], true);
  });
}

interface RenderPageOptions {
  /** The URL the page is opened at, e.g. `/projects/p1?task=t1`. */
  route?: string;
  /** The route pattern the page is mounted under, e.g. `/projects/:id`. */
  path?: string;
  user?: typeof TEST_USER | null;
}

/**
 * Render a page the way the app does: signed in, inside the router, with the
 * toast host mounted, talking to the MSW-mocked API through the real client.
 */
export function renderPage(ui: ReactElement, options: RenderPageOptions = {}) {
  const { route = '/', path = '/', user = TEST_USER } = options;
  resetStores();
  useAuthStore.setState({
    user,
    isAuthenticated: user !== null,
    isLoading: false,
  });

  const utils = render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path={path} element={ui} />
      </Routes>
      <ToastContainer />
    </MemoryRouter>,
  );
  return { ...utils, user: userEvent.setup() };
}
