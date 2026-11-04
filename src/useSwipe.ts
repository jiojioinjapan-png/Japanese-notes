import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

type Options = {
  disabled?: boolean;
  canPrevious: boolean;
  canNext: boolean;
  onTurn: (direction: -1 | 1) => void;
  onProgress?: (offset: number) => void;
  onCancel?: () => void;
};

/** Leave vertical drags and pinch zoom to the browser, capture only horizontal turns. */
export function useSwipe(options: Options) {
  const gesture = useRef<{
    x: number;
    y: number;
    time: number;
    horizontal: boolean;
    vertical: boolean;
    pointer: number;
  } | null>(null);
  const ignoreClickUntil = useRef(0);
  const cancel = () => {
    gesture.current = null;
    options.onCancel?.();
  };
  return {
    suppressClick: () => Date.now() < ignoreClickUntil.current,
    handlers: {
      onPointerDown(event: ReactPointerEvent<HTMLElement>) {
        if (options.disabled || !event.isPrimary || event.button !== 0) return;
        if (window.getSelection()?.toString()) return;
        // A fresh press is an intentional interaction, not the click from the last swipe.
        ignoreClickUntil.current = 0;
        gesture.current = {
          x: event.clientX,
          y: event.clientY,
          time: Date.now(),
          horizontal: false,
          vertical: false,
          pointer: event.pointerId,
        };
      },
      onPointerMove(event: ReactPointerEvent<HTMLElement>) {
        const start = gesture.current;
        if (!start || start.pointer !== event.pointerId || start.vertical) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (!start.horizontal && Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
          start.vertical = true;
          options.onCancel?.();
          return;
        }
        if (!start.horizontal && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3) {
          start.horizontal = true;
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            /* Synthetic test events do not own a pointer. */
          }
        }
        if (!start.horizontal) return;
        event.preventDefault();
        ignoreClickUntil.current = Date.now() + 400;
        const allowed = dx < 0 ? options.canNext : options.canPrevious;
        options.onProgress?.(allowed ? dx : dx * 0.15);
      },
      onPointerUp(event: ReactPointerEvent<HTMLElement>) {
        const start = gesture.current;
        if (!start || start.pointer !== event.pointerId) return;
        gesture.current = null;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        const elapsed = Date.now() - start.time;
        const threshold = Math.min(70, event.currentTarget.clientWidth * 0.18);
        const direction = dx < 0 ? 1 : -1;
        if (start.horizontal) ignoreClickUntil.current = Date.now() + 400;
        if (
          start.horizontal &&
          Math.abs(dx) > Math.abs(dy) * 1.3 &&
          (Math.abs(dx) >= threshold || (Math.abs(dx) > 30 && elapsed < 220)) &&
          (direction === 1 ? options.canNext : options.canPrevious)
        )
          options.onTurn(direction);
        else options.onCancel?.();
      },
      onPointerCancel: cancel,
    },
  };
}
