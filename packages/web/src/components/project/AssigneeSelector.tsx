import { useState, useRef, useEffect } from 'react';
import { User, Search, Check, X } from 'lucide-react';
import api from '@/services/api';

interface Member {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

interface AssigneeSelectorProps {
  projectId: string;
  workspaceId?: string | null;
  value: string | null;
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
  onChange: (assigneeId: string | null) => void;
}

export function AssigneeSelector({
  projectId,
  workspaceId,
  value,
  assignee,
  onChange,
}: AssigneeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchMembers = async () => {
    setLoading(true);
    try {
      // For workspace projects, fetch workspace members
      // For personal/shared projects, fetch project members
      if (workspaceId) {
        const { data } = await api.get(`/workspaces/${workspaceId}/members`);
        const wsMembers = (data.data || []).map(
          (m: { user: Member }) => m.user,
        );
        setMembers(wsMembers);
      } else {
        const { data } = await api.get(`/projects/${projectId}/members`);
        setMembers(data.data || []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMembers();
    }
  }, [isOpen, projectId, workspaceId]);

  const filteredMembers = members.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase()),
  );

  const initial = assignee?.name
    ? assignee.name.charAt(0).toUpperCase()
    : null;

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center gap-1">
        <button
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
          onClick={() => setIsOpen(!isOpen)}
          type="button"
        >
          {assignee ? (
            <>
              {assignee.avatarUrl ? (
                <img
                  src={assignee.avatarUrl}
                  alt={assignee.name}
                  className="w-4 h-4 rounded-full"
                />
              ) : (
                <div className="w-4 h-4 rounded-full bg-[#db4c3f]/10 text-[#db4c3f] flex items-center justify-center text-[9px] font-medium">
                  {initial}
                </div>
              )}
              <span className="text-gray-700 dark:text-gray-300">{assignee.name}</span>
            </>
          ) : (
            <>
              <User className="w-3.5 h-3.5" />
              Assignee
            </>
          )}
        </button>
        {value && (
          <button
            className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
            onClick={() => onChange(null)}
            title="Remove assignee"
            type="button"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
          {/* Search */}
          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
              <input
                className="w-full pl-7 pr-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:border-[#db4c3f]"
                placeholder="Search members..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          {/* Unassign option */}
          {value && (
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700"
              onClick={() => {
                onChange(null);
                setIsOpen(false);
              }}
            >
              <X className="w-4 h-4" />
              <span>Unassigned</span>
            </button>
          )}

          {/* Member list */}
          <div className="max-h-48 overflow-y-auto py-1">
            {loading ? (
              <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">Loading...</p>
            ) : (
              <>
                {filteredMembers.map((member) => {
                  const isSelected = value === member.id;
                  const memberInitial = member.name.charAt(0).toUpperCase();
                  return (
                    <button
                      key={member.id}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${
                        isSelected ? 'bg-[#db4c3f]/5' : ''
                      }`}
                      onClick={() => {
                        onChange(member.id);
                        setIsOpen(false);
                      }}
                    >
                      {member.avatarUrl ? (
                        <img
                          src={member.avatarUrl}
                          alt={member.name}
                          className="w-5 h-5 rounded-full flex-shrink-0"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-[#db4c3f]/10 text-[#db4c3f] flex items-center justify-center text-[10px] font-medium flex-shrink-0">
                          {memberInitial}
                        </div>
                      )}
                      <span className="text-gray-700 dark:text-gray-300 flex-1 text-left truncate">
                        {member.name}
                      </span>
                      {isSelected && (
                        <Check className="w-4 h-4 text-[#db4c3f]" />
                      )}
                    </button>
                  );
                })}

                {filteredMembers.length === 0 && (
                  <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
                    No members found
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
