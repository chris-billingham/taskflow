import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { Outlet, useLocation, useSearchParams } from 'react-router';
import { Menu, Plus, Search } from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { NotificationCenter } from '@/components/notification/NotificationCenter';
import { Modal } from '@/components/ui/Modal';
import { QuickAdd } from '@/components/task/QuickAdd';
import { SyncStatus } from '@/components/ui/SyncStatus';
import { SearchModal } from '@/components/search/SearchModal';
// The panel (comments, Markdown, attachments, pickers) loads the first time a
// task is opened, not with the app.
/** Shown when a task is opened but the panel's code couldn't be loaded. */
function PanelUnavailable() {
  return (
    <div role="alert" className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-gray-700">
      Task details can't be opened without a connection yet. Try again once you're back online.
    </div>
  );
}

export const loadTaskPanel = () => import('@/components/task/TaskPanel');
const TaskPanel = lazy(() => loadTaskPanel().then((m) => ({ default: m.TaskPanel })));
import { useTaskActions } from '@/queries/taskActions';
import { OpenTaskProvider } from '@/hooks/useTaskPanel';
import { BulkActionBar } from '@/components/task/BulkActionBar';
import { useSelectionStore } from '@/stores/selectionStore';
import { useSocket } from '@/hooks/useSocket';
import { useRealTimeSync } from '@/hooks/useRealTimeSync';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { CommandPalette } from '@/components/layout/CommandPalette';
import { ShortcutsSheet } from '@/components/layout/ShortcutsSheet';
import { OfflineBanner } from '@/components/layout/OfflineBanner';
import { useLayoutWidth } from '@/hooks/useWideLayout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useOnline } from '@/hooks/useOnline';

export function AppLayout() {
  const [searchParams] = useSearchParams();
  const openTaskId = searchParams.get('task');
  const online = useOnline();
  // Boards and calendars use the whole width (useWideLayout).
  const wide = useLayoutWidth((st) => st.wide);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { quickAddTask } = useTaskActions();
  const taskOpen = searchParams.has('task');

  // A selection belongs to the page it was made on.
  const { pathname } = useLocation();
  useEffect(() => {
    useSelectionStore.getState().clear();
  }, [pathname]);

  useSocket();
  useRealTimeSync();
  // useTheme lives at the app root (App.tsx) so it covers settings and auth
  // routes too, which this layout does not wrap.

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const shortcutHandlers = useMemo(
    () => ({
      quickAdd: () => setQuickAddOpen(true),
      search: () => setSearchOpen(true),
      commandPalette: () => setPaletteOpen((open) => !open),
      shortcutsSheet: () => setShortcutsOpen(true),
    }),
    [],
  );
  useKeyboardShortcuts(shortcutHandlers);

  const handleQuickAddSubmit = async (text: string) => {
    await quickAddTask(text);
    setQuickAddOpen(false);
  };

  return (
    <OpenTaskProvider>
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content area */}
      <div className="md:pl-64">
        {/* Mobile header bar */}
        <div className="md:hidden sticky top-0 z-30 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center justify-between">
          <button
            className="p-1.5 rounded-sm hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </button>
          <div className="flex items-center gap-1">
            <button
              className="p-1.5 rounded-sm hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => setSearchOpen(true)}
              title="Search (/)"
            >
              <Search className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
            <NotificationCenter />
            <button
              className="p-1.5 rounded-sm hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => setQuickAddOpen(true)}
            >
              <Plus className="w-5 h-5 text-primary-500" />
            </button>
          </div>
        </div>

        {/* Desktop notification center + sync status + search */}
        <div className="hidden md:flex fixed top-4 right-20 z-30 items-center gap-3">
          <SyncStatus />
          <button
            className="p-1.5 rounded-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            onClick={() => setSearchOpen(true)}
            title="Search (/)"
          >
            <Search className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
          <NotificationCenter />
        </div>

        {/* Desktop quick add button */}
        <div className="hidden md:block fixed bottom-6 right-6 z-30">
          <button
            className="w-12 h-12 rounded-full bg-primary-500 hover:bg-primary-600 text-white shadow-lg flex items-center justify-center transition-colors"
            onClick={() => setQuickAddOpen(true)}
            title="Quick add task (Q)"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>

        <OfflineBanner />
        <main className={`${wide ? 'max-w-none' : 'max-w-5xl'} mx-auto px-4 py-6`}>
          <Outlet />
        </main>
      </div>

      {/* The open task (?task= in the URL), over whichever page is showing.
          Its own error boundary: if the panel's code can't load (offline,
          before it was ever opened), that's said here instead of the whole
          app failing. Keyed so opening another task, or reconnecting, retries. */}
      {taskOpen && (
        <ErrorBoundary key={`${openTaskId}:${online}`} fallback={<PanelUnavailable />}>
          <Suspense fallback={null}>
            <TaskPanel />
          </Suspense>
        </ErrorBoundary>
      )}

      <BulkActionBar />

      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onQuickAdd={() => setQuickAddOpen(true)}
        onSearch={() => setSearchOpen(true)}
        onShortcuts={() => setShortcutsOpen(true)}
      />
      <ShortcutsSheet isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* Global Search Modal */}
      <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Global Quick Add Modal */}
      <Modal
        isOpen={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        title="Quick Add Task"
        size="md"
      >
        <div className="p-4">
          <QuickAdd
            onSubmit={handleQuickAddSubmit}
            placeholder="Add task (e.g., Buy milk tomorrow p1 @shopping)"
            autoFocus
            onCancel={() => setQuickAddOpen(false)}
            inline={false}
          />
        </div>
      </Modal>
    </div>
    </OpenTaskProvider>
  );
}
