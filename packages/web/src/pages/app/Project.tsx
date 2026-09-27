import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ProjectHeader } from '@/components/project/ProjectHeader';
import { SectionList } from '@/components/project/SectionList';
import { TaskList } from '@/components/task/TaskList';
import { QuickAdd } from '@/components/task/QuickAdd';
import { CalendarView } from '@/components/views/CalendarView';
import { BoardView } from '@/components/views/BoardView';
import { BoardGroupingMenu, GroupedBoard, useBoardGrouping } from '@/components/views/GroupedBoard';
import type { BoardGrouping } from '@/stores/uiStore';
import { useProject, useProjectActions, useSectionActions } from '@/queries/projects';
import { useProjectRoom } from '@/hooks/useProjectRoom';
import { useProjectTasks } from '@/queries/tasks';
import { useTaskActions } from '@/queries/taskActions';
import type { Task } from '@/types/task';

const UNSECTIONED = '__unsectioned__';

const PROJECT_GROUPINGS: BoardGrouping[] = ['section', 'priority', 'assignee', 'dueDate'];

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
  const [grouping, setGrouping] = useBoardGrouping(`project:${id}`, 'section');
  const { quickAddTask, moveTask, reorderTasks } = useTaskActions();

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

  // One drag context for the whole list view: tasks reorder within a list,
  // move between sections (and "no section"), and sections reorder by their
  // header grip. Each drag only ever lands on its own kind of target.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const collisionDetection: CollisionDetection = (args) => {
    const dragging = args.active.data.current?.type;
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => {
        const type = c.data.current?.type;
        return dragging === 'section' ? type === 'section' : type === 'task' || type === 'task-list';
      }),
    });
  };

  const tasksIn = (containerId: string) =>
    containerId === UNSECTIONED ? unsectionedTasks : (tasksBySection.get(containerId) ?? []);

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const from = active.data.current;
    const to = over.data.current;
    if (from?.type === 'section') {
      const ids = sections.map((s) => s.id);
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        await reorderSections(arrayMove(ids, oldIndex, newIndex));
      }
      return;
    }
    if (from?.type !== 'task' || !to?.containerId) return;
    const taskId = String(active.id);
    const target = tasksIn(to.containerId).map((t) => t.id);
    if (from.containerId === to.containerId) {
      const oldIndex = target.indexOf(taskId);
      const newIndex = target.indexOf(String(over.id));
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        await reorderTasks(arrayMove(target, oldIndex, newIndex));
      }
      return;
    }
    // Into another section: move it, then place it where it was dropped.
    const at = to.type === 'task' ? target.indexOf(String(over.id)) : target.length;
    const order = [...target];
    order.splice(at === -1 ? order.length : at, 0, taskId);
    await moveTask(taskId, { sectionId: to.containerId === UNSECTIONED ? null : to.containerId });
    await reorderTasks(order);
  };

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
          className="text-primary-500 hover:underline"
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
        <>
          <div className="flex justify-end -mb-2">
            <BoardGroupingMenu value={grouping} options={PROJECT_GROUPINGS} onChange={setGrouping} />
          </div>
          {grouping === 'section' ? (
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
            <GroupedBoard tasks={ordered.filter((t) => !t.parentId)} grouping={grouping} />
          )}
        </>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragEnd={(event) => void handleDragEnd(event)}
        >
          {/* Unsectioned tasks */}
          <div className="mb-4">
            <TaskList
              tasks={unsectionedTasks}
              containerId={UNSECTIONED}
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
            renderSectionContent={(section) => {
              const sectionTasks = tasksBySection.get(section.id) || [];
              return (
                <div className="pl-7 py-1">
                  <TaskList
                    tasks={sectionTasks}
                    containerId={section.id}
                    emptyMessage="No tasks in this section"
                  />
                  <div className="mt-1">
                    <QuickAdd
                      projectId={project.id}
                      sectionId={section.id}
                      // Parsed like every other quick add ("p1 tomorrow" etc.).
                      onSubmit={async (text) => {
                        await quickAddTask(text, project.id, { sectionId: section.id });
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

        </DndContext>
      )}

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete project?"
        message={`This permanently deletes "${project.name}" and all its tasks and sections.`}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
