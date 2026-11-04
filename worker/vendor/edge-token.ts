// Adapted for Workers Web Crypto from node-edge-tts 1.2.12, src/drm.ts.
// Copyright (c) 2022 SchneeHertz. MIT license: node-edge-tts.LICENSE.
// Source: https://github.com/SchneeHertz/node-edge-tts
export const CHROMIUM_FULL_VERSION = '143.0.3650.75';
export const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
const COEFFICIENTS: ReadonlyArray<readonly [number, number]> = [
  [0xe82e91b1, 0xb32700d0],
  [0x44de24c6, 0x88dff51d],
  [0x3beb65bc, 0x29514038],
  [0xc89c5933, 0xb328cbdf],
  [0x8d1ec211, 0xd405b4d5],
  [0x314ef5d5, 0x26e55f3c],
  [0xe92491b1, 0x607801c6],
  [0xf0a5b9d5, 0x82b2c1fb],
  [0x06064cf3, 0xfa51a3da],
  [0xda79fa60, 0x207cc464],
  [0xbed20560, 0x3c3c74f3],
  [0x89f9c9f8, 0xd2d14b61],
  [0x35fa38c6, 0xbb04a2c1],
  [0xcb49e3c6, 0xc5626167],
];

const mul = Math.imul;

const rol16 = (x: number): number => ((x << 16) | (x >>> 16)) >>> 0;

function cs64Digest(data: Uint8Array, shaDigest: Uint8Array): Uint8Array {
  const keyA = (new DataView(shaDigest.buffer, shaDigest.byteOffset).getUint32(0, true) | 1) >>> 0;
  const keyB = (new DataView(shaDigest.buffer, shaDigest.byteOffset).getUint32(4, true) | 1) >>> 0;

  const factors: [number, number] = [mul(keyA, 0x82893933) >>> 0, mul(keyB, 0x82893933) >>> 0];

  const terms: number[] = COEFFICIENTS.map(
    ([coefficient], i) => mul(coefficient, factors[i % 2]) >>> 0,
  );

  const offsets: number[] = COEFFICIENTS.map(([, offset]) => offset);

  const padded = new Uint8Array(Math.ceil((data.length + 1) / 8) * 8);

  padded.set(data, 1);

  for (let i = 0; i < padded.length / 4; i++) {
    const word = new DataView(padded.buffer).getUint32(i * 4, true);

    let term = mul(word, i % 2 === 0 ? keyA : keyB);

    let offset = mul(rol16(word), i % 2 === 0 ? 0xef0569fb : 0xc31713db);

    if (i === 0) {
      term = (term + mul(0xf2f90b1a, factors[0])) >>> 0;

      offset = (offset + 0x0b1a0000) >>> 0;
    }

    terms.push(term >>> 0);
    offsets.push(offset >>> 0);
  }

  let swapAcc = 0;
  let swapLast = 0;
  let state = 0;
  let acc = 0;

  for (let i = 0; i < terms.length; i += 2) {
    const x = terms[i];
    const y = terms[i + 1];

    let t = rol16((offsets[i] + x) >>> 0);
    let q = mul(t, 0x76f50f34);

    swapAcc += (mul(rol16(q), 0xc3efea97) + q) >>> 0;

    t = rol16((offsets[i + 1] + y) >>> 0);
    q = mul(t, 0x1881ce3c);

    swapLast = (mul(rol16(q), 0x35bd1ec9) + q) >>> 0;

    swapAcc = (swapAcc + swapLast) >>> 0;

    state = (mul(state, keyA) + x) >>> 0;

    for (const k of [0xcf98b111, 0x87085b9f, 0x12ceb96d, 0x257e1d83]) {
      state = mul(rol16(state), k) >>> 0;
    }

    acc += state;

    t = (mul(state, keyB) + y) >>> 0;
    t = mul(rol16(t), 0xa27416f5) >>> 0;
    t = mul(rol16(t), 0xd38396ff) >>> 0;

    state = mul(rol16(mul(rol16(t), 0x7c932b89)), 0xbfa49f69) >>> 0;

    acc = (acc + state) >>> 0;
  }

  const result = new Uint8Array(8);
  const view = new DataView(result.buffer);

  view.setUint32(0, (swapLast ^ state) >>> 0, true);

  view.setUint32(4, (swapAcc ^ acc) >>> 0, true);

  return result;
}

export async function edgeToken(unixSeconds = Date.now() / 1000): Promise<string> {
  if (!Number.isFinite(unixSeconds)) throw new TypeError('Invalid time');
  const seconds = BigInt(Math.floor(unixSeconds)) + 11644473600n;
  const ticks = (seconds - (seconds % 300n)) * 10000000n;
  const data = encoder.encode(`${ticks}${TRUSTED_CLIENT_TOKEN}`);
  const prefix = encoder.encode('Copyright (C) Microsoft Corporation. All rights reserved.');
  const combined = new Uint8Array(prefix.length + data.length);
  combined.set(prefix);
  combined.set(data, prefix.length);
  const sha = new Uint8Array(await crypto.subtle.digest('SHA-256', combined));
  return `${hex(cs64Digest(data, sha))}-${hex(sha)}`;
}
