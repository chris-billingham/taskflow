import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MoreHorizontal, Pencil, Trash2, Star, StarOff } from 'lucide-react';
import { useFilterStore, selectFiltersArray } from '@/stores/filterStore';
import type { Filter } from '@/stores/filterStore';

export function FilterList() {
  const navigate = useNavigate();
  const location = useLocation();
  const filters = useFilterStore(selectFiltersArray);
  const updateFilter = useFilterStore((s) => s.updateFilter);
  const deleteFilter = useFilterStore((s) => s.deleteFilter);

  const [contextMenu, setContextMenu] = useState<{ filter: Filter; x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, filter: Filter) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ filter, x: e.clientX, y: e.clientY });
  };

  if (filters.length === 0) return null;

  return (
    <div className="space-y-0.5">
      {filters.map((filter) => (
        <button
          key={filter.id}
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm group ${
            location.pathname === `/filters/${filter.id}`
              ? 'bg-[#db4c3f]/10 text-[#db4c3f]'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          onClick={() => navigate(`/filters/${filter.id}`)}
          onContextMenu={(e) => handleContextMenu(e, filter)}
        >
          <span
            className="w-2.5 h-2.5 rounded flex-shrink-0"
            style={{ backgroundColor: filter.color }}
          />
          <span className="truncate flex-1 text-left">{filter.name}</span>
          <button
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            onClick={(e) => {
              e.stopPropagation();
              handleContextMenu(e, filter);
            }}
          >
            <MoreHorizontal className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
          </button>
        </button>
      ))}

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            ref={menuRef}
            className="fixed z-50 w-44 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => {
                updateFilter(contextMenu.filter.id, {
                  isFavorite: !contextMenu.filter.isFavorite,
                });
                setContextMenu(null);
              }}
            >
              {contextMenu.filter.isFavorite ? (
                <>
                  <StarOff className="w-4 h-4" /> Remove favorite
                </>
              ) : (
                <>
                  <Star className="w-4 h-4" /> Add to favorites
                </>
              )}
            </button>
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => {
                navigate(`/filters-labels`);
                setContextMenu(null);
              }}
            >
              <Pencil className="w-4 h-4" /> Edit
            </button>
            <hr className="my-1 border-gray-200 dark:border-gray-700" />
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              onClick={() => {
                deleteFilter(contextMenu.filter.id);
                setContextMenu(null);
              }}
            >
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}
