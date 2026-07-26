import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRefreshAccessToken = vi.fn();
const mockGetAccessToken = vi.fn(() => 'token-1');

vi.mock('@/services/api', () => ({
  default: {},
  getAccessToken: () => mockGetAccessToken(),
  refreshAccessToken: () => mockRefreshAccessToken(),
  setAccessToken: vi.fn(),
}));

type Handler = (...args: unknown[]) => void;

function createFakeSocket() {
  const handlers = new Map<string, Handler[]>();
  return {
    connected: false,
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn((event: string, fn: Handler): void => {
      handlers.set(event, [...(handlers.get(event) ?? []), fn]);
    }),
    io: { on: vi.fn() },
    fire(event: string, ...args: unknown[]) {
      for (const fn of handlers.get(event) ?? []) fn(...args);
    },
  };
}

let fakeSocket = createFakeSocket();

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => fakeSocket),
}));

// socket.ts keeps module-level state (socket handle, room registry, retry
// counter), so every test loads a fresh copy of the module.
async function loadSocketModule() {
  vi.resetModules();
  fakeSocket = createFakeSocket();
  return import('@/services/socket');
}

// Extracts the ack callback from a recorded subscribe:project emit call.
function ackOfCall(call: unknown[]): (res: { ok: boolean }) => void {
  return call[2] as (res: { ok: boolean }) => void;
}

function subscribeEmits(fake: ReturnType<typeof createFakeSocket>) {
  return fake.emit.mock.calls.filter((c: unknown[]) => c[0] === 'subscribe:project');
}

beforeEach(() => {
  mockRefreshAccessToken.mockReset();
  mockGetAccessToken.mockReset().mockReturnValue('token-1');
});

describe('socket service room registry', () => {
  it('emits registered subscriptions once connected', async () => {
    const socket = await loadSocketModule();
    socket.subscribeToProject('p1', 'w1');
    socket.initSocket('token-1');
    expect(subscribeEmits(fakeSocket)).toHaveLength(0);

    fakeSocket.connected = true;
    fakeSocket.fire('connect');

    const calls = subscribeEmits(fakeSocket);
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual({ projectId: 'p1', workspaceId: 'w1' });
  });

  it('emits immediately when already connected', async () => {
    const socket = await loadSocketModule();
    socket.initSocket('token-1');
    fakeSocket.connected = true;
    fakeSocket.fire('connect');

    socket.subscribeToProject('p2', undefined);
    const calls = subscribeEmits(fakeSocket);
    expect(calls[calls.length - 1]?.[1]).toEqual({ projectId: 'p2', workspaceId: undefined });
  });

  it('re-joins every registered room on each reconnect', async () => {
    const socket = await loadSocketModule();
    socket.initSocket('token-1');
    socket.subscribeToProject('p1');
    socket.subscribeToProject('p2');

    fakeSocket.connected = true;
    fakeSocket.fire('connect');
    fakeSocket.fire('connect');

    expect(subscribeEmits(fakeSocket)).toHaveLength(4);
  });

  it('drops a subscription the server denies', async () => {
    const socket = await loadSocketModule();
    socket.initSocket('token-1');
    fakeSocket.connected = true;
    fakeSocket.fire('connect');

    socket.subscribeToProject('p1');
    const deniedCalls = subscribeEmits(fakeSocket);
    const denied = deniedCalls[deniedCalls.length - 1];
    ackOfCall(denied)({ ok: false });

    fakeSocket.emit.mockClear();
    fakeSocket.fire('connect');
    expect(subscribeEmits(fakeSocket)).toHaveLength(0);
  });

  it('stops re-joining after explicit unsubscribe', async () => {
    const socket = await loadSocketModule();
    socket.initSocket('token-1');
    fakeSocket.connected = true;
    fakeSocket.fire('connect');

    socket.subscribeToProject('p1');
    socket.unsubscribeFromProject('p1');
    expect(
      fakeSocket.emit.mock.calls.some((c) => c[0] === 'unsubscribe:project'),
    ).toBe(true);

    fakeSocket.emit.mockClear();
    fakeSocket.fire('connect');
    expect(subscribeEmits(fakeSocket)).toHaveLength(0);
  });

  it('clears the registry on disconnectSocket', async () => {
    const socket = await loadSocketModule();
    socket.initSocket('token-1');
    socket.subscribeToProject('p1');
    socket.disconnectSocket();
    expect(fakeSocket.disconnect).toHaveBeenCalled();

    // A new session must not inherit the previous session's rooms.
    fakeSocket = createFakeSocket();
    socket.initSocket('token-2');
    fakeSocket.connected = true;
    fakeSocket.fire('connect');
    expect(subscribeEmits(fakeSocket)).toHaveLength(0);
  });
});

