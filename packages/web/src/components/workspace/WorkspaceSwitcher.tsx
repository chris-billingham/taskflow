import { ChevronDown, Plus, User } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useCurrentWorkspace, useWorkspaces } from '@/queries/workspaces';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/Menu';

interface WorkspaceSwitcherProps {
  onCreateWorkspace: () => void;
}

export function WorkspaceSwitcher({ onCreateWorkspace }: WorkspaceSwitcherProps) {
  const { workspaces } = useWorkspaces();
  const currentWorkspace = useCurrentWorkspace();
  const switchWorkspace = useWorkspaceStore((s) => s.switchWorkspace);

  return (
    <Menu
      // The visible text leads the name, so voice control ("click Personal") works.
      label={`${currentWorkspace?.name ?? 'Personal'}, switch workspace`}
      align="left"
      triggerVariant="plain"
      triggerClassName="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      // Span the trigger's full width (align="left" pins only the left edge).
      fullWidth
      trigger={
        <>
          {currentWorkspace ? (
            <span className="w-6 h-6 rounded bg-primary-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
              {currentWorkspace.name.charAt(0).toUpperCase()}
            </span>
          ) : (
            <User className="w-5 h-5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
          )}
          <span className="truncate font-medium">{currentWorkspace?.name ?? 'Personal'}</span>
          <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500 ml-auto flex-shrink-0" />
        </>
      }
    >
      <MenuItem icon={User} checked={!currentWorkspace} onSelect={() => switchWorkspace(null)}>
        Personal
      </MenuItem>

      {workspaces.length > 0 && <MenuSeparator />}

      {workspaces.map((ws) => (
        <MenuItem key={ws.id} checked={currentWorkspace?.id === ws.id} onSelect={() => switchWorkspace(ws.id)}>
          <span
            className="w-5 h-5 rounded bg-primary-500/10 flex items-center justify-center text-primary-500 text-[10px] font-semibold flex-shrink-0"
            aria-hidden="true"
          >
            {ws.name.charAt(0).toUpperCase()}
          </span>
          <span className="truncate">{ws.name}</span>
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto flex-shrink-0">
            {ws._count?.members ?? 0}
            <span className="sr-only"> members</span>
          </span>
        </MenuItem>
      ))}

      <MenuSeparator />

      <MenuItem icon={Plus} onSelect={onCreateWorkspace}>
        Create workspace
      </MenuItem>
    </Menu>
  );
}
