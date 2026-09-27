import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TaskPanel } from '@/components/task/TaskPanel';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { useAuthStore } from '@/stores/authStore';
import { useProjectStore } from '@/stores/projectStore';
import { useSocketStore } from '@/stores/socketStore';
import { useToastStore } from '@/stores/toastStore';
import { useUIStore } from '@/stores/uiStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { TEST_USER } from '../msw/fixtures';

// Stores are module singletons, so state would leak between tests. Snapshot
// each one's initial state at import and restore it before every render.
const stores = [
  useAuthStore,
  useProjectStore,
  useSocketStore,
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

/** Renders the current URL, so tests can assert on navigation. */
function CurrentUrl() {
  const location = useLocation();
  return <output data-testid="current-url">{location.pathname + location.search}</output>;
}

/** A fresh cache per test, without retries, so failures surface at once. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

/**
 * Render a page the way the app does: signed in, inside the router and the
 * query cache, with the task panel and toast host mounted (as AppLayout
 * mounts them), talking to the MSW-mocked API through the real client.
 */
export function renderPage(ui: ReactElement, options: RenderPageOptions = {}) {
  const { route = '/', path = '/', user = TEST_USER } = options;
  resetStores();
  useAuthStore.setState({
    user,
    isAuthenticated: user !== null,
    isLoading: false,
  });
  const queryClient = createTestQueryClient();

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={ui} />
        </Routes>
        <TaskPanel />
        <CurrentUrl />
        <ToastContainer />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, user: userEvent.setup(), queryClient };
}
