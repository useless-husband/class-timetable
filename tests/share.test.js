import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, shareURL, codeFromHash, toBase64Url, fromBase64Url } from '../src/share.js';
import { course, table } from './helpers.js';
import { COLORS } from '../src/palette.js';

const sample = () =>
  table([
    course('a', '微積分(一)', [{ day: 1, periods: ['2', '3'] }, { day: 4, periods: ['2'] }], { teacher: '王大明', room: '數學館 101', color: 4, note: '第一堂課要帶計算機\n有小考' }),
    course('b', '英文', [{ day: 2, periods: ['A', 'B'] }], { credits: 2, color: 7 }),
  ]);

test('編碼再解碼,內容(除 id)完全一致', async () => {
  const t = sample();
  const r = await decodeShare(await encodeShare(t));
  assert.equal(r.ok, true);
  const strip = (x) => ({ ...x, id: undefined, courses: x.courses.map((c) => ({ ...c, id: undefined })) });
  assert.deepEqual(strip(r.value), strip(t));
});

test('編碼結果只含網址安全字元', async () => {
  assert.match(await encodeShare(sample()), /^[A-Za-z0-9_-]+$/);
});

test('分享碼有壓縮效果:比原始 JSON 短', async () => {
  const t = table(Array.from({ length: 12 }, (_, i) => course('c' + i, '課程' + i, [{ day: 1 + (i % 5), periods: ['1', '2'] }], { teacher: '老師', room: '教室' })));
  const code = await encodeShare(t);
  assert.ok(code.length < JSON.stringify(t).length / 2);
});

test('自訂節次也能來回', async () => {
  const t = sample();
  t.periods = [{ id: 'p1', label: '甲', start: '09:00', end: '09:45' }, { id: 'p2', label: '乙', start: '10:00', end: '10:45' }];
  t.courses = [course('x', 'X', [{ day: 3, periods: ['p2'] }])];
  const r = await decodeShare(await encodeShare(t));
  assert.deepEqual(r.value.periods, t.periods);
  assert.deepEqual(r.value.courses[0].slots, [{ day: 3, periods: ['p2'] }]);
});

test('shareURL 會替換舊的 hash', async () => {
  const url = await shareURL(sample(), 'https://example.com/class-timetable/#s=old');
  assert.ok(url.startsWith('https://example.com/class-timetable/#s='));
  assert.equal(url.includes('old'), false);
  assert.equal(codeFromHash(new URL(url).hash) !== null, true);
});

test('codeFromHash', () => {
  assert.equal(codeFromHash('#s=abc'), 'abc');
  assert.equal(codeFromHash('#other'), null);
  assert.equal(codeFromHash(''), null);
});

test('壞分享碼一律回傳 ok:false', async () => {
  const good = await encodeShare(sample());
  const cases = ['', '!!!', 'AAAA', good.slice(0, 20), good.slice(0, -5) + 'zzzzz', 'x'.repeat(70000), null, undefined, 42];
  for (const bad of cases) {
    const r = await decodeShare(bad);
    assert.equal(r.ok, false, String(bad).slice(0, 30));
  }
});

test('壓縮炸彈(解壓後過大)被擋下', async () => {
  const bomb = await new Response(new Blob([new Uint8Array(5_000_000)]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
  const r = await decodeShare(toBase64Url(new Uint8Array(bomb)));
  assert.equal(r.ok, false);
});

test('合法壓縮但內容不是課表格式,不會壞', async () => {
  for (const payload of ['[]', '{"a":1}', '[1,"x"]', '[2,"x","university",5,[],[]]', 'null', '[1,"x","university",5,"bad",7]']) {
    const bytes = new Uint8Array(await new Response(new Blob([payload]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    const r = await decodeShare(toBase64Url(bytes));
    assert.equal(r.ok, false, payload);
  }
});

test('壞掉的課程陣列元素會被 sanitize 過濾', async () => {
  const payload = JSON.stringify([1, 'T', 'university', 5, [], [null, 5, ['好課', '', '', 3, 1, '', [[1, ['1']], null]]]]);
  const bytes = new Uint8Array(await new Response(new Blob([payload]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  const r = await decodeShare(toBase64Url(bytes));
  assert.equal(r.ok, true);
  assert.equal(r.value.courses.length, 1);
  assert.deepEqual(r.value.courses[0].slots, [{ day: 1, periods: ['1'] }]);
});

test('base64url 來回', () => {
  const b = Uint8Array.from([0, 250, 251, 252, 253, 254, 255, 62, 63]);
  assert.deepEqual(fromBase64Url(toBase64Url(b)), b);
  assert.throws(() => fromBase64Url('a+b/'));
});

test('調色盤:8 色、深淺兩套、白字/深字對比 >= 4.5', () => {
  assert.equal(COLORS.length, 8);
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const c of COLORS) for (const m of ['light', 'dark']) assert.ok(ratio(c[m].bg, c[m].fg) >= 4.5, `${c.name} ${m}`);
});
