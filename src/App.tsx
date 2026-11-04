import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Code2,
  FileJson,
  Headphones,
  LayoutGrid,
  Library,
  List,
  LoaderCircle,
  Moon,
  Plus,
  Search,
  Sparkles,
  Sun,
  Type,
  Upload,
  X,
} from 'lucide-react';
import {
  categories,
  exampleImport,
  NOTE_TYPES,
  validateImport,
  ValidationError,
  type Category,
  type Counts,
  type Note,
  type NoteInput,
  type NotesResponse,
  type NoteType,
} from '../shared/notes';

const emptyCounts: Counts = { all: 0, word: 0, onomatopoeia: 0, grammar: 0 };
const icons = { word: Type, onomatopoeia: Headphones, grammar: BookOpen };
function savedPreference(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function usePreference(key: string, fallback: string) {
  const [value, setValue] = useState(() => savedPreference(key, fallback));
  const update = (next: string) => {
    setValue(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      /* Storage can be disabled. */
    }
  };
  return [value, update] as const;
}
async function responseBody<T>(response: Response): Promise<T> {
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new Error('服务暂时不可用，请稍后重试。');
  const body = (await response.json()) as { error?: string; issues?: string[] };
  if (!response.ok)
    throw new Error([body.error, ...(body.issues ?? [])].filter(Boolean).join('\n'));
  return body as T;
}

function Modal({
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
    dialog.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previous;
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

function BookCover({
  type,
  count,
  onClick,
  active,
}: {
  type: NoteType;
  count: number;
  onClick: () => void;
  active: boolean;
}) {
  const meta = categories[type];
  return (
    <button
      className={`collection ${type} ${active ? 'selected' : ''}`}
      onClick={onClick}
      aria-label={`查看${meta.label}，${count} 条笔记`}
      aria-pressed={active}
    >
      <div className="book-cover">
        <div className="book-spine" />
        <span className="cover-number">
          VOL. {String(NOTE_TYPES.indexOf(type) + 1).padStart(2, '0')}
        </span>
        <div className="cover-letter" lang="ja">
          {type === 'word' ? '言葉' : type === 'onomatopoeia' ? '音と形' : '文法'}
        </div>
        <span className="cover-english">{meta.english}</span>
        <div className="cover-art" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
        <span className="cover-footer">
          ことばのコレクション <span>日</span>
        </span>
      </div>
      <div className="collection-caption">
        <span>{meta.label}</span>
        <ArrowRight size={16} />
      </div>
      <span className="collection-count">{count} 条笔记</span>
    </button>
  );
}

function NoteContent({ note, full = false }: { note: Note; full?: boolean }) {
  return (
    <>
      <h3 className="note-term" lang="ja">
        {note.term}
      </h3>
      {note.type === 'word' && (
        <div className="pronunciation">
          <span lang="ja">{note.reading}</span>
          <span
            className="accent"
            title={`${note.accent} 调${note.accent === 0 ? ' · 平板型' : ''}`}
          >
            {note.accent}
          </span>
          <span className="part-of-speech">{note.partOfSpeech}</span>
        </div>
      )}
      <p className="note-meaning">{note.meaning}</p>
      {note.example && (
        <div className={`note-example ${full ? 'full' : ''}`}>
          <span className="example-label">例句</span>
          <p lang="ja">{note.example}</p>
          {full && note.exampleTranslation && (
            <p className="example-translation">{note.exampleTranslation}</p>
          )}
        </div>
      )}
    </>
  );
}

function Reader({ notes, initial, close }: { notes: Note[]; initial: number; close: () => void }) {
  const [index, setIndex] = useState(initial);
  const [large, setLarge] = useState(false);
  const note = notes[index];
  return (
    <Modal
      title="笔记阅读"
      close={close}
      className={`reader ${note.type} ${large ? 'large-text' : ''}`}
    >
      <header className="reader-toolbar">
        <button className="text-button" onClick={close}>
          <ArrowLeft size={17} /> 返回书库
        </button>
        <div className="reader-actions">
          <button
            className="icon-button"
            aria-label="切换阅读字号"
            aria-pressed={large}
            onClick={() => setLarge(!large)}
          >
            <Type size={20} />
          </button>
          <button className="icon-button" aria-label="关闭阅读" onClick={close}>
            <X size={20} />
          </button>
        </div>
      </header>
      <article className="reader-page">
        <span className={`type-badge ${note.type}`}>{categories[note.type].label}</span>
        <span className="reader-kicker">ことばのノート</span>
        <NoteContent note={note} full />
        <div className="reader-end" aria-hidden="true">
          ✳
        </div>
      </article>
      <footer className="reader-footer">
        <button
          className="icon-button"
          aria-label="上一篇"
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
        >
          <ChevronLeft size={21} />
        </button>
        <span>
          {index + 1} / {notes.length}
        </span>
        <button
          className="icon-button"
          aria-label="下一篇"
          disabled={index === notes.length - 1}
          onClick={() => setIndex(index + 1)}
        >
          <ChevronRight size={21} />
        </button>
      </footer>
    </Modal>
  );
}

function Importer({
  close,
  onImported,
}: {
  close: () => void;
  onImported: (message: string) => void;
}) {
  const [code, setCode] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const validation = useMemo((): { notes: NoteInput[]; error: string } => {
    if (!code.trim()) return { notes: [], error: '' };
    if (new TextEncoder().encode(code).byteLength > 1024 * 1024)
      return { notes: [], error: 'JSON 超过 1 MiB，请分批导入。' };
    try {
      return { notes: validateImport(JSON.parse(code)), error: '' };
    } catch (e) {
      return {
        notes: [],
        error:
          e instanceof ValidationError
            ? e.issues.join('\n')
            : 'JSON 无法解析，请检查双引号、逗号和括号。',
      };
    }
  }, [code]);
  async function loadFile(file?: File) {
    if (!file) return;
    setError('');
    if (file.size > 1024 * 1024) {
      setError('文件超过 1 MiB，请分批导入。');
      return;
    }
    try {
      setCode(await file.text());
      setResult(null);
    } catch {
      setError('无法读取文件，请重新选择。');
    }
  }
  async function upload() {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const response = await fetch('/api/notes/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.trim()}` },
        body: JSON.stringify({ notes: validation.notes }),
      });
      const body = await responseBody<{ inserted: number; skipped: number }>(response);
      setResult(body);
      onImported(
        `已新增 ${body.inserted} 条笔记${body.skipped ? `，跳过 ${body.skipped} 条重复笔记` : ''}。`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传失败，请稍后重试。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="批量导入笔记"
      close={() => {
        if (!busy) close();
      }}
      className="import-modal"
    >
      <header className="modal-header">
        <div className="modal-symbol">
          <ArrowDownToLine size={22} />
        </div>
        <button className="icon-button" aria-label="关闭导入" onClick={close} disabled={busy}>
          <X size={21} />
        </button>
      </header>
      <h2>把新发现，收进书库。</h2>
      <p className="modal-description">粘贴 JSON，一次收藏多条笔记。</p>
      <div className="import-tools">
        <label htmlFor="json-input">
          笔记内容 <span>JSON</span>
        </label>
        <div>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              setCode(JSON.stringify(exampleImport, null, 2));
              setError('');
              setResult(null);
            }}
          >
            填入示例
          </button>
          <button className="text-button" disabled={busy} onClick={() => fileRef.current?.click()}>
            <FileJson size={15} /> 选择文件
          </button>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="visually-hidden"
        disabled={busy}
        onChange={(event) => {
          void loadFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <textarea
        id="json-input"
        value={code}
        spellCheck={false}
        disabled={busy}
        placeholder={
          '{\n  "notes": [\n    {\n      "type": "word",\n      "term": "多彩",\n      "reading": "たさい",\n      "accent": 0,\n      "partOfSpeech": "形动",\n      "meaning": "丰富多彩"\n    }\n  ]\n}'
        }
        onChange={(event) => {
          setCode(event.target.value);
          setError('');
          setResult(null);
        }}
      />
      {validation.error && (
        <p className="validation-error" role="status">
          {validation.error}
        </p>
      )}
      {validation.notes.length > 0 && (
        <div className="import-preview">
          <div>
            <Check size={16} />
            <strong>{validation.notes.length} 条笔记通过检查</strong>
          </div>
          <p>
            {NOTE_TYPES.map(
              (type) =>
                `${categories[type].label} ${validation.notes.filter((note) => note.type === type).length}`,
            ).join(' · ')}
          </p>
          <div className="preview-terms">
            {validation.notes.slice(0, 5).map((note, i) => (
              <span key={i} lang="ja">
                {note.term}
              </span>
            ))}
            {validation.notes.length > 5 && <span>+{validation.notes.length - 5}</span>}
          </div>
        </div>
      )}
      <label className="token-label" htmlFor="import-token">
        导入密钥
      </label>
      <input
        id="import-token"
        type="password"
        value={token}
        disabled={busy}
        autoComplete="off"
        placeholder="输入你在 Cloudflare 设置的密钥"
        onChange={(event) => setToken(event.target.value)}
      />
      <p className="import-hint">
        <CircleHelp size={14} /> 每批最多 500 条、1 MiB；完全相同的笔记会自动跳过。
      </p>
      {error && (
        <p className="validation-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="import-success" role="status">
          <Check size={19} />
          <span>
            导入完成，新增 {result.inserted} 条，跳过 {result.skipped} 条重复笔记。
          </span>
        </div>
      )}
      <footer className="import-footer">
        <a
          className="text-button"
          href="https://github.com/jiojioinjapan-png/Japanese-notes#json-导入格式"
          target="_blank"
          rel="noreferrer"
        >
          <Code2 size={16} /> JSON 格式说明
        </a>
        <button
          className="primary-button"
          disabled={busy || !validation.notes.length || !token.trim() || !!result}
          onClick={() => void upload()}
        >
          {busy ? <LoaderCircle className="spin" size={17} /> : <Upload size={17} />}
          {busy ? '正在上传…' : '上传笔记'}
        </button>
      </footer>
    </Modal>
  );
}

export default function App() {
  const [category, setCategory] = useState<Category>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(1);
  const [view, setView] = usePreference('kotoba-view', 'grid');
  const [theme, setTheme] = usePreference('kotoba-theme', 'light');
  const [data, setData] = useState<NotesResponse>({
    notes: [],
    total: 0,
    page: 1,
    pageSize: 24,
    counts: emptyCounts,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [reader, setReader] = useState<{ notes: Note[]; index: number } | null>(null);
  const [toast, setToast] = useState('');
  const notesRef = useRef<HTMLElement>(null);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
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
    const params = new URLSearchParams({ category, q: query, sort, page: String(page) });
    fetch(`/api/notes?${params}`, { signal: controller.signal })
      .then((response) => responseBody<NotesResponse>(response))
      .then((body) => {
        setData(body);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [category, query, sort, page, refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  const selectCategory = useCallback((next: Category, scroll = false) => {
    setCategory(next);
    setPage(1);
    if (scroll) notesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  const date = new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());
  const pageCount = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <div className="app-shell">
      <a href="#notes" className="skip-link">
        跳到笔记
      </a>
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="ことば日语笔记首页">
          <span className="brand-icon">
            <BookOpen size={23} strokeWidth={1.6} />
          </span>
          <span>
            <strong lang="ja">ことば</strong>
            <small>日语笔记</small>
          </span>
        </a>
        <div className="sidebar-label">我的空间</div>
        <nav aria-label="笔记分类">
          <button
            className={`nav-item ${category === 'all' ? 'active' : ''}`}
            onClick={() => selectCategory('all')}
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
                onClick={() => selectCategory(type)}
              >
                <Icon size={19} />
                <span>{categories[type].label}</span>
                <small>{data.counts[type]}</small>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-note">
          <span className="tiny-flower">✳</span>
          <p lang="ja">一日、ひとこと。</p>
          <span>每天一点，慢慢积累。</span>
          <div className="note-rule" />
        </div>
        <div className="sidebar-bottom">
          <span>我的日语小书架</span>
          <button
            className="icon-button"
            aria-label={theme === 'light' ? '切换深色模式' : '切换浅色模式'}
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <Library size={17} />
            <span>书库</span>
            <ChevronRight size={13} />
            <strong>{category === 'all' ? '全部笔记' : categories[category].label}</strong>
          </div>
          <div className="topbar-actions">
            <span className="topbar-date">{date}</span>
            <button className="primary-button" onClick={() => setImportOpen(true)}>
              <Plus size={17} /> 导入笔记
            </button>
          </div>
        </header>
        <main className="main-content">
          <section className="intro">
            <div>
              <p className="eyebrow">A LITTLE JAPANESE, EVERY DAY</p>
              <h1>
                我的书库<span>。</span>
              </h1>
              <p className="intro-description">收藏每一次相遇，让日语慢慢成为日常。</p>
            </div>
            <div className="intro-seal" aria-hidden="true">
              <span lang="ja">
                日々の
                <br />
                ことば
              </span>
              <span>WORDS TO KEEP</span>
            </div>
          </section>
          <section className="collection-section" aria-labelledby="collections-title">
            <div className="section-heading">
              <h2 id="collections-title">
                笔记集 <span>COLLECTIONS</span>
              </h2>
              <span className="muted">三个角度，一点一滴。</span>
            </div>
            <div className="collections-grid">
              {NOTE_TYPES.map((type) => (
                <BookCover
                  key={type}
                  type={type}
                  count={data.counts[type]}
                  active={category === type}
                  onClick={() => selectCategory(type, true)}
                />
              ))}
            </div>
          </section>
          <section
            id="notes"
            ref={notesRef}
            className="notes-section"
            aria-labelledby="notes-title"
          >
            <div className="notes-heading">
              <div>
                <h2 id="notes-title">
                  {query
                    ? '搜索结果'
                    : category === 'all'
                      ? '所有笔记'
                      : categories[category].label}
                  <span className="count-pill">{data.total}</span>
                </h2>
                <p>
                  {query
                    ? `与「${query}」有关的收藏`
                    : category === 'all'
                      ? '翻开一页，遇见新的表达。'
                      : categories[category].description}
                </p>
              </div>
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
            </div>
            <div className="filter-toolbar">
              <div className="search-box">
                <Search size={17} />
                <input
                  aria-label="搜索笔记"
                  type="search"
                  placeholder="搜索单词、释义或例句…"
                  value={search}
                  maxLength={200}
                  onChange={(event) => setSearch(event.target.value)}
                />
                {search && (
                  <button
                    className="clear-search"
                    aria-label="清空搜索"
                    onClick={() => setSearch('')}
                  >
                    <X size={15} />
                  </button>
                )}
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
              <div className="notes-grid" role="status" aria-label="正在加载笔记">
                {[0, 1, 2].map((i) => (
                  <div className="skeleton" key={i}>
                    <i />
                    <i />
                    <i />
                  </div>
                ))}
              </div>
            ) : data.notes.length ? (
              <div className={`notes-grid ${view === 'list' ? 'list-view' : ''}`}>
                {data.notes.map((note, index) => (
                  <button
                    key={note.id}
                    className={`note-card ${note.type}`}
                    onClick={() => setReader({ notes: data.notes, index })}
                    aria-label={`阅读：${note.term}`}
                  >
                    <div className="note-card-top">
                      <span className={`type-badge ${note.type}`}>
                        {categories[note.type].label}
                      </span>
                      <ArrowRight size={16} />
                    </div>
                    <NoteContent note={note} />
                    <div className="note-card-footer">
                      <span>打开笔记</span>
                      <span aria-hidden="true">↗</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <Search size={30} />
                <h3>{query ? '还没有遇见这个表达' : '你的下一页，从这里开始'}</h3>
                <p>
                  {query
                    ? '换一个词，或清空搜索再看看。'
                    : '导入一些笔记，把新学到的日语收藏起来。'}
                </p>
                <button
                  className="secondary-button"
                  onClick={() => {
                    if (query) setSearch('');
                    else setImportOpen(true);
                  }}
                >
                  {query ? '清空搜索' : '导入第一批笔记'}
                </button>
              </div>
            )}
            {!error && !loading && data.total > 0 && (
              <div className="pagination">
                <span>
                  第 {(page - 1) * data.pageSize + 1}–{Math.min(page * data.pageSize, data.total)}{' '}
                  条，共 {data.total} 条
                </span>
                {pageCount > 1 && (
                  <div>
                    <button
                      className="icon-button"
                      aria-label="上一页"
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <span>
                      {page} / {pageCount}
                    </span>
                    <button
                      className="icon-button"
                      aria-label="下一页"
                      disabled={page === pageCount}
                      onClick={() => setPage(page + 1)}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
          <footer className="page-footer">
            <span>
              <BookOpen size={15} /> ことば <i>·</i> 日语笔记
            </span>
            <span>积累的每一页，都算数。</span>
            <Sparkles size={16} />
          </footer>
        </main>
      </div>
      {importOpen && (
        <Importer
          close={() => setImportOpen(false)}
          onImported={(message) => {
            setToast(message);
            setSearch('');
            setQuery('');
            setCategory('all');
            setPage(1);
            setRefresh((value) => value + 1);
          }}
        />
      )}
      {reader && (
        <Reader notes={reader.notes} initial={reader.index} close={() => setReader(null)} />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          <span>{toast}</span>
          <button aria-label="关闭提示" onClick={() => setToast('')}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
