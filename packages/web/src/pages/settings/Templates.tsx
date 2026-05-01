import { useEffect, useState } from 'react';
import { FileText, Plus, Pencil, Trash2, Globe, Lock, Users, Check, X } from 'lucide-react';
import { useTemplateStore } from '@/stores/templateStore';
import { CreateTemplateModal } from '@/components/template/CreateTemplateModal';
import type { Template } from '@/stores/templateStore';

function EditTemplateInline({
  template,
  onSave,
  onCancel,
}: {
  template: Template;
  onSave: (name: string, description: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? '');

  return (
    <div className="flex flex-col gap-2 flex-1">
      <input
        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#db4c3f]"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <input
        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#db4c3f]"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
      />
      <div className="flex gap-1">
        <button
          onClick={() => onSave(name.trim(), description.trim())}
          disabled={!name.trim()}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-green-600 disabled:opacity-40"
        >
          <Check className="w-4 h-4" />
        </button>
        <button
          onClick={onCancel}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function Templates() {
  const { userTemplates, loading, error, fetchUserTemplates, updateTemplate, deleteTemplate } =
    useTemplateStore();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchUserTemplates();
  }, []);

  const handleSave = async (id: string, name: string, description: string) => {
    await updateTemplate(id, { name, description: description || undefined });
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteTemplate(id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Templates</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage your personal templates.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#db4c3f] text-white text-sm font-medium hover:bg-[#c0392b] transition-colors"
        >
          <Plus className="w-4 h-4" />
          New template
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading && userTemplates.length === 0 ? (
        <div className="text-sm text-gray-400 py-8 text-center">Loading templates...</div>
      ) : userTemplates.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
          <FileText className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No templates yet</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Save a project as a template to reuse its structure.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          {userTemplates.map((template) => (
            <div
              key={template.id}
              className="flex items-start gap-3 px-4 py-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750"
            >
              {/* Color swatch */}
              <div
                className="w-8 h-8 rounded-lg flex-shrink-0 mt-0.5"
                style={{ backgroundColor: template.data.project.color + '30' }}
              >
                <FileText
                  className="w-4 h-4 m-2"
                  style={{ color: template.data.project.color }}
                />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {editingId === template.id ? (
                  <EditTemplateInline
                    template={template}
                    onSave={(name, desc) => handleSave(template.id, name, desc)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
                        {template.name}
                      </span>
                      {template.isPublic ? (
                        <span title="Public"><Globe className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /></span>
                      ) : template.workspaceId ? (
                        <span title="Workspace"><Users className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /></span>
                      ) : (
                        <span title="Personal"><Lock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /></span>
                      )}
                    </div>
                    {template.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                        {template.description}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {template.data.sections.length} sections ·{' '}
                      {template.data.tasks.length} tasks ·{' '}
                      <span className="capitalize">{template.data.project.viewStyle.toLowerCase()}</span>
                    </p>
                  </>
                )}
              </div>

              {/* Actions */}
              {editingId !== template.id && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setEditingId(template.id)}
                    className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(template.id)}
                    disabled={deletingId === template.id}
                    className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-600 disabled:opacity-40"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <CreateTemplateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </div>
  );
}
