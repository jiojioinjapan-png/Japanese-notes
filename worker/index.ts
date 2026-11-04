import {
  NOTE_TYPES,
  ValidationError,
  validateImport,
  type Note,
  type NoteType,
} from '../shared/notes';

import {
  authConfigured,
  authRoute,
  notConfigured,
  unauthorized,
  validSession,
  type AuthEnv,
} from './auth';
import { isJson, json, readJson, sameOrigin } from './http';
import { speechResponse } from './speech';

export interface Env extends AuthEnv {
  ASSETS: Fetcher;
  AUDIO?: R2Bucket;
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
  revision: number;
};
function serialize(row: Row): Note {
  return {
    id: row.id,
    type: row.type,
    term: row.term,
    meaning: row.meaning,
    createdAt: row.created_at,
    revision: row.revision,
    ...(row.reading ? { reading: row.reading } : {}),
    ...(row.accent >= 0 ? { accent: row.accent } : {}),
    ...(row.part_of_speech ? { partOfSpeech: row.part_of_speech } : {}),
    ...(row.example ? { example: row.example } : {}),
    ...(row.example_translation ? { exampleTranslation: row.example_translation } : {}),
  };
}
function noteSource(url: URL) {
  const category = url.searchParams.get('category') ?? 'all';
  const query = (url.searchParams.get('q') ?? '').trim();
  const sort = url.searchParams.get('sort') ?? 'recent';
  if (
    (category !== 'all' && !NOTE_TYPES.includes(category as NoteType)) ||
    !['recent', 'oldest', 'term'].includes(sort) ||
    query.length > 200
  )
    throw new ValidationError(['筛选或排序参数无效。']);
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
  return { clause, bindings, order };
}
async function listNotes(url: URL, env: Env): Promise<Response> {
  const page = Number(url.searchParams.get('page') ?? 1);
  const pageSize = Number(url.searchParams.get('pageSize') ?? 24);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 100000 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  )
    return json({ error: '分页参数无效。' }, 400);
  const { clause, bindings, order } = noteSource(url);
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
async function importNotes(request: Request, env: Env): Promise<Response> {
  if (!sameOrigin(request)) return json({ error: '不允许跨站导入。' }, 403);
  if (!isJson(request)) return json({ error: '请使用 application/json。' }, 415);
  try {
    const notes = validateImport(await readJson(request));
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
        note.meaning ?? '',
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
    if (error instanceof RangeError) return json({ error: 'JSON 超过 1 MiB，请分批导入。' }, 413);
    throw error;
  }
}
async function updateNote(request: Request, url: URL, id: string, env: Env): Promise<Response> {
  if (!sameOrigin(request)) return json({ error: '不允许跨站修改。' }, 403);
  if (!isJson(request)) return json({ error: '请使用 application/json。' }, 415);
  const body = await readJson(request, 32 * 1024);
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new ValidationError(['修改内容必须是 { "note": {...}, "revision": 数字 }。']);
  const input = body as Record<string, unknown>;
  if (
    Object.keys(input).some((key) => !['note', 'revision'].includes(key)) ||
    typeof input.revision !== 'number' ||
    !Number.isSafeInteger(input.revision) ||
    input.revision < 0
  )
    throw new ValidationError(['笔记版本或字段无效，请重新打开词条。']);
  const [note] = validateImport({ notes: [input.note] });
  const { clause, bindings, order } = noteSource(url);
  const db = env.DB.withSession('first-primary');
  try {
    const [updated, context, count] = await db.batch([
      db
        .prepare(
          `UPDATE notes SET type = ?, term = ?, reading = ?, accent = ?, part_of_speech = ?,
        meaning = ?, example = ?, example_translation = ?, revision = revision + 1
        WHERE id = ? AND revision = ? RETURNING *`,
        )
        .bind(
          note.type,
          note.term,
          note.reading ?? '',
          note.accent ?? -1,
          note.partOfSpeech ?? '',
          note.meaning ?? '',
          note.example ?? '',
          note.exampleTranslation ?? '',
          id,
          input.revision,
        ),
      db
        .prepare(
          `SELECT position FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY ${order}) - 1 AS position FROM notes ${clause}) WHERE id = ?`,
        )
        .bind(...bindings, id),
      db.prepare(`SELECT COUNT(*) AS total FROM notes ${clause}`).bind(...bindings),
    ]);
    const row = updated.results[0] as Row | undefined;
    if (!row) {
      const current = await db.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first<Row>();
      return current
        ? json(
            {
              error: '这条笔记已在其他页面修改，请载入最新内容后重试。',
              code: 'NOTE_CHANGED',
              note: serialize(current),
            },
            409,
          )
        : json({ error: '这条笔记不存在。' }, 404);
    }
    return json({
      note: serialize(row),
      context: {
        index: (context.results[0] as { position: number } | undefined)?.position ?? null,
        total: (count.results[0] as { total: number }).total,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed'))
      return json({ error: '已有内容完全相同的笔记，请调整内容后保存。' }, 409);
    throw error;
  }
}
export default {
  async fetch(request: Request, env: Env, context?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (url.pathname.startsWith('/api/auth/')) return await authRoute(request, env);
      if (!authConfigured(env)) return notConfigured();
      if (!(await validSession(request, env))) return unauthorized();
      if (url.pathname === '/api/notes' && request.method === 'GET')
        return await listNotes(url, env);
      const audio = /^\/api\/notes\/([^/]+)\/audio$/.exec(url.pathname);
      if (audio && ['GET', 'HEAD'].includes(request.method))
        return await speechResponse(request, env, audio[1], undefined, context);
      const match = /^\/api\/notes\/([^/]+)$/.exec(url.pathname);
      if (match && request.method === 'PUT') return await updateNote(request, url, match[1], env);
      if (url.pathname === '/api/notes/import' && request.method === 'POST')
        return await importNotes(request, env);
      if (url.pathname === '/api/notes' || url.pathname === '/api/notes/import')
        return json({ error: '请求方法不支持。' }, 405);
      return json({ error: '接口不存在。' }, 404);
    } catch (error) {
      if (error instanceof ValidationError)
        return json({ error: '字段检查未通过。', issues: error.issues }, 400);
      if (error instanceof SyntaxError) return json({ error: 'JSON 无法解析。' }, 400);
      if (error instanceof RangeError) return json({ error: '请求内容超过大小限制。' }, 413);
      console.error(
        'Notes request failed',
        error instanceof Error ? error.message : 'Unknown error',
      );
      return json({ error: '暂时无法访问笔记库，请稍后重试。' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
