import { useLayoutEffect, useRef, useState } from 'react';

/** Page capacity comes from real available space, never from a fixed device model. */
export function useShelfLayout() {
  const ref = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ columns: 1, rows: 1, pageSize: 1 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const css = getComputedStyle(element);
      const columns = Math.max(1, parseInt(css.getPropertyValue('--shelf-columns')) || 1);
      const minimum = parseFloat(css.getPropertyValue('--card-min-height')) || 250;
      const gap = parseFloat(css.rowGap) || 14;
      const rows = Math.max(
        1,
        Math.min(10, Math.floor((element.clientHeight + gap) / (minimum + gap))),
      );
      const pageSize = Math.min(100, columns * rows);
      setLayout((previous) =>
        previous.pageSize === pageSize && previous.columns === columns && previous.rows === rows
          ? previous
          : { columns, rows, pageSize },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, []);
  return { ref, ...layout };
}
