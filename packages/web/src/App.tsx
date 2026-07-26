import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AppLayout } from '@/layouts/AppLayout';
import { SettingsLayout } from '@/layouts/SettingsLayout';
import { Spinner } from '@/components/ui/Spinner';
import { ToastContainer } from '@/components/ui/ToastContainer';
// Core daily-use pages stay in the main bundle for instant navigation.
import Today from '@/pages/app/Today';
import Upcoming from '@/pages/app/Upcoming';
import Project from '@/pages/app/Project';
import Login from '@/pages/auth/Login';

// Everything else loads on demand — auth flows, settings and secondary views
// don't belong in the first paint of a task list.
const Register = lazy(() => import('@/pages/auth/Register'));
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/auth/ResetPassword'));
const VerifyEmail = lazy(() => import('@/pages/auth/VerifyEmail'));
const Label = lazy(() => import('@/pages/app/Label'));
const Filter = lazy(() => import('@/pages/app/Filter'));
const FiltersLabels = lazy(() => import('@/pages/app/FiltersLabels'));
const WorkspaceSettingsPage = lazy(() => import('@/pages/settings/Workspace'));
const NotificationSettings = lazy(() => import('@/pages/settings/Notifications'));
const Profile = lazy(() => import('@/pages/settings/Profile'));
const Account = lazy(() => import('@/pages/settings/Account'));
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

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
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
          <Route path="/workspace/settings" element={<WorkspaceSettingsPage />} />
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
  );
}

export default App;
