import { isJson, json, readJson, sameOrigin } from './http';

export interface AuthEnv {
  DB: D1Database;
  LOGIN_USERNAME?: string;
  LOGIN_PASSWORD?: string;
}
export const SESSION_SECONDS = 30 * 24 * 60 * 60;
const ATTEMPT_WINDOW = 15 * 60;
const ATTEMPT_LIMIT = 10;
const encoder = new TextEncoder();
type SessionRow = { id: string; signature: string; expires_at: number };

export function authConfigured(env: AuthEnv): boolean {
  return !!env.LOGIN_USERNAME?.trim() && !!env.LOGIN_PASSWORD?.trim();
}
export function notConfigured(): Response {
  return json(
    { error: '书库尚未开放，请联系管理员完成登录配置。', code: 'AUTH_NOT_CONFIGURED' },
    503,
  );
}
function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function unhex(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) => parseInt(byte, 16));
}
async function hash(value: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}
async function sessionKey(env: AuthEnv): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(JSON.stringify([env.LOGIN_USERNAME, env.LOGIN_PASSWORD])),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}
function sessionMessage(token: string, expires: number): Uint8Array<ArrayBuffer> {
  return encoder.encode(`kotoba-session-v1:${token}:${expires}`);
}
function cookieName(request: Request): string {
  const url = new URL(request.url);
  // Only local development omits Secure; production always uses a host-only cookie.
  const local =
    url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  return local ? 'kotoba_session_dev' : '__Host-kotoba_session';
}
function cookie(request: Request, token: string, maxAge: number): string {
  const name = cookieName(request);
  return `${name}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${name.startsWith('__Host-') ? '; Secure' : ''}`;
}
function requestToken(request: Request): string | null {
  const name = `${cookieName(request)}=`;
  const token = request.headers
    .get('Cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(name))
    ?.slice(name.length);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
export function unauthorized(): Response {
  // Only login/logout modify the cookie; an older failed request must not clear a newer login.
  return json({ error: '登录已过期，请重新登录。', code: 'AUTH_REQUIRED' }, 401);
}
export async function validSession(request: Request, env: AuthEnv): Promise<boolean> {
  if (!authConfigured(env)) return false;
  const token = requestToken(request);
  if (!token) return false;
  const id = await hash(token);
  const row = await env.DB.withSession('first-primary')
    .prepare('SELECT id, signature, expires_at FROM auth_sessions WHERE id = ?')
    .bind(id)
    .first<SessionRow>();
  if (!row) return false;
  if (row.expires_at <= Math.floor(Date.now() / 1000)) {
    await env.DB.prepare('DELETE FROM auth_sessions WHERE id = ?').bind(id).run();
    return false;
  }
  // Changing either environment credential invalidates every existing session.
  return crypto.subtle.verify(
    'HMAC',
    await sessionKey(env),
    unhex(row.signature),
    sessionMessage(token, row.expires_at),
  );
}
async function credentialsMatch(
  username: string,
  password: string,
  env: AuthEnv,
): Promise<boolean> {
  const [expected, supplied] = await Promise.all([
    crypto.subtle.digest(
      'SHA-256',
      encoder.encode(JSON.stringify([env.LOGIN_USERNAME, env.LOGIN_PASSWORD])),
    ),
    crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify([username, password]))),
  ]);
  const a = new Uint8Array(expected);
  const b = new Uint8Array(supplied);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
async function login(request: Request, env: AuthEnv): Promise<Response> {
  if (!authConfigured(env)) return notConfigured();
  if (!isJson(request)) return json({ error: '请使用 JSON 提交登录信息。' }, 415);
  let input: unknown;
  try {
    input = await readJson(request, 4096);
  } catch (error) {
    return json({ error: '登录信息格式不正确。' }, error instanceof RangeError ? 413 : 400);
  }
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return json({ error: '请输入账号和密码。' }, 400);
  const { username, password } = input as Record<string, unknown>;
  if (
    typeof username !== 'string' ||
    !username ||
    username.length > 128 ||
    typeof password !== 'string' ||
    !password ||
    password.length > 1024
  )
    return json({ error: '请输入有效的账号和密码。' }, 400);
  const now = Math.floor(Date.now() / 1000);
  const bucket = await hash(`login:${request.headers.get('CF-Connecting-IP') ?? 'local'}`);
  const budgets = await env.DB.batch([
    env.DB.prepare('DELETE FROM auth_attempts WHERE reset_at <= ?').bind(now),
    env.DB.prepare(
      `INSERT INTO auth_attempts (bucket, attempts, reset_at) VALUES (?, 1, ?)
      ON CONFLICT(bucket) DO UPDATE SET attempts = attempts + 1 RETURNING attempts, reset_at`,
    ).bind(bucket, now + ATTEMPT_WINDOW),
  ]);
  const budget = budgets[1].results[0] as { attempts: number; reset_at: number };
  if (budget.attempts > ATTEMPT_LIMIT)
    return json({ error: '尝试次数较多，请在 15 分钟后重试。', code: 'LOGIN_RATE_LIMITED' }, 429, {
      'Retry-After': String(Math.max(1, budget.reset_at - now)),
    });
  if (!(await credentialsMatch(username, password, env)))
    return json({ error: '账号或密码不正确。' }, 401);
  const token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const id = await hash(token);
  const expires = now + SESSION_SECONDS;
  const signature = hex(
    await crypto.subtle.sign('HMAC', await sessionKey(env), sessionMessage(token, expires)),
  );
  const oldToken = requestToken(request);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').bind(now),
    ...(oldToken
      ? [env.DB.prepare('DELETE FROM auth_sessions WHERE id = ?').bind(await hash(oldToken))]
      : []),
    env.DB.prepare(
      'INSERT INTO auth_sessions (id, signature, expires_at, created_at) VALUES (?, ?, ?, ?)',
    ).bind(id, signature, expires, now),
    env.DB.prepare('DELETE FROM auth_attempts WHERE bucket = ?').bind(bucket),
  ]);
  return json({ authenticated: true, username: env.LOGIN_USERNAME }, 200, {
    'Set-Cookie': cookie(request, token, SESSION_SECONDS),
  });
}
export async function authRoute(request: Request, env: AuthEnv): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (request.method !== 'GET' && !sameOrigin(request))
    return json({ error: '不允许跨站请求。' }, 403);
  if (path === '/api/auth/login' && request.method === 'POST') return login(request, env);
  if (path === '/api/auth/logout' && request.method === 'POST') {
    const token = requestToken(request);
    if (token)
      await env.DB.prepare('DELETE FROM auth_sessions WHERE id = ?')
        .bind(await hash(token))
        .run();
    return json({ authenticated: false }, 200, { 'Set-Cookie': cookie(request, '', 0) });
  }
  if (path === '/api/auth/session' && request.method === 'GET') {
    if (!authConfigured(env)) return notConfigured();
    if (await validSession(request, env))
      return json({ authenticated: true, username: env.LOGIN_USERNAME });
    return json({ authenticated: false });
  }
  if (['/api/auth/login', '/api/auth/logout', '/api/auth/session'].includes(path))
    return json({ error: '请求方法不支持。' }, 405);
  return json({ error: '接口不存在。' }, 404);
}
