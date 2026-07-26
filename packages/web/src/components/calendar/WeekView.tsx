import { useEffect, useRef, useState, useMemo } from 'react';
import { formatUserHour } from '@/utils/dateFormat';
import { format } from 'date-fns';
import { useDroppable } from '@dnd-kit/core';
import { CalendarTask } from './CalendarTask';
import { TimeSlot } from './TimeSlot';
import type { CalendarDay } from '@/hooks/useCalendar';
import type { Task } from '@/stores/taskStore';

interface WeekViewProps {
  days: CalendarDay[];
  hours: number[];
  onTaskClick: (task: Task) => void;
  onComplete: (id: string) => void;
  onUncomplete: (id: string) => void;
  onSlotClick: (dateStr: string, time: string) => void;
  onResizeDuration: (taskId: string, duration: number) => void;
}

const HOUR_HEIGHT = 48; // px per hour
const START_HOUR = 6;

function timeToPixels(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h - START_HOUR) * HOUR_HEIGHT + (m / 60) * HOUR_HEIGHT;
}

function durationToPixels(duration: number): number {
  return (duration / 60) * HOUR_HEIGHT;
}

function AnytimeDropZone({ dateStr }: { dateStr: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${dateStr}`,
  });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[4px] transition-colors ${isOver ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
    />
  );
}

export function WeekView({
  days,
  hours,
  onTaskClick,
  onComplete,
  onUncomplete,
  onSlotClick,
  onResizeDuration,
}: WeekViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every 60s
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to current time on mount
  useEffect(() => {
    if (scrollRef.current) {
      const now = new Date();
      const scrollTo = timeToPixels(
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      );
      scrollRef.current.scrollTop = Math.max(0, scrollTo - 100);
    }
  }, []);

  // Split tasks into timed and anytime per day
  const { timedByDay, anytimeByDay } = useMemo(() => {
    const timed = new Map<string, Task[]>();
    const anytime = new Map<string, Task[]>();

    for (const day of days) {
      const t: Task[] = [];
      const a: Task[] = [];
      for (const task of day.tasks) {
        if (task.dueTime) {
          t.push(task);
        } else {
          a.push(task);
        }
      }
      timed.set(day.dateStr, t);
      anytime.set(day.dateStr, a);
    }

    return { timedByDay: timed, anytimeByDay: anytime };
  }, [days]);

  const nowHour = currentTime.getHours();
  const nowMin = currentTime.getMinutes();
  const todayStr = format(currentTime, 'yyyy-MM-dd');

  return (
    <div className="flex flex-col h-[calc(100vh-220px)]">
      {/* Day headers */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        {/* Time label spacer */}
        <div className="w-16 flex-shrink-0" />
        {days.map((day) => (
          <div
            key={day.dateStr}
            className="flex-1 text-center py-2 border-l border-gray-200 dark:border-gray-700"
          >
            <div
              className={`text-xs font-medium ${
                day.isToday ? 'text-[#db4c3f]' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {format(day.date, 'EEE')}
            </div>
            <div
              className={`text-sm font-bold inline-flex items-center justify-center w-7 h-7 rounded-full ${
                day.isToday
                  ? 'bg-[#db4c3f] text-white'
                  : 'text-gray-900 dark:text-white'
              }`}
            >
              {format(day.date, 'd')}
            </div>
          </div>
        ))}
      </div>

      {/* Anytime row */}
      {days.some((d) => (anytimeByDay.get(d.dateStr) || []).length > 0) && (
        <div className="flex border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="w-16 flex-shrink-0 text-xs text-gray-400 dark:text-gray-500 text-right pr-2 pt-1">
            Anytime
          </div>
          {days.map((day) => {
            const anytimeTasks = anytimeByDay.get(day.dateStr) || [];
            return (
              <div
                key={day.dateStr}
                className="flex-1 border-l border-gray-200 dark:border-gray-700 p-1 space-y-0.5"
              >
                <AnytimeDropZone dateStr={day.dateStr} />
                {anytimeTasks.map((task) => (
                  <CalendarTask
                    key={task.id}
                    task={task}
                    variant="month"
                    onTaskClick={onTaskClick}
                    onComplete={onComplete}
                    onUncomplete={onUncomplete}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="flex relative">
          {/* Time labels column */}
          <div className="w-16 flex-shrink-0">
            {hours.map((hour) => (
              <div key={hour} className="h-12 relative">
                <span className="absolute -top-2 right-2 text-xs text-gray-400 dark:text-gray-500">
                  {formatUserHour(hour)}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day) => {
            const timedTasks = timedByDay.get(day.dateStr) || [];
            const isCurrentDay = day.dateStr === todayStr;

            return (
              <div
                key={day.dateStr}
                className="flex-1 border-l border-gray-200 dark:border-gray-700 relative"
              >
                {/* Time slots */}
                {hours.map((hour) => (
                  <TimeSlot
                    key={hour}
                    dateStr={day.dateStr}
                    hour={hour}
                    isCurrentHour={isCurrentDay && hour === nowHour}
                    onSlotClick={onSlotClick}
                  />
                ))}

                {/* Timed tasks */}
                {timedTasks.map((task) => {
                  if (!task.dueTime) return null;
                  const top = timeToPixels(task.dueTime);
                  const height = durationToPixels(task.duration || 30);
                  // Don't render tasks outside visible range
                  if (top < 0) return null;
                  return (
                    <CalendarTask
                      key={task.id}
                      task={task}
                      variant="week"
                      style={{ top: `${top}px`, height: `${Math.max(height, 20)}px` }}
                      onTaskClick={onTaskClick}
                      onComplete={onComplete}
                      onUncomplete={onUncomplete}
                      onResizeDuration={onResizeDuration}
                    />
                  );
                })}

                {/* Current time indicator */}
                {isCurrentDay && (
                  <div
                    className="absolute left-0 right-0 z-10 pointer-events-none"
                    style={{
                      top: `${timeToPixels(`${String(nowHour).padStart(2, '0')}:${String(nowMin).padStart(2, '0')}`)}px`,
                    }}
                  >
                    <div className="flex items-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#db4c3f] -ml-1" />
                      <div className="flex-1 h-[2px] bg-[#db4c3f]" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
