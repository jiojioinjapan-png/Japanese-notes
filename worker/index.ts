import {
  NOTE_TYPES,
  ValidationError,
  validateImport,
  type Note,
  type NoteType,
} from '../shared/notes';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ADMIN_TOKEN?: string;
}
type Row = {
  id: string;
  type: NoteType;
  term: string;
  reading: string;
  accent: number;
  part_of_speech: string;
  meaning: string;
  example: string;
  example_translation: string;
  created_at: string;
};
function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
    },
  });
}
function serialize(row: Row): Note {
  return {
    id: row.id,
    type: row.type,
    term: row.term,
    meaning: row.meaning,
    createdAt: row.created_at,
    ...(row.type === 'word'
      ? { reading: row.reading, accent: row.accent, partOfSpeech: row.part_of_speech }
      : {}),
    ...(row.example ? { example: row.example } : {}),
    ...(row.example_translation ? { exampleTranslation: row.example_translation } : {}),
  };
}
async function listNotes(url: URL, env: Env): Promise<Response> {
  const category = url.searchParams.get('category') ?? 'all';
  const query = (url.searchParams.get('q') ?? '').trim();
  const sort = url.searchParams.get('sort') ?? 'recent';
  const page = Number(url.searchParams.get('page') ?? 1);
  const pageSize = Number(url.searchParams.get('pageSize') ?? 24);
  if (
    (category !== 'all' && !NOTE_TYPES.includes(category as NoteType)) ||
    !['recent', 'oldest', 'term'].includes(sort) ||
    query.length > 200 ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 100000 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  ) {
    return json({ error: '筛选或分页参数无效。' }, 400);
  }
  const where: string[] = [];
  const bindings: string[] = [];
  if (category !== 'all') {
    where.push('type = ?');
    bindings.push(category);
  }
  if (query) {
    where.push(
      '(instr(lower(term), lower(?)) > 0 OR instr(lower(reading), lower(?)) > 0 OR instr(lower(meaning), lower(?)) > 0 OR instr(lower(example), lower(?)) > 0 OR instr(lower(example_translation), lower(?)) > 0 OR instr(lower(part_of_speech), lower(?)) > 0)',
    );
    bindings.push(...Array<string>(6).fill(query.normalize('NFC')));
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const order =
    sort === 'term'
      ? 'term COLLATE NOCASE ASC, id ASC'
      : sort === 'oldest'
        ? 'created_at ASC, id ASC'
        : 'created_at DESC, id DESC';
  const db = env.DB.withSession('first-primary');
  const [items, total, groups] = await db.batch([
    db
      .prepare(`SELECT * FROM notes ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .bind(...bindings, pageSize, (page - 1) * pageSize),
    db.prepare(`SELECT COUNT(*) AS total FROM notes ${clause}`).bind(...bindings),
    db.prepare('SELECT type, COUNT(*) AS count FROM notes GROUP BY type'),
  ]);
  const counts = { all: 0, word: 0, onomatopoeia: 0, grammar: 0 };
  for (const row of groups.results as { type: NoteType; count: number }[]) {
    counts[row.type] = row.count;
    counts.all += row.count;
  }
  return json({
    notes: (items.results as Row[]).map(serialize),
    total: (total.results[0] as { total: number }).total,
    page,
    pageSize,
    counts,
  });
}
/** Bound streamed bodies as well as requests declaring Content-Length. */
async function readBody(request: Request): Promise<unknown> {
  const limit = 1024 * 1024;
  if (Number(request.headers.get('Content-Length')) > limit)
    throw new RangeError('JSON 超过 1 MiB，请分批导入。');
  if (!request.body) throw new SyntaxError();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new RangeError('JSON 超过 1 MiB，请分批导入。');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function importNotes(request: Request, env: Env): Promise<Response> {
  if (!env.ADMIN_TOKEN?.trim())
    return json({ error: '尚未启用导入，请先在 Cloudflare 设置 ADMIN_TOKEN。' }, 503);
  const expected = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`Bearer ${env.ADMIN_TOKEN}`),
  );
  const supplied = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(request.headers.get('Authorization') ?? ''),
  );
  let difference = 0;
  const a = new Uint8Array(expected);
  const b = new Uint8Array(supplied);
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  if (difference) return json({ error: '导入密钥不正确，请重新输入。' }, 401);
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin)
    return json({ error: '不允许跨站导入。' }, 403);
  if (
    request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
  )
    return json({ error: '请使用 application/json。' }, 415);
  try {
    const notes = validateImport(await readBody(request));
    const statements = notes.map((note) =>
      env.DB.prepare(
        `
      INSERT INTO notes (id, type, term, reading, accent, part_of_speech, meaning, example, example_translation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING
    `,
      ).bind(
        crypto.randomUUID(),
        note.type,
        note.term,
        note.reading ?? '',
        note.accent ?? -1,
        note.partOfSpeech ?? '',
        note.meaning,
        note.example ?? '',
        note.exampleTranslation ?? '',
      ),
    );
    // D1 batch is transactional: a failure rolls back this entire batch.
    const results = await env.DB.batch(statements);
    const inserted = results.reduce((sum, result) => sum + result.meta.changes, 0);
    return json({ inserted, skipped: notes.length - inserted, total: notes.length }, 201);
  } catch (error) {
    if (error instanceof ValidationError)
      return json({ error: '格式检查未通过，本批次未写入。', issues: error.issues }, 400);
    if (error instanceof SyntaxError)
      return json({ error: 'JSON 无法解析，请检查引号、逗号和括号。' }, 400);
    if (error instanceof RangeError) return json({ error: error.message }, 413);
    throw error;
  }
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (url.pathname === '/api/notes' && request.method === 'GET')
        return await listNotes(url, env);
      if (url.pathname === '/api/notes/import' && request.method === 'POST')
        return await importNotes(request, env);
      if (url.pathname === '/api/notes' || url.pathname === '/api/notes/import')
        return json({ error: '请求方法不支持。' }, 405);
      return json({ error: '接口不存在。' }, 404);
    } catch (error) {
      console.error(
        'Notes request failed',
        error instanceof Error ? error.message : 'Unknown error',
      );
      return json({ error: '暂时无法访问笔记库，请稍后重试。' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
