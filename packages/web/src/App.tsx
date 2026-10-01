import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { clearPersistedCache, PERSIST_MAX_AGE, queryPersister } from '@/queries/persistence';
import { createQueryClient } from '@/queries/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { useAuthStore } from '@/stores/authStore';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AppLayout } from '@/layouts/AppLayout';
import { SettingsLayout } from '@/layouts/SettingsLayout';
import { Spinner } from '@/components/ui/Spinner';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { useTheme } from '@/hooks/useTheme';
// Today is where the app opens, so it ships in the first bundle. Everything
// else loads on demand; the other daily views are prefetched once the first
// screen is up (see below), so switching to them is still instant.
import Today from '@/pages/app/Today';

const loadUpcoming = () => import('@/pages/app/Upcoming');
const loadProject = () => import('@/pages/app/Project');
const Upcoming = lazy(loadUpcoming);
const Project = lazy(loadProject);
const Login = lazy(() => import('@/pages/auth/Login'));

// Everything else loads on demand — auth flows, settings and secondary views
// don't belong in the first paint of a task list.
const Register = lazy(() => import('@/pages/auth/Register'));
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/auth/ResetPassword'));
const VerifyEmail = lazy(() => import('@/pages/auth/VerifyEmail'));
const Label = lazy(() => import('@/pages/app/Label'));
const TaskLink = lazy(() => import('@/pages/app/TaskLink'));
const Trash = lazy(() => import('@/pages/app/Trash'));
const ArchivedProjects = lazy(() => import('@/pages/app/ArchivedProjects'));
const Assigned = lazy(() => import('@/pages/app/Assigned'));
const Filter = lazy(() => import('@/pages/app/Filter'));
const FiltersLabels = lazy(() => import('@/pages/app/FiltersLabels'));
const WorkspaceSettingsPage = lazy(() => import('@/pages/settings/Workspace'));
const NotificationSettings = lazy(() => import('@/pages/settings/Notifications'));
const Profile = lazy(() => import('@/pages/settings/Profile'));
const Account = lazy(() => import('@/pages/settings/Account'));
const Devices = lazy(() => import('@/pages/settings/Devices'));
const Preferences = lazy(() => import('@/pages/settings/Preferences'));
const Integrations = lazy(() => import('@/pages/settings/Integrations'));
const DataExport = lazy(() => import('@/pages/settings/DataExport'));
const TemplatesSettings = lazy(() => import('@/pages/settings/Templates'));
const Admin = lazy(() => import('@/pages/settings/Admin'));
const JoinWorkspace = lazy(() =>
  import('@/components/workspace/JoinWorkspace').then((m) => ({
    default: m.JoinWorkspace,
  })),
);

function RouteFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <Spinner size="lg" />
    </div>
  );
}

function App() {
  const initialize = useAuthStore((s) => s.initialize);
  const [queryClient] = useState(createQueryClient);

  // Cached server data belongs to whoever was signed in. Drop it when that
  // changes (sign-out, or another account signing in on this tab) so one
  // person's tasks can never show in the next person's session.
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const cachedFor = useRef(userId);
  useEffect(() => {
    if (cachedFor.current === userId) return;
    cachedFor.current = userId;
    queryClient.clear();
    void clearPersistedCache();
  }, [userId, queryClient]);

  // Back online after starting offline: get a session, then fresh data.
  useEffect(() => {
    const onOnline = () => void initialize();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [initialize]);

  // At the app root, not in AppLayout. Mounted only there, the theme was never
  // applied on any route AppLayout doesn't wrap — so loading or refreshing any
  // /settings/* page, or an auth page, rendered light regardless of the user's
  // choice. It only ever looked right because client-side navigation from a
  // task view left the class AppLayout had already put on <html>.
  useTheme();

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Warm the other daily views while the browser is idle.
  useEffect(() => {
    const prefetch = () => {
      void loadUpcoming();
      void loadProject();
    };
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(prefetch, { timeout: 5000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = setTimeout(prefetch, 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: PERSIST_MAX_AGE,
        // Another account's saved copy is never restored.
        buster: userId ?? 'signed-out',
        dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' },
      }}
    >
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/join" element={<JoinWorkspace />} />

        {/* Protected routes with AppLayout */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/today" element={<Today />} />
          <Route path="/upcoming" element={<Upcoming />} />
          <Route path="/filters-labels" element={<FiltersLabels />} />
          <Route path="/labels/:id" element={<Label />} />
          <Route path="/filters/:id" element={<Filter />} />
          <Route path="/projects/:id" element={<Project />} />
          <Route path="/tasks/:id" element={<TaskLink />} />
          <Route path="/trash" element={<Trash />} />
          <Route path="/archived" element={<ArchivedProjects />} />
          <Route path="/assigned" element={<Assigned />} />
          <Route path="/workspaces/:id/settings" element={<WorkspaceSettingsPage />} />
        </Route>

        {/* Settings routes */}
        <Route
          element={
            <ProtectedRoute>
              <SettingsLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/settings" element={<Navigate to="/settings/profile" replace />} />
          <Route path="/settings/profile" element={<Profile />} />
          <Route path="/settings/account" element={<Account />} />
          <Route path="/settings/devices" element={<Devices />} />
          <Route path="/settings/preferences" element={<Preferences />} />
          <Route path="/settings/notifications" element={<NotificationSettings />} />
          <Route path="/settings/templates" element={<TemplatesSettings />} />
          <Route path="/settings/integrations" element={<Integrations />} />
          <Route path="/settings/export" element={<DataExport />} />
          {/* Admin console. The page itself redirects non-admins, and every
              endpoint it calls re-checks the role server-side. */}
          <Route path="/settings/admin" element={<Admin />} />
        </Route>

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Routes>
      </Suspense>
      <ToastContainer />
    </BrowserRouter>
    </PersistQueryClientProvider>
  );
}

export default App;
