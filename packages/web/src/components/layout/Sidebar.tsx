import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useProjects } from '@/hooks/useProjects';
import { useProjectStore } from '@/stores/projectStore';
import { useLabelStore, selectFavoriteLabels } from '@/stores/labelStore';
import { useFilterStore, selectFavoriteFilters } from '@/stores/filterStore';
import {
  useWorkspaceStore,
  selectCurrentWorkspace,
} from '@/stores/workspaceStore';
import { ProjectList } from '@/components/project/ProjectList';
import { CreateProjectModal } from '@/components/project/CreateProjectModal';
import { EditProjectModal } from '@/components/project/EditProjectModal';
import { WorkspaceSwitcher } from '@/components/workspace/WorkspaceSwitcher';
import { CreateWorkspaceModal } from '@/components/workspace/CreateWorkspaceModal';
import type { ProjectTreeNode, Project } from '@/stores/projectStore';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { favorites, tree, loading } = useProjects();
  const updateProject = useProjectStore((s) => s.updateProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const archiveProject = useProjectStore((s) => s.archiveProject);

  const fetchLabels = useLabelStore((s) => s.fetchLabels);
  const fetchFilters = useFilterStore((s) => s.fetchFilters);
  const favoriteLabels = useLabelStore(selectFavoriteLabels);
  const favoriteFilters = useFilterStore(selectFavoriteFilters);

  const currentWorkspace = useWorkspaceStore(selectCurrentWorkspace);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForTeam, setCreateForTeam] = useState(false);
  const [showCreateWorkspaceModal, setShowCreateWorkspaceModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [teamProjectsExpanded, setTeamProjectsExpanded] = useState(true);
  const [favoritesExpanded, setFavoritesExpanded] = useState(true);
  const [filtersLabelsExpanded, setFiltersLabelsExpanded] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    fetchLabels();
    fetchFilters();
  }, [fetchLabels, fetchFilters]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleDeleteProject = (project: ProjectTreeNode) => {
    if (project.isInbox) return;
    deleteProject(project.id);
    if (location.pathname === `/projects/${project.id}`) {
      navigate('/today');
    }
  };

  // Separate personal projects from team (workspace) projects
  const { personalTree, teamTree } = useMemo(() => {
    const personal = tree.filter((p) => !p.workspaceId);
    const team = tree.filter(
      (p) =>
        p.workspaceId &&
        (!currentWorkspace || p.workspaceId === currentWorkspace.id),
    );
    return { personalTree: personal, teamTree: team };
  }, [tree, currentWorkspace]);

  const navItems = [
    { path: '/today', label: 'Today', icon: CalendarDays },
    { path: '/upcoming', label: 'Upcoming', icon: CalendarRange },
    { path: '/filters-labels', label: 'Filters & Labels', icon: Filter },
  ];

  const hasFavoriteFiltersOrLabels = favoriteFilters.length > 0 || favoriteLabels.length > 0;

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#FAFAFA] border-r border-gray-200">
      {/* Logo and workspace switcher */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-[#db4c3f]" />
            <span className="text-lg font-bold text-gray-900">Taskflow</span>
          </div>
          <button
            className="p-1 rounded hover:bg-gray-200 md:hidden"
            onClick={onClose}
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Workspace Switcher */}
        <WorkspaceSwitcher
          onCreateWorkspace={() => setShowCreateWorkspaceModal(true)}
        />
      </div>

      {/* Navigation */}
      <nav className="px-2 py-1 space-y-0.5">
        {navItems.map(({ path, label, icon: Icon }) => (
          <button
            key={path}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm ${
              location.pathname === path
                ? 'bg-[#db4c3f]/10 text-[#db4c3f] font-medium'
                : 'text-gray-700 hover:bg-gray-100'
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
              className="flex items-center justify-between w-full px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700"
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
                        ? 'bg-[#db4c3f]/10 text-[#db4c3f]'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                    onClick={() => {
                      navigate(`/projects/${p.id}`);
                      onClose();
                    }}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
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
              className="flex items-center justify-between w-full px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700"
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
                        ? 'bg-[#db4c3f]/10 text-[#db4c3f]'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                    onClick={() => {
                      navigate(`/filters/${f.id}`);
                      onClose();
                    }}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded flex-shrink-0"
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
                        ? 'bg-[#db4c3f]/10 text-[#db4c3f]'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                    onClick={() => {
                      navigate(`/labels/${l.id}`);
                      onClose();
                    }}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: l.color }}
                    />
                    <span className="truncate">{l.name}</span>
                  </button>
                ))}
                {/* Show all link */}
                <button
                  className="w-full text-left px-2 py-1 text-xs text-gray-400 hover:text-[#db4c3f]"
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
              className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700"
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
              className="p-0.5 rounded hover:bg-gray-200"
              onClick={() => { setCreateForTeam(false); setShowCreateModal(true); }}
              title="Add project"
            >
              <Plus className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {projectsExpanded && (
            <div className="mt-1">
              {loading ? (
                <p className="px-2 py-1 text-xs text-gray-400">Loading...</p>
              ) : personalTree.length > 0 ? (
                <ProjectList
                  projects={personalTree}
                  onEdit={(p) => setEditingProject(p)}
                  onDelete={handleDeleteProject}
                />
              ) : (
                <p className="px-2 py-1 text-xs text-gray-400">No projects</p>
              )}
            </div>
          )}
        </div>

        {/* Team Projects section (shown when a workspace is selected) */}
        {currentWorkspace && (
          <div>
            <div className="flex items-center justify-between px-2 py-1">
              <button
                className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700"
                onClick={() => setTeamProjectsExpanded(!teamProjectsExpanded)}
              >
                <Building2 className="w-3.5 h-3.5" />
                Team Projects
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${
                    teamProjectsExpanded ? '' : '-rotate-90'
                  }`}
                />
              </button>
              <div className="flex items-center gap-1">
                <button
                  className="p-0.5 rounded hover:bg-gray-200"
                  onClick={() => {
                    navigate('/workspace/settings');
                    onClose();
                  }}
                  title="Workspace settings"
                >
                  <Settings className="w-3.5 h-3.5 text-gray-500" />
                </button>
                <button
                  className="p-0.5 rounded hover:bg-gray-200"
                  onClick={() => { setCreateForTeam(true); setShowCreateModal(true); }}
                  title="Add team project"
                >
                  <Plus className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>

            {teamProjectsExpanded && (
              <div className="mt-1">
                {loading ? (
                  <p className="px-2 py-1 text-xs text-gray-400">Loading...</p>
                ) : teamTree.length > 0 ? (
                  <ProjectList
                    projects={teamTree}
                    onEdit={(p) => setEditingProject(p)}
                    onDelete={handleDeleteProject}
                  />
                ) : (
                  <p className="px-2 py-1 text-xs text-gray-400">
                    No team projects yet
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* User menu */}
      <div className="relative border-t border-gray-200 px-2 py-2">
        <button
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-gray-700 hover:bg-gray-100"
          onClick={() => setShowUserMenu(!showUserMenu)}
        >
          <div className="w-7 h-7 rounded-full bg-[#db4c3f] flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <span className="truncate">{user?.name}</span>
        </button>

        {showUserMenu && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowUserMenu(false)}
            />
            <div className="absolute left-2 bottom-full mb-1 z-50 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
              {currentWorkspace && (
                <>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                    onClick={() => {
                      setShowUserMenu(false);
                      navigate('/workspace/settings');
                    }}
                  >
                    <Building2 className="w-4 h-4" />
                    Workspace settings
                  </button>
                  <hr className="my-1 border-gray-200" />
                </>
              )}
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                onClick={() => {
                  setShowUserMenu(false);
                  navigate('/settings/profile');
                }}
              >
                <Settings className="w-4 h-4" />
                Settings
              </button>
              <hr className="my-1 border-gray-200" />
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4" />
                Log out
              </button>
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      <CreateProjectModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        workspaceId={createForTeam ? currentWorkspace?.id : undefined}
      />
      <CreateWorkspaceModal
        isOpen={showCreateWorkspaceModal}
        onClose={() => setShowCreateWorkspaceModal(false)}
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
          <div className="relative w-64 flex-shrink-0">{sidebarContent}</div>
        </div>
      )}
    </>
  );
}
