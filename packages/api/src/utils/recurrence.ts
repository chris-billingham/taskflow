export function parseRecurrenceText(text: string): string {
  const lower = text.toLowerCase().trim();

  const dayMap: Record<string, string> = {
    monday: 'MO', tuesday: 'TU', wednesday: 'WE', thursday: 'TH',
    friday: 'FR', saturday: 'SA', sunday: 'SU',
  };

  // "every day", "every 2 days"
  const dailyMatch = lower.match(/^every\s+(?:(\d+)\s+)?days?$/);
  if (dailyMatch) {
    const interval = parseInt(dailyMatch[1] || '1', 10);
    return `FREQ=DAILY;INTERVAL=${interval}`;
  }

  // "every week", "every 2 weeks"
  const weeklyMatch = lower.match(/^every\s+(?:(\d+)\s+)?weeks?$/);
  if (weeklyMatch) {
    const interval = parseInt(weeklyMatch[1] || '1', 10);
    return `FREQ=WEEKLY;INTERVAL=${interval}`;
  }

  // "every month", "every 3 months"
  const monthlyMatch = lower.match(/^every\s+(?:(\d+)\s+)?months?$/);
  if (monthlyMatch) {
    const interval = parseInt(monthlyMatch[1] || '1', 10);
    return `FREQ=MONTHLY;INTERVAL=${interval}`;
  }

  // "every year", "every 2 years"
  const yearlyMatch = lower.match(/^every\s+(?:(\d+)\s+)?years?$/);
  if (yearlyMatch) {
    const interval = parseInt(yearlyMatch[1] || '1', 10);
    return `FREQ=YEARLY;INTERVAL=${interval}`;
  }

  // "every Monday", "every Tuesday", etc.
  for (const [dayName, dayCode] of Object.entries(dayMap)) {
    if (lower === `every ${dayName}`) {
      return `FREQ=WEEKLY;INTERVAL=1;BYDAY=${dayCode}`;
    }
  }

  // "every weekday"
  if (lower === 'every weekday') {
    return 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR';
  }

  // Default: daily
  return 'FREQ=DAILY;INTERVAL=1';
}

export function getNextOccurrence(rrule: string, fromDate: Date): Date {
  const parts = new Map<string, string>();
  for (const part of rrule.split(';')) {
    const [key, value] = part.split('=');
    parts.set(key, value);
  }

  const freq = parts.get('FREQ') || 'DAILY';
  const interval = parseInt(parts.get('INTERVAL') || '1', 10);
  const byDay = parts.get('BYDAY')?.split(',');

  const next = new Date(fromDate);

  switch (freq) {
    case 'DAILY':
      next.setDate(next.getDate() + interval);
      break;

    case 'WEEKLY':
      if (byDay && byDay.length > 0) {
        const dayCodeToNum: Record<string, number> = {
          SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
        };
        const targetDays = byDay.map((d) => dayCodeToNum[d]).filter((d) => d !== undefined);

        if (targetDays.length > 0) {
          const currentDay = next.getDay();
          // Find next matching day
          let daysToAdd = Infinity;
          for (const target of targetDays) {
            let diff = target - currentDay;
            if (diff <= 0) diff += 7;
            if (diff < daysToAdd) daysToAdd = diff;
          }
          next.setDate(next.getDate() + daysToAdd);
        } else {
          next.setDate(next.getDate() + 7 * interval);
        }
      } else {
        next.setDate(next.getDate() + 7 * interval);
      }
      break;

    case 'MONTHLY':
      next.setMonth(next.getMonth() + interval);
      break;

    case 'YEARLY':
      next.setFullYear(next.getFullYear() + interval);
      break;
  }

  return next;
}