describe('socket service auth recovery', () => {
  it('refreshes the token and reconnects when the handshake is rejected', async () => {
    mockRefreshAccessToken.mockResolvedValue('token-2');
    const socket = await loadSocketModule();
    socket.initSocket('token-1');

    fakeSocket.fire('connect_error', new Error('Invalid or expired token'));

    await vi.waitFor(() => expect(fakeSocket.connect).toHaveBeenCalled());
    expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it('does not refresh for non-auth connection errors', async () => {
    const socket = await loadSocketModule();
    socket.initSocket('token-1');

    fakeSocket.fire('connect_error', new Error('websocket error'));

    await new Promise((r) => setTimeout(r, 0));
    expect(mockRefreshAccessToken).not.toHaveBeenCalled();
    expect(fakeSocket.connect).not.toHaveBeenCalled();
  });

  it('gives up after repeated auth failures instead of looping forever', async () => {
    mockRefreshAccessToken.mockResolvedValue('token-2');
    const socket = await loadSocketModule();
    socket.initSocket('token-1');

    for (let i = 0; i < 5; i++) {
      fakeSocket.fire('connect_error', new Error('Authentication required'));
      await new Promise((r) => setTimeout(r, 0));
    }

    expect(mockRefreshAccessToken).toHaveBeenCalledTimes(3);
  });

  it('resets the retry budget after a successful connect', async () => {
    mockRefreshAccessToken.mockResolvedValue('token-2');
    const socket = await loadSocketModule();
    socket.initSocket('token-1');

    for (let i = 0; i < 3; i++) {
      fakeSocket.fire('connect_error', new Error('Authentication required'));
      await new Promise((r) => setTimeout(r, 0));
    }
    fakeSocket.fire('connect');
    fakeSocket.fire('connect_error', new Error('Authentication required'));
    await new Promise((r) => setTimeout(r, 0));

    expect(mockRefreshAccessToken).toHaveBeenCalledTimes(4);
  });
});

describe('resync signalling', () => {
  // A reconnected socket re-joins its rooms but nothing replays what it missed
  // while it was away, so the app has to re-read its views. These tests pin down
  // WHEN it is told to, and that it is told once rather than once per room.
  async function loadWithStore() {
    const socket = await loadSocketModule();
    const { useSocketStore } = await import('@/stores/socketStore');
    useSocketStore.setState({ resyncEpoch: 0 });
    return { socket, useSocketStore };
  }

  it('signals a resync when the server reports the rooms are live', async () => {
    const { socket, useSocketStore } = await loadWithStore();
    socket.initSocket('token-1');

    fakeSocket.connected = true;
    fakeSocket.fire('connect');
    // `connect` alone is too early — the server joins rooms asynchronously.
    expect(useSocketStore.getState().resyncEpoch).toBe(0);

    fakeSocket.fire('rooms:ready');

    await vi.waitFor(() =>
      expect(useSocketStore.getState().resyncEpoch).toBe(1),
    );
  });

  it('signals a resync when a project subscription is acknowledged', async () => {
    const { socket, useSocketStore } = await loadWithStore();
    socket.initSocket('token-1');
    fakeSocket.connected = true;
    fakeSocket.fire('connect');

    socket.subscribeToProject('p1');
    const calls = subscribeEmits(fakeSocket);
    ackOfCall(calls[calls.length - 1])({ ok: true });

    await vi.waitFor(() =>
      expect(useSocketStore.getState().resyncEpoch).toBe(1),
    );
  });

  it('does not signal a resync for a denied subscription', async () => {
    const { socket, useSocketStore } = await loadWithStore();
    socket.initSocket('token-1');
    fakeSocket.connected = true;
    fakeSocket.fire('connect');

    socket.subscribeToProject('p1');
    const calls = subscribeEmits(fakeSocket);
    ackOfCall(calls[calls.length - 1])({ ok: false });

    await new Promise((r) => setTimeout(r, 250));
    expect(useSocketStore.getState().resyncEpoch).toBe(0);
  });

  it('coalesces the burst a reconnect produces into one signal', async () => {
    // One reconnect fires rooms:ready plus an ack per re-subscribed project.
    // Each must not cost its own round trip of refetches.
    const { socket, useSocketStore } = await loadWithStore();
    socket.initSocket('token-1');
    socket.subscribeToProject('p1');
    socket.subscribeToProject('p2');
    socket.subscribeToProject('p3');

    fakeSocket.connected = true;
    fakeSocket.fire('connect');
    fakeSocket.fire('rooms:ready');
    for (const call of subscribeEmits(fakeSocket)) ackOfCall(call)({ ok: true });

    await vi.waitFor(() =>
      expect(useSocketStore.getState().resyncEpoch).toBe(1),
    );
    await new Promise((r) => setTimeout(r, 250));
    expect(useSocketStore.getState().resyncEpoch).toBe(1);
  });

  it('signals again on a later reconnect', async () => {
    const { socket, useSocketStore } = await loadWithStore();
    socket.initSocket('token-1');
    fakeSocket.connected = true;

    fakeSocket.fire('connect');
    fakeSocket.fire('rooms:ready');
    await vi.waitFor(() => expect(useSocketStore.getState().resyncEpoch).toBe(1));

    // The 15-minute token-expiry disconnect, then socket.io reconnecting.
    fakeSocket.fire('disconnect');
    fakeSocket.fire('connect');
    fakeSocket.fire('rooms:ready');
    await vi.waitFor(() => expect(useSocketStore.getState().resyncEpoch).toBe(2));
  });

  it('drops a pending signal when the session ends', async () => {
    // Logging out mid-window must not make the next user's views refetch under
    // the previous session's signal.
    const { socket, useSocketStore } = await loadWithStore();
    socket.initSocket('token-1');
    fakeSocket.connected = true;
    fakeSocket.fire('connect');
    fakeSocket.fire('rooms:ready');

    socket.disconnectSocket();

    await new Promise((r) => setTimeout(r, 250));
    expect(useSocketStore.getState().resyncEpoch).toBe(0);
  });
});
