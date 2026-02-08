import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Users, FolderKanban, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  useWorkspaceStore,
  selectCurrentWorkspace,
} from '@/stores/workspaceStore';
import { useAuthStore } from '@/stores/authStore';
import { MemberList } from './MemberList';
import { InviteMemberModal } from './InviteMemberModal';

type SettingsTab = 'general' | 'members' | 'projects' | 'danger';

export function WorkspaceSettings() {
  const navigate = useNavigate();
  const workspace = useWorkspaceStore(selectCurrentWorkspace);
  const {
    members,
    invites,
    fetchMembers,
    fetchInvites,
    updateWorkspace,
    deleteWorkspace,
    updateMemberRole,
    removeMember,
    cancelInvite,
  } = useWorkspaceStore();
  const user = useAuthStore((s) => s.user);

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (workspace) {
      setName(workspace.name);
      setDescription(workspace.description ?? '');
      fetchMembers(workspace.id);
      fetchInvites(workspace.id);
    }
  }, [workspace, fetchMembers, fetchInvites]);

  if (!workspace) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Select a workspace to view settings.</p>
      </div>
    );
  }

  const currentUserRole = workspace.role;
  const isAdmin = currentUserRole === 'OWNER' || currentUserRole === 'ADMIN';
  const isOwner = currentUserRole === 'OWNER';

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError('');
    try {
      await updateWorkspace(workspace.id, {
        name: name.trim(),
        description: description.trim() || null,
      });
    } catch (err: any) {
      setSaveError(err.response?.data?.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirm !== workspace.name) return;
    setIsDeleting(true);
    try {
      await deleteWorkspace(workspace.id);
      navigate('/today');
    } catch {
      // Error handled in store
    } finally {
      setIsDeleting(false);
    }
  };

  const tabs: { id: SettingsTab; label: string; icon: typeof Settings }[] = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'members', label: 'Members', icon: Users },
    { id: 'projects', label: 'Projects', icon: FolderKanban },
    ...(isOwner
      ? [{ id: 'danger' as const, label: 'Danger zone', icon: Trash2 }]
      : []),
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Workspace settings
      </h1>

      <div className="flex gap-6">
        {/* Tab navigation */}
        <nav className="w-48 flex-shrink-0 space-y-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                activeTab === id
                  ? 'bg-gray-100 text-gray-900 font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
              onClick={() => setActiveTab(id)}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>

        {/* Tab content */}
        <div className="flex-1 min-w-0">
          {activeTab === 'general' && (
            <form onSubmit={handleSaveGeneral} className="space-y-4">
              <Input
                label="Workspace name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isAdmin}
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#db4c3f] focus:border-[#db4c3f] resize-none disabled:bg-gray-50 disabled:text-gray-500"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={!isAdmin}
                />
              </div>
              {saveError && (
                <p className="text-sm text-red-600">{saveError}</p>
              )}
              {isAdmin && (
                <Button type="submit" isLoading={isSaving}>
                  Save changes
                </Button>
              )}
            </form>
          )}

          {activeTab === 'members' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700">
                  {members.length} member{members.length !== 1 ? 's' : ''}
                </h3>
                {isAdmin && (
                  <Button
                    size="sm"
                    onClick={() => setShowInviteModal(true)}
                  >
                    <UserPlus className="w-4 h-4 mr-1" />
                    Invite
                  </Button>
                )}
              </div>
              <MemberList
                members={members}
                invites={invites}
                currentUserId={user?.id ?? ''}
                currentUserRole={currentUserRole}
                onChangeRole={(userId, role) =>
                  updateMemberRole(workspace.id, userId, role)
                }
                onRemoveMember={(userId) =>
                  removeMember(workspace.id, userId)
                }
                onCancelInvite={(inviteId) =>
                  cancelInvite(workspace.id, inviteId)
                }
              />
            </div>
          )}

          {activeTab === 'projects' && (
            <div className="space-y-2">
              <p className="text-sm text-gray-500">
                Team projects in this workspace are accessible to all workspace
                members based on their role.
              </p>
              <p className="text-sm text-gray-400">
                {workspace._count?.projects ?? 0} team project
                {(workspace._count?.projects ?? 0) !== 1 ? 's' : ''}
              </p>
            </div>
          )}

          {activeTab === 'danger' && isOwner && (
            <div className="space-y-4">
              <div className="p-4 border border-red-200 rounded-lg bg-red-50">
                <h3 className="text-sm font-semibold text-red-800 mb-2">
                  Delete workspace
                </h3>
                <p className="text-sm text-red-600 mb-4">
                  This will permanently delete the workspace, all team
                  projects, and remove all members. This action cannot be
                  undone.
                </p>
                <div className="space-y-3">
                  <Input
                    label={`Type "${workspace.name}" to confirm`}
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder={workspace.name}
                  />
                  <Button
                    variant="danger"
                    onClick={handleDelete}
                    isLoading={isDeleting}
                    disabled={deleteConfirm !== workspace.name}
                  >
                    Delete workspace
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <InviteMemberModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        workspaceId={workspace.id}
      />
    </div>
  );
}
