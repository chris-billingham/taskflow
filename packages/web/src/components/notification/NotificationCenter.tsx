import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check } from 'lucide-react';
import { useNotificationStore } from '@/stores/notificationStore';
import { NotificationItem } from './NotificationItem';
import type { Notification } from '@/stores/notificationStore';

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
  } = useNotificationStore();

  // Fetch notifications on mount and poll every 30 seconds
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(() => fetchNotifications(), 30_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.isRead) {
      await markAsRead(notification.id);
    }

    // Navigate based on notification data
    const data = notification.data as Record<string, string> | null;
    if (data?.taskId && data?.projectId) {
      navigate(`/projects/${data.projectId}?task=${data.taskId}`);
    } else if (data?.projectId) {
      navigate(`/projects/${data.projectId}`);
    }

    setIsOpen(false);
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
  };

  return (
    <div className="relative" ref={ref}>
      {/* Bell icon button */}
      <button
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
        title="Notifications"
      >
        <Bell className="w-5 h-5 text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[#db4c3f] text-white text-[10px] font-bold px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-[480px] bg-white rounded-lg shadow-lg border border-gray-200 flex flex-col z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                className="flex items-center gap-1 text-xs text-[#db4c3f] hover:text-[#c53727]"
                onClick={handleMarkAllRead}
              >
                <Check className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="flex-1 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Loading...</p>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8">
                <Bell className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onClick={handleNotificationClick}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-gray-100 px-3 py-2">
              <button
                className="w-full text-xs text-center text-gray-500 hover:text-[#db4c3f]"
                onClick={() => {
                  navigate('/settings/notifications');
                  setIsOpen(false);
                }}
              >
                Notification settings
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
