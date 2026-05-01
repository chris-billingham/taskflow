import { useState } from 'react';
import { Download, Shield, Trash2 } from 'lucide-react';
import api from '@/services/api';

export default function DataExport() {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const handleExport = async () => {
    setExporting(true);
    setExportError('');
    try {
      const response = await api.get('/settings/export', { responseType: 'blob' });
      const url = URL.createObjectURL(response.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `taskflow-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Data & Privacy</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Manage your personal data in accordance with GDPR.
        </p>
      </div>

      {/* Export */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
            <Download className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Export your data</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Download a JSON file containing all your tasks, projects, comments, labels, and activity history.
            </p>
            {exportError && <p className="text-sm text-red-600 mt-2">{exportError}</p>}
            <button
              onClick={handleExport}
              disabled={exporting}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#db4c3f] text-white rounded-lg text-sm font-medium hover:bg-[#c53727] disabled:opacity-60 transition-colors"
            >
              <Download className="w-4 h-4" />
              {exporting ? 'Preparing export…' : 'Download my data'}
            </button>
          </div>
        </div>
      </section>

      {/* Privacy info */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Your data is yours</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              We never sell your data to third parties. Your tasks and projects are stored securely and encrypted at rest.
            </p>
          </div>
        </div>
      </section>

      {/* Delete account link */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0">
            <Trash2 className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Delete account</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Permanently delete your account and all data. To proceed, go to{' '}
              <a href="/settings/account" className="text-[#db4c3f] hover:underline">
                Account settings
              </a>
              .
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
