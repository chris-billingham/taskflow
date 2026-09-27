import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { addDays, format } from 'date-fns';
import { Rows3 } from 'lucide-react';
import { BoardColumn } from '@/components/board/BoardColumn';
import { BoardCardOverlay } from '@/components/board/BoardCard';
import { Menu, MenuItem } from '@/components/ui/Menu';
import { useTaskActions } from '@/queries/taskActions';
import { useUIStore, type BoardGrouping } from '@/stores/uiStore';
import type { Task } from '@/types/task';

export const GROUPING_LABELS: Record<BoardGrouping, string> = {
  section: 'Section',
  priority: 'Priority',
  assignee: 'Assignee',
  dueDate: 'Due date',
  project: 'Project',
};

/** The grouping saved for a board, or its default. */
export function useBoardGrouping(view: string, fallback: BoardGrouping) {
  const grouping = useUIStore((s) => s.boardGrouping[view]) ?? fallback;
  const setBoardGrouping = useUIStore((s) => s.setBoardGrouping);
  return [grouping, (g: BoardGrouping) => setBoardGrouping(view, g)] as const;
}

export function BoardGroupingMenu({
  value,
  options,
  onChange,
}: {
  value: BoardGrouping;
  options: BoardGrouping[];
  onChange: (grouping: BoardGrouping) => void;
}) {
  return (
    <Menu
      label={`Group by: ${GROUPING_LABELS[value]}`}
      triggerVariant="plain"
      triggerClassName="flex items-center gap-1.5 px-2 py-1 text-sm text-gray-600 dark:text-gray-400 rounded-sm hover:bg-gray-100 dark:hover:bg-gray-700"
      trigger={
        <>
          <Rows3 className="w-4 h-4" aria-hidden="true" />
          Group: {GROUPING_LABELS[value]}
        </>
      }
      menuClassName="w-44"
    >
      {options.map((option) => (
        <MenuItem key={option} checked={option === value} onSelect={() => onChange(option)}>
          {GROUPING_LABELS[option]}
        </MenuItem>
      ))}
    </Menu>
  );
}

interface Column {
  id: string;
  title: string;
  tasks: Task[];
  /** What a card dropped here changes; null when it can't take one. */
  drop: ((task: Task) => void) | null;
}

const dateKey = (task: Task) => task.dueDate?.split('T')[0] ?? null;

// Priority first, then soonest due, then name.
function byUrgency(a: Task, b: Task) {
  if (a.priority !== b.priority) return a.priority - b.priority;
  const da = dateKey(a) ?? '9999';
  const db = dateKey(b) ?? '9999';
  if (da !== db) return da < db ? -1 : 1;
  return a.content.localeCompare(b.content);
}

type BoardActions = Pick<ReturnType<typeof useTaskActions>, 'updateTask' | 'moveTask'>;

/**
 * The columns for a grouping, each with what dropping a card on it does.
 * Exported for tests.
 */
export function boardColumns(
  tasks: Task[],
  grouping: Exclude<BoardGrouping, 'section'>,
  { updateTask, moveTask }: BoardActions,
  now: Date = new Date(),
): Column[] {
  const sorted = [...tasks].sort(byUrgency);
  const where = (test: (t: Task) => boolean) => sorted.filter(test);

  if (grouping === 'priority') {
    return [1, 2, 3, 4].map((p) => ({
      id: `p${p}`,
      title: `Priority ${p}`,
      tasks: where((t) => t.priority === p),
      drop: (t) => void updateTask(t.id, { priority: p }),
    }));
  }

  if (grouping === 'assignee') {
    const people = new Map<string, string>();
    for (const t of sorted) if (t.assignee) people.set(t.assignee.id, t.assignee.name);
    return [
      {
        id: 'unassigned',
        title: 'Unassigned',
        tasks: where((t) => !t.assignee),
        drop: (t) => void updateTask(t.id, { assigneeId: null }),
      },
      ...[...people]
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([id, name]) => ({
          id: `user-${id}`,
          title: name,
          tasks: where((t) => t.assignee?.id === id),
          drop: (t: Task) => void updateTask(t.id, { assigneeId: id }),
        })),
    ];
  }

  if (grouping === 'project') {
    const projects = new Map<string, string>();
    for (const t of sorted) if (t.project) projects.set(t.project.id, t.project.name);
    return [...projects]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, name]) => ({
        id: `project-${id}`,
        title: name,
        tasks: where((t) => t.projectId === id),
        drop: (t: Task) => void moveTask(t.id, { projectId: id, sectionId: null }),
      }));
  }

  // Due date: fixed buckets. Only the ones that name one day take a drop.
  const today = format(now, 'yyyy-MM-dd');
  const tomorrow = format(addDays(now, 1), 'yyyy-MM-dd');
  const weekEnd = format(addDays(now, 7), 'yyyy-MM-dd');
  const setDate = (date: string | null) => (t: Task) =>
    void updateTask(t.id, date ? { dueDate: date } : { dueDate: null, dueTime: null });
  const overdue = where((t) => (dateKey(t) ?? '9999') < today);
  return [
    ...(overdue.length > 0 ? [{ id: 'overdue', title: 'Overdue', tasks: overdue, drop: null }] : []),
    { id: 'today', title: 'Today', tasks: where((t) => dateKey(t) === today), drop: setDate(today) },
    { id: 'tomorrow', title: 'Tomorrow', tasks: where((t) => dateKey(t) === tomorrow), drop: setDate(tomorrow) },
    {
      id: 'week',
      title: 'Next 7 days',
      tasks: where((t) => {
        const d = dateKey(t);
        return d !== null && d > tomorrow && d <= weekEnd;
      }),
      drop: null,
    },
    { id: 'later', title: 'Later', tasks: where((t) => (dateKey(t) ?? '') > weekEnd), drop: null },
    { id: 'none', title: 'No date', tasks: where((t) => !t.dueDate), drop: setDate(null) },
  ];
}

interface GroupedBoardProps {
  tasks: Task[];
  grouping: Exclude<BoardGrouping, 'section'>;
}

/**
 * A board whose columns come from a task field instead of sections. Dragging a
 * card to another column changes that field: its priority, assignee, due date
 * or project.
 */
export function GroupedBoard({ tasks, grouping }: GroupedBoardProps) {
  const { updateTask, moveTask } = useTaskActions();
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columns = useMemo(
    () => boardColumns(tasks, grouping, { updateTask, moveTask }),
    [tasks, grouping, updateTask, moveTask],
  );

  const columnOf = (id: string) =>
    id.startsWith('column-')
      ? columns.find((c) => `column-${c.id}` === id)
      : columns.find((c) => c.tasks.some((t) => t.id === id));

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return;
    const target = columnOf(String(over.id));
    const task = tasks.find((t) => t.id === active.id);
    if (target?.drop && task && columnOf(task.id) !== target) target.drop(task);
  };

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={({ active }) => setActiveId(String(active.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={handleDragEnd}
    >
      <div className="flex overflow-x-auto gap-4 p-4">
        {columns.map((column) => (
          <BoardColumn
            key={column.id}
            columnId={column.id}
            title={column.title}
            tasks={column.tasks}
            isVirtual
            dropDisabled={!column.drop}
          />
        ))}
        {columns.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No tasks to show.</p>}
      </div>
      <DragOverlay>{activeTask && <BoardCardOverlay task={activeTask} />}</DragOverlay>
    </DndContext>
  );
}
