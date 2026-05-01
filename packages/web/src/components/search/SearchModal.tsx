import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { SearchInput } from './SearchInput';
import { SearchResultsPanel } from './SearchResults';
import { useSearch } from '@/hooks/useSearch';
import type { TaskResult, ProjectResult, CommentResult } from '@/hooks/useSearch';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const navigate = useNavigate();
  const {
    query,
    setQuery,
    results,
    loading,
    recentSearches,
    saveRecentSearch,
    clearRecentSearches,
    totalResults,
  } = useSearch();
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen, setQuery]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  const handleSelectTask = useCallback(
    (result: TaskResult) => {
      if (query.trim()) saveRecentSearch(query);
      navigate(`/projects/${result.projectId}`);
      onClose();
    },
    [query, navigate, saveRecentSearch, onClose],
  );

  const handleSelectProject = useCallback(
    (result: ProjectResult) => {
      if (query.trim()) saveRecentSearch(query);
      navigate(`/projects/${result.id}`);
      onClose();
    },
    [query, navigate, saveRecentSearch, onClose],
  );

  const handleSelectComment = useCallback(
    (result: CommentResult) => {
      if (query.trim()) saveRecentSearch(query);
      if (result.projectId) {
        const taskParam = result.taskId ? `?task=${result.taskId}` : '';
        navigate(`/projects/${result.projectId}${taskParam}`);
      }
      onClose();
    },
    [query, navigate, saveRecentSearch, onClose],
  );

  const getNthResult = useCallback(
    (n: number): { type: string; result: TaskResult | ProjectResult | CommentResult } | null => {
      if (!results) return null;
      if (n < results.tasks.length) return { type: 'task', result: results.tasks[n] };
      n -= results.tasks.length;
      if (n < results.projects.length) return { type: 'project', result: results.projects[n] };
      n -= results.projects.length;
      if (n < results.comments.length) return { type: 'comment', result: results.comments[n] };
      return null;
    },
    [results],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, totalResults - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && totalResults > 0) {
        e.preventDefault();
        const item = getNthResult(selectedIndex);
        if (!item) return;
        if (item.type === 'task') handleSelectTask(item.result as TaskResult);
        else if (item.type === 'project') handleSelectProject(item.result as ProjectResult);
        else if (item.type === 'comment') handleSelectComment(item.result as CommentResult);
      }
    },
    [
      isOpen,
      totalResults,
      selectedIndex,
      getNthResult,
      onClose,
      handleSelectTask,
      handleSelectProject,
      handleSelectComment,
    ],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen) return null;

  const showRecents = !query.trim() && recentSearches.length > 0;
  const showResults = query.trim().length >= 2 && results !== null;
  const showEmpty = query.trim().length >= 2 && !loading && results !== null && totalResults === 0;
  const showPlaceholder = !query.trim() && recentSearches.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <SearchInput query={query} onChange={setQuery} loading={loading} autoFocus />

        <div className="max-h-[60vh] overflow-y-auto">
          {showPlaceholder && (
            <div className="py-12 text-center">
              <p className="text-gray-400 text-sm">
                Type to search tasks, projects, and comments
              </p>
            </div>
          )}

          {showRecents && (
            <div>
              <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Recent Searches
                </p>
                <button
                  onClick={clearRecentSearches}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Clear
                </button>
              </div>
              {recentSearches.map((term) => (
                <button
                  key={term}
                  className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors"
                  onClick={() => setQuery(term)}
                >
                  <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-700">{term}</span>
                </button>
              ))}
            </div>
          )}

          {showResults && (
            <SearchResultsPanel
              results={results}
              query={query}
              selectedIndex={selectedIndex}
              onSelectTask={handleSelectTask}
              onSelectProject={handleSelectProject}
              onSelectComment={handleSelectComment}
            />
          )}

          {showEmpty && (
            <div className="py-12 text-center">
              <p className="text-gray-500 text-sm">No results for &ldquo;{query}&rdquo;</p>
            </div>
          )}
        </div>

        {totalResults > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-4 text-xs text-gray-400">
            <span>
              <kbd className="font-mono">↑↓</kbd> navigate
            </span>
            <span>
              <kbd className="font-mono">↵</kbd> select
            </span>
            <span>
              <kbd className="font-mono">esc</kbd> close
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
