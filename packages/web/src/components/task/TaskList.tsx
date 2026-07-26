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
import type { Task } from '@/stores/taskStore';
import { getSubtasks } from '@/utils/subtaskIndex';

interface TaskListProps {
  tasks: Task[];
  allTasks?: Map<string, Task>;
  onComplete: (id: string) => void;
  onUncomplete: (id: string) => void;
  onTaskClick: (task: Task) => void;
  onUpdate: (id: string, data: Record<string, any>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onReorder: (taskIds: string[]) => void;
  emptyMessage?: string;
  externalDnd?: boolean;
}

function SortableTaskItem({
  task,
  allTasks,
  onComplete,
  onUncomplete,
  onTaskClick,
  onUpdate,
  onDelete,
  onDuplicate,
}: {
  task: Task;
  allTasks?: Map<string, Task>;
  onComplete: (id: string) => void;
  onUncomplete: (id: string) => void;
  onTaskClick: (task: Task) => void;
  onUpdate: (id: string, data: Record<string, any>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Get subtasks from allTasks map
  const subtasks = allTasks
    ? getSubtasks(allTasks, task.id)
    : task.subtasks;

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <TaskItem
        task={task}
        onComplete={onComplete}
        onUncomplete={onUncomplete}
        onClick={onTaskClick}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        dragHandleProps={listeners}
        showSubtasks
        subtasks={subtasks}
      />
    </div>
  );
}

function DraggableTaskItem({
  task,
  allTasks,
  onComplete,
  onUncomplete,
  onTaskClick,
  onUpdate,
  onDelete,
  onDuplicate,
}: {
  task: Task;
  allTasks?: Map<string, Task>;
  onComplete: (id: string) => void;
  onUncomplete: (id: string) => void;
  onTaskClick: (task: Task) => void;
  onUpdate: (id: string, data: Record<string, any>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id: task.id });

  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  const subtasks = allTasks
    ? getSubtasks(allTasks, task.id)
    : task.subtasks;

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <TaskItem
        task={task}
        onComplete={onComplete}
        onUncomplete={onUncomplete}
        onClick={onTaskClick}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        dragHandleProps={listeners}
        showSubtasks
        subtasks={subtasks}
      />
    </div>
  );
}

export function TaskList({
  tasks,
  allTasks,
  onComplete,
  onUncomplete,
  onTaskClick,
  onUpdate,
  onDelete,
  onDuplicate,
  onReorder,
  emptyMessage = 'No tasks yet',
  externalDnd = false,
}: TaskListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
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
    onReorder(newIds);
  };

  if (tasks.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic py-3 px-2">{emptyMessage}</p>
    );
  }

  // When externalDnd is true, skip the inner DndContext and render
  // draggable (not sortable) items so the parent DndContext handles drops.
  if (externalDnd) {
    return (
      <div className="space-y-0.5">
        {tasks.map((task) => (
          <DraggableTaskItem
            key={task.id}
            task={task}
            allTasks={allTasks}
            onComplete={onComplete}
            onUncomplete={onUncomplete}
            onTaskClick={onTaskClick}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
          />
        ))}
      </div>
    );
  }

  const taskIds = tasks.map((t) => t.id);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={taskIds}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-0.5">
          {tasks.map((task) => (
            <SortableTaskItem
              key={task.id}
              task={task}
              allTasks={allTasks}
              onComplete={onComplete}
              onUncomplete={onUncomplete}
              onTaskClick={onTaskClick}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
