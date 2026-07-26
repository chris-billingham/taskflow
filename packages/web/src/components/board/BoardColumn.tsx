import { useState, useRef, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, GripVertical, Trash2 } from 'lucide-react';
import { BoardCard } from './BoardCard';
import { BoardQuickAdd } from './BoardQuickAdd';
import type { Task } from '@/stores/taskStore';
import { getSubtasks } from '@/utils/subtaskIndex';

interface BoardColumnProps {
  columnId: string;
  title: string;
  tasks: Task[];
  allTasks: Map<string, Task>;
  isVirtual?: boolean;
  onTaskClick: (task: Task) => void;
  onCompleteTask: (id: string) => void;
  onUncompleteTask: (id: string) => void;
  onCreateTask: (content: string) => Promise<void>;
  onUpdateSection?: (id: string, data: { name?: string }) => void;
  onDeleteSection?: (id: string) => void;
}

export function BoardColumn({
  columnId,
  title,
  tasks,
  allTasks,
  isVirtual,
  onTaskClick,
  onCompleteTask,
  onUncompleteTask,
  onCreateTask,
  onUpdateSection,
  onDeleteSection,
}: BoardColumnProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sortable for column reordering (only non-virtual columns)
  const {
    attributes: sortableAttributes,
    listeners: sortableListeners,
    setNodeRef: setSortableRef,
    transform: sortableTransform,
    transition: sortableTransition,
    isDragging: isColumnDragging,
  } = useSortable({
    id: columnId,
    data: { type: 'column' },
    disabled: !!isVirtual,
  });

  // Droppable zone for receiving cards
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `column-${columnId}`,
    data: { type: 'column', columnId },
  });

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSubmitEdit = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== title && onUpdateSection && !isVirtual) {
      onUpdateSection(columnId, { name: trimmed });
    } else {
      setEditName(title);
    }
    setIsEditing(false);
  };

  const sortableStyle = {
    transform: CSS.Transform.toString(sortableTransform),
    transition: sortableTransition,
    opacity: isColumnDragging ? 0.5 : 1,
  };

  const taskIds = tasks.map((t) => t.id);

  return (
    <div
      ref={setSortableRef}
      style={sortableStyle}
      className="group bg-gray-50 rounded-lg min-w-[280px] w-[280px] flex flex-col max-h-[calc(100vh-200px)] flex-shrink-0"
    >
      {/* Column header */}
      <div className="px-3 py-2 flex items-center gap-2 border-b border-gray-200">
        {!isVirtual && (
          <div
            className="cursor-grab flex-shrink-0 opacity-0 hover:opacity-100 transition-opacity"
            {...sortableAttributes}
            {...sortableListeners}
          >
            <GripVertical className="w-4 h-4 text-gray-300" />
          </div>
        )}

        <button
          className="flex-shrink-0"
          onClick={() => setCollapsed(!collapsed)}
        >
          <ChevronDown
            className={`w-4 h-4 text-gray-400 transition-transform ${
              collapsed ? '-rotate-90' : ''
            }`}
          />
        </button>

        {isEditing && !isVirtual ? (
          <input
            ref={inputRef}
            className="flex-1 text-sm font-semibold bg-white border border-[#db4c3f] rounded px-1 py-0.5 outline-none"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleSubmitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmitEdit();
              if (e.key === 'Escape') {
                setEditName(title);
                setIsEditing(false);
              }
            }}
          />
        ) : (
          <span
            className="flex-1 text-sm font-semibold text-gray-700 truncate cursor-pointer"
            onClick={() => {
              if (!isVirtual) setIsEditing(true);
            }}
          >
            {title}
          </span>
        )}

        <span className="text-xs text-gray-400 flex-shrink-0">
          {tasks.length}
        </span>

        {!isVirtual && onDeleteSection && (
          <button
            className="p-1 rounded hover:bg-gray-200 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity flex-shrink-0"
            onClick={() => {
              if (window.confirm(`Delete section "${title}"? Its tasks move out of the board columns.`)) {
                onDeleteSection(columnId);
              }
            }}
            title="Delete section"
            aria-label="Delete section"
          >
            <Trash2 className="w-3.5 h-3.5 text-gray-400" />
          </button>
        )}
      </div>

      {/* Cards area */}
      {!collapsed && (
        <div
          ref={setDropRef}
          className={`flex-1 overflow-y-auto px-2 py-2 space-y-2 ${
            isOver ? 'bg-blue-50/50' : ''
          }`}
        >
          <SortableContext
            items={taskIds}
            strategy={verticalListSortingStrategy}
          >
            {tasks.map((task) => {
              const subtasks = getSubtasks(allTasks, task.id);
              return (
                <BoardCard
                  key={task.id}
                  task={task}
                  subtasks={subtasks}
                  onClick={onTaskClick}
                  onComplete={onCompleteTask}
                  onUncomplete={onUncompleteTask}
                />
              );
            })}
          </SortableContext>

          {tasks.length === 0 && (
            <div
              className={`text-xs text-gray-400 text-center py-4 border-2 border-dashed border-gray-200 rounded-lg ${
                isOver ? 'border-blue-300 bg-blue-50' : ''
              }`}
            >
              {isOver ? 'Drop here' : 'No tasks'}
            </div>
          )}
        </div>
      )}

      {/* Quick add at bottom */}
      {!collapsed && (
        <div className="px-2 pb-2">
          <BoardQuickAdd onSubmit={onCreateTask} />
        </div>
      )}
    </div>
  );
}
