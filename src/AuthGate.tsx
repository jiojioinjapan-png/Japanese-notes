import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Moon, Sun } from 'lucide-react';
import App from './App';
import { responseBody } from './api';
import { useTheme } from './preferences';

type Session = { authenticated: boolean; username?: string };

function Login({
  onLogin,
  notice,
  unavailable,
  retry,
}: {
  onLogin: (username: string) => void;
  notice: string;
  unavailable: string;
  retry: () => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [theme, setTheme] = useTheme();
  const passwordRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const session = await responseBody<Session>(response);
      if (!session.authenticated || !session.username)
        throw new Error('暂时无法登录，请稍后重试。');
      setPassword('');
      onLogin(session.username);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '暂时无法登录，请稍后重试。');
      setPassword('');
      passwordRef.current?.focus({ preventScroll: true });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-screen">
      <header className="auth-header">
        <a className="auth-brand" href="/" aria-label="ことば日语笔记首页">
          <img src="/icons/icon-192.png" width="40" height="40" alt="" />
          <span lang="ja">
            ことば<small>日语笔记</small>
          </span>
        </a>
        <button
          className="icon-button"
          aria-label={theme === 'light' ? '切换深色模式' : '切换浅色模式'}
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        >
          {theme === 'light' ? <Moon size={21} /> : <Sun size={21} />}
        </button>
      </header>
      <main className="auth-main">
        <section className="auth-intro">
          <p className="eyebrow">A LITTLE JAPANESE, EVERY DAY</p>
          <h1>
            每一页，
            <br />
            都是你的积累<span>。</span>
          </h1>
          <p>
            把遇见的词、听见的声音，
            <br className="auth-desktop-break" />
            和读懂的表达，好好收藏。
          </p>
          <div className="auth-books" aria-hidden="true">
            <div className="auth-book word">
              <span>言葉</span>
              <small>WORDS</small>
            </div>
            <div className="auth-book onomatopoeia">
              <span>音と形</span>
              <small>EXPRESSIONS</small>
            </div>
            <div className="auth-book grammar">
              <span>文法</span>
              <small>GRAMMAR</small>
            </div>
          </div>
          <span className="auth-intro-caption" lang="ja">
            一日、ひとこと。
          </span>
        </section>
        <section className="login-card" aria-labelledby="login-title">
          <span className="login-symbol">
            <LockKeyhole size={22} strokeWidth={1.5} />
          </span>
          <h2 id="login-title">欢迎回到书库</h2>
          <p className="login-description">登录，继续翻开属于你的那一页。</p>
          <form onSubmit={(event) => void submit(event)} aria-label="账号密码登录" aria-busy={busy}>
            <label htmlFor="login-username">账号</label>
            <input
              id="login-username"
              name="username"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                setError('');
              }}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              placeholder="输入账号"
              required
              maxLength={128}
              readOnly={busy}
            />
            <label htmlFor="login-password">密码</label>
            <div className="login-password">
              <input
                ref={passwordRef}
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError('');
                }}
                autoComplete="current-password"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="go"
                placeholder="输入密码"
                required
                maxLength={1024}
                readOnly={busy}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
            {(error || unavailable) && (
              <p className="login-error" role="alert">
                {error || unavailable}
              </p>
            )}
            {!error && !unavailable && notice && (
              <p className="login-notice" role="status">
                {notice}
              </p>
            )}
            <button
              className="primary-button login-submit"
              type="submit"
              disabled={busy || !!unavailable}
            >
              {busy ? <LoaderCircle className="spin" size={19} /> : null}
              <span>{busy ? '正在打开书库…' : '登录书库'}</span>
              {!busy && <ArrowRight size={18} />}
            </button>
            {unavailable && (
              <button className="text-button login-retry" type="button" onClick={retry}>
                重新连接
              </button>
            )}
          </form>
          <p className="login-footnote">
            <LockKeyhole size={13} /> 你的收藏，登录后可见。
          </p>
        </section>
      </main>
      <footer className="auth-footer">
        <span lang="ja">ことばのある日々。</span>
        <span>每天一点，慢慢积累。</span>
      </footer>
    </div>
  );
}

export default function AuthGate() {
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState('');
  const [notice, setNotice] = useState('');
  const [logoutBusy, setLogoutBusy] = useState(false);
  const sessionVersion = useRef(0);
  const checkSession = useCallback(async (signal?: AbortSignal, silent = false) => {
    const version = ++sessionVersion.current;
    try {
      const session = await responseBody<Session>(
        await fetch('/api/auth/session', { signal, cache: 'no-store' }),
      );
      if (version !== sessionVersion.current) return;
      setUsername(session.authenticated && session.username ? session.username : null);
      setUnavailable('');
    } catch (cause) {
      if ((cause as Error).name === 'AbortError' || version !== sessionVersion.current) return;
      if (!silent)
        setUnavailable(cause instanceof Error ? cause.message : '暂时无法连接书库，请稍后重试。');
    } finally {
      if (!signal?.aborted && version === sessionVersion.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void checkSession(controller.signal);
    const expired = () => {
      sessionVersion.current++;
      setUsername(null);
      setNotice('登录已过期，请重新登录。');
    };
    const resume = () => {
      if (document.visibilityState === 'visible') void checkSession(undefined, true);
    };
    const pageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void checkSession(undefined, true);
    };
    window.addEventListener('kotoba:auth-required', expired);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('pageshow', pageShow);
    return () => {
      controller.abort();
      window.removeEventListener('kotoba:auth-required', expired);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('pageshow', pageShow);
    };
  }, [checkSession]);
  async function logout() {
    sessionVersion.current++;
    setLogoutBusy(true);
    try {
      await responseBody(await fetch('/api/auth/logout', { method: 'POST' }));
      sessionVersion.current++;
      setUsername(null);
      setNotice('已退出登录。');
      setUnavailable('');
    } finally {
      setLogoutBusy(false);
    }
  }
  if (loading)
    return (
      <main className="auth-loading" aria-label="正在打开书库" role="status">
        <img src="/icons/icon-192.png" width="58" height="58" alt="" />
        <p>正在打开书库…</p>
      </main>
    );
  if (username) return <App username={username} onLogout={logout} logoutBusy={logoutBusy} />;
  return (
    <Login
      onLogin={(name) => {
        sessionVersion.current++;
        setUsername(name);
        setNotice('');
        setUnavailable('');
        window.scrollTo({ top: 0, behavior: 'instant' });
      }}
      notice={notice}
      unavailable={unavailable}
      retry={() => {
        setLoading(true);
        void checkSession();
      }}
    />
  );
}
