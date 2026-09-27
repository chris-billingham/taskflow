import { useState } from 'react';
import { Link } from 'react-router';
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { IconButton } from '@/components/ui/IconButton';
import { useProjectActions, useProjects } from '@/queries/projects';
import { useWorkspaces } from '@/queries/workspaces';
import type { Project } from '@/types/project';

/** Projects put away with Archive: open, bring back or delete them. */
export default function ArchivedProjects() {
  const { archived, loading, error } = useProjects();
  const { workspaces } = useWorkspaces();
  const { unarchiveProject, deleteProject } = useProjectActions();
  const [deleting, setDeleting] = useState<Project | null>(null);
  const spaceName = (p: Project) =>
    p.workspaceId ? (workspaces.find((w) => w.id === p.workspaceId)?.name ?? 'Team') : 'Personal';

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Archived projects</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Archived projects are hidden from the sidebar and project search. Their tasks still show in Today, Upcoming and filters.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : archived.length === 0 ? (
        <div className="text-center py-16">
          <Archive className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" aria-hidden="true" />
          <p className="text-gray-500 dark:text-gray-400">No archived projects.</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {archived.map((project) => (
            <li key={project.id} className="flex items-center gap-3 py-3">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: project.color }} aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <Link
                  to={`/projects/${project.id}`}
                  className="text-sm text-gray-900 dark:text-white hover:underline truncate block"
                >
                  {project.name}
                </Link>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                  {spaceName(project)}
                  {project.description && ` · ${project.description}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void unarchiveProject(project.id)}
                aria-label={`Unarchive ${project.name}`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <ArchiveRestore className="w-4 h-4" aria-hidden="true" />
                Unarchive
              </button>
              <IconButton label={`Delete ${project.name}`} tone="danger" onClick={() => setDeleting(project)}>
                <Trash2 className="w-4 h-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        isOpen={deleting !== null}
        title="Delete project?"
        message={`This permanently deletes "${deleting?.name ?? ''}" and all its tasks and sections.`}
        onConfirm={() => {
          if (deleting) void deleteProject(deleting.id);
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
