import { create } from 'zustand';

export type SocketStatus = 'connected' | 'connecting' | 'disconnected';

interface SocketStore {
  status: SocketStatus;
  setStatus: (status: SocketStatus) => void;
  /**
   * Incremented whenever this client has (re)established its realtime
   * subscriptions and may therefore have MISSED events in the meantime.
   *
   * Realtime state arrives two ways: an HTTP fetch when a view mounts, and
   * websocket broadcasts thereafter. Nothing bridged the gap between them, so
   * anything broadcast while the client was not in the room was lost with no
   * reconciliation — the view stayed silently stale until a manual reload.
   * There are two such windows, and the second is routine rather than rare:
   *
   *  - between a view's HTTP fetch and its socket actually joining the room
   *    (the join is async, and the server's auto-join is not acknowledged);
   *  - every disconnect — a sleeping laptop, a network blip, and in particular
   *    the server's own deliberate force-disconnect when an access token
   *    expires, which happens to every client every 15 minutes.
   *
   * Data hooks include this in their fetch-effect dependencies, so a bump
   * re-reads whatever is on screen. It is a resync signal, not a status: it
   * only ever moves forward, so an effect can depend on it without needing to
   * distinguish a first connect from a reconnect.
   */
  resyncEpoch: number;
  bumpResync: () => void;
}

export const useSocketStore = create<SocketStore>()((set) => ({
  status: 'disconnected',
  setStatus: (status) => set({ status }),
  resyncEpoch: 0,
  bumpResync: () => set((s) => ({ resyncEpoch: s.resyncEpoch + 1 })),
}));
