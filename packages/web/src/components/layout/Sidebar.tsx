import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  CheckSquare,
  CalendarDays,
  CalendarRange,
  Filter,
  Plus,
  ChevronDown,
  Star,
  Settings,
  LogOut,
  X,
  Tag,
  Building2,
  Inbox,
  Trash2,
  Archive,
  UserCheck,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useProjects, useProjectActions } from '@/queries/projects';
import { useLabels } from '@/queries/labels';
import { useFilters } from '@/queries/filters';
import { useWorkspaces } from '@/queries/workspaces';
import { ProjectList } from '@/components/project/ProjectList';
import { CreateProjectModal } from '@/components/project/CreateProjectModal';
import { EditProjectModal } from '@/components/project/EditProjectModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/Menu';
import { CreateWorkspaceModal } from '@/components/workspace/CreateWorkspaceModal';
import type { ProjectTreeNode, Project } from '@/types/project';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { projects, favorites, archived, tree, loading } = useProjects();
  const { updateProject, deleteProject, archiveProject } = useProjectActions();

  const { favorites: favoriteLabels } = useLabels();
  const { favorites: favoriteFilters } = useFilters();

  const { workspaces } = useWorkspaces();

  const [showCreateModal, setShowCreateModal] = useState(false);
  // The workspace a new project goes into; undefined for your own space.
  const [createInWorkspace, setCreateInWorkspace] = useState<string | undefined>();
  const [showCreateWorkspaceModal, setShowCreateWorkspaceModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [collapsedWorkspaces, setCollapsedWorkspaces] = useState<Set<string>>(new Set());
  const toggleWorkspace = (id: string) =>
    setCollapsedWorkspaces((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const openCreateProject = (workspaceId?: string) => {
    setCreateInWorkspace(workspaceId);
    setShowCreateModal(true);
  };
  const [favoritesExpanded, setFavoritesExpanded] = useState(true);
  const [filtersLabelsExpanded, setFiltersLabelsExpanded] = useState(true);

  // The mobile drawer closes on Escape, unless a menu inside it already used
  // that Escape or it came from a dialog opened over the drawer.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (e.target instanceof Element && e.target.closest('[role="dialog"]')) return;
      onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Deleting removes every task and section in the project, so ask first
  // (the project header already did; the sidebar menu used to delete at once).
  const [pendingDelete, setPendingDelete] = useState<ProjectTreeNode | null>(null);

  const handleDeleteProject = (project: ProjectTreeNode) => {
    if (project.isInbox) return;
    setPendingDelete(project);
  };

  const confirmDeleteProject = () => {
    if (!pendingDelete) return;
    const project = pendingDelete;
    setPendingDelete(null);
    void deleteProject(project.id);
    if (location.pathname === `/projects/${project.id}`) {
      navigate('/today');
    }
  };

  // The Inbox gets its own pinned nav entry, above the project lists.
  const inbox = useMemo(
    () => projects.find((p) => p.isInbox && p.ownerId === user?.id),
    [projects, user?.id],
  );

  // Your own space, then each workspace you belong to, then projects shared
  // with you from somewhere else (another person's space, or a workspace
  // you're not in).
  const { personalTree, workspaceTrees, sharedTree } = useMemo(() => {
    const visible = tree.filter((p) => !p.isInbox);
    const mine = new Set(workspaces.map((w) => w.id));
    return {
      personalTree: visible.filter((p) => !p.workspaceId && p.ownerId === user?.id),
      workspaceTrees: [...workspaces]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((workspace) => ({
          workspace,
          projects: visible.filter((p) => p.workspaceId === workspace.id),
        })),
      sharedTree: visible.filter((p) =>
        p.workspaceId ? !mine.has(p.workspaceId) : p.ownerId !== user?.id,
      ),
    };
  }, [tree, workspaces, user?.id]);

  const navItems = [
    ...(inbox ? [{ path: `/projects/${inbox.id}`, label: 'Inbox', icon: Inbox }] : []),
    { path: '/today', label: 'Today', icon: CalendarDays },
    { path: '/upcoming', label: 'Upcoming', icon: CalendarRange },
    { path: '/assigned', label: 'Assigned to me', icon: UserCheck },
    { path: '/filters-labels', label: 'Filters & Labels', icon: Filter },
    { path: '/trash', label: 'Trash', icon: Trash2 },
  ];

  const hasFavoriteFiltersOrLabels = favoriteFilters.length > 0 || favoriteLabels.length > 0;

  // The light sidebar tint is an arbitrary value, so its dark counterpart has
  // to be spelled out — a utility-class sweep can't infer one.
  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#FAFAFA] dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
      {/* Logo and workspace switcher */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-primary-500" />
            <span className="text-lg font-bold text-gray-900 dark:text-white">Taskflow</span>
          </div>
          <button
            className="p-1 rounded-sm hover:bg-gray-200 dark:hover:bg-gray-600 md:hidden"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="px-2 py-1 space-y-0.5">
        {navItems.map(({ path, label, icon: Icon }) => (
          <button
            key={path}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm ${
              location.pathname === path
                ? 'bg-primary-500/10 text-primary-500 font-medium'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
            onClick={() => {
              navigate(path);
              onClose();
            }}
          >
            <Icon className="w-4.5 h-4.5" />
            {label}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {/* Favorites section */}
        {favorites.length > 0 && (
          <div className="mb-4">
            <button
              className="flex items-center justify-between w-full px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-200"
              onClick={() => setFavoritesExpanded(!favoritesExpanded)}
            >
              <span className="flex items-center gap-1">
                <Star className="w-3.5 h-3.5" />
                Favorites
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${
                  favoritesExpanded ? '' : '-rotate-90'
                }`}
              />
            </button>
            {favoritesExpanded && (
              <div className="mt-1 space-y-0.5">
                {favorites.map((p) => (
                  <button
                    key={p.id}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm ${
                      location.pathname === `/projects/${p.id}`
                        ? 'bg-primary-500/10 text-primary-500'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                    onClick={() => {
                      navigate(`/projects/${p.id}`);
                      onClose();
                    }}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Filters & Labels section */}
        {hasFavoriteFiltersOrLabels && (
          <div className="mb-4">
            <button
              className="flex items-center justify-between w-full px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-200"
              onClick={() => setFiltersLabelsExpanded(!filtersLabelsExpanded)}
            >
              <span className="flex items-center gap-1">
                <Tag className="w-3.5 h-3.5" />
                Filters & Labels
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${
                  filtersLabelsExpanded ? '' : '-rotate-90'
                }`}
              />
            </button>
            {filtersLabelsExpanded && (
              <div className="mt-1 space-y-0.5">
                {/* Favorite filters */}
                {favoriteFilters.map((f) => (
                  <button
                    key={`filter-${f.id}`}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm ${
                      location.pathname === `/filters/${f.id}`
                        ? 'bg-primary-500/10 text-primary-500'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                    onClick={() => {
                      navigate(`/filters/${f.id}`);
                      onClose();
                    }}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: f.color }}
                    />
                    <span className="truncate">{f.name}</span>
                  </button>
                ))}
                {/* Favorite labels */}
                {favoriteLabels.map((l) => (
                  <button
                    key={`label-${l.id}`}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm ${
                      location.pathname === `/labels/${l.id}`
                        ? 'bg-primary-500/10 text-primary-500'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                    onClick={() => {
                      navigate(`/labels/${l.id}`);
                      onClose();
                    }}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: l.color }}
                    />
                    <span className="truncate">{l.name}</span>
                  </button>
                ))}
                {/* Show all link */}
                <button
                  className="w-full text-left px-2 py-1 text-xs text-gray-400 dark:text-gray-500 hover:text-primary-500"
                  onClick={() => {
                    navigate('/filters-labels');
                    onClose();
                  }}
                >
                  Show all
                </button>
              </div>
            )}
          </div>
        )}

        {/* My Projects section */}
        <div className="mb-4">
          <div className="flex items-center justify-between px-2 py-1">
            <button
              className="flex items-center gap-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-200"
              onClick={() => setProjectsExpanded(!projectsExpanded)}
            >
              My Projects
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${
                  projectsExpanded ? '' : '-rotate-90'
                }`}
              />
            </button>
            <button
              className="p-0.5 rounded-sm hover:bg-gray-200 dark:hover:bg-gray-600"
              onClick={() => openCreateProject()}
              title="Add project"
            >
              <Plus className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          {projectsExpanded && (
            <div className="mt-1">
              {loading ? (
                <p className="px-2 py-1 text-xs text-gray-400 dark:text-gray-500">Loading...</p>
              ) : personalTree.length > 0 ? (
                <ProjectList
                  projects={personalTree}
                  onEdit={(p) => setEditingProject(p)}
                  onDelete={handleDeleteProject}
                />
              ) : (
                <p className="px-2 py-1 text-xs text-gray-400 dark:text-gray-500">No projects</p>
              )}
            </div>
          )}
        </div>

        {/* One section per workspace */}
        {workspaceTrees.map(({ workspace, projects: workspaceProjects }) => {
          const expanded = !collapsedWorkspaces.has(workspace.id);
          return (
            <div key={workspace.id} className="mb-4">
              <div className="flex items-center justify-between px-2 py-1">
                <button
                  className="flex items-center gap-1 min-w-0 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-200"
                  onClick={() => toggleWorkspace(workspace.id)}
                  aria-expanded={expanded}
                >
                  <Building2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{workspace.name}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 shrink-0 transition-transform ${expanded ? '' : '-rotate-90'}`}
                    aria-hidden="true"
                  />
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    className="p-0.5 rounded-sm hover:bg-gray-200 dark:hover:bg-gray-600"
                    onClick={() => {
                      navigate(`/workspaces/${workspace.id}/settings`);
                      onClose();
                    }}
                    title={`${workspace.name} settings`}
                    aria-label={`${workspace.name} settings`}
                  >
                    <Settings className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                  </button>
                  {workspace.role !== 'GUEST' && (
                    <button
                      className="p-0.5 rounded-sm hover:bg-gray-200 dark:hover:bg-gray-600"
                      onClick={() => openCreateProject(workspace.id)}
                      title={`Add project to ${workspace.name}`}
                      aria-label={`Add project to ${workspace.name}`}
                    >
                      <Plus className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    </button>
                  )}
                </div>
              </div>

              {expanded && (
                <div className="mt-1">
                  {loading ? (
                    <p className="px-2 py-1 text-xs text-gray-400 dark:text-gray-500">Loading...</p>
                  ) : workspaceProjects.length > 0 ? (
                    <ProjectList
                      projects={workspaceProjects}
                      onEdit={(p) => setEditingProject(p)}
                      onDelete={handleDeleteProject}
                    />
                  ) : (
                    <p className="px-2 py-1 text-xs text-gray-400 dark:text-gray-500">No projects yet</p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {sharedTree.length > 0 && (
          <div className="mb-4">
            <p className="px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Shared with me
            </p>
            <div className="mt-1">
              <ProjectList
                projects={sharedTree}
                onEdit={(p) => setEditingProject(p)}
                onDelete={handleDeleteProject}
              />
            </div>
          </div>
        )}

        {archived.length > 0 && (
          <button
            className={`mt-4 w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm ${
              location.pathname === '/archived'
                ? 'bg-primary-500/10 text-primary-500 font-medium'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
            onClick={() => {
              navigate('/archived');
              onClose();
            }}
          >
            <Archive className="w-4 h-4" aria-hidden="true" />
            Archived projects
            <span className="ml-auto text-xs tabular-nums">{archived.length}</span>
          </button>
        )}
        <button
          className="mt-2 w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
          onClick={() => setShowCreateWorkspaceModal(true)}
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          New workspace
        </button>
      </div>

      {/* User menu */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-2 py-2">
        <Menu
          // The visible name leads, so voice control can target it.
          label={`${user?.name ?? 'Account'}, account menu`}
          side="top"
          align="left"
          triggerVariant="plain"
          triggerClassName="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          menuClassName="w-48"
          trigger={
            <>
              <span
                className="w-7 h-7 rounded-full bg-primary-500 flex items-center justify-center text-white text-xs font-medium shrink-0"
                aria-hidden="true"
              >
                {user?.name?.charAt(0).toUpperCase()}
              </span>
              <span className="truncate">{user?.name}</span>
            </>
          }
        >
          <MenuItem icon={Settings} onSelect={() => navigate('/settings/profile')}>
            Settings
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={LogOut} tone="danger" onSelect={() => void handleLogout()}>
            Log out
          </MenuItem>
        </Menu>
      </div>

    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0">
        {sidebarContent}
      </aside>

      {/* Mobile drawer */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/50" onClick={onClose} />
          <div className="relative w-64 shrink-0">{sidebarContent}</div>
        </div>
      )}

      {/* Modals — rendered ONCE here: they used to live inside sidebarContent,
          which is rendered twice (desktop aside + mobile drawer), mounting
          every modal twice whenever the drawer was open. */}
      {/* Modals */}
      <CreateProjectModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        workspaceId={createInWorkspace}
      />
      <CreateWorkspaceModal
        isOpen={showCreateWorkspaceModal}
        onClose={() => setShowCreateWorkspaceModal(false)}
      />
      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title="Delete project?"
        message={`This permanently deletes "${pendingDelete?.name ?? ''}" and all its tasks and sections.`}
        onConfirm={confirmDeleteProject}
        onCancel={() => setPendingDelete(null)}
      />

      {editingProject && (
        <EditProjectModal
          isOpen={!!editingProject}
          onClose={() => setEditingProject(null)}
          project={editingProject}
          onUpdate={async (id, data) => {
            await updateProject(id, data as any);
          }}
          onDelete={async (id) => {
            await deleteProject(id);
            if (location.pathname === `/projects/${id}`) {
              navigate('/today');
            }
          }}
          onArchive={async (id) => {
            await archiveProject(id);
          }}
        />
      )}
    </>
  );
}
