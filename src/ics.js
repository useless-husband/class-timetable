// 產生 iCalendar (.ics):每門課的每個連續節次區塊 = 一個每週重複事件
import { slotRuns } from './periods.js';

const BYDAY = ['', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const TZ = 'Asia/Taipei';

export function escapeText(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

const byteLen = (ch) => new TextEncoder().encode(ch).length;

/** 依 RFC 5545 折行:每行(不含 CRLF)最多 75 位元組,續行以空白開頭;不會切斷多位元組字元 */
export function foldLine(line) {
  const out = [];
  let cur = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = byteLen(ch);
    if (bytes + b > limit) {
      out.push(cur);
      cur = ' ';
      bytes = 1;
      limit = 75;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

export function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return d;
}

const ymd = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;

/** 從 startDate 起(含)第一個符合星期的日期。day: 1=週一 … 7=週日 */
export function firstOccurrence(start, day) {
  const target = day % 7; // JS: 0=週日
  const offset = (target - start.getUTCDay() + 7) % 7;
  return new Date(start.getTime() + offset * 86400000);
}

function utcStamp(now) {
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
}

/** 依今天猜學期起訖(2–6 月為下學期,其餘為上學期) */
export function defaultSemester(today = new Date()) {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  if (m >= 2 && m <= 7) return { start: `${y}-02-16`, end: `${y}-06-20` };
  const sy = m === 1 ? y - 1 : y;
  return { start: `${sy}-09-14`, end: `${sy + 1}-01-16` };
}

const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${TZ}`,
  'BEGIN:STANDARD',
  'DTSTART:19700101T000000',
  'TZOFFSETFROM:+0800',
  'TZOFFSETTO:+0800',
  'TZNAME:CST',
  'END:STANDARD',
  'END:VTIMEZONE',
];

/**
 * @param {object} tt 課表
 * @param {{start:string,end:string,now?:Date}} opt start/end 為 YYYY-MM-DD
 * @returns {string} 以 CRLF 分行的 ICS 文字
 */
export function buildICS(tt, { start, end, now = new Date() }) {
  const s = parseDate(start);
  const e = parseDate(end);
  if (!s || !e) throw new Error('日期格式不正確');
  if (e < s) throw new Error('結束日期不能早於開始日期');
  // UNTIL 要用 UTC:台北 23:59:59 (UTC+8,無日光節約) = 同一天 15:59:59Z
  const untilUtc = `${ymd(e)}T155959Z`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//useless-husband//class-timetable//ZH-TW',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(tt.name)}`,
    `X-WR-TIMEZONE:${TZ}`,
    ...VTIMEZONE,
  ];
  const stamp = utcStamp(now);
  for (const c of tt.courses) {
    c.slots.forEach((slot, si) => {
      slotRuns(slot, tt.periods).forEach((run, ri) => {
        const first = firstOccurrence(s, slot.day);
        if (first > e) return;
        const d = ymd(first);
        const desc = [c.teacher && `老師:${c.teacher}`, c.credits ? `學分:${c.credits}` : '', c.note].filter(Boolean).join('\n');
        lines.push(
          'BEGIN:VEVENT',
          `UID:${c.id}-${si}-${ri}@class-timetable`,
          `DTSTAMP:${stamp}`,
          `DTSTART;TZID=${TZ}:${d}T${run.start.replace(':', '')}00`,
          `DTEND;TZID=${TZ}:${d}T${run.end.replace(':', '')}00`,
          `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[slot.day]};UNTIL=${untilUtc}`,
          `SUMMARY:${escapeText(c.name)}`,
        );
        if (c.room) lines.push(`LOCATION:${escapeText(c.room)}`);
        if (desc) lines.push(`DESCRIPTION:${escapeText(desc)}`);
        lines.push('END:VEVENT');
      });
    });
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
