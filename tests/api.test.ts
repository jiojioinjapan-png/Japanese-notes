import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { exampleImport } from '../shared/notes';
import worker, { type Env } from '../worker/index';

let mf: Miniflare;
let db: Awaited<ReturnType<Miniflare['getD1Database']>>;
const username = 'test-reader';
const password = 'test-only-account-password';
let sessionCookie = '';
const headers = { 'Content-Type': 'application/json' };
async function request(
  path: string,
  init?: Parameters<Miniflare['dispatchFetch']>[1],
  authenticated = true,
) {
  const requestHeaders = new Headers(init?.headers as HeadersInit);
  if (authenticated && !requestHeaders.has('Cookie')) requestHeaders.set('Cookie', sessionCookie);
  return mf.dispatchFetch(`http://localhost${path}`, {
    ...init,
    headers: Object.fromEntries(requestHeaders.entries()),
  });
}
async function login(credentials = { username, password }, extraHeaders = {}) {
  return request(
    '/api/auth/login',
    { method: 'POST', headers: { ...headers, ...extraHeaders }, body: JSON.stringify(credentials) },
    false,
  );
}
async function upload(body: unknown, extraHeaders = {}) {
  return request('/api/notes/import', {
    method: 'POST',
    headers: { ...headers, ...extraHeaders },
    body: JSON.stringify(body),
  });
}
async function count() {
  return (await db.prepare('SELECT COUNT(*) AS n FROM notes').first<{ n: number }>())!.n;
}

beforeAll(async () => {
  const built = await build({
    entryPoints: ['worker/index.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: built.outputFiles[0].text,
      compatibilityDate: '2025-11-01',
      d1Databases: ['DB'],
      bindings: { LOGIN_USERNAME: username, LOGIN_PASSWORD: password },
    }),
  );
  db = await mf.getD1Database('DB');
  for (const file of ['0001_create_notes.sql', '0002_authentication.sql']) {
    const migration = await readFile(`migrations/${file}`, 'utf8');
    const statements = migration
      .replace(/--[^\n]*/g, '')
      .split(';')
      .map((sql) => sql.trim())
      .filter(Boolean);
    await db.batch(statements.map((sql) => db.prepare(sql)));
  }
  expect(await count()).toBe(3);
});
beforeEach(async () => {
  await db.batch(
    ['DELETE FROM notes', 'DELETE FROM auth_sessions', 'DELETE FROM auth_attempts'].map((sql) =>
      db.prepare(sql),
    ),
  );
  const authenticated = await login();
  expect(authenticated.status).toBe(200);
  sessionCookie = authenticated.headers.get('Set-Cookie')!.split(';')[0];
});
afterAll(async () => {
  await mf?.dispose();
});

