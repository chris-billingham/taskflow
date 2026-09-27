import { useMemo, useState, type KeyboardEvent } from 'react';
import { Check, Hash } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useProjects } from '@/queries/projects';
import { useTaskActions } from '@/queries/taskActions';

interface MoveTaskDialogProps {
  isOpen: boolean;
  onClose: () => void;
  task: { id: string; projectId: string; sectionId: string | null; parentId?: string | null };
}

interface Destination {
  key: string;
  projectId: string;
  sectionId: string | null;
  label: string;
  color: string;
  isSection: boolean;
}

/** Pick a project or section to move a task to: type to filter, arrows and Enter to choose. */
export function MoveTaskDialog({ isOpen, onClose, task }: MoveTaskDialogProps) {
  const { active: projects } = useProjects();
  const { moveTask } = useTaskActions();
  const [search, setSearch] = useState('');
  const [highlighted, setHighlighted] = useState(0);

  const destinations = useMemo(() => {
    const term = search.trim().toLowerCase();
    const all: Destination[] = [];
    for (const project of projects) {
      all.push({
        key: project.id,
        projectId: project.id,
        sectionId: null,
        label: project.isInbox ? 'Inbox' : project.name,
        color: project.color,
        isSection: false,
      });
      for (const section of [...(project.sections ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)) {
        all.push({
          key: `${project.id}:${section.id}`,
          projectId: project.id,
          sectionId: section.id,
          label: `${project.isInbox ? 'Inbox' : project.name} / ${section.name}`,
          color: project.color,
          isSection: true,
        });
      }
    }
    return term ? all.filter((d) => d.label.toLowerCase().includes(term)) : all;
  }, [projects, search]);

  const isCurrent = (d: Destination) => d.projectId === task.projectId && d.sectionId === task.sectionId;

  const choose = (d: Destination) => {
    onClose();
    if (!isCurrent(d)) {
      void moveTask(task.id, { projectId: d.projectId, sectionId: d.sectionId }, { from: task });
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, destinations.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && destinations[highlighted]) {
      e.preventDefault();
      choose(destinations[highlighted]);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Move to…" size="sm">
      <div className="p-3" onKeyDown={onKeyDown}>
        <input
          autoFocus
          aria-label="Search projects and sections"
          aria-controls="move-destinations"
          aria-activedescendant={destinations[highlighted] ? `move-${destinations[highlighted].key}` : undefined}
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:outline-hidden focus:border-primary-500"
          placeholder="Type a project or section"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setHighlighted(0);
          }}
        />
        <ul id="move-destinations" role="listbox" aria-label="Destinations" className="mt-2 max-h-72 overflow-y-auto">
          {destinations.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">No matching project or section</li>
          )}
          {destinations.map((d, i) => (
            <li
              key={d.key}
              id={`move-${d.key}`}
              role="option"
              aria-selected={i === highlighted}
              onMouseEnter={() => setHighlighted(i)}
              onClick={() => choose(d)}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md cursor-pointer ${
                i === highlighted ? 'bg-gray-100 dark:bg-gray-700' : ''
              } ${d.isSection ? 'pl-8 text-gray-600 dark:text-gray-300' : 'text-gray-800 dark:text-gray-200'}`}
            >
              {d.isSection ? (
                <Hash className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
              ) : (
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} aria-hidden="true" />
              )}
              <span className="flex-1 truncate">{d.isSection ? d.label.split(' / ').slice(1).join(' / ') : d.label}</span>
              {isCurrent(d) && <Check className="w-4 h-4 text-primary-500" aria-label="Current location" />}
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
