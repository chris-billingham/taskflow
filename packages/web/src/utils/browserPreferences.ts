/**
 * Starting preferences for a new account, read from the browser so a new user
 * in London doesn't begin on US dates, Sunday weeks and 12-hour times. They
 * can all be changed later in Settings → Preferences.
 */
export interface SignUpPreferences {
  timezone?: string;
  weekStart?: 0 | 1 | 6;
  dateFormat?: 'MMM d, yyyy' | 'dd/MM/yyyy' | 'yyyy-MM-dd';
  timeFormat?: '12h' | '24h';
}

type WeekInfo = { firstDay: number };
type LocaleWithWeekInfo = Intl.Locale & { getWeekInfo?: () => WeekInfo; weekInfo?: WeekInfo };

export function browserPreferences(locale: string = navigator.language): SignUpPreferences {
  const prefs: SignUpPreferences = {};
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) prefs.timezone = tz;
  } catch {
    /* no Intl timezone support: the server default (UTC) applies */
  }
  try {
    const loc = new Intl.Locale(locale) as LocaleWithWeekInfo;
    // ISO day numbers: 1 = Monday … 7 = Sunday. Only the three week starts
    // the app offers are used.
    const firstDay = (loc.getWeekInfo?.() ?? loc.weekInfo)?.firstDay;
    if (firstDay === 7) prefs.weekStart = 0;
    else if (firstDay === 1) prefs.weekStart = 1;
    else if (firstDay === 6) prefs.weekStart = 6;
  } catch {
    /* unknown locale or no week data */
  }
  try {
    // The order the locale writes day, month and year in.
    const order = new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date(2025, 0, 5))
      .map((p) => p.type)
      .filter((t) => t === 'year' || t === 'month' || t === 'day')
      .join(',');
    if (order === 'year,month,day') prefs.dateFormat = 'yyyy-MM-dd';
    else if (order === 'day,month,year') prefs.dateFormat = 'dd/MM/yyyy';
    // Month-first locales keep the default, which spells the month out.
    else if (order === 'month,day,year') prefs.dateFormat = 'MMM d, yyyy';

    const hourCycle = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hourCycle;
    if (hourCycle) prefs.timeFormat = hourCycle === 'h23' || hourCycle === 'h24' ? '24h' : '12h';
  } catch {
    /* unknown locale */
  }
  return prefs;
}