describe('Worker with a real local D1 database', () => {
  it('imports mixed types and ignores exact duplicates within and across requests', async () => {
    const response = await upload({ notes: [...exampleImport.notes, exampleImport.notes[0]] });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ inserted: 3, skipped: 1 });
    expect(await (await upload(exampleImport)).json()).toMatchObject({ inserted: 0, skipped: 3 });
    const sameWordDifferentMeaning = { ...exampleImport.notes[0], meaning: '色彩丰富；多种多样' };
    expect(await (await upload({ notes: [sameWordDifferentMeaning] })).json()).toMatchObject({
      inserted: 1,
    });
    expect(await count()).toBe(4);
  });
  it('persists partial notes, preserves metadata for all types, and deduplicates all empty forms', async () => {
    const response = await upload({
      notes: [
        { type: 'word', term: 'ある' },
        { type: 'word', term: 'ある', accent: 0 },
        {
          type: 'onomatopoeia',
          term: 'じっくり',
          accent: 3,
          partOfSpeech: '副',
          meaning: '慢慢地',
        },
        { type: 'grammar', term: 'からすると', reading: null, meaning: '', example: null },
        {
          type: 'word',
          term: 'みっともない',
          accent: 5,
          partOfSpeech: '形',
          meaning: '不体面、丢脸',
        },
      ],
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ inserted: 5, skipped: 0 });
    const listing = (await (await request('/api/notes')).json()) as {
      notes: Record<string, unknown>[];
    };
    const blank = listing.notes.find((note) => note.term === 'ある' && note.accent === undefined)!;
    expect(blank).toBeDefined();
    expect(blank).not.toHaveProperty('reading');
    expect(blank).not.toHaveProperty('partOfSpeech');
    expect(listing.notes.find((note) => note.term === 'ある' && note.accent === 0)).toBeDefined();
    expect(listing.notes.find((note) => note.term === 'じっくり')).toMatchObject({
      accent: 3,
      partOfSpeech: '副',
    });
    expect(
      await db.prepare('SELECT accent FROM notes WHERE id = ?').bind(blank.id).first(),
    ).toEqual({ accent: -1 });
    expect(
      await (
        await upload({
          notes: [
            {
              type: 'word',
              term: 'ある',
              reading: '',
              accent: null,
              partOfSpeech: ' ',
              meaning: null,
              example: '',
              exampleTranslation: null,
            },
            { type: 'grammar', term: 'からすると', accent: '', meaning: '  ', example: '' },
          ],
        })
      ).json(),
    ).toMatchObject({ inserted: 0, skipped: 2 });
    const roundTrip = listing.notes.map(({ id: _id, createdAt: _createdAt, ...note }) => note);
    expect(await (await upload({ notes: roundTrip })).json()).toMatchObject({
      inserted: 0,
      skipped: 5,
    });
    expect(await count()).toBe(5);
  });
  it('rejects invalid batches without inserting the valid first row', async () => {
    const response = await upload({
      notes: [exampleImport.notes[0], { type: 'grammar', term: '' }],
    });
    expect(response.status).toBe(400);
    expect(await count()).toBe(0);
  });
  it('rolls back the entire D1 batch on an actual database error', async () => {
    await db
      .prepare(
        "CREATE TRIGGER fail_import BEFORE INSERT ON notes WHEN NEW.term = 'FAIL-TRANSACTION' BEGIN SELECT RAISE(ABORT, 'test rollback'); END",
      )
      .run();
    try {
      const response = await upload({
        notes: [exampleImport.notes[0], { ...exampleImport.notes[2], term: 'FAIL-TRANSACTION' }],
      });
      expect(response.status).toBe(500);
      expect(await count()).toBe(0);
    } finally {
      await db.prepare('DROP TRIGGER fail_import').run();
    }
  });
  it('supports the maximum 500-note batch', async () => {
    const notes = Array.from({ length: 500 }, (_, i) => ({
      ...exampleImport.notes[0],
      term: `単語${i}`,
    }));
    expect(await (await upload({ notes })).json()).toMatchObject({ inserted: 500, skipped: 0 });
    expect(await count()).toBe(500);
  });
  it('filters, searches readings/examples/Chinese, paginates, and reports global category counts', async () => {
    await upload(exampleImport);
    const listing = await (
      await request('/api/notes?category=word&q=' + encodeURIComponent('たさい'))
    ).json();
    expect(listing).toMatchObject({
      total: 1,
      counts: { all: 3, word: 1, onomatopoeia: 1, grammar: 1 },
      notes: [{ term: '多彩', reading: 'たさい', accent: 0, partOfSpeech: '形动' }],
    });
    for (const q of ['丰富', '資料', '留学経験']) {
      expect(await (await request('/api/notes?q=' + encodeURIComponent(q))).json()).toMatchObject({
        total: 1,
      });
    }
    const first = (await (await request('/api/notes?pageSize=1&page=1&sort=term')).json()) as {
      notes: { id: string }[];
    };
    const second = (await (await request('/api/notes?pageSize=1&page=2&sort=term')).json()) as {
      notes: { id: string }[];
    };
    expect(first.notes[0].id).not.toBe(second.notes[0].id);
  });
  it('treats wildcard characters and SQL syntax as plain text; supports long Japanese queries', async () => {
    const literal = '100%_\\';
    const longTerm = 'ながいことば'.repeat(12);
    await upload({
      notes: [
        { ...exampleImport.notes[0], term: literal },
        { ...exampleImport.notes[0], term: longTerm },
      ],
    });
    for (const q of [literal, longTerm])
      expect(await (await request('/api/notes?q=' + encodeURIComponent(q))).json()).toMatchObject({
        total: 1,
      });
    expect(
      await (await request('/api/notes?q=' + encodeURIComponent("' OR 1=1 --"))).json(),
    ).toMatchObject({ total: 0 });
  });
  it.each([
    '/api/notes?page=0',
    '/api/notes?page=1.5',
    '/api/notes?pageSize=1000',
    '/api/notes?category=unknown',
    '/api/notes?sort=unknown',
  ])('rejects invalid list parameters %s', async (path) => {
    expect((await request(path)).status).toBe(400);
  });
  it('requires a session and blocks foreign origins and wrong content types', async () => {
    expect((await request('/api/notes', undefined, false)).status).toBe(401);
    expect(
      (
        await request(
          '/api/notes/import',
          {
            method: 'POST',
            headers: { ...headers, Authorization: 'Bearer legacy-import-key' },
            body: JSON.stringify(exampleImport),
          },
          false,
        )
      ).status,
    ).toBe(401);
    expect((await upload(exampleImport, { Origin: 'https://other.example' })).status).toBe(403);
    expect((await upload(exampleImport, { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect(await count()).toBe(0);
  });
  it('rejects malformed and oversized JSON and keeps API errors as JSON', async () => {
    expect(
      (await request('/api/notes/import', { method: 'POST', headers, body: '{bad-json' })).status,
    ).toBe(400);
    expect(
      (
        await request('/api/notes/import', {
          method: 'POST',
          headers,
          body: 'x'.repeat(1024 * 1024 + 1),
        })
      ).status,
    ).toBe(413);
    const missing = await request('/api/missing');
    expect(missing.status).toBe(404);
    expect(missing.headers.get('content-type')).toContain('application/json');
    expect((await request('/api/notes', { method: 'DELETE' })).status).toBe(405);
  });
});

describe('account authentication and server-side sessions', () => {
  it('does not reveal the configured username until login and keeps passwords out of responses', async () => {
    const anonymous = await request('/api/auth/session', undefined, false);
    expect(await anonymous.json()).toEqual({ authenticated: false });
    expect(await (await request('/api/auth/session')).json()).toEqual({
      authenticated: true,
      username,
    });
    const rejected = await login({ username, password: 'wrong-password' });
    expect(rejected.status).toBe(401);
    expect(await rejected.json()).toEqual({ error: '账号或密码不正确。' });
    const unknown = await login({ username: 'unknown-reader', password });
    expect(await unknown.json()).toEqual({ error: '账号或密码不正确。' });
  });
  it("anonymous status and failed reads cannot overwrite another request's fresh login cookie", async () => {
    const response = await login();
    expect(response.headers.get('Set-Cookie')).toBeTruthy();
    const status = await request('/api/auth/session', undefined, false);
    const denied = await request('/api/notes', undefined, false);
    expect(status.headers.get('Set-Cookie')).toBeNull();
    expect(denied.headers.get('Set-Cookie')).toBeNull();
  });
  it('uses Secure host-only HttpOnly cookies over HTTPS and stores only a token hash in D1', async () => {
    const response = await mf.dispatchFetch('https://notes.example/api/auth/login', {
      method: 'POST',
      headers,
      body: JSON.stringify({ username, password }),
    });
    expect(response.status).toBe(200);
    const cookie = response.headers.get('Set-Cookie')!;
    expect(cookie).toMatch(/^__Host-kotoba_session=/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Max-Age=2592000');
    expect(cookie).not.toContain('Domain=');
    const rawToken = cookie.split(';')[0].split('=')[1];
    const rows = await db.prepare('SELECT * FROM auth_sessions').all();
    expect(JSON.stringify(rows.results)).not.toContain(rawToken);
    expect(JSON.stringify(rows.results)).not.toContain(password);
    const protectedResponse = await mf.dispatchFetch('https://notes.example/api/notes', {
      headers: { Cookie: cookie.split(';')[0] },
    });
    expect(protectedResponse.status).toBe(200);
  });
  it('revokes sessions on logout, including replay of the original cookie', async () => {
    expect((await request('/api/auth/logout', { method: 'POST' })).status).toBe(200);
    expect((await request('/api/notes')).status).toBe(401);
    expect(await (await request('/api/auth/session')).json()).toEqual({ authenticated: false });
    expect(
      (await db.prepare('SELECT COUNT(*) AS n FROM auth_sessions').first<{ n: number }>())!.n,
    ).toBe(0);
  });
  it('rejects expired sessions and removes them from D1', async () => {
    await db.prepare('UPDATE auth_sessions SET expires_at = 0').run();
    const response = await request('/api/notes');
    expect(response.status).toBe(401);
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(
      (await db.prepare('SELECT COUNT(*) AS n FROM auth_sessions').first<{ n: number }>())!.n,
    ).toBe(0);
  });
  it('rejects modified tokens and modified session signatures', async () => {
    const token = sessionCookie.slice(sessionCookie.indexOf('=') + 1);
    const forged = token[0] === 'A' ? 'B' + token.slice(1) : 'A' + token.slice(1);
    expect(
      (await request('/api/notes', { headers: { Cookie: `kotoba_session_dev=${forged}` } })).status,
    ).toBe(401);
    await db.prepare('UPDATE auth_sessions SET signature = ?').bind('00'.repeat(32)).run();
    expect((await request('/api/notes')).status).toBe(401);
  });
  it('invalidates existing sessions when either environment credential changes', async () => {
    for (const changed of [
      { LOGIN_USERNAME: 'new-reader', LOGIN_PASSWORD: password },
      { LOGIN_USERNAME: username, LOGIN_PASSWORD: 'new-password' },
    ]) {
      const env = { DB: db, ASSETS: {}, ...changed } as unknown as Env;
      const response = await worker.fetch(
        new Request('http://localhost/api/notes', { headers: { Cookie: sessionCookie } }),
        env,
      );
      expect(response.status).toBe(401);
    }
  });
  it('fails closed when either credential is missing', async () => {
    for (const missing of [{ LOGIN_USERNAME: username }, { LOGIN_PASSWORD: password }, {}]) {
      const env = { DB: db, ASSETS: {}, ...missing } as unknown as Env;
      for (const path of ['/api/auth/session', '/api/notes']) {
        const response = await worker.fetch(new Request(`http://localhost${path}`), env);
        expect(response.status).toBe(503);
        expect(await response.json()).toMatchObject({ code: 'AUTH_NOT_CONFIGURED' });
      }
      expect(
        (
          await worker.fetch(
            new Request('http://localhost/api/auth/login', {
              method: 'POST',
              headers,
              body: JSON.stringify({ username, password }),
            }),
            env,
          )
        ).status,
      ).toBe(503);
    }
  });
  it('limits concurrent guessing attempts per IP and recovers after the window expires', async () => {
    const ip = { 'CF-Connecting-IP': '203.0.113.40' };
    const attempts = await Promise.all(
      Array.from({ length: 11 }, () => login({ username, password: 'wrong' }, ip)),
    );
    expect(attempts.filter((result) => result.status === 401)).toHaveLength(10);
    expect(attempts.filter((result) => result.status === 429)).toHaveLength(1);
    expect(
      attempts.find((result) => result.status === 429)!.headers.get('Retry-After'),
    ).toBeTruthy();
    await db.prepare('UPDATE auth_attempts SET reset_at = 0').run();
    expect((await login({ username, password }, ip)).status).toBe(200);
  });
  it('bounds login payloads and rejects cross-site login/logout requests', async () => {
    expect((await login({ username, password }, { Origin: 'https://other.example' })).status).toBe(
      403,
    );
    expect(
      (
        await request('/api/auth/logout', {
          method: 'POST',
          headers: { Origin: 'https://other.example' },
        })
      ).status,
    ).toBe(403);
    expect(
      (await request('/api/auth/login', { method: 'POST', headers, body: '{broken' }, false))
        .status,
    ).toBe(400);
    expect(
      (await request('/api/auth/login', { method: 'POST', headers, body: 'x'.repeat(4097) }, false))
        .status,
    ).toBe(413);
    expect(
      (
        await request(
          '/api/auth/login',
          { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' },
          false,
        )
      ).status,
    ).toBe(415);
  });
});
