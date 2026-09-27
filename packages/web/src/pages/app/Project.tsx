import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spinner } from '@/components/ui/Spinner';
import { ProjectHeader } from '@/components/project/ProjectHeader';
import { SectionList } from '@/components/project/SectionList';
import { TaskList } from '@/components/task/TaskList';
import { QuickAdd } from '@/components/task/QuickAdd';
import { CalendarView } from '@/components/views/CalendarView';
import { BoardView } from '@/components/views/BoardView';
import { useProject, useProjectActions, useSectionActions } from '@/queries/projects';
import { useProjectRoom } from '@/hooks/useProjectRoom';
import { useProjectTasks } from '@/queries/tasks';
import { useTaskActions } from '@/queries/taskActions';
import type { Task } from '@/types/task';

export default function Project() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { project, sections, loading } = useProject(id);
  // Join the project's realtime room so remote task/section/comment changes
  // stream in while this view is open.
  useProjectRoom(id, project?.workspaceId);
  const { updateProject, deleteProject, archiveProject, unarchiveProject, duplicateProject } =
    useProjectActions();
  const { createSection, updateSection, deleteSection, reorderSections } = useSectionActions(id);

  const { tasks, hasMore, loadingMore, loadMore } = useProjectTasks(id);
  const { createTask, quickAddTask } = useTaskActions();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Top-level tasks in their saved order (a drag reorders them optimistically
  // by sortOrder, ahead of the server's response).
  const ordered = useMemo(
    () => tasks.filter((t) => !t.parentId).sort((a, b) => a.sortOrder - b.sortOrder),
    [tasks],
  );

  const unsectionedTasks = useMemo(() => ordered.filter((t) => !t.sectionId), [ordered]);

  const tasksBySection = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of ordered) {
      if (!t.sectionId) continue;
      const list = map.get(t.sectionId) || [];
      list.push(t);
      map.set(t.sectionId, list);
    }
    return map;
  }, [ordered]);

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
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Project not found
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
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

  const handleQuickAdd = async (text: string) => {
    await quickAddTask(text, project.id);
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

      {project.viewStyle === 'CALENDAR' ? (
        <CalendarView tasks={ordered} defaultProjectId={project.id} />
      ) : project.viewStyle === 'BOARD' ? (
        <BoardView
          tasks={ordered}
          sections={sections}
          projectId={project.id}
          onCreateSection={createSection}
          onUpdateSection={updateSection}
          onDeleteSection={deleteSection}
          onReorderSections={reorderSections}
        />
      ) : (
        <>
          {/* Unsectioned tasks */}
          <div className="mb-4">
            <TaskList tasks={unsectionedTasks} emptyMessage="No tasks yet. Add one below!" />
            <div className="mt-2">
              <QuickAdd
                projectId={project.id}
                onSubmit={(text) => handleQuickAdd(text)}
                placeholder="Add task"
              />
            </div>
          </div>

          {/* Sections with tasks */}
          <SectionList
            sections={sections}
            onCreateSection={createSection}
            onUpdateSection={updateSection}
            onDeleteSection={deleteSection}
            onReorderSections={reorderSections}
            renderSectionContent={(section) => {
              const sectionTasks = tasksBySection.get(section.id) || [];
              return (
                <div className="pl-7 py-1">
                  <TaskList tasks={sectionTasks} emptyMessage="No tasks in this section" />
                  <div className="mt-1">
                    <QuickAdd
                      projectId={project.id}
                      sectionId={section.id}
                      onSubmit={async (text) => {
                        await createTask({
                          content: text,
                          projectId: project.id,
                          sectionId: section.id,
                        });
                      }}
                      placeholder="Add task"
                    />
                  </div>
                </div>
              );
            }}
          />

          {hasMore && (
            <div className="flex justify-center py-3">
              <button
                className="px-4 py-1.5 text-sm text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                onClick={() => loadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading…' : 'Load more tasks'}
              </button>
            </div>
          )}

        </>
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setShowDeleteConfirm(false)}
          />
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 mx-4 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Delete project?
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              This will permanently delete "{project.name}" and all its tasks
              and sections.
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
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
