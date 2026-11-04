export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  const result = new Headers(headers);
  result.set('Cache-Control', 'no-store');
  result.set('X-Content-Type-Options', 'nosniff');
  result.set('Referrer-Policy', 'same-origin');
  return Response.json(data, { status, headers: result });
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  return (
    (!origin || origin === new URL(request.url).origin) &&
    request.headers.get('Sec-Fetch-Site') !== 'cross-site'
  );
}

export function isJson(request: Request): boolean {
  return (
    request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() === 'application/json'
  );
}

/** Bound streamed requests as well as requests declaring Content-Length. */
export async function readJson(request: Request, limit = 1024 * 1024): Promise<unknown> {
  if (Number(request.headers.get('Content-Length')) > limit)
    throw new RangeError('请求内容超过大小限制。');
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
      throw new RangeError('请求内容超过大小限制。');
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
