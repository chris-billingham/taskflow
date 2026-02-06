import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { CheckSquare, LogOut } from 'lucide-react';

export default function Today() {
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-[#db4c3f]" />
            <span className="text-lg font-bold text-gray-900">Taskflow</span>
          </div>
          <Button variant="secondary" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Welcome, {user?.name}
        </h1>
        <p className="text-gray-600">
          Your tasks for today will appear here.
        </p>
      </main>
    </div>
  );
}
