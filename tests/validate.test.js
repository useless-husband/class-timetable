import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeTimetable, parseImport, wrapExport, cleanStr, LIMITS } from '../src/validate.js';
import { course, table } from './helpers.js';

test('合法課表通過並保留內容', () => {
  const t = table([course('a', '微積分', [{ day: 1, periods: ['2', '3'] }], { teacher: '王', color: 4 })]);
  const r = sanitizeTimetable(t);
  assert.equal(r.ok, true);
  assert.equal(r.value.courses[0].name, '微積分');
  assert.equal(r.value.courses[0].color, 4);
  assert.deepEqual(r.warnings, []);
});

test('非物件/陣列/null 直接失敗而不丟例外', () => {
  for (const bad of [null, undefined, 42, 'x', [], true]) assert.equal(sanitizeTimetable(bad).ok, false);
});

test('壞掉的節次會回到預設並警告', () => {
  const r = sanitizeTimetable({ name: 'x', periods: [{ id: '1', start: '9:00', end: '10:00' }], courses: [] });
  assert.equal(r.ok, true);
  assert.equal(r.value.periods.length, 15);
  assert.ok(r.warnings.length > 0);
});

test('節次結束早於開始、id 重複都視為壞資料', () => {
  const bad1 = [{ id: '1', label: '1', start: '10:00', end: '09:00' }];
  const bad2 = [{ id: '1', label: '1', start: '08:00', end: '09:00' }, { id: '1', label: '2', start: '09:00', end: '10:00' }];
  for (const periods of [bad1, bad2]) assert.equal(sanitizeTimetable({ periods }).value.periods.length, 15);
});

test('壞課程被略過、好的保留', () => {
  const r = sanitizeTimetable({ courses: [null, 5, { name: '' }, { name: '好課', slots: [] }, 'x'] });
  assert.equal(r.value.courses.length, 1);
  assert.equal(r.value.courses[0].name, '好課');
  assert.ok(r.warnings[0].includes('4'));
});

test('壞的時段(星期超出、節次不存在、型別錯誤)被清掉', () => {
  const r = sanitizeTimetable({
    courses: [{ name: 'X', slots: [{ day: 0, periods: ['1'] }, { day: 8, periods: ['1'] }, { day: 1.5, periods: ['1'] }, { day: '1', periods: ['1'] }, { day: 2, periods: ['zzz'] }, { day: 3, periods: 'oops' }, null, { day: 4, periods: ['1', 1, {}, '1'] }] }],
  });
  assert.deepEqual(r.value.courses[0].slots, [{ day: 4, periods: ['1'] }]);
});

test('學分、顏色範圍限制', () => {
  const r = sanitizeTimetable({ courses: [{ name: 'A', credits: -5, color: 99 }, { name: 'B', credits: 1e9, color: 'red' }, { name: 'C', credits: 2.3, color: 7 }, { name: 'D', credits: NaN }] });
  const [a, b, c, d] = r.value.courses;
  assert.deepEqual([a.credits, a.color], [0, 0]);
  assert.deepEqual([b.credits, b.color], [99, 0]);
  assert.deepEqual([c.credits, c.color], [2.5, 7]);
  assert.equal(d.credits, 0);
});

test('字串長度上限與控制字元', () => {
  assert.equal(cleanStr('a\u0000b\u0007c', 10), 'abc');
  assert.equal(cleanStr('x'.repeat(500), 10).length, 10);
  assert.equal(cleanStr('a\nb', 10), 'a b');
  assert.equal(cleanStr('a\nb', 10, true), 'a\nb');
  assert.equal(cleanStr(123, 10), '');
  const r = sanitizeTimetable({ name: 'n'.repeat(999), courses: [{ name: 'c'.repeat(999) }] });
  assert.equal(r.value.name.length, 40);
  assert.equal(r.value.courses[0].name.length, LIMITS.name);
});

test('課程數量超過上限會截斷', () => {
  const courses = Array.from({ length: 200 }, (_, i) => ({ name: 'c' + i }));
  const r = sanitizeTimetable({ courses });
  assert.equal(r.value.courses.length, LIMITS.courses);
});

test('重複的課程 id 會被改成唯一', () => {
  const r = sanitizeTimetable({ courses: [{ id: 'same', name: 'A' }, { id: 'same', name: 'B' }] });
  assert.notEqual(r.value.courses[0].id, r.value.courses[1].id);
});

test('原型污染的鍵不會進入結果', () => {
  const evil = JSON.parse('{"__proto__":{"polluted":1},"name":"x","courses":[{"name":"a","__proto__":{"polluted":2}}]}');
  const r = sanitizeTimetable(evil);
  assert.equal(r.ok, true);
  assert.equal({}.polluted, undefined);
  assert.equal(r.value.polluted, undefined);
});

test('parseImport:各種壞輸入都回傳 ok:false 而不是丟例外', () => {
  for (const bad of ['', '   ', '{oops', 'null', '[]', '123', '"str"', '{"format":"class-timetable","version":99}', undefined, null, 42]) {
    const r = parseImport(bad);
    assert.equal(r.ok, false, String(bad));
    assert.equal(typeof r.error, 'string');
  }
});

test('parseImport:匯出再匯入內容一致,並換新 id', () => {
  const t = table([course('a', '英文', [{ day: 2, periods: ['3'] }])]);
  const text = JSON.stringify(wrapExport(t));
  assert.equal(JSON.parse(text).timetable.id, undefined);
  const r = parseImport(text);
  assert.equal(r.ok, true);
  assert.notEqual(r.value.id, t.id);
  assert.deepEqual(r.value.courses[0].slots, [{ day: 2, periods: ['3'] }]);
  assert.equal(r.value.name, '測試');
});

test('parseImport:也接受沒有外框的純課表 JSON', () => {
  const r = parseImport(JSON.stringify({ name: '裸的', courses: [{ name: 'A' }] }));
  assert.equal(r.ok, true);
  assert.equal(r.value.name, '裸的');
});

test('parseImport:過大的檔案被拒絕', () => {
  assert.equal(parseImport('x'.repeat(2_000_001)).ok, false);
});
