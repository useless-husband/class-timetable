import test from 'node:test';
import assert from 'node:assert/strict';
import { buildICS, escapeText, foldLine, firstOccurrence, parseDate, defaultSemester } from '../src/ics.js';
import { course, table } from './helpers.js';

const NOW = new Date(Date.UTC(2026, 8, 1, 3, 4, 5));
const opt = { start: '2026-09-14', end: '2027-01-15', now: NOW };

test('所有行尾都是 CRLF,沒有單獨的 LF', () => {
  const ics = buildICS(table([course('a', '微積分', [{ day: 1, periods: ['2', '3'] }])]), opt);
  assert.ok(ics.endsWith('\r\n'));
  assert.equal(ics.replace(/\r\n/g, '').includes('\n'), false);
  assert.equal(ics.split('\r\n')[0], 'BEGIN:VCALENDAR');
});

test('DTSTART/DTEND 使用 Asia/Taipei,時間由首尾節次決定', () => {
  const ics = buildICS(table([course('a', '微積分', [{ day: 1, periods: ['2', '3'] }])]), opt);
  assert.match(ics, /DTSTART;TZID=Asia\/Taipei:20260914T091000\r\n/);
  assert.match(ics, /DTEND;TZID=Asia\/Taipei:20260914T111000\r\n/);
  assert.match(ics, /TZID:Asia\/Taipei\r\n/);
});

test('RRULE 每週重複、BYDAY 正確、UNTIL 為結束日當天(UTC)', () => {
  const ics = buildICS(table([course('a', 'A', [{ day: 3, periods: ['1'] }])]), opt);
  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=WE;UNTIL=20270115T155959Z\r\n/);
  assert.match(ics, /DTSTART;TZID=Asia\/Taipei:20260916T081000/); // 9/14 是週一,週三是 9/16
});

test('週日課:BYDAY=SU,首次日期正確', () => {
  const ics = buildICS(table([course('a', 'A', [{ day: 7, periods: ['1'] }])]), opt);
  assert.match(ics, /BYDAY=SU/);
  assert.match(ics, /DTSTART;TZID=Asia\/Taipei:20260920T081000/);
});

test('不連續節次產生多個事件', () => {
  const ics = buildICS(table([course('a', 'A', [{ day: 1, periods: ['1', '2', '5'] }])]), opt);
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 2);
});

test('一週多個時段各自產生事件,UID 不重複', () => {
  const ics = buildICS(table([course('a', 'A', [{ day: 1, periods: ['1'] }, { day: 4, periods: ['1'] }])]), opt);
  const uids = ics.match(/UID:.*\r\n/g);
  assert.equal(new Set(uids).size, 2);
});

test('特殊字元跳脫:逗號、分號、反斜線、換行', () => {
  assert.equal(escapeText('a,b;c\\d\ne'), 'a\\,b\;c\\\\d\\ne');
  const c = course('a', '數學,線代;進階', [{ day: 1, periods: ['1'] }], { room: '工程館 A,101', note: '第一行\n第二行', teacher: '王老師' });
  const ics = buildICS(table([c]), opt);
  assert.match(ics, /SUMMARY:數學\\,線代\;進階\r\n/);
  assert.match(ics, /LOCATION:工程館 A\\,101\r\n/);
  assert.match(ics, /第一行\\n第二行/);
});

test('折行:每行最多 75 位元組,續行以空白開頭,還原後內容一致', () => {
  const long = '很長的課程名稱'.repeat(20);
  const line = 'SUMMARY:' + long;
  const folded = foldLine(line);
  const parts = folded.split('\r\n');
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(new TextEncoder().encode(p).length <= 75, p);
  for (const p of parts.slice(1)) assert.ok(p.startsWith(' '));
  assert.equal(parts.map((p, i) => (i ? p.slice(1) : p)).join(''), line);
});

test('短行不折', () => {
  assert.equal(foldLine('SUMMARY:短'), 'SUMMARY:短');
});

test('折行不會切斷多位元組字元(含表情符號)', () => {
  const folded = foldLine('X'.repeat(73) + '😀😀');
  const rebuilt = folded.split('\r\n').map((p, i) => (i ? p.slice(1) : p)).join('');
  assert.equal(rebuilt, 'X'.repeat(73) + '😀😀');
});

test('起訖日期錯誤會丟例外', () => {
  const t = table([]);
  assert.throws(() => buildICS(t, { start: '2026-13-01', end: '2027-01-01' }));
  assert.throws(() => buildICS(t, { start: '2027-02-01', end: '2027-01-01' }));
  assert.throws(() => buildICS(t, { start: '', end: '' }));
});

test('學期太短、首次上課日已超過結束日就不產生該事件', () => {
  const ics = buildICS(table([course('a', 'A', [{ day: 5, periods: ['1'] }])]), { start: '2026-09-14', end: '2026-09-15', now: NOW });
  assert.equal(ics.includes('BEGIN:VEVENT'), false);
});

test('parseDate 驗證真實日期,firstOccurrence 從起始日當天算起', () => {
  assert.equal(parseDate('2026-02-30'), null);
  assert.ok(parseDate('2028-02-29'));
  const mon = parseDate('2026-09-14');
  assert.equal(firstOccurrence(mon, 1).toISOString().slice(0, 10), '2026-09-14');
  assert.equal(firstOccurrence(mon, 7).toISOString().slice(0, 10), '2026-09-20');
});

test('defaultSemester 依月份猜學期', () => {
  assert.deepEqual(defaultSemester(new Date(2026, 9, 5)), { start: '2026-09-14', end: '2027-01-16' });
  assert.deepEqual(defaultSemester(new Date(2027, 0, 5)), { start: '2026-09-14', end: '2027-01-16' });
  assert.deepEqual(defaultSemester(new Date(2027, 2, 5)), { start: '2027-02-16', end: '2027-06-20' });
});
