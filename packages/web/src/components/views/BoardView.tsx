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
import type { Task } from '@/types/task';
import type { ProjectSection } from '@/stores/projectStore';
import { useTaskActions } from '@/queries/taskActions';

interface BoardViewProps {
  tasks: Task[];
  sections: ProjectSection[];
  projectId: string;
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
  sections,
  projectId,
  onCreateSection,
  onUpdateSection,
  onDeleteSection,
  onReorderSections,
}: BoardViewProps) {
  const {
    createTask: onCreateTask,
    reorderTasks: onReorderTasks,
    moveTask: onMoveTask,
  } = useTaskActions();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'card' | 'column' | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Visual-only column override while a card is mid-drag. The move API call
  // happens ONCE on drop — the old code fired an unawaited POST per column
  // crossing during dragOver, and whichever response landed last won (cards
  // snapped back to columns the pointer had merely passed through).
  const [dragOverride, setDragOverride] = useState<{
    taskId: string;
    column: string;
  } | null>(null);

  const effectiveTasks = useMemo(() => {
    if (!dragOverride) return tasks;
    return tasks.map((t) =>
      t.id === dragOverride.taskId
        ? {
            ...t,
            sectionId:
              dragOverride.column === UNSECTIONED_ID ? null : dragOverride.column,
          }
        : t,
    );
  }, [tasks, dragOverride]);

  // Group tasks by section
  const unsectionedTasks = useMemo(
    () =>
      effectiveTasks
        .filter((t) => !t.sectionId && !t.parentId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [effectiveTasks],
  );

  const tasksBySection = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of effectiveTasks) {
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
  }, [effectiveTasks]);

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
      let targetColumn: string | null;

      // If dropped over a column droppable
      if (overId.startsWith('column-')) {
        targetColumn = overId.replace('column-', '');
      } else {
        // Dropped over another card - find its column
        targetColumn = findColumnForTask(overId);
      }

      if (!sourceColumn || !targetColumn || sourceColumn === targetColumn) return;

      // Visual feedback only — the single API call happens on drop.
      setDragOverride({ taskId: activeTaskId, column: targetColumn });
    },
    [findColumnForTask],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      setActiveType(null);
      setDragOverride(null);

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
      const targetColumn = overId.startsWith('column-')
        ? overId.replace('column-', '')
        : findColumnForTask(overId);

      if (!targetColumn) return;

      // Commit a cross-column move exactly once, against the task's REAL
      // column from props (the local override is visual only).
      const originalTask = tasks.find((t) => t.id === activeTaskId);
      const originalColumn = originalTask?.sectionId ?? UNSECTIONED_ID;
      if (originalTask && targetColumn !== originalColumn) {
        await onMoveTask(activeTaskId, {
          sectionId: targetColumn === UNSECTIONED_ID ? null : targetColumn,
        });
      }

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
    [columnIds, findColumnForTask, getColumnTasks, onReorderSections, onReorderTasks, onMoveTask, tasks],
  );

  const handleCreateTaskInColumn = useCallback(
    async (columnId: string, content: string) => {
      const sectionId = columnId === UNSECTIONED_ID ? undefined : columnId;
      await onCreateTask({ content, projectId, sectionId });
    },
    [projectId, onCreateTask],
  );

  // Get active task for drag overlay
  const activeTask =
    activeId && activeType === 'card' ? tasks.find((t) => t.id === activeId) : null;

  return (
    <div>
      <DndContext
        onDragCancel={() => setDragOverride(null)}
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
                  isVirtual={columnId === UNSECTIONED_ID}
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

    </div>
  );
}
