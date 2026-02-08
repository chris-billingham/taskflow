import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, User } from 'lucide-react';
import {
  useWorkspaceStore,
  selectCurrentWorkspace,
} from '@/stores/workspaceStore';

interface WorkspaceSwitcherProps {
  onCreateWorkspace: () => void;
}

export function WorkspaceSwitcher({ onCreateWorkspace }: WorkspaceSwitcherProps) {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const currentWorkspace = useWorkspaceStore(selectCurrentWorkspace);
  const switchWorkspace = useWorkspaceStore((s) => s.switchWorkspace);
  const fetchWorkspaces = useWorkspaceStore((s) => s.fetchWorkspaces);

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-gray-700 hover:bg-gray-100 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        {currentWorkspace ? (
          <div className="w-6 h-6 rounded bg-[#db4c3f] flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
            {currentWorkspace.name.charAt(0).toUpperCase()}
          </div>
        ) : (
          <User className="w-5 h-5 text-gray-500 flex-shrink-0" />
        )}
        <span className="truncate font-medium">
          {currentWorkspace?.name ?? 'Personal'}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400 ml-auto flex-shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
          {/* Personal option */}
          <button
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 ${
              !currentWorkspace ? 'bg-gray-50 text-[#db4c3f] font-medium' : 'text-gray-700'
            }`}
            onClick={() => {
              switchWorkspace(null);
              setIsOpen(false);
            }}
          >
            <User className="w-5 h-5 flex-shrink-0" />
            <span>Personal</span>
          </button>

          {workspaces.length > 0 && (
            <hr className="my-1 border-gray-100" />
          )}

          {/* Workspace list */}
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 ${
                currentWorkspace?.id === ws.id
                  ? 'bg-gray-50 text-[#db4c3f] font-medium'
                  : 'text-gray-700'
              }`}
              onClick={() => {
                switchWorkspace(ws.id);
                setIsOpen(false);
              }}
            >
              <div className="w-5 h-5 rounded bg-[#db4c3f]/10 flex items-center justify-center text-[#db4c3f] text-[10px] font-semibold flex-shrink-0">
                {ws.name.charAt(0).toUpperCase()}
              </div>
              <span className="truncate">{ws.name}</span>
              <span className="text-xs text-gray-400 ml-auto flex-shrink-0">
                {ws._count?.members ?? 0}
              </span>
            </button>
          ))}

          <hr className="my-1 border-gray-100" />

          {/* Create workspace */}
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
            onClick={() => {
              setIsOpen(false);
              onCreateWorkspace();
            }}
          >
            <Plus className="w-5 h-5 flex-shrink-0" />
            <span>Create workspace</span>
          </button>
        </div>
      )}
    </div>
  );
}
