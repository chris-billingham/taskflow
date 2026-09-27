import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/services/api';
import type { SearchResults } from '@taskflow/contract';

const RECENT_SEARCHES_KEY = 'taskflow:recent-searches';
const MAX_RECENT = 5;
const DEBOUNCE_MS = 300;

export type TaskResult = SearchResults['tasks'][number];
export type ProjectResult = SearchResults['projects'][number];
export type CommentResult = SearchResults['comments'][number];
export type { SearchResults };

function loadRecentSearches(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
  } catch {
    return [];
  }
}

export function useSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>(loadRecentSearches);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(debounceRef.current);

    if (!query.trim() || query.trim().length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/search', { params: { q: query.trim() } });
        setResults(data.data);
        setError(null);
      } catch {
        setError('Search failed');
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const saveRecentSearch = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setRecentSearches((prev) => {
      const updated = [trimmed, ...prev.filter((s) => s !== trimmed)].slice(0, MAX_RECENT);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearRecentSearches = useCallback(() => {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
    setRecentSearches([]);
  }, []);

  const totalResults = results
    ? results.tasks.length + results.projects.length + results.comments.length
    : 0;

  return {
    query,
    setQuery,
    results,
    loading,
    error,
    recentSearches,
    saveRecentSearch,
    clearRecentSearches,
    totalResults,
  };
}
