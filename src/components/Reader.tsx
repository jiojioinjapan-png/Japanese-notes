import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, LoaderCircle, Type, X } from 'lucide-react';
import { categories, type Category, type Note, type NotesResponse } from '../../shared/notes';
import { responseBody } from '../api';
import { usePreference } from '../preferences';
import { useSwipe } from '../useSwipe';
import Modal from './Modal';
import NoteContent from './NoteContent';

export type ReaderSource = { category: Category; query: string; sort: string; total: number };
export default function Reader({
  initialNote,
  initialIndex,
  source,
  historyKey,
  returnLabel = '返回书库',
  close,
}: {
  initialNote: Note;
  initialIndex: number;
  source: ReaderSource;
  historyKey: string;
  returnLabel?: string;
  close: (position: number) => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [note, setNote] = useState(initialNote);
  const [readerSize, setReaderSize] = usePreference('kotoba-reader-size', 'regular');
  const [offset, setOffset] = useState(0);
  const [direction, setDirection] = useState<-1 | 0 | 1>(0);
  const [turning, setTurning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [, redrawCache] = useState(0);
  const cache = useRef(new Map<number, Note>([[initialIndex, initialNote]]));
  const pending = useRef(new Map<number, Promise<Note>>());
  const controller = useRef(new AbortController());
  const animation = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frames = useRef<number[]>([]);
  const locked = useRef(false);
  const position = useRef(index);
  const closeRef = useRef(close);
  closeRef.current = close;
  const stage = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLElement>(null);
  const offsetRef = useRef(0);
  const setDrag = (value: number) => {
    offsetRef.current = value;
    setOffset(value);
  };
  const load = useCallback(
    (target: number): Promise<Note> => {
      if (cache.current.has(target)) return Promise.resolve(cache.current.get(target)!);
      if (pending.current.has(target)) return pending.current.get(target)!;
      const params = new URLSearchParams({
        category: source.category,
        q: source.query,
        sort: source.sort,
        page: String(target + 1),
        pageSize: '1',
      });
      const request = fetch(`/api/notes?${params}`, { signal: controller.current.signal })
        .then(responseBody<NotesResponse>)
        .then((result) => {
          if (!result.notes[0]) throw new Error('这一页暂时没有内容，请返回书库刷新。');
          cache.current.set(target, result.notes[0]);
          if (!controller.current.signal.aborted) redrawCache((value) => value + 1);
          return result.notes[0];
        })
        .finally(() => pending.current.delete(target));
      pending.current.set(target, request);
      return request;
    },
    [source.category, source.query, source.sort],
  );
  useEffect(() => {
    // StrictMode replays setup/cleanup; each live instance needs a live controller.
    controller.current = new AbortController();
    return () => {
      controller.current.abort();
      if (animation.current) clearTimeout(animation.current);
      for (const frame of frames.current) cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    const back = () => {
      if (history.state?.kotobaReader !== historyKey) closeRef.current(position.current);
    };
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, [historyKey]);
  useEffect(() => {
    position.current = index;
    for (const adjacent of [index - 1, index + 1])
      if (adjacent >= 0 && adjacent < source.total)
        void load(adjacent).catch(() => {
          /* Current page remains readable if prefetch fails. */
        });
  }, [index, source.total, load]);
  const turn = useCallback(
    async (step: -1 | 1) => {
      const target = position.current + step;
      if (locked.current || target < 0 || target >= source.total) {
        setDrag(0);
        setDirection(0);
        return;
      }
      locked.current = true;
      setError('');
      try {
        if (!cache.current.has(target)) setLoading(true);
        const next = await load(target);
        if (controller.current.signal.aborted) return;
        setLoading(false);
        setDirection(step);
        setTurning(true);
        const width = stage.current?.clientWidth ?? window.innerWidth;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const finish = () => {
          position.current = target;
          setIndex(target);
          setNote(next);
          setDrag(0);
          setDirection(0);
          setTurning(false);
          locked.current = false;
          if (page.current) page.current.scrollTop = 0;
        };
        if (reduced) {
          finish();
          return;
        }
        frames.current.push(
          requestAnimationFrame(() =>
            frames.current.push(
              requestAnimationFrame(() => {
                setDrag(-step * width);
                animation.current = setTimeout(finish, 290);
              }),
            ),
          ),
        );
      } catch (cause) {
        if ((cause as Error).name !== 'AbortError')
          setError(cause instanceof Error ? cause.message : '这一页暂时无法打开，请重试。');
        setLoading(false);
        setTurning(false);
        setDrag(0);
        setDirection(0);
        locked.current = false;
      }
    },
    [source.total, load],
  );
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        void turn(event.key === 'ArrowRight' ? 1 : -1);
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [turn]);
  useLayoutEffect(() => {
    page.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [index]);
  const swipe = useSwipe({
    disabled: turning || loading,
    canPrevious: index > 0,
    canNext: index < source.total - 1,
    onTurn: (step) => void turn(step),
    onProgress: (distance) => {
      setDirection(distance < 0 ? 1 : -1);
      setDrag(Math.max(-window.innerWidth, Math.min(window.innerWidth, distance)));
    },
    onCancel: () => {
      if (!locked.current) {
        setDrag(0);
        setDirection(0);
      }
    },
  });
  const width = stage.current?.clientWidth ?? window.innerWidth;
  const preview = direction ? cache.current.get(index + direction) : undefined;
  return (
    <Modal
      title="笔记阅读"
      close={() => closeRef.current(position.current)}
      className={`reader ${note.type} ${readerSize === 'large' ? 'large-text' : ''}`}
    >
      <header className="reader-toolbar">
        <button className="text-button" onClick={() => close(position.current)}>
          <ArrowLeft size={18} /> {returnLabel}
        </button>
        <div className="reader-actions">
          <button
            className="icon-button"
            aria-label="切换阅读字号"
            aria-pressed={readerSize === 'large'}
            onClick={() => setReaderSize(readerSize === 'large' ? 'regular' : 'large')}
          >
            <Type size={21} />
          </button>
          <button
            className="icon-button"
            aria-label="关闭阅读"
            onClick={() => close(position.current)}
          >
            <X size={21} />
          </button>
        </div>
      </header>
      <div
        ref={stage}
        className={`reader-stage ${turning ? 'is-turning' : ''} ${offset && !turning ? 'is-dragging' : ''}`}
        {...swipe.handlers}
      >
        <article
          key={index}
          ref={page}
          className={`reader-page ${note.type}`}
          tabIndex={-1}
          data-dialog-focus
          style={{
            transform: `translate3d(${offset}px, 0, 0) rotateY(${offset ? (offset / width) * -3 : 0}deg)`,
          }}
        >
          <span className={`type-badge ${note.type}`}>{categories[note.type].label}</span>
          <NoteContent note={note} full />
          <div className="reader-end" aria-hidden="true">
            ✳
          </div>
        </article>
        {direction !== 0 && (
          <div
            className={`reader-turn-preview ${preview?.type ?? note.type}`}
            aria-hidden="true"
            style={{ transform: `translate3d(${direction * width + offset}px, 0, 0)` }}
          >
            {preview ? (
              <>
                <span className={`type-badge ${preview.type}`}>
                  {categories[preview.type].label}
                </span>
                <NoteContent note={preview} full />
              </>
            ) : (
              <LoaderCircle className="spin" size={24} />
            )}
          </div>
        )}
        {loading && (
          <div className="reader-loading" role="status">
            <LoaderCircle className="spin" size={20} /> 正在翻页…
          </div>
        )}
      </div>
      {error && (
        <p className="reader-error" role="alert">
          {error}
        </p>
      )}
      <footer className="reader-footer">
        <button
          className="icon-button"
          aria-label="上一篇"
          disabled={index === 0 || turning || loading}
          onClick={() => void turn(-1)}
        >
          <ChevronLeft size={23} />
        </button>
        <div className="reader-position" aria-live="polite">
          <span>
            {index + 1} / {source.total}
          </span>
          <small>左右滑动翻页</small>
        </div>
        <button
          className="icon-button"
          aria-label="下一篇"
          disabled={index === source.total - 1 || turning || loading}
          onClick={() => void turn(1)}
        >
          <ChevronRight size={23} />
        </button>
      </footer>
    </Modal>
  );
}
