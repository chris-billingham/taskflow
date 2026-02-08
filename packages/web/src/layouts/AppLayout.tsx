import { useState, useEffect, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, Plus } from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { NotificationCenter } from '@/components/notification/NotificationCenter';
import { Modal } from '@/components/ui/Modal';
import { QuickAdd } from '@/components/task/QuickAdd';
import { useTaskStore } from '@/stores/taskStore';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const quickAddTask = useTaskStore((s) => s.quickAddTask);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't trigger if typing in an input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === 'q' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setQuickAddOpen(true);
      }
    },
    [],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleQuickAddSubmit = async (text: string) => {
    await quickAddTask(text);
    setQuickAddOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content area */}
      <div className="md:pl-64">
        {/* Mobile header bar */}
        <div className="md:hidden sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
          <button
            className="p-1.5 rounded hover:bg-gray-100"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5 text-gray-700" />
          </button>
          <div className="flex items-center gap-1">
            <NotificationCenter />
            <button
              className="p-1.5 rounded hover:bg-gray-100"
              onClick={() => setQuickAddOpen(true)}
            >
              <Plus className="w-5 h-5 text-[#db4c3f]" />
            </button>
          </div>
        </div>

        {/* Desktop notification center */}
        <div className="hidden md:flex fixed top-4 right-20 z-30">
          <NotificationCenter />
        </div>

        {/* Desktop quick add button */}
        <div className="hidden md:block fixed bottom-6 right-6 z-30">
          <button
            className="w-12 h-12 rounded-full bg-[#db4c3f] hover:bg-[#c53727] text-white shadow-lg flex items-center justify-center transition-colors"
            onClick={() => setQuickAddOpen(true)}
            title="Quick add task (Q)"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>

        <main className="max-w-5xl mx-auto px-4 py-6">
          <Outlet />
        </main>
      </div>

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
  );
}
