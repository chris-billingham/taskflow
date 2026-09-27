import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TaskItem } from './TaskItem';
import { useTaskActions } from '@/queries/taskActions';
import type { Task } from '@/types/task';

interface TaskListProps {
  tasks: Task[];
  emptyMessage?: string;
  /** Let an enclosing DndContext handle drops (e.g. Upcoming's day sections). */
  externalDnd?: boolean;
}

function SortableTaskItem({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <TaskItem task={task} dragHandleProps={listeners} showSubtasks />
    </div>
  );
}

function DraggableTaskItem({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <TaskItem task={task} dragHandleProps={listeners} showSubtasks />
    </div>
  );
}

/** A list of task rows, reorderable by drag. */
export function TaskList({ tasks, emptyMessage = 'No tasks yet', externalDnd = false }: TaskListProps) {
  const { reorderTasks } = useTaskActions();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const ids = tasks.map((t) => t.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const newIds = [...ids];
    newIds.splice(oldIndex, 1);
    newIds.splice(newIndex, 0, active.id as string);
    void reorderTasks(newIds);
  };

  if (tasks.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-gray-500 italic py-3 px-2">{emptyMessage}</p>;
  }

  // Draggable (not sortable) items, so the parent DndContext handles drops.
  if (externalDnd) {
    return (
      <div className="space-y-0.5">
        {tasks.map((task) => (
          <DraggableTaskItem key={task.id} task={task} />
        ))}
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-0.5">
          {tasks.map((task) => (
            <SortableTaskItem key={task.id} task={task} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
