import { create } from 'zustand';

export type SocketStatus = 'connected' | 'connecting' | 'disconnected';

interface SocketStore {
  status: SocketStatus;
  setStatus: (status: SocketStatus) => void;
}

export const useSocketStore = create<SocketStore>()((set) => ({
  status: 'disconnected',
  setStatus: (status) => set({ status }),
}));
