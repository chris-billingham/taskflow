import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { ArrowLeft, Menu, X } from 'lucide-react';
import { SettingsNav } from '@/components/settings/SettingsNav';

export function SettingsLayout() {
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate('/today')}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to app
          </button>
          <span className="text-gray-300 dark:text-gray-600">·</span>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Settings</h1>

          {/* Mobile nav toggle */}
          <button
            className="ml-auto md:hidden p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
          >
            {mobileNavOpen ? (
              <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            ) : (
              <Menu className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            )}
          </button>
        </div>

        <div className="flex gap-8">
          {/* Sidebar nav — desktop */}
          <aside className="hidden md:block w-48 flex-shrink-0">
            <SettingsNav />
          </aside>

          {/* Mobile nav overlay */}
          {mobileNavOpen && (
            <div className="md:hidden fixed inset-0 z-40 flex">
              <div
                className="fixed inset-0 bg-black/40"
                onClick={() => setMobileNavOpen(false)}
              />
              <div className="relative w-64 bg-white dark:bg-gray-800 p-4 shadow-xl">
                <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                  Settings
                </h2>
                <SettingsNav onNavigate={() => setMobileNavOpen(false)} />
              </div>
            </div>
          )}

          {/* Content */}
          <main className="flex-1 min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
