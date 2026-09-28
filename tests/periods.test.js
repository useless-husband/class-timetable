import test from 'node:test';
import assert from 'node:assert/strict';
import { presetPeriods, toMinutes, fmtMinutes, isValidTime, slotRuns, normalizePeriodIds, rangeLabel, dayLabel, durationMinutes } from '../src/periods.js';

test('大學預設:0、1–10、A–D 共 15 節', () => {
  const p = presetPeriods('university');
  assert.deepEqual(p.map((x) => x.id), ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'A', 'B', 'C', 'D']);
  assert.equal(p[1].start, '08:10');
  assert.equal(p[14].end, '22:05');
});

test('高中預設:早自習 + 1–8 節,中午有午休空檔', () => {
  const p = presetPeriods('high');
  assert.equal(p.length, 9);
  assert.equal(p[0].label, '早自習');
  assert.equal(p[4].end, '12:00');
  assert.equal(p[5].start, '13:10');
});

test('預設節次每次都是新物件,修改不會污染下一次', () => {
  const a = presetPeriods('high');
  a[0].start = '01:00';
  assert.equal(presetPeriods('high')[0].start, '07:30');
});

test('未知預設回傳大學常見', () => {
  assert.equal(presetPeriods('nope').length, 15);
});

test('toMinutes / fmtMinutes 來回', () => {
  assert.equal(toMinutes('08:10'), 490);
  assert.equal(fmtMinutes(490), '08:10');
  assert.equal(fmtMinutes(toMinutes('22:05')), '22:05');
  assert.equal(toMinutes('00:00'), 0);
});

test('isValidTime 拒絕壞格式', () => {
  for (const bad of ['8:10', '24:00', '12:60', '', null, undefined, 830, '12-30']) {
    assert.equal(isValidTime(bad), false, String(bad));
    assert.ok(Number.isNaN(toMinutes(bad)));
  }
  assert.equal(isValidTime('23:59'), true);
});

test('durationMinutes', () => {
  assert.equal(durationMinutes({ start: '08:10', end: '09:00' }), 50);
});

test('slotRuns 把連續節次合併並算出起訖時間', () => {
  const p = presetPeriods('university');
  const runs = slotRuns({ day: 1, periods: ['2', '3', '4'] }, p);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].start, '09:10');
  assert.equal(runs[0].end, '12:10');
  assert.deepEqual(runs[0].ids, ['2', '3', '4']);
});

test('slotRuns 不連續會拆開,順序不影響結果', () => {
  const p = presetPeriods('university');
  const runs = slotRuns({ day: 3, periods: ['7', '2', '3', '10'] }, p);
  assert.deepEqual(runs.map((r) => [r.from, r.to]), [[2, 3], [7, 7], [10, 10]]);
});

test('slotRuns 忽略不存在的節次', () => {
  const p = presetPeriods('high');
  assert.deepEqual(slotRuns({ day: 1, periods: ['A', 'zz'] }, p), []);
});

test('高中午休前後(4 與 5 節)算連續,因為索引相鄰', () => {
  const p = presetPeriods('high');
  const runs = slotRuns({ day: 1, periods: ['4', '5'] }, p);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].start, '11:10');
  assert.equal(runs[0].end, '14:00');
});

test('normalizePeriodIds 去重、過濾、排序', () => {
  const p = presetPeriods('university');
  assert.deepEqual(normalizePeriodIds(['B', '3', '3', 'x', '1'], p), ['1', '3', 'B']);
  assert.deepEqual(normalizePeriodIds(null, p), []);
});

test('標籤文字', () => {
  const p = presetPeriods('high');
  assert.equal(rangeLabel(p, 1, 1), '第 1 節');
  assert.equal(rangeLabel(p, 1, 2), '1–2 節');
  assert.equal(rangeLabel(p, 0, 0), '早自習');
  assert.equal(dayLabel(7), '週日');
});
