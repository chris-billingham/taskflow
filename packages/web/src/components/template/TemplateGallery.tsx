import { useState } from 'react';
import { X, Search } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';
import { Modal } from '@/components/ui/Modal';
import { TemplateCard } from './TemplateCard';
import { TemplatePreview } from './TemplatePreview';
import { UseTemplateModal } from './UseTemplateModal';
import { useMyTemplates, useGalleryTemplates, useWorkspaceTemplates } from '@/queries/templates';
import type { Template } from '@/queries/templates';

type TabKey = 'personal' | 'workspace' | 'gallery';

interface TemplateGalleryProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId?: string;
  onProjectCreated?: (projectId: string) => void;
}

export function TemplateGallery({
  isOpen,
  onClose,
  workspaceId,
  onProjectCreated,
}: TemplateGalleryProps) {
  const mine = useMyTemplates(isOpen);
  const gallery = useGalleryTemplates(isOpen);
  const shared = useWorkspaceTemplates(workspaceId, isOpen);
  const userTemplates = mine.templates;
  const publicTemplates = gallery.templates;
  const loading = mine.loading || gallery.loading || shared.loading;

  const [activeTab, setActiveTab] = useState<TabKey>('gallery');
  const [search, setSearch] = useState('');
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [useTemplate, setUseTemplate] = useState<Template | null>(null);

  if (!isOpen) return null;

  const tabs: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: 'gallery', label: 'Gallery', count: publicTemplates.length },
    { key: 'personal', label: 'Personal', count: userTemplates.length },
    ...(workspaceId
      ? [{ key: 'workspace' as TabKey, label: 'Workspace', count: shared.templates.length }]
      : []),
  ];

  const currentList: Template[] =
    activeTab === 'personal'
      ? userTemplates
      : activeTab === 'workspace'
      ? shared.templates
      : publicTemplates;

  const filtered = search
    ? currentList.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.description?.toLowerCase().includes(search.toLowerCase()),
      )
    : currentList;

  return (
    <>
      <Modal
        isOpen
        onClose={onClose}
        ariaLabel="Templates"
        size="4xl"
        className="max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Templates
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Start a new project from a template
            </p>
          </div>
          <IconButton label="Close" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </IconButton>
        </div>

        {/* Tabs + Search */}
        <div className="px-6 pb-4 flex items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex gap-1">
            {tabs.map(({ key, label, count }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === key
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {label}
                {count !== undefined && count > 0 && (
                  <span className="ml-1.5 text-xs text-gray-400">{count}</span>
                )}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates..."
              className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400">
              Loading templates...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400 gap-2">
              <p className="text-sm">
                {search ? 'No templates match your search.' : 'No templates yet.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onPreview={setPreviewTemplate}
                  onUse={setUseTemplate}
                />
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Rendered after the gallery so they open on top of it, and Escape
          closes only the topmost. */}
      {previewTemplate && (
        <TemplatePreview
          template={previewTemplate}
          onClose={() => setPreviewTemplate(null)}
          onUse={() => {
            setUseTemplate(previewTemplate);
            setPreviewTemplate(null);
          }}
        />
      )}

      {useTemplate && (
        <UseTemplateModal
          template={useTemplate}
          workspaceId={workspaceId}
          onClose={() => setUseTemplate(null)}
          onSuccess={(projectId) => {
            setUseTemplate(null);
            onClose();
            onProjectCreated?.(projectId);
          }}
        />
      )}
    </>
  );
}
