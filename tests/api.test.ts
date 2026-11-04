import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { exampleImport } from '../shared/notes';

let mf: Miniflare;
let db: Awaited<ReturnType<Miniflare['getD1Database']>>;
const key = 'test-only-import-key';
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
async function request(path: string, init?: Parameters<Miniflare['dispatchFetch']>[1]) {
  return mf.dispatchFetch(`http://localhost${path}`, init);
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
      bindings: { ADMIN_TOKEN: key },
    }),
  );
  db = await mf.getD1Database('DB');
  const migration = await readFile('migrations/0001_create_notes.sql', 'utf8');
  const statements = migration
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  await db.batch(statements.map((s) => db.prepare(s)));
  expect(await count()).toBe(3);
});
beforeEach(async () => {
  await db.prepare('DELETE FROM notes').run();
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
  it('rejects invalid batches without inserting the valid first row', async () => {
    const response = await upload({
      notes: [exampleImport.notes[0], { type: 'grammar', term: 'invalid' }],
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
  it('requires an import key and blocks foreign origins and wrong content types', async () => {
    expect((await upload(exampleImport, { Authorization: 'Bearer wrong' })).status).toBe(401);
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
