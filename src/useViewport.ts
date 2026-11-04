import { useEffect } from 'react';

/** iOS software keyboards resize the visual viewport, not always 100dvh. */
export function useViewport() {
  useEffect(() => {
    const update = () => {
      const viewport = window.visualViewport;
      if (viewport && viewport.scale > 1.01) return;
      const height = viewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${height}px`);
      document.documentElement.style.setProperty('--app-top', `${viewport?.offsetTop ?? 0}px`);
      document.documentElement.dataset.keyboard = String(window.innerHeight - height > 120);
    };
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, []);
}
