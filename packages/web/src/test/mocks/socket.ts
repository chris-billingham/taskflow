import { vi } from 'vitest';

// Import this before the module under test in any file that renders pages:
// the realtime layer is exercised by its own tests (services/socket.test.ts),
// and page tests must not open real socket.io connections.
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
  initSocket: vi.fn(() => mockSocket),
  getSocket: vi.fn(() => null),
  disconnectSocket: vi.fn(),
  subscribeToProject: vi.fn(),
  unsubscribeFromProject: vi.fn(),
  emitTypingStart: vi.fn(),
  emitTypingStop: vi.fn(),
  viewTask: vi.fn(),
  leaveTask: vi.fn(),
}));
