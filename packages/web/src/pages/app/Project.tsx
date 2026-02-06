import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spinner } from '@/components/ui/Spinner';
import { ProjectHeader } from '@/components/project/ProjectHeader';
import { SectionList } from '@/components/project/SectionList';
import { useProject, useProjectSections } from '@/hooks/useProjects';
import { useProjectStore } from '@/stores/projectStore';

export default function Project() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { project, loading } = useProject(id);
  const updateProject = useProjectStore((s) => s.updateProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const archiveProject = useProjectStore((s) => s.archiveProject);
  const unarchiveProject = useProjectStore((s) => s.unarchiveProject);
  const duplicateProject = useProjectStore((s) => s.duplicateProject);
  const {
    sections,
    createSection,
    updateSection,
    deleteSection,
    reorderSections,
  } = useProjectSections(id);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (loading && !project) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Project not found
        </h2>
        <p className="text-gray-600 mb-4">
          This project may have been deleted or you don't have access.
        </p>
        <button
          className="text-[#db4c3f] hover:underline"
          onClick={() => navigate('/today')}
        >
          Go to Today
        </button>
      </div>
    );
  }

  const handleDelete = async () => {
    await deleteProject(project.id);
    navigate('/today');
  };

  const handleArchive = async () => {
    if (project.isArchived) {
      await unarchiveProject(project.id);
    } else {
      await archiveProject(project.id);
    }
  };

  return (
    <div>
      <ProjectHeader
        project={project}
        onUpdateName={(name) => updateProject(project.id, { name })}
        onUpdateViewStyle={(viewStyle) =>
          updateProject(project.id, { viewStyle })
        }
        onAddSection={() => createSection('New section')}
        onDuplicate={() => duplicateProject(project.id)}
        onArchive={handleArchive}
        onDelete={() => setShowDeleteConfirm(true)}
      />

      {/* Unsectioned tasks placeholder */}
      <div className="mb-4">
        <p className="text-sm text-gray-400 italic">
          Tasks will appear here.
        </p>
      </div>

      {/* Sections */}
      <SectionList
        sections={sections}
        onCreateSection={createSection}
        onUpdateSection={updateSection}
        onDeleteSection={deleteSection}
        onReorderSections={reorderSections}
      />

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setShowDeleteConfirm(false)}
          />
          <div className="relative bg-white rounded-xl shadow-xl p-6 mx-4 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Delete project?
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              This will permanently delete "{project.name}" and all its tasks
              and sections.
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                onClick={handleDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
