import { describe, it, expect } from 'vitest';
import { readLinkToken } from '@/utils/linkToken';

describe('readLinkToken', () => {
  it('reads the token from the URL fragment', () => {
    expect(readLinkToken({ hash: '#token=abc123', search: '' })).toBe('abc123');
  });

  it('decodes an encoded fragment token', () => {
    expect(readLinkToken({ hash: '#token=a%2Bb%3D', search: '' })).toBe('a+b=');
  });

  it('still accepts links sent with ?token= before the change', () => {
    expect(readLinkToken({ hash: '', search: '?token=legacy' })).toBe('legacy');
  });

  it('prefers the fragment when both are present', () => {
    expect(readLinkToken({ hash: '#token=new', search: '?token=old' })).toBe('new');
  });

  it('returns null when there is no token', () => {
    expect(readLinkToken({ hash: '', search: '' })).toBeNull();
  });
});
