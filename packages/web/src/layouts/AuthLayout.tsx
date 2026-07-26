import { ReactNode } from 'react';
import { CheckSquare } from 'lucide-react';
import { Card } from '@/components/ui/Card';

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-2 mb-6">
            <CheckSquare className="w-8 h-8 text-[#db4c3f]" />
            <span className="text-2xl font-bold text-gray-900 dark:text-white">Taskflow</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
          {subtitle && (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{subtitle}</p>
          )}
        </div>
        <Card padding="lg">{children}</Card>
      </div>
    </div>
  );
}
