import test from 'node:test';
import assert from 'node:assert/strict';
import { findConflicts, buildRuns, stats, visibleDays, describeSlot, cellMap } from '../src/schedule.js';
import { course, table } from './helpers.js';

const A = course('a', '微積分', [{ day: 1, periods: ['2', '3'] }], { credits: 3 });
const B = course('b', '普通物理', [{ day: 1, periods: ['3', '4'] }], { credits: 4 });
const C = course('c', '英文', [{ day: 2, periods: ['3'] }], { credits: 2 });

test('相同星期且節次重疊 = 衝堂', () => {
  const c = findConflicts(table([A, B]));
  assert.equal(c.length, 1);
  assert.equal(c[0].a.id, 'a');
  assert.equal(c[0].b.id, 'b');
  assert.deepEqual(c[0].ids, ['3']);
  assert.equal(c[0].text, '週一 第 3 節');
});

test('不同天、或節次相鄰但不重疊,不算衝堂', () => {
  assert.equal(findConflicts(table([A, C])).length, 0);
  const D = course('d', '化學', [{ day: 1, periods: ['4', '5'] }]);
  assert.equal(findConflicts(table([A, D])).length, 0);
});

test('三門課擠同一格會產生三組衝突', () => {
  const X = course('x', 'X', [{ day: 1, periods: ['3'] }]);
  assert.equal(findConflicts(table([A, B, X])).length, 3);
});

test('同一門課自己兩個時段重疊,不算衝堂', () => {
  const S = course('s', '自己', [{ day: 1, periods: ['2'] }, { day: 1, periods: ['2', '3'] }]);
  assert.equal(findConflicts(table([S])).length, 0);
});

test('多節重疊會列出全部重疊節次', () => {
  const P = course('p', 'P', [{ day: 4, periods: ['5', '6', '7'] }]);
  const Q = course('q', 'Q', [{ day: 4, periods: ['6', '7', '8'] }]);
  const c = findConflicts(table([P, Q]));
  assert.deepEqual(c[0].ids, ['6', '7']);
  assert.equal(c[0].text, '週四 6–7 節');
});

test('buildRuns 合併連續格,衝突格獨立成區塊', () => {
  const runs = buildRuns(table([A, B]));
  const d1 = runs.filter((r) => r.day === 1);
  assert.deepEqual(d1.map((r) => [r.from, r.to, r.conflict]), [[2, 2, false], [3, 3, true], [4, 4, false]]);
});

test('visibleDays 預設一到五,有週六課自動顯示', () => {
  assert.deepEqual(visibleDays(table([A])), [1, 2, 3, 4, 5]);
  const Sat = course('s', '週六課', [{ day: 6, periods: ['1'] }]);
  assert.deepEqual(visibleDays(table([Sat])), [1, 2, 3, 4, 5, 6]);
  const t = table([]);
  t.dayEnd = 7;
  assert.equal(visibleDays(t).length, 7);
});

test('統計:總學分、每天節數與時數、最早最晚', () => {
  const s = stats(table([A, B, C]));
  assert.equal(s.totalCredits, 9);
  assert.equal(s.courseCount, 3);
  assert.deepEqual(s.perDay[0], { day: 1, periods: 3, minutes: 150 }); // 第 2、3、4 節,衝堂格只算一次
  assert.equal(s.perDay[1].periods, 1);
  assert.equal(s.earliest.time, '09:10');
  assert.equal(s.latest.time, '12:10');
  assert.equal(s.totalPeriods, 4);
});

test('統計:空課表', () => {
  const s = stats(table([]));
  assert.equal(s.totalCredits, 0);
  assert.equal(s.earliest, null);
  assert.equal(s.latest, null);
});

test('統計:夜間節次為最晚', () => {
  const N = course('n', '夜間部', [{ day: 3, periods: ['0', 'D'] }]);
  const s = stats(table([N]));
  assert.equal(s.earliest.time, '07:10');
  assert.equal(s.latest.time, '22:05');
  assert.equal(s.earliest.day, 3);
});

test('describeSlot', () => {
  const p = table([]).periods;
  assert.equal(describeSlot({ day: 2, periods: ['3', '4'] }, p), '週二 3–4 節 10:20–12:10');
});

test('cellMap 忽略不存在的節次', () => {
  const Z = course('z', 'Z', [{ day: 1, periods: ['nope'] }]);
  assert.equal(cellMap(table([Z])).size, 0);
});
