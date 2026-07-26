import { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useWorkspaceStore } from '@/stores/workspaceStore';

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
}

export function InviteMemberModal({
  isOpen,
  onClose,
  workspaceId,
}: InviteMemberModalProps) {
  const inviteMember = useWorkspaceStore((s) => s.inviteMember);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'MEMBER' | 'GUEST'>('MEMBER');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const invite = await inviteMember(workspaceId, email.trim(), role);
      setInviteToken(invite.token);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send invite');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyLink = async () => {
    if (!inviteToken) return;
    const link = `${window.location.origin}/join?token=${inviteToken}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setEmail('');
    setRole('MEMBER');
    setError('');
    setInviteToken(null);
    setCopied(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative z-10 bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Invite member
          </h2>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {inviteToken ? (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <p className="text-sm text-green-800 font-medium">
                Invite sent to {email}
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                The invite will expire in 7 days.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Invite link
              </label>
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700"
                  readOnly
                  value={`${window.location.origin}/join?token=${inviteToken}`}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCopyLink}
                >
                  {copied ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={handleClose}>
                Done
              </Button>
              <Button
                onClick={() => {
                  setInviteToken(null);
                  setEmail('');
                  setError('');
                }}
              >
                Invite another
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@example.com"
              error={error}
              autoFocus
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Role
              </label>
              <select
                className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#db4c3f] focus:border-[#db4c3f]"
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as 'ADMIN' | 'MEMBER' | 'GUEST')
                }
              >
                <option value="MEMBER">Member - Create projects, access team projects</option>
                <option value="ADMIN">Admin - Manage members and all projects</option>
                <option value="GUEST">Guest - Access specific shared projects only</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" type="button" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                isLoading={isSubmitting}
                disabled={!email.trim()}
              >
                Send invite
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
