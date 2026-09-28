// 把課表壓縮後放進網址 hash。格式:#s=<base64url(deflate-raw(JSON))>
import { sanitizeTimetable } from './validate.js';

const MAX_INFLATED = 300_000;
const MAX_CODE = 60_000;

/** 去掉 id 並轉成短陣列格式 */
export function toCompact(tt) {
  return [
    1,
    tt.name,
    tt.preset,
    tt.dayEnd,
    tt.periods.map((p) => [p.id, p.label, p.start, p.end]),
    tt.courses.map((c) => [c.name, c.teacher, c.room, c.credits, c.color, c.note, c.slots.map((s) => [s.day, s.periods])]),
  ];
}

export function fromCompact(a) {
  if (!Array.isArray(a) || a[0] !== 1 || a.length < 6) return null;
  const [, name, preset, dayEnd, periods, courses] = a;
  if (!Array.isArray(periods) || !Array.isArray(courses)) return null;
  return {
    name,
    preset,
    dayEnd,
    periods: periods.map((p) => (Array.isArray(p) ? { id: p[0], label: p[1], start: p[2], end: p[3] } : null)),
    courses: courses.map((c) =>
      Array.isArray(c)
        ? {
            name: c[0], teacher: c[1], room: c[2], credits: c[3], color: c[4], note: c[5],
            slots: Array.isArray(c[6]) ? c[6].map((s) => (Array.isArray(s) ? { day: s[0], periods: s[1] } : null)) : [],
          }
        : null,
    ),
  };
}

export function toBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s) {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('bad base64url');
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes, stream, limit = Infinity) {
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new Error('too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export async function encodeShare(tt) {
  const json = JSON.stringify(toCompact(tt));
  const packed = await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw'));
  return toBase64Url(packed);
}

/** @returns {Promise<{ok:true,value:object,warnings:string[]}|{ok:false,error:string}>} */
export async function decodeShare(code) {
  try {
    if (typeof code !== 'string' || !code) return { ok: false, error: '分享連結是空的' };
    if (code.length > MAX_CODE) return { ok: false, error: '分享連結太長' };
    const bytes = fromBase64Url(code);
    const raw = await pipe(bytes, new DecompressionStream('deflate-raw'), MAX_INFLATED);
    const compact = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
    const tt = fromCompact(compact);
    if (!tt) return { ok: false, error: '分享連結的格式不對' };
    return sanitizeTimetable(tt);
  } catch {
    return { ok: false, error: '分享連結無法讀取(可能被截斷或已損壞)' };
  }
}

export async function shareURL(tt, base) {
  return `${base.split('#')[0]}#s=${await encodeShare(tt)}`;
}

/** 從 location.hash 取出分享碼,沒有就回傳 null */
export function codeFromHash(hash) {
  const m = /^#s=(.*)$/.exec(hash || '');
  return m ? m[1] : null;
}
