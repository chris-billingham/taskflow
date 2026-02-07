import { useState, useCallback, useMemo } from 'react';
import {
  DndContext,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable';
import { BoardColumn } from '@/components/board/BoardColumn';
import { BoardCardOverlay } from '@/components/board/BoardCard';
import { BoardAddColumn } from '@/components/board/BoardAddColumn';
import { TaskDetail } from '@/components/task/TaskDetail';
import type { Task } from '@/stores/taskStore';
import type { ProjectSection } from '@/stores/projectStore';

interface BoardViewProps {
  tasks: Task[];
  allTasks: Map<string, Task>;
  sections: ProjectSection[];
  projectId: string;
  onUpdateTask: (id: string, data: Record<string, any>) => Promise<void>;
  onCompleteTask: (id: string) => Promise<void>;
  onUncompleteTask: (id: string) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  onDuplicateTask: (id: string) => Promise<void>;
  onAddSubtask: (text: string) => Promise<void>;
  onCreateTask: (data: {
    content: string;
    projectId: string;
    sectionId?: string;
  }) => Promise<Task>;
  onReorderTasks: (taskIds: string[]) => Promise<void>;
  onMoveTask: (
    id: string,
    data: { projectId?: string; sectionId?: string | null; parentId?: string | null },
  ) => Promise<Task>;
  onCreateSection: (name: string) => Promise<unknown>;
  onUpdateSection: (
    id: string,
    data: Partial<{ name: string; isCollapsed: boolean }>,
  ) => Promise<unknown>;
  onDeleteSection: (id: string) => Promise<void>;
  onReorderSections: (sectionIds: string[]) => Promise<void>;
}

const UNSECTIONED_ID = '__unsectioned__';

export function BoardView({
  tasks,
  allTasks,
  sections,
  projectId,
  onUpdateTask,
  onCompleteTask,
  onUncompleteTask,
  onDeleteTask,
  onDuplicateTask: _onDuplicateTask,
  onAddSubtask,
  onCreateTask,
  onReorderTasks,
  onMoveTask,
  onCreateSection,
  onUpdateSection,
  onDeleteSection,
  onReorderSections,
}: BoardViewProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'card' | 'column' | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Group tasks by section
  const unsectionedTasks = useMemo(
    () =>
      tasks
        .filter((t) => !t.sectionId && !t.parentId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
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
    // Sort each section's tasks
    for (const [key, list] of map) {
      map.set(
        key,
        list.sort((a, b) => a.sortOrder - b.sortOrder),
      );
    }
    return map;
  }, [tasks]);

  // Column order: unsectioned first, then sections in sort order
  const columnIds = useMemo(
    () => [
      UNSECTIONED_ID,
      ...sections
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s) => s.id),
    ],
    [sections],
  );

  // Find which column a task belongs to
  const findColumnForTask = useCallback(
    (taskId: string): string | null => {
      if (unsectionedTasks.some((t) => t.id === taskId)) return UNSECTIONED_ID;
      for (const [sectionId, sectionTasks] of tasksBySection) {
        if (sectionTasks.some((t) => t.id === taskId)) return sectionId;
      }
      return null;
    },
    [unsectionedTasks, tasksBySection],
  );

  // Get tasks for a column
  const getColumnTasks = useCallback(
    (columnId: string): Task[] => {
      if (columnId === UNSECTIONED_ID) return unsectionedTasks;
      return tasksBySection.get(columnId) || [];
    },
    [unsectionedTasks, tasksBySection],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);
    const type = active.data.current?.type === 'column' ? 'column' : 'card';
    setActiveType(type);
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      // Only handle card-over-column/card scenarios
      if (active.data.current?.type === 'column') return;

      const activeTaskId = active.id as string;
      const overId = over.id as string;

      // Determine source and target columns
      const sourceColumn = findColumnForTask(activeTaskId);
      let targetColumn: string | null = null;

      // If dropped over a column droppable
      if (overId.startsWith('column-')) {
        targetColumn = overId.replace('column-', '');
      } else {
        // Dropped over another card - find its column
        targetColumn = findColumnForTask(overId);
      }

      if (!sourceColumn || !targetColumn || sourceColumn === targetColumn) return;

      // Move task to new section via API
      const newSectionId = targetColumn === UNSECTIONED_ID ? null : targetColumn;
      onMoveTask(activeTaskId, { sectionId: newSectionId });
    },
    [findColumnForTask, onMoveTask],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      setActiveType(null);

      if (!over) return;

      // Column reordering
      if (active.data.current?.type === 'column') {
        const activeColId = active.id as string;
        const overColId = over.id as string;
        if (activeColId === overColId) return;

        // Only reorder real sections (not unsectioned)
        const sectionIds = columnIds.filter((id) => id !== UNSECTIONED_ID);
        const oldIndex = sectionIds.indexOf(activeColId);
        const newIndex = sectionIds.indexOf(overColId);
        if (oldIndex === -1 || newIndex === -1) return;

        const newOrder = arrayMove(sectionIds, oldIndex, newIndex);
        await onReorderSections(newOrder);
        return;
      }

      // Card reordering within the same column
      const activeTaskId = active.id as string;
      const overId = over.id as string;

      // Determine which column the card ended in
      let targetColumn: string | null = null;
      if (overId.startsWith('column-')) {
        targetColumn = overId.replace('column-', '');
      } else {
        targetColumn = findColumnForTask(overId);
      }

      if (!targetColumn) return;

      const columnTasks = getColumnTasks(targetColumn);
      const taskIds = columnTasks.map((t) => t.id);

      // If the over target is a card (not a column droppable), reorder within column
      if (!overId.startsWith('column-') && taskIds.includes(overId)) {
        const oldIndex = taskIds.indexOf(activeTaskId);
        const newIndex = taskIds.indexOf(overId);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const newOrder = arrayMove(taskIds, oldIndex, newIndex);
          await onReorderTasks(newOrder);
        }
      }
    },
    [columnIds, findColumnForTask, getColumnTasks, onReorderSections, onReorderTasks],
  );

  const handleCreateTaskInColumn = useCallback(
    async (columnId: string, content: string) => {
      const sectionId = columnId === UNSECTIONED_ID ? undefined : columnId;
      await onCreateTask({ content, projectId, sectionId });
    },
    [projectId, onCreateTask],
  );

  // Get active task for drag overlay
  const activeTask = activeId && activeType === 'card' ? allTasks.get(activeId) : null;

  // TaskDetail support
  const currentSelectedTask = selectedTask
    ? allTasks.get(selectedTask.id) || selectedTask
    : null;

  const selectedTaskSubtasks = selectedTask
    ? Array.from(allTasks.values())
        .filter((t) => t.parentId === selectedTask.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
    : [];

  const handleAddSubtask = useCallback(
    async (text: string) => {
      if (!selectedTask) return;
      await onAddSubtask(text);
    },
    [selectedTask, onAddSubtask],
  );

  return (
    <div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex overflow-x-auto gap-4 p-4 pb-4">
          <SortableContext
            items={columnIds}
            strategy={horizontalListSortingStrategy}
          >
            {columnIds.map((columnId) => {
              const section = sections.find((s) => s.id === columnId);
              const columnTitle =
                columnId === UNSECTIONED_ID
                  ? 'No section'
                  : section?.name || 'Unknown';
              const columnTasks = getColumnTasks(columnId);

              return (
                <BoardColumn
                  key={columnId}
                  columnId={columnId}
                  title={columnTitle}
                  tasks={columnTasks}
                  allTasks={allTasks}
                  isVirtual={columnId === UNSECTIONED_ID}
                  onTaskClick={setSelectedTask}
                  onCompleteTask={onCompleteTask}
                  onUncompleteTask={onUncompleteTask}
                  onCreateTask={(content) =>
                    handleCreateTaskInColumn(columnId, content)
                  }
                  onUpdateSection={onUpdateSection}
                  onDeleteSection={onDeleteSection}
                />
              );
            })}
          </SortableContext>

          <BoardAddColumn onCreateSection={onCreateSection} />
        </div>

        <DragOverlay>
          {activeTask && <BoardCardOverlay task={activeTask} />}
        </DragOverlay>
      </DndContext>

      {/* Task detail panel */}
      {currentSelectedTask && (
        <TaskDetail
          task={currentSelectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={onUpdateTask}
          onComplete={onCompleteTask}
          onUncomplete={onUncompleteTask}
          onDelete={onDeleteTask}
          onAddSubtask={handleAddSubtask}
          subtasks={selectedTaskSubtasks}
        />
      )}
    </div>
  );
}
