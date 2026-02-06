interface ViewHeaderProps {
  title: string;
  subtitle?: string;
  taskCount?: number;
  children?: React.ReactNode;
}

export function ViewHeader({ title, subtitle, taskCount, children }: ViewHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {taskCount !== undefined && taskCount > 0 && (
            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {taskCount}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
