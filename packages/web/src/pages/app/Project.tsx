import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spinner } from '@/components/ui/Spinner';
import { ProjectHeader } from '@/components/project/ProjectHeader';
import { SectionList } from '@/components/project/SectionList';
import { TaskList } from '@/components/task/TaskList';
import { QuickAdd } from '@/components/task/QuickAdd';
import { TaskDetail } from '@/components/task/TaskDetail';
import { CalendarView } from '@/components/views/CalendarView';
import { BoardView } from '@/components/views/BoardView';
import { useProject, useProjectSections } from '@/hooks/useProjects';
import { useProjectRoom } from '@/hooks/useProjectRoom';
import { useProjectStore } from '@/stores/projectStore';
import { useTasks, useTaskActions } from '@/hooks/useTasks';
import { useTaskStore } from '@/stores/taskStore';
import type { Task } from '@/stores/taskStore';

export default function Project() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { project, loading } = useProject(id);
  // Join the project's realtime room so remote task/section/comment changes
  // stream in while this view is open.
  useProjectRoom(id, project?.workspaceId);
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

  const queryObj = useMemo(() => (id ? { projectId: id } : undefined), [id]);
  const { tasks, refetch: refetchTasks, hasMore, loadingMore, loadMore } = useTasks(queryObj);
  const taskMap = useTaskStore((s) => s.tasks);
  const {
    createTask,
    updateTask,
    deleteTask,
    completeTask,
    uncompleteTask,
    moveTask,
    quickAddTask,
    reorderTasks,
    duplicateTask: duplicateTaskAction,
  } = useTaskActions();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Split tasks into unsectioned and by section
  const unsectionedTasks = useMemo(
    () => tasks.filter((t) => !t.sectionId && !t.parentId),
    [tasks],
  );

  const tasksBySection = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (t.sectionId && !t.parentId) {
        const list = map.get(t.sectionId) || [];
        list.push(t);
        map.set(t.sectionId, list);
      }
    }
    return map;
  }, [tasks]);

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
    refetchTasks();
  };

  const handleComplete = async (taskId: string) => {
    await completeTask(taskId);
  };

  const handleUncomplete = async (taskId: string) => {
    await uncompleteTask(taskId);
  };

  const handleUpdateTask = async (taskId: string, data: Record<string, any>) => {
    await updateTask(taskId, data);
  };

  const handleDeleteTask = async (taskId: string) => {
    await deleteTask(taskId);
    if (selectedTask?.id === taskId) {
      setSelectedTask(null);
    }
  };

  const handleDuplicate = async (taskId: string) => {
    await duplicateTaskAction(taskId);
    refetchTasks();
  };

  const handleReorder = async (taskIds: string[]) => {
    await reorderTasks(taskIds);
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
  };

  const handleAddSubtask = async (text: string) => {
    if (!selectedTask) return;
    await createTask({
      content: text,
      projectId: selectedTask.projectId,
      parentId: selectedTask.id,
    });
    refetchTasks();
  };

  // Get subtasks for selected task
  const selectedTaskSubtasks = selectedTask
    ? Array.from(taskMap.values())
        .filter((t) => t.parentId === selectedTask.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
    : [];

  // Get the full task data for the selected task (may have been updated)
  const currentSelectedTask = selectedTask
    ? taskMap.get(selectedTask.id) || selectedTask
    : null;

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
        <CalendarView
          tasks={tasks.filter((t) => !t.parentId)}
          allTasks={taskMap}
          onUpdateTask={handleUpdateTask}
          onCompleteTask={handleComplete}
          onUncompleteTask={handleUncomplete}
          onDeleteTask={handleDeleteTask}
          onAddSubtask={handleAddSubtask}
          onQuickAdd={handleQuickAdd}
          defaultProjectId={project.id}
        />
      ) : project.viewStyle === 'BOARD' ? (
        <BoardView
          tasks={tasks}
          allTasks={taskMap}
          sections={sections}
          projectId={project.id}
          onUpdateTask={handleUpdateTask}
          onCompleteTask={handleComplete}
          onUncompleteTask={handleUncomplete}
          onDeleteTask={handleDeleteTask}
          onDuplicateTask={handleDuplicate}
          onAddSubtask={handleAddSubtask}
          onCreateTask={createTask}
          onReorderTasks={handleReorder}
          onMoveTask={moveTask}
          onCreateSection={createSection}
          onUpdateSection={updateSection}
          onDeleteSection={deleteSection}
          onReorderSections={reorderSections}
        />
      ) : (
        <>
          {/* Unsectioned tasks */}
          <div className="mb-4">
            <TaskList
              tasks={unsectionedTasks}
              allTasks={taskMap}
              onComplete={handleComplete}
              onUncomplete={handleUncomplete}
              onTaskClick={handleTaskClick}
              onUpdate={handleUpdateTask}
              onDelete={handleDeleteTask}
              onDuplicate={handleDuplicate}
              onReorder={handleReorder}
              emptyMessage="No tasks yet. Add one below!"
            />
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
                  <TaskList
                    tasks={sectionTasks}
                    allTasks={taskMap}
                    onComplete={handleComplete}
                    onUncomplete={handleUncomplete}
                    onTaskClick={handleTaskClick}
                    onUpdate={handleUpdateTask}
                    onDelete={handleDeleteTask}
                    onDuplicate={handleDuplicate}
                    onReorder={handleReorder}
                    emptyMessage="No tasks in this section"
                  />
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
                        refetchTasks();
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

          {/* Task detail panel */}
          {currentSelectedTask && (
            <TaskDetail
              task={currentSelectedTask}
              onClose={() => setSelectedTask(null)}
              onUpdate={handleUpdateTask}
              onComplete={handleComplete}
              onUncomplete={handleUncomplete}
              onDelete={handleDeleteTask}
              onAddSubtask={handleAddSubtask}
              subtasks={selectedTaskSubtasks}
            />
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
