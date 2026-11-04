import { describe, expect, it } from 'vitest';
import { audioFrame, speechChunks } from '../worker/edge-tts';
import { edgeToken } from '../worker/vendor/edge-token';

describe('Worker-native Edge speech protocol', () => {
  it.each([
    [0, '52BC7A17B50DFEC9-28C4394775C8751CD2F6859C030C06DB1489ACAB3B3A7651831FC26895177ED6'],
    [
      1767225600,
      '723A6EBC411B23BB-214991EA6B1E401F3D777A699DDDEE75E29740EA7A5DCD1007366FA1090DD267',
    ],
    [
      1793793600,
      '07BB69475EBB626B-A49016AA9F8F7A25F24B04C2706C820EC6DE6E8140CB2E4FB717163D9DE20712',
    ],
  ])('matches the current upstream v2 authentication vector at %i', async (time, expected) => {
    expect(await edgeToken(Number(time))).toBe(expected);
  });
  it('escapes XML and chunks full-length Japanese examples without breaking entities or characters', () => {
    const text = '日本語<&>"\'。'.repeat(200);
    const chunks = speechChunks(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => new TextEncoder().encode(chunk).length <= 3000)).toBe(true);
    const restored = chunks
      .join('')
      .replaceAll('&apos;', "'")
      .replaceAll('&quot;', '"')
      .replaceAll('&gt;', '>')
      .replaceAll('&lt;', '<')
      .replaceAll('&amp;', '&');
    expect(restored).toBe(text);
    expect(speechChunks('a\u000bb')[0]).toBe('a b');
  });
  it('extracts only MP3 payload bytes and rejects corrupt speech frames', () => {
    const header = new TextEncoder().encode('Path:audio\r\nContent-Type:audio/mpeg\r\n');
    const frame = new Uint8Array(2 + header.length + 3);
    new DataView(frame.buffer).setUint16(0, header.length);
    frame.set(header, 2);
    frame.set([255, 243, 0], 2 + header.length);
    expect(audioFrame(frame.buffer)).toEqual(new Uint8Array([255, 243, 0]));
    expect(() => audioFrame(new Uint8Array([0, 255]).buffer)).toThrow();
  });
});
