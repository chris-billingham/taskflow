import { useState } from 'react';
import { X } from 'lucide-react';
import type { ProjectRole } from '@taskflow/contract';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Spinner } from '@/components/ui/Spinner';
import { useProjectSharing, useSharingActions } from '@/queries/sharing';
import { useAuthStore } from '@/stores/authStore';

const ROLES: { value: ProjectRole; label: string; description: string }[] = [
  { value: 'ADMIN', label: 'Admin', description: 'Edit the project and choose who it’s shared with' },
  { value: 'MEMBER', label: 'Member', description: 'Add, edit and complete tasks' },
  { value: 'COMMENTER', label: 'Commenter', description: 'Read and comment' },
  { value: 'VIEWER', label: 'Viewer', description: 'Read only' },
];
const roleLabel = (role: ProjectRole) => ROLES.find((r) => r.value === role)?.label ?? role;

const selectClass =
  'rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-primary-500/40';

interface ShareProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  project: { id: string; name: string };
  /** Called after you take yourself off the project. */
  onLeft?: () => void;
}

/** Share one project with specific people, and see who it's shared with. */
export function ShareProjectDialog({ isOpen, onClose, project, onLeft }: ShareProjectDialogProps) {
  const me = useAuthStore((s) => s.user?.id);
  const { sharing, loading, error: loadError } = useProjectSharing(project.id, isOpen);
  const { share, changeRole, remove, leave } = useSharingActions(project.id);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ProjectRole>('MEMBER');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await share(email.trim(), role);
      setEmail('');
    } catch (err) {
      setError(
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
          'The project could not be shared',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleLeave = async () => {
    if (!me) return;
    await leave(me);
    onClose();
    onLeft?.();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Share “${project.name}”`}>
      <div className="p-6 space-y-5">
        {sharing?.workspace && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Everyone in <strong className="font-medium">{sharing.workspace.name}</strong> can already see this
            project, except guests. Share it here with guests or with people outside the workspace.
          </p>
        )}

        {sharing?.canManage && (
          <form onSubmit={handleShare} className="space-y-2">
            <label htmlFor="share-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Share with
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="share-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                className="flex-1 min-w-48 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-primary-500/40"
                aria-describedby={error ? 'share-error' : undefined}
              />
              <select
                aria-label="Role"
                value={role}
                onChange={(e) => setRole(e.target.value as ProjectRole)}
                className={selectClass}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value} title={r.description}>
                    {r.label}
                  </option>
                ))}
              </select>
              <Button type="submit" size="sm" isLoading={submitting} disabled={!email.trim()}>
                Share
              </Button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {ROLES.find((r) => r.value === role)?.description}. They need an account here already.
            </p>
            {error && (
              <p id="share-error" className="text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
          </form>
        )}

        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">People with access</h3>
          {loading ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : loadError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {sharing?.owner && (
                <PersonRow name={sharing.owner.name} email={sharing.owner.email} isMe={sharing.owner.id === me}>
                  <span className="text-sm text-gray-500 dark:text-gray-400">Owner</span>
                </PersonRow>
              )}
              {sharing?.collaborators.map(({ user, role: theirRole }) => (
                <PersonRow key={user.id} name={user.name} email={user.email} isMe={user.id === me}>
                  {sharing.canManage ? (
                    <>
                      <select
                        aria-label={`Role for ${user.name}`}
                        value={theirRole}
                        onChange={(e) => void changeRole(user.id, e.target.value as ProjectRole)}
                        className={selectClass}
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <IconButton label={`Remove ${user.name}`} onClick={() => void remove(user.id)}>
                        <X className="w-4 h-4" />
                      </IconButton>
                    </>
                  ) : user.id === me ? (
                    <>
                      <span className="text-sm text-gray-500 dark:text-gray-400">{roleLabel(theirRole)}</span>
                      <Button variant="secondary" size="sm" onClick={() => void handleLeave()}>
                        Leave
                      </Button>
                    </>
                  ) : (
                    <span className="text-sm text-gray-500 dark:text-gray-400">{roleLabel(theirRole)}</span>
                  )}
                </PersonRow>
              ))}
              {sharing && sharing.collaborators.length === 0 && (
                <li className="py-2 text-sm text-gray-500 dark:text-gray-400">Not shared with anyone yet.</li>
              )}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

function PersonRow({
  name,
  email,
  isMe,
  children,
}: {
  name: string;
  email: string | null;
  isMe: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span
        className="w-8 h-8 rounded-full bg-primary-500 text-white text-xs font-medium flex items-center justify-center shrink-0"
        aria-hidden="true"
      >
        {name.charAt(0).toUpperCase()}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900 dark:text-white truncate">
          {name}
          {isMe && <span className="text-gray-500 dark:text-gray-400"> (you)</span>}
        </p>
        {email && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{email}</p>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">{children}</div>
    </li>
  );
}
