import { useEffect, useState } from 'react';
import { format, addDays, nextMonday } from 'date-fns';
import { createPortal } from 'react-dom';
import { Calendar, CheckCircle2, Flag, FolderInput, Tag, Trash2, X } from 'lucide-react';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/Menu';
import { IconButton } from '@/components/ui/IconButton';
import { MoveTaskDialog } from './MoveTaskDialog';
import { useSelectionStore } from '@/stores/selectionStore';
import { useTaskActions } from '@/queries/taskActions';
import { useLabels } from '@/queries/labels';
import { findCachedTask } from '@/queries/taskCache';
import { useQueryClient } from '@tanstack/react-query';
import { toastUndo } from '@/stores/toastStore';

const plural = (n: number) => `${n} task${n === 1 ? '' : 's'}`;
const PRIORITY_NAMES = { 1: 'Priority 1', 2: 'Priority 2', 3: 'Priority 3', 4: 'No priority' } as const;

/**
 * Actions for the selected tasks: complete, date, priority, move, labels,
 * delete. Shown at the bottom of the screen while anything is selected.
 */
export function BulkActionBar() {
  const ids = useSelectionStore((s) => s.ids);
  const clear = useSelectionStore((s) => s.clear);
  const { bulkUpdate, moveTask } = useTaskActions();
  const { labels } = useLabels();
  const qc = useQueryClient();
  const [moving, setMoving] = useState(false);

  // Escape clears the selection, unless something on top (a menu, a dialog)
  // took the key first.
  useEffect(() => {
    if (ids.length === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('[role="dialog"]')) clear();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [ids.length, clear]);

  if (ids.length === 0) return null;

  const act = async (run: () => Promise<unknown>) => {
    clear();
    await run();
  };

  const complete = () =>
    act(async () => {
      // Completing a repeating task spawns its next occurrence, which a plain
      // uncomplete can't take back, so Undo is only offered without them.
      const repeating = ids.some((id) => findCachedTask(qc, id)?.isRecurring);
      await bulkUpdate(ids, 'complete');
      if (!repeating) toastUndo(`${plural(ids.length)} completed`, () => void bulkUpdate(ids, 'uncomplete'));
    });

  const remove = () =>
    act(async () => {
      await bulkUpdate(ids, 'delete');
      toastUndo(`${plural(ids.length)} moved to trash`, () => void bulkUpdate(ids, 'restore'));
    });

  const setDate = (dueDate: string | null) => act(() => bulkUpdate(ids, 'setDueDate', { dueDate }));

  const moveTo = (destination: { projectId: string; sectionId: string | null }) => {
    // Remember where each one was, so Undo can put every task back.
    const origins = ids
      .map((id) => ({ id, from: findCachedTask(qc, id) }))
      .filter((o): o is { id: string; from: NonNullable<typeof o.from> } => Boolean(o.from));
    void act(async () => {
      await bulkUpdate(ids, 'move', destination);
      toastUndo(`${plural(ids.length)} moved`, () => {
        for (const { id, from } of origins) {
          void moveTask(
            id,
            { projectId: from.projectId, sectionId: from.sectionId, parentId: from.parentId },
            { undo: false },
          );
        }
      });
    });
  };

  const today = new Date();
  const day = (d: Date) => format(d, 'yyyy-MM-dd');

  return createPortal(
    <div
      role="toolbar"
      aria-label={`Actions for ${plural(ids.length)}`}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 px-3 py-2 rounded-xl shadow-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 max-w-[calc(100vw-2rem)] overflow-x-auto"
    >
      <span className="text-sm font-medium text-gray-700 dark:text-gray-200 px-2 whitespace-nowrap" aria-live="polite">
        {ids.length} selected
      </span>
      <IconButton label="Complete" onClick={() => void complete()}>
        <CheckCircle2 className="w-4 h-4" />
      </IconButton>
      <Menu label="Set due date" trigger={<Calendar className="w-4 h-4" />} side="top" align="left">
        <MenuItem onSelect={() => void setDate(day(today))}>Today</MenuItem>
        <MenuItem onSelect={() => void setDate(day(addDays(today, 1)))}>Tomorrow</MenuItem>
        <MenuItem onSelect={() => void setDate(day(nextMonday(today)))}>Next week</MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={() => void setDate(null)}>No date</MenuItem>
      </Menu>
      <Menu label="Set priority" trigger={<Flag className="w-4 h-4" />} side="top" align="left">
        {([1, 2, 3, 4] as const).map((p) => (
          <MenuItem key={p} onSelect={() => void act(() => bulkUpdate(ids, 'updatePriority', { priority: p }))}>
            {PRIORITY_NAMES[p]}
          </MenuItem>
        ))}
      </Menu>
      <IconButton label="Move to…" onClick={() => setMoving(true)}>
        <FolderInput className="w-4 h-4" />
      </IconButton>
      {labels.length > 0 && (
        <Menu label="Labels" trigger={<Tag className="w-4 h-4" />} side="top" align="left" menuClassName="max-h-72 overflow-y-auto">
          {labels.map((l) => (
            <MenuItem key={`add-${l.id}`} onSelect={() => void act(() => bulkUpdate(ids, 'addLabels', { labelIds: [l.id] }))}>
              Add @{l.name}
            </MenuItem>
          ))}
          <MenuSeparator />
          {labels.map((l) => (
            <MenuItem key={`rm-${l.id}`} onSelect={() => void act(() => bulkUpdate(ids, 'removeLabels', { labelIds: [l.id] }))}>
              Remove @{l.name}
            </MenuItem>
          ))}
        </Menu>
      )}
      <IconButton label="Delete" tone="danger" onClick={() => void remove()}>
        <Trash2 className="w-4 h-4" />
      </IconButton>
      <span className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" aria-hidden="true" />
      <IconButton label="Clear selection" onClick={clear}>
        <X className="w-4 h-4" />
      </IconButton>
      {moving && (
        <MoveTaskDialog
          isOpen
          title={`Move ${plural(ids.length)} to…`}
          onClose={() => setMoving(false)}
          onChoose={moveTo}
        />
      )}
    </div>,
    document.body,
  );
}
