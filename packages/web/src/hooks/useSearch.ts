import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  const [debounced, setDebounced] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>(loadRecentSearches);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const term = query.trim().length >= 2 ? debounced : '';
  const search = useQuery({
    queryKey: ['search', term],
    queryFn: async () => (await api.get('/search', { params: { q: term } })).data.data as SearchResults,
    enabled: term.length >= 2,
    staleTime: 10_000,
    placeholderData: (previous) => previous,
  });
  const results = term.length >= 2 ? (search.data ?? null) : null;
  // Typing ahead of the debounce counts as loading, so "no results" doesn't flash.
  const loading = query.trim().length >= 2 && (query.trim() !== debounced || search.isFetching);
  const error = search.error ? 'Search failed' : null;

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
