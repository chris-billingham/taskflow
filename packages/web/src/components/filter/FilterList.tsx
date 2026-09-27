import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { MoreHorizontal, Pencil, Trash2, Star, StarOff } from 'lucide-react';
import { useFilters, useFilterActions } from '@/queries/filters';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/Menu';

export function FilterList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { filters } = useFilters();
  const { updateFilter, deleteFilter } = useFilterActions();

  // Which row's menu is open, so a right-click on the row can open it too.
  const [menuFor, setMenuFor] = useState<string | null>(null);

  if (filters.length === 0) return null;

  return (
    <div className="space-y-0.5">
      {filters.map((filter) => (
        <div
          key={filter.id}
          className={`flex items-center gap-1 pr-1 rounded-md text-sm group ${
            location.pathname === `/filters/${filter.id}`
              ? 'bg-primary-500/10 text-primary-500'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenuFor(filter.id);
          }}
        >
          <button
            className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 text-left"
            onClick={() => navigate(`/filters/${filter.id}`)}
          >
            <span
              className="w-2.5 h-2.5 rounded flex-shrink-0"
              style={{ backgroundColor: filter.color }}
            />
            <span className="truncate flex-1">{filter.name}</span>
          </button>
          <Menu
            label={`Options for ${filter.name}`}
            trigger={<MoreHorizontal className="w-3.5 h-3.5" />}
            triggerVariant="plain"
            triggerClassName="p-0.5 inline-flex items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
            menuClassName="w-44"
            open={menuFor === filter.id}
            onOpenChange={(open) => setMenuFor(open ? filter.id : null)}
          >
            <MenuItem
              icon={filter.isFavorite ? StarOff : Star}
              onSelect={() => updateFilter(filter.id, { isFavorite: !filter.isFavorite })}
            >
              {filter.isFavorite ? 'Remove favorite' : 'Add to favorites'}
            </MenuItem>
            <MenuItem icon={Pencil} onSelect={() => navigate('/filters-labels')}>
              Edit
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={Trash2} tone="danger" onSelect={() => deleteFilter(filter.id)}>
              Delete
            </MenuItem>
          </Menu>
        </div>
      ))}
    </div>
  );
}
