import { useEffect, useRef } from 'react';

// Open overlays by opening order. Every overlay listens on document, so
// without this a single Escape closed a dialog AND everything underneath it
// (the template preview and the gallery behind it, a lightbox and the task
// panel).
const openLayers = new Set<number>();
let nextOrder = 0;

/**
 * Call `onClose` on Escape, but only for the most recently opened overlay.
 * Escape that a menu or picker inside already handled (defaultPrevented) is
 * left alone.
 */
export function useEscapeToClose(onClose: () => void, active: boolean = true): void {
  // Ordered at render, not in the effect: effects run child-first, so a
  // dialog mounted together with the panel it sits in would otherwise count
  // as opened before it.
  const order = useRef(0);
  const wasActive = useRef(false);
  if (active && !wasActive.current) order.current = ++nextOrder;
  wasActive.current = active;

  // Callers pass inline closures; reading them through a ref keeps the
  // listener registered once per open.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!active) return;
    const layer = order.current;
    openLayers.add(layer);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (layer !== Math.max(...openLayers)) return;
      // Marks the key as used so no other Escape handler acts on it too.
      e.preventDefault();
      onCloseRef.current();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      openLayers.delete(layer);
    };
  }, [active]);
}
