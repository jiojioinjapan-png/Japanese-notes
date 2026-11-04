import { flushSync } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Headphones,
  LayoutGrid,
  Library,
  List,
  LoaderCircle,
  LogOut,
  Moon,
  Plus,
  Search,
  Sun,
  Type,
  X,
} from 'lucide-react';
import {
  categories,
  NOTE_TYPES,
  type Category,
  type Note,
  type NotesResponse,
  type NoteType,
} from '../shared/notes';
import { responseBody } from './api';
import { usePreference, useTheme } from './preferences';
import { useShelfLayout } from './useShelfLayout';
import { useSwipe } from './useSwipe';
import BookCover from './components/BookCover';
import CollectionList from './components/CollectionList';
import Importer from './components/Importer';
import NoteContent from './components/NoteContent';
import Reader, { type ReaderSource } from './components/Reader';

type OpenReader = { note: Note; index: number; source: ReaderSource; historyKey: string };
const icons = { word: Type, onomatopoeia: Headphones, grammar: BookOpen };
export default function App({
  username,
  onLogout,
  logoutBusy,
}: {
  username: string;
  onLogout: () => Promise<void>;
  logoutBusy: boolean;
}) {
  const [category, setCategory] = useState<Category>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(1);
  const [view, setView] = usePreference('kotoba-view', 'grid');
  const [theme, setTheme] = useTheme();
  const [tab, setTab] = useState<'library' | 'search'>('library');
  const [data, setData] = useState<NotesResponse>({
    notes: [],
    total: 0,
    page: 1,
    pageSize: 1,
    counts: { all: 0, word: 0, onomatopoeia: 0, grammar: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [reader, setReader] = useState<OpenReader | null>(null);
  const [collection, setCollection] = useState<{ category: NoteType; historyKey: string } | null>(
    null,
  );
  const [toast, setToast] = useState('');
  const [pageDirection, setPageDirection] = useState<-1 | 1>(1);
  const searchRef = useRef<HTMLInputElement>(null);
  const shelf = useShelfLayout();
  const oldPageSize = useRef(shelf.pageSize);
  useEffect(() => {
    const previous = oldPageSize.current;
    oldPageSize.current = shelf.pageSize;
    if (previous !== shelf.pageSize)
      setPage((current) => Math.floor(((current - 1) * previous) / shelf.pageSize) + 1);
  }, [shelf.pageSize]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const params = new URLSearchParams({
      category,
      q: query,
      sort,
      page: String(page),
      pageSize: String(shelf.pageSize),
    });
    fetch(`/api/notes?${params}`, { signal: controller.signal })
      .then(responseBody<NotesResponse>)
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((cause: Error) => {
        if (cause.name !== 'AbortError') {
          setError(cause.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [category, query, sort, page, shelf.pageSize, refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (history.state?.kotobaReader || history.state?.kotobaCollection)
      history.replaceState(null, '');
    return () => {
      if (history.state?.kotobaReader || history.state?.kotobaCollection)
        history.replaceState(null, '');
    };
  }, []);
  const pageCount = Math.max(1, Math.ceil(data.total / shelf.pageSize));
  const selectCategory = (next: Category) => {
    setCategory(next);
    setPage(1);
  };
  function showLibrary() {
    setTab('library');
    selectCategory('all');
    setSearch('');
    setQuery('');
  }
  function showSearch() {
    flushSync(() => {
      setTab('search');
      setPage(1);
    });
    searchRef.current?.focus({ preventScroll: true });
  }
  async function logout() {
    try {
      await onLogout();
    } catch {
      setToast('退出失败，请检查网络后重试。');
    }
  }
  function turnShelf(direction: -1 | 1) {
    if (loading) return;
    setPageDirection(direction);
    setPage((current) => Math.max(1, Math.min(pageCount, current + direction)));
  }
  const swipe = useSwipe({
    disabled: loading || !!reader || !!collection || importOpen,
    canPrevious: page > 1,
    canNext: page < pageCount,
    onTurn: turnShelf,
  });
  function openReader(note: Note, index: number) {
    if (swipe.suppressClick()) return;
    const historyKey = crypto.randomUUID();
    if (history.state?.kotobaReader || history.state?.kotobaCollection)
      history.replaceState(null, '');
    history.pushState({ kotobaReader: historyKey }, '');
    setReader({
      note,
      index: (data.page - 1) * data.pageSize + index,
      source: { category, query, sort, total: data.total },
      historyKey,
    });
  }
  function closeReader(position: number) {
    const key = reader?.historyKey;
    setPage(Math.floor(position / shelf.pageSize) + 1);
    setReader(null);
    if (history.state?.kotobaReader === key) history.back();
  }
  function openCollection(type: NoteType) {
    const historyKey = crypto.randomUUID();
    history.pushState({ kotobaCollection: historyKey }, '');
    setCollection({ category: type, historyKey });
  }
  function closeCollection() {
    const key = collection?.historyKey;
    setCollection(null);
    if (key && history.state?.kotobaCollection === key) history.back();
  }
  const rows = Math.max(1, Math.min(shelf.rows, Math.ceil(data.notes.length / shelf.columns)));
  return (
    <div
      className={`app-shell ${tab === 'search' ? 'mobile-search-mode' : ''} ${category !== 'all' ? 'filtered-library' : ''}`}
    >
      <aside className="sidebar">
        <button className="brand" onClick={showLibrary}>
          <span className="brand-icon">
            <img src="/icons/icon-192.png" width="41" height="43" alt="" />
          </span>
          <span>
            <strong lang="ja">ことば</strong>
            <small>日语笔记</small>
          </span>
        </button>
        <div className="sidebar-label">我的空间</div>
        <nav aria-label="笔记分类">
          <button
            className={`nav-item ${category === 'all' ? 'active' : ''}`}
            onClick={() => {
              setTab('library');
              selectCategory('all');
            }}
          >
            <Library size={19} />
            <span>全部笔记</span>
            <small>{data.counts.all}</small>
          </button>
          <div className="nav-divider" />
          {NOTE_TYPES.map((type) => {
            const Icon = icons[type];
            return (
              <button
                key={type}
                className={`nav-item ${category === type ? 'active' : ''}`}
                onClick={() => {
                  setTab('library');
                  selectCategory(type);
                }}
              >
                <Icon size={19} />
                <span>{categories[type].label}</span>
                <small>{data.counts[type]}</small>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-note">
          <span>✳</span>
          <p lang="ja">一日、ひとこと。</p>
          <small>每天一点，慢慢积累。</small>
        </div>
        <div className="sidebar-bottom">
          <span className="signed-in-user" title={username}>
            {username}
          </span>
          <button
            className="icon-button"
            aria-label={theme === 'light' ? '切换深色模式' : '切换浅色模式'}
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          >
            {theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="app-header">
          <button className="mobile-brand" aria-label="返回书库首页" onClick={showLibrary}>
            <img src="/icons/icon-192.png" width="34" height="36" alt="" />
            <span lang="ja">
              ことば<small>日语笔记</small>
            </span>
          </button>
          <div className="breadcrumb">
            <Library size={18} />
            <span>书库</span>
            <ChevronRight size={14} />
            <strong>{category === 'all' ? '全部笔记' : categories[category].label}</strong>
          </div>
          <div className="header-actions">
            <button className="icon-button header-search" aria-label="搜索" onClick={showSearch}>
              <Search size={21} />
            </button>
            <button className="primary-button desktop-import" onClick={() => setImportOpen(true)}>
              <Plus size={17} /> 导入笔记
            </button>
            <button
              className="icon-button mobile-theme"
              aria-label={theme === 'light' ? '切换深色模式' : '切换浅色模式'}
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            >
              {theme === 'light' ? <Moon size={21} /> : <Sun size={21} />}
            </button>
            <button
              className="icon-button"
              aria-label="退出登录"
              disabled={logoutBusy}
              onClick={() => void logout()}
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>
        <main className="main-content">
          <section className="intro">
            <div>
              <p className="eyebrow">A LITTLE JAPANESE, EVERY DAY</p>
              <h1>
                {tab === 'search' ? '搜索' : '我的书库'}
                <span>。</span>
              </h1>
              <p className="intro-description">
                {tab === 'search'
                  ? '在收藏里，找回那个表达。'
                  : '收藏每一次相遇，让日语慢慢成为日常。'}
              </p>
            </div>
            <span className="intro-mark" lang="ja" aria-hidden="true">
              日々の
              <br />
              ことば
            </span>
          </section>
          <section className="collection-section" aria-label="笔记集">
            <div className="collections-grid">
              {NOTE_TYPES.map((type) => (
                <BookCover
                  key={type}
                  type={type}
                  count={data.counts[type]}
                  active={collection?.category === type}
                  onClick={() => openCollection(type)}
                />
              ))}
            </div>
          </section>
          <section className="notes-section" aria-labelledby="notes-title">
            <div className="notes-heading">
              <h2 id="notes-title">
                {query ? '搜索结果' : category === 'all' ? '所有笔记' : categories[category].label}
                <span className="count-pill">{data.total}</span>
              </h2>
              <div className="view-switch" aria-label="笔记显示方式">
                <button
                  aria-label="卡片视图"
                  aria-pressed={view === 'grid'}
                  className={view === 'grid' ? 'active' : ''}
                  onClick={() => setView('grid')}
                >
                  <LayoutGrid size={17} />
                </button>
                <button
                  aria-label="列表视图"
                  aria-pressed={view === 'list'}
                  className={view === 'list' ? 'active' : ''}
                  onClick={() => setView('list')}
                >
                  <List size={19} />
                </button>
              </div>
              <label className="sort-select">
                <span className="visually-hidden">排序方式</span>
                <select
                  value={sort}
                  onChange={(event) => {
                    setSort(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="recent">最近添加</option>
                  <option value="oldest">最早添加</option>
                  <option value="term">按词条排序</option>
                </select>
              </label>
            </div>
            <div className="search-box">
              <Search size={18} />
              <input
                ref={searchRef}
                aria-label="搜索笔记"
                type="search"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
                enterKeyHint="search"
                autoComplete="off"
                autoCapitalize="none"
                placeholder="搜索词条、释义…"
                maxLength={200}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {search && (
                <button
                  className="clear-search icon-button"
                  aria-label="清空搜索"
                  onClick={() => setSearch('')}
                >
                  <X size={17} />
                </button>
              )}
            </div>
            <div className="category-tabs" aria-label="筛选笔记">
              <button
                className={category === 'all' ? 'active' : ''}
                aria-pressed={category === 'all'}
                onClick={() => selectCategory('all')}
              >
                全部
              </button>
              {NOTE_TYPES.map((type) => (
                <button
                  key={type}
                  className={category === type ? 'active' : ''}
                  aria-pressed={category === type}
                  onClick={() => selectCategory(type)}
                >
                  {categories[type].label}
                </button>
              ))}
            </div>
            <div
              ref={shelf.ref}
              className={`shelf-viewport ${view === 'list' ? 'list-mode' : ''}`}
              {...swipe.handlers}
            >
              {error ? (
                <div className="empty-state" role="alert">
                  <BookOpen size={30} />
                  <h3>书库暂时没有打开</h3>
                  <p>{error}</p>
                  <button className="secondary-button" onClick={() => setRefresh(refresh + 1)}>
                    重新加载
                  </button>
                </div>
              ) : loading ? (
                <div className="shelf-loading" role="status" aria-label="正在加载笔记">
                  <LoaderCircle className="spin" size={26} />
                </div>
              ) : data.notes.length ? (
                <div
                  key={`${data.page}-${category}-${query}-${view}`}
                  className={`notes-grid ${view === 'list' ? 'list-view' : ''} ${pageDirection === -1 ? 'page-backward' : 'page-forward'}`}
                  style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
                >
                  {data.notes.map((note, index) => (
                    <button
                      key={note.id}
                      className={`note-card ${note.type}`}
                      onClick={() => openReader(note, index)}
                      aria-label={`阅读：${note.term}`}
                    >
                      <div className="note-card-top">
                        <span className={`type-badge ${note.type}`}>
                          {categories[note.type].label}
                        </span>
                        <ArrowRight size={16} />
                      </div>
                      <div className="note-card-content">
                        <NoteContent note={note} />
                      </div>
                      <div className="note-card-footer">
                        <span>打开笔记</span>
                        <span aria-hidden="true">↗</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <Search size={28} />
                  <h3>{query ? '还没有遇见这个表达' : '你的下一页，从这里开始'}</h3>
                  <p>
                    {query
                      ? '换一个词，或清空搜索再看看。'
                      : '导入一些笔记，把新学到的日语收藏起来。'}
                  </p>
                  <button
                    className="secondary-button"
                    onClick={() => (query ? setSearch('') : setImportOpen(true))}
                  >
                    {query ? '清空搜索' : '导入第一批笔记'}
                  </button>
                </div>
              )}
            </div>
            <div className="pagination">
              <button
                className="icon-button"
                aria-label="上一页"
                disabled={page === 1 || loading}
                onClick={() => turnShelf(-1)}
              >
                <ChevronLeft size={21} />
              </button>
              <div aria-live="polite">
                <span>
                  {page} / {pageCount}
                </span>
                <small>
                  {data.total
                    ? `第 ${(page - 1) * shelf.pageSize + 1}–${Math.min(page * shelf.pageSize, data.total)} 条 · 共 ${data.total} 条`
                    : '等待新的一页'}
                </small>
              </div>
              <button
                className="icon-button"
                aria-label="下一页"
                disabled={page >= pageCount || loading}
                onClick={() => turnShelf(1)}
              >
                <ChevronRight size={21} />
              </button>
            </div>
          </section>
        </main>
      </div>
      <nav className="mobile-tabbar" aria-label="主导航">
        <button
          aria-label="书库"
          aria-current={tab === 'library' && !importOpen ? 'page' : undefined}
          onClick={showLibrary}
        >
          <Library size={23} />
          <span>书库</span>
        </button>
        <button
          aria-label="搜索"
          aria-current={tab === 'search' && !importOpen ? 'page' : undefined}
          onClick={showSearch}
        >
          <Search size={23} />
          <span>搜索</span>
        </button>
        <button
          aria-label="导入笔记"
          aria-haspopup="dialog"
          aria-expanded={importOpen}
          onClick={() => setImportOpen(true)}
        >
          <Plus size={24} />
          <span>导入</span>
        </button>
      </nav>
      {collection && (
        <CollectionList
          category={collection.category}
          sort={sort}
          initialCount={data.counts[collection.category]}
          historyKey={collection.historyKey}
          close={closeCollection}
        />
      )}
      {reader && (
        <Reader
          initialNote={reader.note}
          initialIndex={reader.index}
          source={reader.source}
          historyKey={reader.historyKey}
          close={closeReader}
        />
      )}
      {importOpen && (
        <Importer
          close={() => setImportOpen(false)}
          onImported={(message) => {
            setToast(message);
            showLibrary();
            setRefresh((value) => value + 1);
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          <span>{toast}</span>
          <button className="icon-button" aria-label="关闭提示" onClick={() => setToast('')}>
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}
