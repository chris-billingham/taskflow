import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Settings, Users, FolderKanban, Trash2, UserPlus, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  useWorkspace,
  useWorkspaceActions,
  useWorkspaceInvites,
  useWorkspaceMembers,
} from '@/queries/workspaces';
import { useAuthStore } from '@/stores/authStore';
import { MemberList } from './MemberList';
import { InviteMemberModal } from './InviteMemberModal';

type SettingsTab = 'general' | 'members' | 'projects' | 'danger';

export function WorkspaceSettings({ workspaceId }: { workspaceId: string | undefined }) {
  const navigate = useNavigate();
  const { workspace, loading } = useWorkspace(workspaceId);
  const {
    updateWorkspace,
    deleteWorkspace,
    updateMemberRole,
    removeMember,
    cancelInvite,
    resendInvite,
    leaveWorkspace,
    transferOwnership,
  } = useWorkspaceActions();
  const isAdminRole = workspace?.role === 'OWNER' || workspace?.role === 'ADMIN';
  const members = useWorkspaceMembers(workspace?.id);
  const invites = useWorkspaceInvites(workspace?.id, isAdminRole);
  const user = useAuthStore((s) => s.user);

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [newOwnerId, setNewOwnerId] = useState('');
  const [confirmTransfer, setConfirmTransfer] = useState(false);

  useEffect(() => {
    if (workspace) {
      setName(workspace.name);
      setDescription(workspace.description ?? '');
    }
    // Reset the form when switching workspace, not on every refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id]);

  if (!workspace) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 dark:text-gray-400">
          {loading ? 'Loading…' : 'This workspace no longer exists, or you are no longer a member.'}
        </p>
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

  const handleLeave = async () => {
    setConfirmLeave(false);
    try {
      await leaveWorkspace(workspace.id);
      navigate('/today');
    } catch {
      // Reported by the action
    }
  };

  // The owner hands over to a member or admin (never a guest).
  const ownerCandidates = members.filter((m) => m.userId !== user?.id && (m.role === 'ADMIN' || m.role === 'MEMBER'));
  const newOwner = ownerCandidates.find((m) => m.userId === newOwnerId);
  const handleTransfer = async () => {
    setConfirmTransfer(false);
    if (!newOwnerId) return;
    try {
      await transferOwnership(workspace.id, newOwnerId);
      setNewOwnerId('');
    } catch {
      // Reported by the action
    }
  };

  const tabs: { id: SettingsTab; label: string; icon: typeof Settings }[] = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'members', label: 'Members', icon: Users },
    { id: 'projects', label: 'Projects', icon: FolderKanban },
    isOwner
      ? { id: 'danger' as const, label: 'Ownership', icon: Trash2 }
      : { id: 'danger' as const, label: 'Leave', icon: LogOut },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
        Workspace settings
      </h1>

      <div className="flex gap-6">
        {/* Tab navigation */}
        <nav className="w-48 shrink-0 space-y-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                activeTab === id
                  ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-medium'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none disabled:bg-gray-50 disabled:text-gray-500"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={!isAdmin}
                />
              </div>
              {saveError && (
                <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
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
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
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
                onResendInvite={(inviteId) =>
                  resendInvite(workspace.id, inviteId)
                }
              />
            </div>
          )}

          {activeTab === 'projects' && (
            <div className="space-y-2">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Team projects in this workspace are accessible to all workspace
                members based on their role.
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {workspace._count?.projects ?? 0} team project
                {(workspace._count?.projects ?? 0) !== 1 ? 's' : ''}
              </p>
            </div>
          )}

          {activeTab === 'danger' && !isOwner && (
            <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Leave workspace</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                You'll lose access to its projects. Projects you own here stay with the workspace and pass to
                its owner, and you're taken off any of its projects shared with you.
              </p>
              <Button variant="danger" onClick={() => setConfirmLeave(true)}>
                Leave workspace
              </Button>
            </div>
          )}

          {activeTab === 'danger' && isOwner && (
            <div className="space-y-4">
              <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Transfer ownership</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Make another member the owner. You'll stay on as an admin. To leave the workspace, or to
                  delete your account, transfer ownership first.
                </p>
                {ownerCandidates.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Invite a member or admin first: guests can't own a workspace.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <select
                      aria-label="New owner"
                      value={newOwnerId}
                      onChange={(e) => setNewOwnerId(e.target.value)}
                      className="flex-1 min-w-48 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                    >
                      <option value="">Choose a member…</option>
                      {ownerCandidates.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.user.name}
                        </option>
                      ))}
                    </select>
                    <Button onClick={() => setConfirmTransfer(true)} disabled={!newOwnerId}>
                      Transfer
                    </Button>
                  </div>
                )}
              </div>

              <div className="p-4 border border-red-200 dark:border-red-900 rounded-lg bg-red-50 dark:bg-red-900/20">
                <h3 className="text-sm font-semibold text-red-800 mb-2">
                  Delete workspace
                </h3>
                <p className="text-sm text-red-600 dark:text-red-400 mb-4">
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

      <ConfirmDialog
        isOpen={confirmLeave}
        title={`Leave ${workspace.name}?`}
        message="You'll lose access to its projects. Someone will need to invite you again to come back."
        confirmLabel="Leave"
        onConfirm={() => void handleLeave()}
        onCancel={() => setConfirmLeave(false)}
      />
      <ConfirmDialog
        isOpen={confirmTransfer}
        title="Transfer ownership?"
        message={`${newOwner?.user.name ?? 'They'} will own ${workspace.name}, and you'll become an admin.`}
        confirmLabel="Transfer"
        onConfirm={() => void handleTransfer()}
        onCancel={() => setConfirmTransfer(false)}
      />

      <InviteMemberModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        workspaceId={workspace.id}
        canInviteAdmins={isOwner}
      />
    </div>
  );
}
