import { useState, useEffect, useRef } from 'react';
import {
  X,
  Calendar,
  Flag,
  Tag,
  Clock,
  Trash2,
  AlertCircle,
  User,
  Bell,
} from 'lucide-react';
import { TaskCheckbox } from './TaskCheckbox';
import { DueDatePicker } from './DueDatePicker';
import { PriorityPicker } from './PriorityPicker';
import { DurationPicker } from './DurationPicker';
import { LabelPicker, LabelBadges } from './LabelPicker';
import { AssigneePicker } from './AssigneePicker';
import { ReminderPicker } from './ReminderPicker';
import { QuickAdd } from './QuickAdd';
import { CommentList } from '@/components/comment/CommentList';
import { ActivityLog } from '@/components/activity/ActivityLog';
import { AttachmentList } from '@/components/attachment/AttachmentList';
import type { Task } from '@/stores/taskStore';

interface TaskDetailProps {
  task: Task;
  onClose: () => void;
  onUpdate: (id: string, data: Record<string, any>) => void;
  onComplete: (id: string) => void;
  onUncomplete: (id: string) => void;
  onDelete: (id: string) => void;
  onAddSubtask: (text: string) => Promise<void>;
  subtasks?: Task[];
}

export function TaskDetail({
  task,
  onClose,
  onUpdate,
  onComplete,
  onUncomplete,
  onDelete,
  onAddSubtask,
  subtasks,
}: TaskDetailProps) {
  const [editingContent, setEditingContent] = useState(false);
  const [content, setContent] = useState(task.content);
  const [editingDescription, setEditingDescription] = useState(false);
  const [description, setDescription] = useState(task.description || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const contentRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setContent(task.content);
    setDescription(task.description || '');
  }, [task.content, task.description]);

  useEffect(() => {
    if (editingContent && contentRef.current) {
      contentRef.current.focus();
      contentRef.current.select();
    }
  }, [editingContent]);

  useEffect(() => {
    if (editingDescription && descRef.current) {
      descRef.current.focus();
    }
  }, [editingDescription]);

  const handleContentSubmit = () => {
    const trimmed = content.trim();
    if (trimmed && trimmed !== task.content) {
      onUpdate(task.id, { content: trimmed });
    } else {
      setContent(task.content);
    }
    setEditingContent(false);
  };

  const handleDescriptionSubmit = () => {
    if (description !== (task.description || '')) {
      onUpdate(task.id, { description: description || null });
    }
    setEditingDescription(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-full max-w-lg bg-white shadow-xl z-50 flex flex-col border-l border-gray-200 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <TaskCheckbox
              checked={task.isCompleted}
              priority={task.priority}
              onChange={(checked) => {
                if (checked) onComplete(task.id);
                else onUncomplete(task.id);
              }}
            />
            {task.project && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: task.project.color }}
                />
                {task.project.name}
                {task.section && <span> / {task.section.name}</span>}
              </span>
            )}
          </div>
          <button
            className="p-1.5 rounded-lg hover:bg-gray-100"
            onClick={onClose}
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {/* Task content */}
          {editingContent ? (
            <input
              ref={contentRef}
              className="w-full text-lg font-medium text-gray-900 bg-transparent border-b-2 border-[#db4c3f] outline-none pb-1 mb-3"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onBlur={handleContentSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleContentSubmit();
                if (e.key === 'Escape') {
                  setContent(task.content);
                  setEditingContent(false);
                }
              }}
            />
          ) : (
            <h2
              className={`text-lg font-medium mb-3 cursor-pointer hover:text-[#db4c3f] ${
                task.isCompleted ? 'line-through text-gray-500' : 'text-gray-900'
              }`}
              onClick={() => setEditingContent(true)}
            >
              {task.content}
            </h2>
          )}

          {/* Description */}
          {editingDescription ? (
            <textarea
              ref={descRef}
              className="w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 outline-none focus:border-[#db4c3f] resize-none mb-4"
              rows={4}
              placeholder="Add a description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleDescriptionSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setDescription(task.description || '');
                  setEditingDescription(false);
                }
              }}
            />
          ) : (
            <div
              className="text-sm text-gray-600 mb-4 cursor-pointer hover:bg-gray-50 rounded-lg p-2 -mx-2 min-h-[40px]"
              onClick={() => setEditingDescription(true)}
            >
              {task.description || (
                <span className="text-gray-400 italic">Add a description...</span>
              )}
            </div>
          )}

          {/* Properties */}
          <div className="space-y-3 mb-6">
            {/* Due date */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 w-24 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Due date
              </span>
              <DueDatePicker
                value={task.dueDate}
                time={task.dueTime}
                onChange={(date, time) => onUpdate(task.id, { dueDate: date, dueTime: time })}
              />
            </div>

            {/* Reminders */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 w-24 flex items-center gap-2">
                <Bell className="w-4 h-4" />
                Reminders
              </span>
              <ReminderPicker taskId={task.id} />
            </div>

            {/* Deadline */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 w-24 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Deadline
              </span>
              <DueDatePicker
                value={task.deadline}
                onChange={(date) => onUpdate(task.id, { deadline: date })}
              />
            </div>

            {/* Priority */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 w-24 flex items-center gap-2">
                <Flag className="w-4 h-4" />
                Priority
              </span>
              <PriorityPicker
                value={task.priority}
                onChange={(priority) => onUpdate(task.id, { priority })}
              />
            </div>

            {/* Labels */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 w-24 flex items-center gap-2">
                <Tag className="w-4 h-4" />
                Labels
              </span>
              <div className="flex items-center gap-2">
                <LabelBadges labels={task.taskLabels} />
                <LabelPicker
                  selectedIds={task.taskLabels.map((tl) => tl.labelId)}
                  onChange={(labelIds) => onUpdate(task.id, { labelIds })}
                />
              </div>
            </div>

            {/* Assignee */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 w-24 flex items-center gap-2">
                <User className="w-4 h-4" />
                Assignee
              </span>
              <AssigneePicker
                projectId={task.projectId}
                value={task.assigneeId}
                assignee={task.assignee}
                onChange={(assigneeId) => onUpdate(task.id, { assigneeId })}
              />
            </div>

            {/* Duration */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 w-24 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Duration
              </span>
              <DurationPicker
                value={task.duration}
                onChange={(duration) => onUpdate(task.id, { duration })}
              />
            </div>
          </div>

          {/* Subtasks */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
              Subtasks
              {subtasks && subtasks.length > 0 && (
                <span className="text-xs text-gray-400 font-normal">
                  ({subtasks.filter((s) => s.isCompleted).length}/{subtasks.length})
                </span>
              )}
            </h3>

            {subtasks && subtasks.length > 0 && (
              <div className="space-y-1 mb-2">
                {subtasks.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50"
                  >
                    <TaskCheckbox
                      checked={sub.isCompleted}
                      priority={sub.priority}
                      onChange={(checked) => {
                        if (checked) onComplete(sub.id);
                        else onUncomplete(sub.id);
                      }}
                    />
                    <span
                      className={`text-sm flex-1 ${
                        sub.isCompleted ? 'line-through text-gray-400' : 'text-gray-700'
                      }`}
                    >
                      {sub.content}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <QuickAdd
              projectId={task.projectId}
              parentId={task.id}
              onSubmit={onAddSubtask}
              placeholder="Add subtask"
              inline
            />
          </div>

          {/* Attachments */}
          <div className="mb-6">
            <AttachmentList taskId={task.id} />
          </div>

          {/* Comments */}
          <div className="mb-6">
            <CommentList taskId={task.id} />
          </div>

          {/* Activity */}
          <div className="mb-6">
            <ActivityLog taskId={task.id} taskUpdatedAt={task.updatedAt} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
          <span className="text-xs text-gray-400">
            Created {new Date(task.createdAt).toLocaleDateString()}
          </span>
          {showDeleteConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-600">Delete this task?</span>
              <button
                className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="px-2 py-1 text-xs text-white bg-red-600 hover:bg-red-700 rounded"
                onClick={() => {
                  onDelete(task.id);
                  onClose();
                }}
              >
                Delete
              </button>
            </div>
          ) : (
            <button
              className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          )}
        </div>
      </div>
    </>
  );
}
