import {
  UserPlus,
  Clock,
  AlertTriangle,
  MessageSquare,
  AtSign,
  Share2,
  Mail,
  Bell,
} from 'lucide-react';
import type { Notification } from '@/stores/notificationStore';
import { formatUserDate } from '@/utils/dateFormat';

interface NotificationItemProps {
  notification: Notification;
  onClick: (notification: Notification) => void;
}

const typeConfig: Record<string, { icon: typeof Bell; color: string }> = {
  TASK_ASSIGNED: { icon: UserPlus, color: 'text-blue-500' },
  TASK_DUE_SOON: { icon: Clock, color: 'text-orange-500' },
  TASK_OVERDUE: { icon: AlertTriangle, color: 'text-red-500' },
  COMMENT_ON_TASK: { icon: MessageSquare, color: 'text-green-500' },
  MENTION_IN_COMMENT: { icon: AtSign, color: 'text-purple-500' },
  PROJECT_SHARED: { icon: Share2, color: 'text-indigo-500' },
  WORKSPACE_INVITE: { icon: Mail, color: 'text-teal-500' },
  REMINDER: { icon: Bell, color: 'text-amber-500' },
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  // Older than a week: an absolute date, in the user's chosen format.
  return formatUserDate(new Date(dateStr));
}

export function NotificationItem({ notification, onClick }: NotificationItemProps) {
  const config = typeConfig[notification.type] || { icon: Bell, color: 'text-gray-500' };
  const Icon = config.icon;

  return (
    <button
      className={`w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors ${
        !notification.isRead ? 'bg-blue-50/50' : ''
      }`}
      onClick={() => onClick(notification)}
    >
      <div className={`mt-0.5 ${config.color}`}>
        <Icon className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm ${!notification.isRead ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
          {notification.title}
        </p>
        <p className="text-xs text-gray-500 mt-0.5 truncate">{notification.body}</p>
        <p className="text-xs text-gray-400 mt-1">{timeAgo(notification.createdAt)}</p>
      </div>

      {!notification.isRead && (
        <div className="mt-2 w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
      )}
    </button>
  );
}
