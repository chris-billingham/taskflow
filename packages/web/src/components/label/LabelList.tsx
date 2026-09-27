import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { MoreHorizontal, Pencil, Trash2, Star, StarOff } from 'lucide-react';
import { useLabels, useLabelActions } from '@/queries/labels';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/Menu';

export function LabelList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { labels } = useLabels();
  const { updateLabel, deleteLabel } = useLabelActions();

  // Which row's menu is open, so a right-click on the row can open it too.
  const [menuFor, setMenuFor] = useState<string | null>(null);

  if (labels.length === 0) return null;

  return (
    <div className="space-y-0.5">
      {labels.map((label) => (
        <div
          key={label.id}
          className={`flex items-center gap-1 pr-1 rounded-md text-sm group ${
            location.pathname === `/labels/${label.id}`
              ? 'bg-primary-500/10 text-primary-500'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenuFor(label.id);
          }}
        >
          <button
            className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 text-left"
            onClick={() => navigate(`/labels/${label.id}`)}
          >
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: label.color }}
            />
            <span className="truncate flex-1">{label.name}</span>
          </button>
          <Menu
            label={`Options for ${label.name}`}
            trigger={<MoreHorizontal className="w-3.5 h-3.5" />}
            triggerVariant="plain"
            triggerClassName="p-0.5 inline-flex items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
            menuClassName="w-44"
            open={menuFor === label.id}
            onOpenChange={(open) => setMenuFor(open ? label.id : null)}
          >
            <MenuItem
              icon={label.isFavorite ? StarOff : Star}
              onSelect={() => updateLabel(label.id, { isFavorite: !label.isFavorite })}
            >
              {label.isFavorite ? 'Remove favorite' : 'Add to favorites'}
            </MenuItem>
            <MenuItem icon={Pencil} onSelect={() => navigate('/filters-labels')}>
              Edit
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={Trash2} tone="danger" onSelect={() => deleteLabel(label.id)}>
              Delete
            </MenuItem>
          </Menu>
        </div>
      ))}
    </div>
  );
}
