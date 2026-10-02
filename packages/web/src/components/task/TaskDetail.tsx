import { useState, useEffect, useRef } from 'react';
import { formatUserDate } from '@/utils/dateFormat';
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
  Repeat,
  Pencil,
} from 'lucide-react';
import { TaskCheckbox } from './TaskCheckbox';
import { DueDatePicker } from './DueDatePicker';
import { PriorityPicker } from './PriorityPicker';
import { DurationPicker } from './DurationPicker';
import { LabelPicker, LabelBadges } from './LabelPicker';
import { AssigneePicker } from './AssigneePicker';
import { ReminderPicker } from './ReminderPicker';
import { RecurrencePicker } from './RecurrencePicker';
import { QuickAdd } from './QuickAdd';
import { MoveTaskDialog } from './MoveTaskDialog';
import { CommentList } from '@/components/comment/CommentList';
import { ActivityLog } from '@/components/activity/ActivityLog';
import { AttachmentList } from '@/components/attachment/AttachmentList';
import type { Task } from '@/types/task';
import { Sheet } from '@/components/ui/Sheet';
import { IconButton } from '@/components/ui/IconButton';
import { Markdown } from '@/components/ui/Markdown';
import { PresenceIndicator } from '@/components/ui/PresenceIndicator';

interface TaskDetailProps {
  task: Task;
  onClose: () => void;
  onUpdate: (id: string, data: Record<string, any>) => void;
  onComplete: (id: string) => void;
  onUncomplete: (id: string) => void;
  onDelete: (id: string) => void;
  onAddSubtask: (text: string) => Promise<void>;
  subtasks?: Task[];
  /** Open a subtask in the panel (it becomes the task shown). */
  onOpenSubtask?: (id: string) => void;
  /** Without it the task is shown read-only. */
  canEdit?: boolean;
  canComment?: boolean;
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
  onOpenSubtask,
  canEdit = true,
  canComment = true,
}: TaskDetailProps) {
  const [editingContent, setEditingContent] = useState(false);
  const [content, setContent] = useState(task.content);
  const [editingDescription, setEditingDescription] = useState(false);
  const [description, setDescription] = useState(task.description || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [moving, setMoving] = useState(false);
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
    <Sheet onClose={onClose} label="Task detail">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <TaskCheckbox
              checked={task.isCompleted}
              priority={task.priority}
              disabled={!canEdit}
              onChange={(checked) => {
                if (checked) onComplete(task.id);
                else onUncomplete(task.id);
              }}
            />
            {task.parent && onOpenSubtask && (
              <button
                type="button"
                className="text-xs text-gray-500 dark:text-gray-400 hover:underline truncate max-w-40"
                onClick={() => onOpenSubtask(task.parent!.id)}
                aria-label={`Open parent task: ${task.parent.content}`}
              >
                ↑ {task.parent.content}
              </button>
            )}
            {task.project && (
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => setMoving(true)}
                aria-label={`Move task (now in ${task.project.name}${task.section ? ` / ${task.section.name}` : ''})`}
                title="Move to another project or section"
                className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 px-1.5 py-0.5 -ml-1.5 rounded-sm enabled:hover:bg-gray-100 dark:enabled:hover:bg-gray-700"
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: task.project.color }}
                  aria-hidden="true"
                />
                {task.project.name}
                {task.section && <span> / {task.section.name}</span>}
              </button>
            )}
            {moving && <MoveTaskDialog isOpen onClose={() => setMoving(false)} task={task} />}
          </div>
          <PresenceIndicator taskId={task.id} className="ml-auto mr-2 min-w-0" />
          <IconButton label="Close task detail" onClick={onClose}>
            <X className="w-5 h-5" />
          </IconButton>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {!canEdit && (
            <p role="note" className="mb-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-800 dark:text-amber-200">
              {canComment
                ? 'You can comment on this task, but not change it.'
                : 'You can view this task, but not change it.'}
            </p>
          )}

          {/* Task content */}
          {editingContent && canEdit ? (
            <input
              ref={contentRef}
              className="w-full text-lg font-medium text-gray-900 dark:text-white bg-transparent border-b-2 border-primary-500 outline-hidden pb-1 mb-3"
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
              className={`text-lg font-medium mb-3 ${canEdit ? 'cursor-pointer hover:text-primary-500' : ''} ${
                task.isCompleted ? 'line-through text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white'
              }`}
              onClick={() => canEdit && setEditingContent(true)}
            >
              {task.content}
            </h2>
          )}

          {/* Description */}
          {!canEdit ? (
            task.description && (
              <div className="text-sm mb-4">
                <Markdown className="text-gray-700 dark:text-gray-300">{task.description}</Markdown>
              </div>
            )
          ) : editingDescription ? (
            <div className="mb-4">
              <textarea
                ref={descRef}
                aria-label="Description"
                className="w-full text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg p-3 outline-hidden focus:border-primary-500 resize-y font-mono"
                rows={Math.min(16, Math.max(4, description.split('\n').length + 1))}
                placeholder="Add a description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={handleDescriptionSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleDescriptionSubmit();
                  }
                  if (e.key === 'Escape') {
                    setDescription(task.description || '');
                    setEditingDescription(false);
                  }
                }}
              />
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                Markdown supported: **bold**, _italic_, lists, links and [ ] checklists &middot; Ctrl+Enter to save
              </p>
            </div>
          ) : task.description ? (
            // Click anywhere but a link or checkbox to edit; the pencil is the
            // keyboard way in.
            <div
              className="group/desc relative text-sm text-gray-600 dark:text-gray-400 mb-4 cursor-text hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg p-2 pr-8 -mx-2"
              onClick={() => setEditingDescription(true)}
            >
              <Markdown
                className="text-gray-700 dark:text-gray-300"
                onChange={(next) => {
                  setDescription(next);
                  onUpdate(task.id, { description: next });
                }}
              >
                {task.description}
              </Markdown>
              <button
                type="button"
                aria-label="Edit description"
                className="absolute top-1.5 right-1.5 p-1 rounded-sm text-gray-400 opacity-0 group-hover/desc:opacity-100 focus-visible:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-600"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingDescription(true);
                }}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="block w-full text-left text-sm text-gray-400 dark:text-gray-500 italic mb-4 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg p-2 -mx-2 min-h-[40px]"
              onClick={() => setEditingDescription(true)}
            >
              Add a description...
            </button>
          )}

          {/* Properties. Reminders are your own, so they stay usable. */}
          <div className="space-y-3 mb-6">
            {/* Due date */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 dark:text-gray-400 w-24 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Due date
              </span>
              <fieldset disabled={!canEdit} className="contents">
                  <DueDatePicker
                  value={task.dueDate}
                  time={task.dueTime}
                  onChange={(date, time) => onUpdate(task.id, { dueDate: date, dueTime: time })}
                />
              </fieldset>
            </div>

            {/* Reminders */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 dark:text-gray-400 w-24 flex items-center gap-2">
                <Bell className="w-4 h-4" />
                Reminders
              </span>
              <ReminderPicker taskId={task.id} />
            </div>

            {/* Repeat */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 dark:text-gray-400 w-24 flex items-center gap-2">
                <Repeat className="w-4 h-4" />
                Repeat
              </span>
              <fieldset disabled={!canEdit} className="contents">
                  <RecurrencePicker
                  isRecurring={task.isRecurring}
                  recurrenceRule={task.recurrenceRule}
                  onChange={(recurrenceRule) =>
                    // isRecurring is what the completion path checks before
                    // spawning the next occurrence, so the flag and the rule have
                    // to move together or the series silently does nothing.
                    onUpdate(task.id, {
                      recurrenceRule,
                      isRecurring: recurrenceRule !== null,
                    })
                  }
                />
              </fieldset>
            </div>

            {/* Deadline */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 dark:text-gray-400 w-24 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Deadline
              </span>
              <fieldset disabled={!canEdit} className="contents">
                  <DueDatePicker
                  value={task.deadline}
                  onChange={(date) => onUpdate(task.id, { deadline: date })}
                />
              </fieldset>
            </div>

            {/* Priority */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 dark:text-gray-400 w-24 flex items-center gap-2">
                <Flag className="w-4 h-4" />
                Priority
              </span>
              <fieldset disabled={!canEdit} className="contents">
                  <PriorityPicker
                  value={task.priority}
                  onChange={(priority) => onUpdate(task.id, { priority })}
                />
              </fieldset>
            </div>

            {/* Labels */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 dark:text-gray-400 w-24 flex items-center gap-2">
                <Tag className="w-4 h-4" />
                Labels
              </span>
              <div className="flex items-center gap-2">
                <LabelBadges labels={task.taskLabels} />
                <fieldset disabled={!canEdit} className="contents">
                    <LabelPicker
                    projectId={task.projectId}
                    selectedIds={task.taskLabels.map((tl) => tl.labelId)}
                    onChange={(labelIds) => onUpdate(task.id, { labelIds })}
                  />
                </fieldset>
              </div>
            </div>

            {/* Assignee */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 dark:text-gray-400 w-24 flex items-center gap-2">
                <User className="w-4 h-4" />
                Assignee
              </span>
              <fieldset disabled={!canEdit} className="contents">
                  <AssigneePicker
                  projectId={task.projectId}
                  value={task.assigneeId}
                  assignee={task.assignee}
                  onChange={(assigneeId) => onUpdate(task.id, { assigneeId })}
                />
              </fieldset>
            </div>

            {/* Duration */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 dark:text-gray-400 w-24 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Duration
              </span>
              <fieldset disabled={!canEdit} className="contents">
                  <DurationPicker
                  value={task.duration}
                  onChange={(duration) => onUpdate(task.id, { duration })}
                />
              </fieldset>
            </div>
          </div>

          {/* Subtasks */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
              Subtasks
              {subtasks && subtasks.length > 0 && (
                <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">
                  ({subtasks.filter((s) => s.isCompleted).length}/{subtasks.length})
                </span>
              )}
            </h3>

            {subtasks && subtasks.length > 0 && (
              <div className="space-y-1 mb-2">
                {subtasks.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center gap-2 py-1 px-2 rounded-sm hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <TaskCheckbox
                      checked={sub.isCompleted}
                      priority={sub.priority}
                      disabled={!canEdit}
                      onChange={(checked) => {
                        if (checked) onComplete(sub.id);
                        else onUncomplete(sub.id);
                      }}
                    />
                    <button
                      type="button"
                      className={`text-sm flex-1 text-left hover:underline ${
                        sub.isCompleted ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'
                      }`}
                      onClick={() => onOpenSubtask?.(sub.id)}
                      aria-label={`Open subtask: ${sub.content}`}
                    >
                      {sub.content}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {canEdit ? (
              <QuickAdd
                projectId={task.projectId}
                parentId={task.id}
                onSubmit={onAddSubtask}
                placeholder="Add subtask"
                inline
              />
            ) : (
              (!subtasks || subtasks.length === 0) && (
                <p className="text-xs text-gray-400 dark:text-gray-500 italic py-1">No subtasks.</p>
              )
            )}
          </div>

          {/* Attachments */}
          <div className="mb-6">
            <AttachmentList taskId={task.id} canUpload={canEdit} />
          </div>

          {/* Comments */}
          <div className="mb-6">
            <CommentList taskId={task.id} projectId={task.projectId} canComment={canComment} />
          </div>

          {/* Activity */}
          <div className="mb-6">
            <ActivityLog taskId={task.id} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            Created {formatUserDate(new Date(task.createdAt))}
          </span>
          {!canEdit ? null : showDeleteConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-600 dark:text-red-400">Delete this task?</span>
              <button
                className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-sm"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="px-2 py-1 text-xs text-white bg-red-600 hover:bg-red-700 rounded-sm"
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
              className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-sm"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          )}
        </div>
    </Sheet>
  );
}
