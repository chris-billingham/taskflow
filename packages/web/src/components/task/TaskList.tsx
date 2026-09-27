import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
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
  /**
   * Join an enclosing DndContext as one sortable list among several (a
   * project's sections), so tasks can be dragged between lists. The page's
   * onDragEnd reads `containerId` from the dragged task and the drop target.
   */
  containerId?: string;
}

function SortableTaskItem({ task, containerId }: { task: Task; containerId?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', containerId },
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
/** A list inside a shared drag context; an empty one is still a drop target. */
function SharedTaskList({ tasks, containerId, emptyMessage }: { tasks: Task[]; containerId: string; emptyMessage: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `list:${containerId}`,
    data: { type: 'task-list', containerId },
  });
  return (
    <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
      <div ref={setNodeRef} className={`space-y-0.5 min-h-[2.5rem] rounded-sm ${isOver ? 'bg-primary-50/60 dark:bg-primary-900/10' : ''}`}>
        {tasks.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 italic py-3 px-2">{emptyMessage}</p>
        ) : (
          tasks.map((task) => <SortableTaskItem key={task.id} task={task} containerId={containerId} />)
        )}
      </div>
    </SortableContext>
  );
}

export function TaskList({ tasks, emptyMessage = 'No tasks yet', externalDnd = false, containerId }: TaskListProps) {
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

  if (containerId) {
    return <SharedTaskList tasks={tasks} containerId={containerId} emptyMessage={emptyMessage} />;
  }

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
