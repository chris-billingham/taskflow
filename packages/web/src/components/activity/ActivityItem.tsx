import {
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  RotateCcw,
  ArrowRightLeft,
  MessageSquare,
  Archive,
  ArchiveRestore,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { ActivityItem as ActivityItemType } from '@/hooks/useActivity';

const actionConfig: Record<string, { icon: typeof Plus; color: string; label: string }> = {
  CREATED: { icon: Plus, color: 'text-green-500', label: 'created' },
  UPDATED: { icon: Pencil, color: 'text-blue-500', label: 'updated' },
  DELETED: { icon: Trash2, color: 'text-red-500', label: 'deleted' },
  COMPLETED: { icon: CheckCircle2, color: 'text-green-600', label: 'completed' },
  UNCOMPLETED: { icon: RotateCcw, color: 'text-orange-500', label: 'reopened' },
  MOVED: { icon: ArrowRightLeft, color: 'text-purple-500', label: 'moved' },
  COMMENTED: { icon: MessageSquare, color: 'text-blue-400', label: 'commented on' },
  ARCHIVED: { icon: Archive, color: 'text-gray-500', label: 'archived' },
  UNARCHIVED: { icon: ArchiveRestore, color: 'text-gray-500', label: 'unarchived' },
};

function getChangedFields(oldData: Record<string, unknown> | null, newData: Record<string, unknown> | null): string[] {
  if (!newData) return [];
  return Object.keys(newData).filter((key) => {
    if (!oldData) return true;
    return oldData[key] !== newData[key];
  });
}

interface ActivityItemProps {
  activity: ActivityItemType;
}

export function ActivityItemComponent({ activity }: ActivityItemProps) {
  const config = actionConfig[activity.action] || {
    icon: Plus,
    color: 'text-gray-400',
    label: activity.action.toLowerCase(),
  };
  const Icon = config.icon;

  const changedFields = activity.action === 'UPDATED'
    ? getChangedFields(activity.oldData, activity.newData)
    : [];

  return (
    <div className="flex gap-2 py-1.5">
      <div className={`flex-shrink-0 mt-0.5 ${config.color}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-600">
          <span className="font-medium text-gray-900">{activity.user.name}</span>
          {' '}{config.label}{' '}
          <span className="text-gray-500">
            this {activity.entityType.toLowerCase()}
          </span>
          {changedFields.length > 0 && (
            <span className="text-gray-400">
              {' '}&middot; changed {changedFields.join(', ')}
            </span>
          )}
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}
