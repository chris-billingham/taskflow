import { Shield, ShieldCheck, Crown, Eye, MoreHorizontal, UserMinus, ArrowUpDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import type { WorkspaceMember, WorkspaceInvite, WorkspaceRole } from '@/stores/workspaceStore';

const ROLE_CONFIG: Record<WorkspaceRole, { label: string; icon: typeof Crown; color: string }> = {
  OWNER: { label: 'Owner', icon: Crown, color: 'text-amber-600 bg-amber-50' },
  ADMIN: { label: 'Admin', icon: ShieldCheck, color: 'text-blue-600 bg-blue-50' },
  MEMBER: { label: 'Member', icon: Shield, color: 'text-gray-600 bg-gray-100' },
  GUEST: { label: 'Guest', icon: Eye, color: 'text-gray-400 bg-gray-50' },
};

interface MemberListProps {
  members: WorkspaceMember[];
  invites: WorkspaceInvite[];
  currentUserId: string;
  currentUserRole: WorkspaceRole;
  onChangeRole: (userId: string, role: string) => void;
  onRemoveMember: (userId: string) => void;
  onCancelInvite: (inviteId: string) => void;
}

export function MemberList({
  members,
  invites,
  currentUserId,
  currentUserRole,
  onChangeRole,
  onRemoveMember,
  onCancelInvite,
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
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Pending invites
            </h4>
          </div>
          {invites.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-sm font-medium">
                  ?
                </div>
                <div>
                  <p className="text-sm text-gray-500">{invite.email}</p>
                  <p className="text-xs text-gray-400">Invited as {invite.role.toLowerCase()}</p>
                </div>
              </div>
              {canManage && (
                <button
                  className="text-xs text-red-500 hover:text-red-700"
                  onClick={() => onCancelInvite(invite.id)}
                >
                  Cancel
                </button>
              )}
            </div>
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
    <div className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50">
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
          <p className="text-sm font-medium text-gray-900">
            {member.user.name}
            {isCurrentUser && (
              <span className="text-xs text-gray-400 ml-1">(you)</span>
            )}
          </p>
          <p className="text-xs text-gray-500">{member.user.email}</p>
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
              className="p-1 rounded hover:bg-gray-200"
              onClick={() => setShowMenu(!showMenu)}
            >
              <MoreHorizontal className="w-4 h-4 text-gray-400" />
            </button>

            {showMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
                {/* Role change options */}
                {currentUserRole === 'OWNER' && member.role !== 'ADMIN' && (
                  <button
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
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
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
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
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => {
                      onChangeRole(member.userId, 'GUEST');
                      setShowMenu(false);
                    }}
                  >
                    <ArrowUpDown className="w-4 h-4" />
                    Make guest
                  </button>
                )}
                <hr className="my-1 border-gray-100" />
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
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
