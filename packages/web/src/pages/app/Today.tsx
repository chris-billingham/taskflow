import { useAuthStore } from '@/stores/authStore';

export default function Today() {
  const { user } = useAuthStore();

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Today</h1>
      <p className="text-gray-600">
        Welcome, {user?.name}. Your tasks for today will appear here.
      </p>
    </div>
  );
}
