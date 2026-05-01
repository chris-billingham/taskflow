import { vi } from 'vitest';

export const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  connected: false,
  id: 'mock-socket-id',
};

vi.mock('@/services/socket', () => ({
  getSocket: vi.fn(() => mockSocket),
  connectSocket: vi.fn(() => mockSocket),
  disconnectSocket: vi.fn(),
}));
