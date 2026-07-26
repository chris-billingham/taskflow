import { useState, useMemo, useCallback } from 'react';
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  format,
  isSameDay,
  startOfDay,
} from 'date-fns';
import type { Task } from '@/stores/taskStore';
import { useAuthStore } from '@/stores/authStore';

export type CalendarMode = 'week' | 'month';

export interface CalendarDay {
  date: Date;
  dateStr: string;
  isToday: boolean;
  isCurrentMonth: boolean;
  tasks: Task[];
}

export function useCalendar(tasks: Task[], initialMode: CalendarMode = 'week') {
  // Subscribed (not getState) so an open calendar re-renders when the user
  // changes "Week starts on" in preferences.
  const WEEK_STARTS_ON = (useAuthStore((s) => s.user?.weekStart) ?? 0) as 0 | 1 | 6;
  const [mode, setMode] = useState<CalendarMode>(initialMode);
  const [currentDate, setCurrentDate] = useState(() => startOfDay(new Date()));

  const goToDate = useCallback((date: Date) => {
    setCurrentDate(startOfDay(date));
  }, []);

  const navigateForward = useCallback(() => {
    setCurrentDate((prev) =>
      mode === 'week' ? addWeeks(prev, 1) : addMonths(prev, 1),
    );
  }, [mode]);

  const navigateBack = useCallback(() => {
    setCurrentDate((prev) =>
      mode === 'week' ? subWeeks(prev, 1) : subMonths(prev, 1),
    );
  }, [mode]);

  const goToToday = useCallback(() => {
    setCurrentDate(startOfDay(new Date()));
  }, []);

  const headerLabel = useMemo(() => {
    if (mode === 'week') {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: WEEK_STARTS_ON });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: WEEK_STARTS_ON });
      return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'd, yyyy')}`;
    }
    return format(currentDate, 'MMMM yyyy');
  }, [mode, currentDate]);

  // Index tasks by date string for O(1) lookup
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      if (task.isCompleted || !task.dueDate) continue;
      const dateStr = task.dueDate.split('T')[0];
      const list = map.get(dateStr) || [];
      list.push(task);
      map.set(dateStr, list);
    }
    return map;
  }, [tasks]);

  const days: CalendarDay[] = useMemo(() => {
    const today = startOfDay(new Date());

    if (mode === 'week') {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: WEEK_STARTS_ON });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: WEEK_STARTS_ON });
      return eachDayOfInterval({ start: weekStart, end: weekEnd }).map((date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        return {
          date,
          dateStr,
          isToday: isSameDay(date, today),
          isCurrentMonth: true,
          tasks: tasksByDate.get(dateStr) || [],
        };
      });
    }

    // Month mode: include leading/trailing days to fill grid
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: WEEK_STARTS_ON });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: WEEK_STARTS_ON });

    return eachDayOfInterval({ start: gridStart, end: gridEnd }).map((date) => {
      const dateStr = format(date, 'yyyy-MM-dd');
      return {
        date,
        dateStr,
        isToday: isSameDay(date, today),
        isCurrentMonth: date.getMonth() === currentDate.getMonth(),
        tasks: tasksByDate.get(dateStr) || [],
      };
    });
  }, [mode, currentDate, tasksByDate]);

  const hours = useMemo(() => {
    const h: number[] = [];
    for (let i = 6; i <= 22; i++) h.push(i);
    return h;
  }, []);

  return {
    mode,
    setMode,
    currentDate,
    goToDate,
    navigateForward,
    navigateBack,
    goToToday,
    headerLabel,
    days,
    hours,
  };
}
