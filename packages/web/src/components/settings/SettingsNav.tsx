import { NavLink } from 'react-router-dom';
import { User, Lock, Sliders, Bell, Plug, Download } from 'lucide-react';

const items = [
  { to: '/settings/profile', label: 'Profile', icon: User },
  { to: '/settings/account', label: 'Account', icon: Lock },
  { to: '/settings/preferences', label: 'Preferences', icon: Sliders },
  { to: '/settings/notifications', label: 'Notifications', icon: Bell },
  { to: '/settings/integrations', label: 'Integrations', icon: Plug },
  { to: '/settings/export', label: 'Data & Privacy', icon: Download },
];

export function SettingsNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="space-y-0.5">
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              isActive
                ? 'bg-gray-100 text-gray-900 font-medium dark:bg-gray-700 dark:text-white'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white'
            }`
          }
        >
          <Icon className="w-4 h-4 flex-shrink-0" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
