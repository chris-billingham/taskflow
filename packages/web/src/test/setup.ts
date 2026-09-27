import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './msw/server';

// Network-level API mocks for tests that exercise the real API client (page
// tests). Tests that vi.mock('@/services/api') never reach the network.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.clearAllMocks();
  localStorage.clear();
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Observer stubs. Classes, not vi.fn(() => ({...})): libraries construct them
// with `new` (dnd-kit's ResizeObserver), which an arrow implementation can't
// satisfy on Vitest 5.
class StubObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.IntersectionObserver = StubObserver as unknown as typeof IntersectionObserver;
globalThis.ResizeObserver = StubObserver as unknown as typeof ResizeObserver;

// jsdom has no layout, so no scrolling APIs; Upcoming scrolls to today on mount.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

// Silence console.error for expected errors in tests
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  if (
    typeof args[0] === 'string' &&
    (args[0].includes('Warning:') || args[0].includes('Error:'))
  ) {
    return;
  }
  originalConsoleError(...args);
};
