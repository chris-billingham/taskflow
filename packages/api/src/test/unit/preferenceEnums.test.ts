import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { profileSchema, updateProfileSchema } from '@taskflow/contract';

describe('display preference enums', () => {
  it('requests carry the format strings and decode to the stored enum names', () => {
    expect(updateProfileSchema.parse({ dateFormat: 'dd/MM/yyyy', timeFormat: '24h', theme: 'dark' })).toEqual({
      dateFormat: 'DAY_FIRST',
      timeFormat: 'H24',
      theme: 'dark',
    });
  });

  it('rejects formats the app does not offer', () => {
    expect(updateProfileSchema.safeParse({ dateFormat: 'yyyy/MM/dd' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ timeFormat: 'military' }).success).toBe(false);
  });

  it('responses turn the enum names back into the format strings', () => {
    const encoded = z.encode(profileSchema.pick({ dateFormat: true, timeFormat: true, theme: true }), {
      dateFormat: 'MONTH_FIRST',
      timeFormat: 'H12',
      theme: null,
    });
    expect(encoded).toEqual({ dateFormat: 'MM/dd/yyyy', timeFormat: '12h', theme: null });
  });
});
