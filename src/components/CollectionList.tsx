import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, ChevronRight, LoaderCircle, Minus, Plus, Type } from 'lucide-react';
import { categories, type Note, type NoteType, type NotesResponse } from '../../shared/notes';
import { responseBody } from '../api';
import { usePreference } from '../preferences';
import Modal from './Modal';
import Reader from './Reader';

const pageSize = 100;
type OpenReader = { note: Note; index: number; historyKey: string };

export default function CollectionList({
  category,
  sort,
  initialCount,
  historyKey,
  onUpdated,
  close,
}: {
  category: NoteType;
  sort: string;
  initialCount: number;
  historyKey: string;
  onUpdated?: (note: Note) => void;
  close: () => void;
}) {
  const [savedSize, setSavedSize] = usePreference('kotoba-list-size', '1');
  const listSize = Math.max(0, Math.min(3, Number(savedSize) || 0));
  const [sizeOpen, setSizeOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [total, setTotal] = useState(initialCount);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reader, setReader] = useState<OpenReader | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLDivElement>(null);
  const fetching = useRef(true);
  const dirty = useRef(false);
  const refreshAll = useRef(false);
  const closeRef = useRef(close);
  closeRef.current = close;
  const label = categories[category].label;
  const hasMore = notes.length < total;

  useEffect(() => {
    const back = () => {
      if (history.state?.kotobaCollection !== historyKey) closeRef.current();
    };
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, [historyKey]);

  useEffect(() => {
    const controller = new AbortController();
    fetching.current = true;
    setLoading(true);
    setError('');
    const replacing = refreshAll.current;
    refreshAll.current = false;
    const oldScroll = scroll.current?.scrollTop ?? 0;
    async function read() {
      const results: NotesResponse[] = [];
      const pages = replacing ? Array.from({ length: page }, (_, i) => i + 1) : [page];
      for (const current of pages) {
        const params = new URLSearchParams({
          category,
          sort,
          page: String(current),
          pageSize: String(pageSize),
        });
        results.push(
          await fetch(`/api/notes?${params}`, { signal: controller.signal }).then(
            responseBody<NotesResponse>,
          ),
        );
      }
      if (controller.signal.aborted) return;
      const incoming = results.flatMap((result) => result.notes);
      setNotes((previous) => (replacing || page === 1 ? incoming : [...previous, ...incoming]));
      setTotal(results[0].total);
      if (replacing)
        requestAnimationFrame(() =>
          scroll.current?.scrollTo({ top: oldScroll, behavior: 'instant' }),
        );
      fetching.current = false;
      setLoading(false);
    }
    void read().catch((cause: Error) => {
      if (controller.signal.aborted) return;
      if (replacing) refreshAll.current = true;
      fetching.current = false;
      setLoading(false);
      setError(cause.message);
    });
    return () => controller.abort();
  }, [category, sort, page, reload]);

  useEffect(() => {
    const sentinel = more.current;
    if (!sentinel || loading || error || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !fetching.current) {
          fetching.current = true;
          setPage((previous) => previous + 1);
        }
      },
      { root: scroll.current, rootMargin: '300px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, error, hasMore, notes.length]);

  function openReader(note: Note, index: number) {
    const key = crypto.randomUUID();
    history.pushState({ ...history.state, kotobaReader: key }, '');
    setReader({ note, index, historyKey: key });
  }
  function closeReader() {
    const key = reader?.historyKey;
    setReader(null);
    if (dirty.current) {
      dirty.current = false;
      refreshAll.current = true;
      setReload((previous) => previous + 1);
    }
    if (key && history.state?.kotobaReader === key) history.back();
  }

  return (
    <>
      <Modal
        title={`${label}预览列表`}
        close={close}
        className={`collection-list list-size-${listSize}`}
      >
        <header className="collection-list-header">
          <button className="text-button" onClick={close}>
            <ArrowLeft size={18} /> 返回书库
          </button>
          <div className="collection-list-actions">
            <span className={`type-badge ${category}`}>{categories[category].english}</span>
            <button
              className="icon-button"
              aria-label="调整列表字号"
              aria-expanded={sizeOpen}
              onClick={() => setSizeOpen(!sizeOpen)}
            >
              <Type size={21} />
            </button>
          </div>
        </header>
        {sizeOpen && (
          <div className="list-size-controls" aria-label="列表字号设置">
            <span>列表字号</span>
            <button
              className="icon-button"
              aria-label="缩小列表字号"
              disabled={listSize === 0}
              onClick={() => setSavedSize(String(listSize - 1))}
            >
              <Minus size={18} />
            </button>
            <span aria-live="polite">{['小', '标准', '大', '特大'][listSize]}</span>
            <button
              className="icon-button"
              aria-label="放大列表字号"
              disabled={listSize === 3}
              onClick={() => setSavedSize(String(listSize + 1))}
            >
              <Plus size={18} />
            </button>
          </div>
        )}
        <div className="collection-list-title">
          <h1 tabIndex={-1} data-dialog-focus>
            {label}
          </h1>
          <span>{total} 条笔记</span>
        </div>
        <div className="collection-list-columns" aria-hidden="true">
          <span>词条</span>
          <span>释义</span>
          <span />
        </div>
        <div
          className="collection-list-scroll"
          ref={scroll}
          tabIndex={0}
          aria-label={`${label}词条列表`}
        >
          <ul className="collection-list-rows" aria-label={`${label}笔记`}>
            {notes.map((note, index) => (
              <li key={note.id}>
                <button
                  className="collection-row"
                  aria-label={`阅读：${note.term}`}
                  aria-describedby={note.meaning ? `preview-meaning-${note.id}` : undefined}
                  onClick={() => openReader(note, index)}
                >
                  <span className="collection-row-term" lang="ja">
                    {note.term}
                  </span>
                  {note.meaning && (
                    <span className="collection-row-meaning" id={`preview-meaning-${note.id}`}>
                      {note.meaning}
                    </span>
                  )}
                  <ChevronRight size={17} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          {loading && (
            <div className="collection-list-status" role="status">
              <LoaderCircle size={21} className="spin" /> 正在读取词条…
            </div>
          )}
          {error && (
            <div className="collection-list-status collection-list-error" role="alert">
              <p>{error}</p>
              <button
                className="secondary-button"
                onClick={() => setReload((previous) => previous + 1)}
              >
                重新加载
              </button>
            </div>
          )}
          {!loading && !error && notes.length === 0 && (
            <div className="collection-list-empty">
              <BookOpen size={30} />
              <h2>这本笔记还没有内容</h2>
              <p>返回书库，导入你遇见的日语。</p>
            </div>
          )}
          <div ref={more} className="collection-list-more">
            {!loading && !error && hasMore && (
              <button
                className="text-button"
                onClick={() => {
                  if (!fetching.current) {
                    fetching.current = true;
                    setPage((previous) => previous + 1);
                  }
                }}
              >
                加载更多词条
              </button>
            )}
            {!loading && !error && notes.length > 0 && !hasMore && <span>共 {total} 条笔记</span>}
          </div>
        </div>
      </Modal>
      {reader && (
        <Reader
          initialNote={reader.note}
          initialIndex={reader.index}
          source={{ category, query: '', sort, total }}
          historyKey={reader.historyKey}
          returnLabel="返回预览列表"
          close={closeReader}
          onUpdated={(note) => {
            dirty.current = true;
            setNotes((previous) => previous.map((item) => (item.id === note.id ? note : item)));
            onUpdated?.(note);
          }}
        />
      )}
    </>
  );
}
