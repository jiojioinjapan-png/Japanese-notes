import { generateSpeech, speechFormat, speechVoice } from './edge-tts';
import { json, sameOrigin } from './http';

type SpeechEnv = { DB: D1Database; AUDIO?: R2Bucket };
const pending = new Map<string, Promise<void>>();
export async function speechKey(text: string, voice = speechVoice) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(['edge-tts-v1', voice, speechFormat, text])),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `examples/${hash}.mp3`;
}
function rangeFor(header: string, size: number): { offset: number; length: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix < 1) return null;
    const length = Math.min(size, suffix);
    return { offset: size - length, length };
  }
  const offset = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(end) || offset >= size || end < offset)
    return null;
  return { offset, length: Math.min(end, size - 1) - offset + 1 };
}
export async function speechResponse(
  request: Request,
  env: SpeechEnv,
  id: string,
  synthesize = generateSpeech,
  context?: ExecutionContext,
): Promise<Response> {
  if (!sameOrigin(request)) return json({ error: '不允许跨站播放。' }, 403);
  const note = await env.DB.withSession('first-primary')
    .prepare('SELECT example, revision FROM notes WHERE id = ?')
    .bind(id)
    .first<{ example: string; revision: number }>();
  if (!note) return json({ error: '这条笔记不存在。' }, 404);
  const revision = new URL(request.url).searchParams.get('revision');
  if (revision !== String(note.revision))
    return json({ error: '例句已修改，请重新打开词条后播放。' }, 409);
  if (!note.example.trim()) return json({ error: '这条笔记还没有日语例句。' }, 422);
  const bucket = env.AUDIO;
  if (!bucket) return json({ error: '发音存储尚未配置，请先绑定 R2 存储桶。' }, 503);
  const key = await speechKey(note.example);
  let object = await bucket.head(key);
  const hit = !!object;
  if (!object) {
    let task = pending.get(key);
    if (!task) {
      task = (async () => {
        // Recheck after the first lookup to avoid duplicate work in a single isolate.
        if (await bucket.head(key)) return;
        const audio = await synthesize(note.example, speechVoice);
        if (!audio.length) throw new Error('No audio returned');
        await bucket.put(key, audio, {
          onlyIf: { etagDoesNotMatch: '*' },
          httpMetadata: { contentType: 'audio/mpeg' },
          customMetadata: { voice: speechVoice, format: speechFormat },
        });
      })();
      pending.set(key, task);
      context?.waitUntil(task.catch(() => {}));
    }
    try {
      await task;
    } catch (error) {
      console.error('Speech synthesis failed', error instanceof Error ? error.message : 'Unknown');
      return json({ error: '暂时无法生成发音，请稍后重试。' }, 502);
    } finally {
      if (pending.get(key) === task) pending.delete(key);
    }
    object = await bucket.head(key);
  }
  if (!object) return json({ error: '发音保存失败，请稍后重试。' }, 502);
  const headers = new Headers({
    'Content-Type': 'audio/mpeg',
    'Cache-Control': 'private, no-store',
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    ETag: object.httpEtag,
    'X-Audio-Cache': hit ? 'HIT' : 'MISS',
  });
  const rangeHeader = request.headers.get('Range');
  const range = rangeHeader ? rangeFor(rangeHeader, object.size) : undefined;
  if (rangeHeader && !range) {
    headers.set('Content-Range', `bytes */${object.size}`);
    return new Response(null, { status: 416, headers });
  }
  const audio = await bucket.get(key, range ? { range } : undefined);
  if (!audio) return json({ error: '发音暂时无法读取，请重试。' }, 502);
  headers.set('Content-Length', String(range?.length ?? object.size));
  if (range)
    headers.set(
      'Content-Range',
      `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`,
    );
  return new Response(request.method === 'HEAD' ? null : audio.body, {
    status: range ? 206 : 200,
    headers,
  });
}
