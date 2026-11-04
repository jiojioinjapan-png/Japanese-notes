import { useEffect, useRef, type ReactNode } from 'react';

export default function Modal({
  title,
  children,
  close,
  className = '',
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const scrollY = window.scrollY;
    dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-dialog-focus]')?.focus({ preventScroll: true });
    const body = document.body;
    const previous = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    const syncViewport = () => {
      const viewport = window.visualViewport;
      if (!viewport) return;
      dialog.style.setProperty('--visual-height', `${viewport.height}px`);
      dialog.style.setProperty(
        '--keyboard-inset',
        `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`,
      );
    };
    syncViewport();
    window.visualViewport?.addEventListener('resize', syncViewport);
    window.visualViewport?.addEventListener('scroll', syncViewport);
    return () => {
      dialog.close();
      window.visualViewport?.removeEventListener('resize', syncViewport);
      window.visualViewport?.removeEventListener('scroll', syncViewport);
      Object.assign(body.style, previous);
      window.scrollTo({ top: scrollY, behavior: 'instant' });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const box = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom
          )
            close();
        }
      }}
    >
      {children}
    </dialog>
  );
}
