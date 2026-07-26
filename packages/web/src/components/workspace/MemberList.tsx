import { Shield, ShieldCheck, Crown, Eye, MoreHorizontal, UserMinus, ArrowUpDown, RefreshCw, Copy, Check } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import type { WorkspaceMember, WorkspaceInvite, WorkspaceRole } from '@/stores/workspaceStore';

const ROLE_CONFIG: Record<WorkspaceRole, { label: string; icon: typeof Crown; color: string }> = {
  OWNER: { label: 'Owner', icon: Crown, color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20' },
  ADMIN: { label: 'Admin', icon: ShieldCheck, color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' },
  MEMBER: { label: 'Member', icon: Shield, color: 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700' },
  GUEST: { label: 'Guest', icon: Eye, color: 'text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700' },
};

interface MemberListProps {
  members: WorkspaceMember[];
  invites: WorkspaceInvite[];
  currentUserId: string;
  currentUserRole: WorkspaceRole;
  onChangeRole: (userId: string, role: string) => void;
  onRemoveMember: (userId: string) => void;
  onCancelInvite: (inviteId: string) => void;
  onResendInvite: (inviteId: string) => Promise<WorkspaceInvite>;
}

export function MemberList({
  members,
  invites,
  currentUserId,
  currentUserRole,
  onChangeRole,
  onRemoveMember,
  onCancelInvite,
  onResendInvite,
}: MemberListProps) {
  const canManage = currentUserRole === 'OWNER' || currentUserRole === 'ADMIN';

  return (
    <div className="space-y-1">
      {/* Active members */}
      {members.map((member) => (
        <MemberRow
          key={member.id}
          member={member}
          isCurrentUser={member.userId === currentUserId}
          canManage={canManage}
          currentUserRole={currentUserRole}
          onChangeRole={onChangeRole}
          onRemoveMember={onRemoveMember}
        />
      ))}

      {/* Pending invites */}
      {invites.length > 0 && (
        <>
          <div className="pt-4 pb-1">
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Pending invites
            </h4>
          </div>
          {invites.map((invite) => (
            <InviteRow
              key={invite.id}
              invite={invite}
              canManage={canManage}
              onCancelInvite={onCancelInvite}
              onResendInvite={onResendInvite}
            />
          ))}
        </>
      )}
    </div>
  );
}

function MemberRow({
  member,
  isCurrentUser,
  canManage,
  currentUserRole,
  onChangeRole,
  onRemoveMember,
}: {
  member: WorkspaceMember;
  isCurrentUser: boolean;
  canManage: boolean;
  currentUserRole: WorkspaceRole;
  onChangeRole: (userId: string, role: string) => void;
  onRemoveMember: (userId: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const roleConfig = ROLE_CONFIG[member.role];
  const RoleIcon = roleConfig.icon;
  const canModify =
    canManage && !isCurrentUser && member.role !== 'OWNER';

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 group">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-[#db4c3f] flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
          {member.user.avatarUrl ? (
            <img
              src={member.user.avatarUrl}
              alt={member.user.name}
              className="w-8 h-8 rounded-full"
            />
          ) : (
            member.user.name.charAt(0).toUpperCase()
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {member.user.name}
            {isCurrentUser && (
              <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">(you)</span>
            )}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{member.user.email}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${roleConfig.color}`}
        >
          <RoleIcon className="w-3 h-3" />
          {roleConfig.label}
        </span>

        {canModify && (
          <div className="relative" ref={menuRef}>
            <button
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
              onClick={() => setShowMenu(!showMenu)}
            >
              <MoreHorizontal className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            </button>

            {showMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1">
                {/* Role change options */}
                {currentUserRole === 'OWNER' && member.role !== 'ADMIN' && (
                  <button
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    onClick={() => {
                      onChangeRole(member.userId, 'ADMIN');
                      setShowMenu(false);
                    }}
                  >
                    <ArrowUpDown className="w-4 h-4" />
                    Make admin
                  </button>
                )}
                {member.role === 'ADMIN' && (
                  <button
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    onClick={() => {
                      onChangeRole(member.userId, 'MEMBER');
                      setShowMenu(false);
                    }}
                  >
                    <ArrowUpDown className="w-4 h-4" />
                    Make member
                  </button>
                )}
                {member.role !== 'GUEST' && (
                  <button
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    onClick={() => {
                      onChangeRole(member.userId, 'GUEST');
                      setShowMenu(false);
                    }}
                  >
                    <ArrowUpDown className="w-4 h-4" />
                    Make guest
                  </button>
                )}
                <hr className="my-1 border-gray-100 dark:border-gray-700" />
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  onClick={() => {
                    onRemoveMember(member.userId);
                    setShowMenu(false);
                  }}
                >
                  <UserMinus className="w-4 h-4" />
                  Remove
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InviteRow({
  invite,
  canManage,
  onCancelInvite,
  onResendInvite,
}: {
  invite: WorkspaceInvite;
  canManage: boolean;
  onCancelInvite: (inviteId: string) => void;
  onResendInvite: (inviteId: string) => Promise<WorkspaceInvite>;
}) {
  const [resending, setResending] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleResend = async () => {
    setResending(true);
    try {
      const updated = await onResendInvite(invite.id);
      const link = `${window.location.origin}/join?token=${updated.token}`;
      setInviteLink(link);
    } catch {
      // Error handled upstream
    } finally {
      setResending(false);
    }
  };

  const handleCopy = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm font-medium">
            ?
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{invite.email}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Invited as {invite.role.toLowerCase()}</p>
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <button
              className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50"
              onClick={handleResend}
              disabled={resending}
            >
              <RefreshCw className={`w-3 h-3 ${resending ? 'animate-spin' : ''}`} />
              Resend
            </button>
            <button
              className="text-xs text-red-500 hover:text-red-700"
              onClick={() => onCancelInvite(invite.id)}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      {inviteLink && (
        <div className="mt-2 ml-11 flex items-center gap-2">
          <code className="flex-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-1 rounded truncate">
            {inviteLink}
          </code>
          <button
            className="flex-shrink-0 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            onClick={handleCopy}
            title="Copy invite link"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-green-500" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
