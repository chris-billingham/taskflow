import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Shield, Trash2, Upload } from 'lucide-react';
import type { ImportSummary } from '@taskflow/contract';
import api from '@/services/api';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Bring in a Taskflow export, a Todoist CSV or backup, or a CSV. */
function ImportData() {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const run = async () => {
    if (!file) return;
    setImporting(true);
    setError('');
    setSummary(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post('/settings/import', form);
      setSummary(data.data);
      setFile(null);
      if (input.current) input.current.value = '';
      // New projects, labels and filters everywhere.
      await qc.invalidateQueries();
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'The import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center shrink-0">
          <Upload className="w-5 h-5 text-purple-600 dark:text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Import</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Bring in a Taskflow export (.zip or .json), a Todoist CSV or backup .zip, or a CSV with a{' '}
            <code>content</code> column. Everything is added as new projects in your own space; nothing you have is
            changed.
          </p>
          <label htmlFor="import-file" className="sr-only">
            File to import
          </label>
          <input
            id="import-file"
            ref={input}
            type="file"
            accept=".zip,.json,.csv,.txt"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-3 block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium dark:text-gray-300 dark:file:bg-gray-700 dark:file:text-gray-200"
          />
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          {summary && (
            <div className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-300" role="status">
              <p>
                Imported {plural(summary.projects, 'project')}, {plural(summary.tasks, 'task')}
                {summary.comments > 0 && `, ${plural(summary.comments, 'comment')}`}
                {summary.attachments > 0 && `, ${plural(summary.attachments, 'attachment')}`}
                {summary.labels > 0 && ` and ${plural(summary.labels, 'new label')}`}.
              </p>
              {summary.warnings.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-amber-800 dark:text-amber-300">
                  {summary.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <button
            onClick={() => void run()}
            disabled={!file || importing}
            className="mt-4 flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60 transition-colors"
          >
            <Upload className="w-4 h-4" />
            {importing ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </section>
  );
}

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
      a.download = `taskflow-export-${new Date().toISOString().slice(0, 10)}.zip`;
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
          <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
            <Download className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Export your data</h3>
            {/* Scoped deliberately: the projects you own, with everything in
                them. Projects others own are theirs to export. */}
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Download a ZIP of the projects you own, with their sections, tasks, labels, comments and attached
              files, plus your filters and recent activity. You can import it into any Taskflow.
            </p>
            {exportError && <p className="text-sm text-red-600 mt-2">{exportError}</p>}
            <button
              onClick={handleExport}
              disabled={exporting}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-60 transition-colors"
            >
              <Download className="w-4 h-4" />
              {exporting ? 'Preparing export…' : 'Download my data'}
            </button>
          </div>
        </div>
      </section>

      <ImportData />

      {/* Privacy info */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Your data is yours</h3>
            {/* No "encrypted at rest" claim: this is self-hosted, and whether
                the database and object store are encrypted is entirely down to
                how the operator provisioned them. */}
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              This is a self-hosted instance — your tasks and projects live only on the
              infrastructure its operator controls, and are never sent to a third party.
            </p>
          </div>
        </div>
      </section>

      {/* Delete account link */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Delete account</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Permanently delete your account and all data. To proceed, go to{' '}
              <a href="/settings/account" className="text-primary-500 hover:underline">
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
