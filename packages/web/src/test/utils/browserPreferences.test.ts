import { describe, it, expect } from 'vitest';
import { browserPreferences } from '@/utils/browserPreferences';

describe('browserPreferences', () => {
  it('reads UK conventions', () => {
    expect(browserPreferences('en-GB')).toMatchObject({ weekStart: 1, dateFormat: 'dd/MM/yyyy', timeFormat: '24h' });
  });

  it('reads US conventions', () => {
    expect(browserPreferences('en-US')).toMatchObject({ weekStart: 0, dateFormat: 'MMM d, yyyy', timeFormat: '12h' });
  });

  it('reads year-first locales', () => {
    expect(browserPreferences('sv-SE')).toMatchObject({ weekStart: 1, dateFormat: 'yyyy-MM-dd', timeFormat: '24h' });
  });

  it('always includes the timezone and survives a nonsense locale', () => {
    expect(browserPreferences('en-GB').timezone).toBeTruthy();
    expect(() => browserPreferences('!!')).not.toThrow();
  });
});
