import { CHROMIUM_FULL_VERSION, edgeToken, TRUSTED_CLIENT_TOKEN } from './vendor/edge-token';

export const speechVoice = 'ja-JP-NanamiNeural';
export const speechFormat = 'audio-24khz-48kbitrate-mono-mp3';
const encoder = new TextEncoder();

export function speechChunks(text: string): string[] {
  const chunks: string[] = [];
  let current = '',
    size = 0;
  for (const char of text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')) {
    const escaped =
      char === '&'
        ? '&amp;'
        : char === '<'
          ? '&lt;'
          : char === '>'
            ? '&gt;'
            : char === '"'
              ? '&quot;'
              : char === "'"
                ? '&apos;'
                : char;
    const length = encoder.encode(escaped).length;
    if (size + length > 3000) {
      chunks.push(current);
      current = '';
      size = 0;
    }
    current += escaped;
    size += length;
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}
export function audioFrame(data: ArrayBuffer): Uint8Array | null {
  const bytes = new Uint8Array(data);
  if (bytes.length < 2) throw new Error('Invalid speech frame');
  const headerLength = new DataView(data).getUint16(0);
  if (headerLength + 2 > bytes.length) throw new Error('Invalid speech header');
  const header = new TextDecoder().decode(bytes.subarray(2, headerLength + 2));
  if (!/(?:^|\r\n)Path:audio(?:\r\n|$)/.test(header)) throw new Error('Unexpected speech frame');
  const audio = bytes.subarray(headerLength + 2);
  if (!audio.length) return null;
  if (!/(?:^|\r\n)Content-Type:audio\/mpeg(?:\r\n|$)/.test(header))
    throw new Error('Unexpected speech format');
  return audio;
}
async function speakChunk(text: string, voice: string): Promise<Uint8Array> {
  const connectionId = crypto.randomUUID().replaceAll('-', '');
  let clock = Date.now();
  let response: Response | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const url = new URL(
      'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1',
    );
    url.searchParams.set('TrustedClientToken', TRUSTED_CLIENT_TOKEN);
    url.searchParams.set('ConnectionId', connectionId);
    url.searchParams.set('Sec-MS-GEC', await edgeToken(clock / 1000));
    url.searchParams.set('Sec-MS-GEC-Version', `2-${CHROMIUM_FULL_VERSION}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Upgrade: 'websocket',
          Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          Cookie: `muid=${crypto.randomUUID().replaceAll('-', '').toUpperCase()};`,
        },
      });
    } finally {
      clearTimeout(timer);
    }
    if (response.status !== 403 || !response.headers.get('Date')) break;
    clock = Date.parse(response.headers.get('Date')!);
    if (!Number.isFinite(clock)) break;
  }
  const socket = response?.webSocket;
  if (!socket || response?.status !== 101)
    throw new Error(`Edge TTS connection failed (${response?.status ?? 'network'})`);
  socket.binaryType = 'arraybuffer';
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let size = 0,
      finished = false;
    const timer = setTimeout(() => finish(new Error('Edge TTS timed out')), 45000);
    function finish(error?: Error) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try {
        socket!.close(1000);
      } catch {
        /* Socket may already be closed. */
      }
      if (error || !size) {
        reject(error ?? new Error('Edge TTS returned no audio'));
        return;
      }
      const audio = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        audio.set(chunk, offset);
        offset += chunk.length;
      }
      resolve(audio);
    }
    socket.addEventListener('message', (event) => {
      if (finished) return;
      try {
        if (typeof event.data === 'string') {
          if (/(?:^|\r\n)Path:turn.end(?:\r\n|$)/.test(event.data)) finish();
          else if (/(?:^|\r\n)Path:(?:turn.error|response.error)(?:\r\n|$)/.test(event.data))
            finish(new Error('Edge TTS rejected speech'));
        } else {
          const audio = audioFrame(event.data);
          if (audio) {
            size += audio.length;
            if (size > 5 * 1024 * 1024) throw new Error('Speech audio too large');
            chunks.push(audio);
          }
        }
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Invalid speech data'));
      }
    });
    socket.addEventListener('close', () => {
      if (!finished) finish(new Error('Edge TTS closed before completion'));
    });
    socket.addEventListener('error', () => finish(new Error('Edge TTS socket error')));
    socket.accept();
    const stamp = new Date().toUTCString().replace('GMT', 'GMT+0000 (Coordinated Universal Time)');
    socket.send(
      `X-Timestamp:${stamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${JSON.stringify({ context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' }, outputFormat: speechFormat } } } })}\r\n`,
    );
    socket.send(
      `X-RequestId:${connectionId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${stamp}Z\r\nPath:ssml\r\n\r\n<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='ja-JP'><voice name='${voice}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>${text}</prosody></voice></speak>`,
    );
  });
}
export async function generateSpeech(text: string, voice = speechVoice): Promise<Uint8Array> {
  const pieces: Uint8Array[] = [];
  let size = 0;
  for (const chunk of speechChunks(text)) {
    const audio = await speakChunk(chunk, voice);
    size += audio.length;
    if (size > 5 * 1024 * 1024) throw new Error('Speech audio too large');
    pieces.push(audio);
  }
  if (!size) throw new Error('No speech text');
  const audio = new Uint8Array(size);
  let offset = 0;
  for (const piece of pieces) {
    audio.set(piece, offset);
    offset += piece.length;
  }
  return audio;
}
