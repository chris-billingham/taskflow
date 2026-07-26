import { CheckSquare, FolderOpen, MessageSquare, Calendar } from 'lucide-react';
import type { TaskResult, ProjectResult, CommentResult } from '@/hooks/useSearch';
import { formatUserDate } from '@/utils/dateFormat';

function highlightMatch(text: string, query: string): JSX.Element {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-100 text-yellow-800 rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

interface TaskItemProps {
  result: TaskResult;
  query: string;
  isSelected: boolean;
  onClick: () => void;
}

export function TaskResultItem({ result, query, isSelected, onClick }: TaskItemProps) {
  return (
    <button
      className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors ${
        isSelected ? 'bg-blue-50' : ''
      }`}
      onClick={onClick}
    >
      <CheckSquare
        className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
          result.isCompleted ? 'text-green-500' : 'text-gray-400'
        }`}
      />
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium truncate ${
            result.isCompleted ? 'line-through text-gray-400' : 'text-gray-900'
          }`}
        >
          {highlightMatch(result.content, query)}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: result.projectColor }}
          />
          <span className="text-xs text-gray-500 truncate">{result.projectName}</span>
          {result.dueDate && (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatUserDate(new Date(result.dueDate))}
              </span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

interface ProjectItemProps {
  result: ProjectResult;
  query: string;
  isSelected: boolean;
  onClick: () => void;
}

export function ProjectResultItem({ result, query, isSelected, onClick }: ProjectItemProps) {
  return (
    <button
      className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors ${
        isSelected ? 'bg-blue-50' : ''
      }`}
      onClick={onClick}
    >
      <span
        className="w-4 h-4 rounded-sm flex-shrink-0"
        style={{ backgroundColor: result.color }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {highlightMatch(result.name, query)}
        </p>
        <p className="text-xs text-gray-500">{result.taskCount} active tasks</p>
      </div>
      <FolderOpen className="w-4 h-4 text-gray-300 flex-shrink-0" />
    </button>
  );
}

interface CommentItemProps {
  result: CommentResult;
  query: string;
  isSelected: boolean;
  onClick: () => void;
}

export function CommentResultItem({ result, query, isSelected, onClick }: CommentItemProps) {
  const snippet =
    result.content.length > 120 ? result.content.slice(0, 120) + '…' : result.content;

  return (
    <button
      className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors ${
        isSelected ? 'bg-blue-50' : ''
      }`}
      onClick={onClick}
    >
      <MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-700 line-clamp-2">{highlightMatch(snippet, query)}</p>
        {(result.taskContent || result.projectName) && (
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {result.taskContent ? `In: ${result.taskContent}` : result.projectName}
          </p>
        )}
      </div>
    </button>
  );
}
