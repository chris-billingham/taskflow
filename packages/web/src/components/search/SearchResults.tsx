import { TaskResultItem, ProjectResultItem, CommentResultItem } from './SearchResultItem';
import type { SearchResults, TaskResult, ProjectResult, CommentResult } from '@/hooks/useSearch';

interface SearchResultsProps {
  results: SearchResults;
  query: string;
  selectedIndex: number;
  onSelectTask: (result: TaskResult) => void;
  onSelectProject: (result: ProjectResult) => void;
  onSelectComment: (result: CommentResult) => void;
}

export function SearchResultsPanel({
  results,
  query,
  selectedIndex,
  onSelectTask,
  onSelectProject,
  onSelectComment,
}: SearchResultsProps) {
  const hasResults =
    results.tasks.length > 0 || results.projects.length > 0 || results.comments.length > 0;

  if (!hasResults) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500 text-sm">No results found</p>
      </div>
    );
  }

  let idx = 0;

  return (
    <div className="divide-y divide-gray-100">
      {results.tasks.length > 0 && (
        <section>
          <p className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50">
            Tasks · {results.tasks.length}
          </p>
          {results.tasks.map((task) => {
            const currentIdx = idx++;
            return (
              <TaskResultItem
                key={task.id}
                result={task}
                query={query}
                isSelected={selectedIndex === currentIdx}
                onClick={() => onSelectTask(task)}
              />
            );
          })}
        </section>
      )}

      {results.projects.length > 0 && (
        <section>
          <p className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50">
            Projects · {results.projects.length}
          </p>
          {results.projects.map((project) => {
            const currentIdx = idx++;
            return (
              <ProjectResultItem
                key={project.id}
                result={project}
                query={query}
                isSelected={selectedIndex === currentIdx}
                onClick={() => onSelectProject(project)}
              />
            );
          })}
        </section>
      )}

      {results.comments.length > 0 && (
        <section>
          <p className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50">
            Comments · {results.comments.length}
          </p>
          {results.comments.map((comment) => {
            const currentIdx = idx++;
            return (
              <CommentResultItem
                key={comment.id}
                result={comment}
                query={query}
                isSelected={selectedIndex === currentIdx}
                onClick={() => onSelectComment(comment)}
              />
            );
          })}
        </section>
      )}
    </div>
  );
}
