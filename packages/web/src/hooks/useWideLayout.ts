import { useEffect } from 'react';
import { create } from 'zustand';

// Pages whose content is wide by nature (boards, calendars) let the main
// column use the whole window; everything else keeps a readable width.
export const useLayoutWidth = create<{ wide: boolean; setWide: (wide: boolean) => void }>((set) => ({
  wide: false,
  setWide: (wide) => set({ wide }),
}));

/** Let the main column fill the window while `active` (and this page) lasts. */
export function useWideLayout(active: boolean): void {
  const setWide = useLayoutWidth((s) => s.setWide);
  useEffect(() => {
    setWide(active);
    return () => setWide(false);
  }, [active, setWide]);
}
