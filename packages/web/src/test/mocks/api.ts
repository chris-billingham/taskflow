import { vi } from 'vitest';

export const mockApi = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  interceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
};

export const mockSetAccessToken = vi.fn();

vi.mock('@/services/api', () => ({
  default: mockApi,
  setAccessToken: mockSetAccessToken,
  getAccessToken: vi.fn(() => null),
}));
