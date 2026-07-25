import { prisma } from '../config/database.js';

export interface ParsedTask {
  content: string;
  dueDate?: string;
  dueTime?: string;
  priority?: number;
  projectId?: string;
  labelIds?: string[];
  duration?: number;
  recurrenceRule?: string;
  isRecurring?: boolean;
}

export async function parseQuickAdd(text: string, userId: string): Promise<ParsedTask> {
  let remaining = text;
  const result: ParsedTask = { content: '' };

  // Parse priority: p1, p2, p3, p4 or !, !!, !!!
  const priorityMatch = remaining.match(/\b[pP]([1-4])\b/);
  if (priorityMatch) {
    result.priority = parseInt(priorityMatch[1], 10);
    remaining = remaining.replace(priorityMatch[0], '').trim();
  } else {
    const exclamationMatch = remaining.match(/(!{1,3})(?!\w)/);
    if (exclamationMatch) {
      const count = exclamationMatch[1].length;
      result.priority = Math.max(1, 4 - count); // !!! = p1, !! = p2, ! = p3
      remaining = remaining.replace(exclamationMatch[0], '').trim();
    }
  }

  // Parse project: #ProjectName
  const projectMatch = remaining.match(/#(\S+)/);
  if (projectMatch) {
    const projectName = projectMatch[1];
    const project = await prisma.project.findFirst({
      where: {
        name: { contains: projectName, mode: 'insensitive' },
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
        ],
      },
      select: { id: true },
    });
    if (project) {
      result.projectId = project.id;
    }
    remaining = remaining.replace(projectMatch[0], '').trim();
  }

  // Parse labels: @labelname (can have multiple)
  const labelMatches = remaining.matchAll(/@(\S+)/g);
  const labelNames: string[] = [];
  for (const match of labelMatches) {
    labelNames.push(match[1]);
    remaining = remaining.replace(match[0], '').trim();
  }
  if (labelNames.length > 0) {
    const labels = await prisma.label.findMany({
      where: {
        userId,
        name: { in: labelNames, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (labels.length > 0) {
      result.labelIds = labels.map((l) => l.id);
    }
  }

  // Parse duration: "for 2h", "for 30m", "for 1h30m"
  const durationMatch = remaining.match(/\bfor\s+(?:(\d+)h)?(?:(\d+)m)?\b/i);
  if (durationMatch && (durationMatch[1] || durationMatch[2])) {
    const hours = parseInt(durationMatch[1] || '0', 10);
    const minutes = parseInt(durationMatch[2] || '0', 10);
    result.duration = hours * 60 + minutes;
    remaining = remaining.replace(durationMatch[0], '').trim();
  }

  // Parse recurring: "every day", "every Monday", "every 2 weeks", etc.
  const recurringMatch = remaining.match(
    /\bevery\s+(?:(\d+)\s+)?(day|week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/i,
  );
  if (recurringMatch) {
    result.isRecurring = true;
    const interval = parseInt(recurringMatch[1] || '1', 10);
    const unit = recurringMatch[2].toLowerCase();

    const dayMap: Record<string, string> = {
      monday: 'MO', tuesday: 'TU', wednesday: 'WE', thursday: 'TH',
      friday: 'FR', saturday: 'SA', sunday: 'SU',
    };

    if (dayMap[unit]) {
      result.recurrenceRule = `FREQ=WEEKLY;INTERVAL=1;BYDAY=${dayMap[unit]}`;
    } else {
      const freqMap: Record<string, string> = {
        day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY',
      };
      result.recurrenceRule = `FREQ=${freqMap[unit]};INTERVAL=${interval}`;
    }
    remaining = remaining.replace(recurringMatch[0], '').trim();
  }

  // Parse time: "at 3pm", "at 15:00", "at 3:30pm"
  const timeMatch = remaining.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2] || '0', 10);
    const ampm = timeMatch[3]?.toLowerCase();

    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;

    result.dueTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    remaining = remaining.replace(timeMatch[0], '').trim();
  }

  // Parse date: "today", "tomorrow", day names, "Jan 15", "next week", "in 3 days"
  const now = new Date();
  const datePatterns: [RegExp, () => Date | null][] = [
    [/\btoday\b/i, () => now],
    [/\btomorrow\b/i, () => {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      return d;
    }],
    [/\bnext\s+week\b/i, () => {
      const d = new Date(now);
      d.setDate(d.getDate() + (7 - d.getDay() + 1)); // next Monday
      return d;
    }],
    [/\bin\s+(\d+)\s+days?\b/i, () => {
      const m = remaining.match(/\bin\s+(\d+)\s+days?\b/i);
      if (!m) return null;
      const d = new Date(now);
      d.setDate(d.getDate() + parseInt(m[1], 10));
      return d;
    }],
    [/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, () => {
      const m = remaining.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
      if (!m) return null;
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const targetDay = days.indexOf(m[1].toLowerCase());
      const d = new Date(now);
      const currentDay = d.getDay();
      let daysToAdd = targetDay - currentDay;
      if (daysToAdd <= 0) daysToAdd += 7;
      d.setDate(d.getDate() + daysToAdd);
      return d;
    }],
    [/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{1,2})\b/i, () => {
      const m = remaining.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{1,2})\b/i);
      if (!m) return null;
      const months: Record<string, number> = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
      };
      const month = months[m[1].toLowerCase().slice(0, 3)];
      const day = parseInt(m[2], 10);
      const d = new Date(now.getFullYear(), month, day);
      if (d < now) d.setFullYear(d.getFullYear() + 1);
      return d;
    }],
  ];

  for (const [pattern, getDate] of datePatterns) {
    const match = remaining.match(pattern);
    if (match) {
      const date = getDate();
      if (date) {
        // Serialize using LOCAL calendar components. toISOString() converts to
        // UTC first, so any evening east of UTC turned "today" into yesterday
        // (the task was born overdue).
        result.dueDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        remaining = remaining.replace(match[0], '').trim();
        break;
      }
    }
  }

  // Clean up remaining text as content
  result.content = remaining.replace(/\s+/g, ' ').trim();

  return result;
}
