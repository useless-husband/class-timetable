// 課表核心:格子占用、衝堂偵測、統計
import { indexMap, toMinutes, slotRuns, rangeLabel, dayLabel } from './periods.js';

export function visibleDays(tt) {
  let max = tt.dayEnd || 5;
  for (const c of tt.courses) for (const s of c.slots) if (s.day > max) max = s.day;
  return Array.from({ length: Math.min(max, 7) }, (_, i) => i + 1);
}

/** Map<"day|periodIndex", course[]> (同一門課在同格只算一次) */
export function cellMap(tt) {
  const idx = indexMap(tt.periods);
  const map = new Map();
  for (const c of tt.courses) {
    for (const s of c.slots) {
      for (const id of s.periods) {
        const i = idx.get(id);
        if (i === undefined) continue;
        const key = `${s.day}|${i}`;
        const arr = map.get(key) || [];
        if (!arr.includes(c)) arr.push(c);
        map.set(key, arr);
      }
    }
  }
  return map;
}

/**
 * 把每天連續且「內容相同」的格子合併成一個區塊,方便畫面與圖片繪製。
 * conflict = 該區塊內同一格有兩門以上課程。
 */
export function buildRuns(tt) {
  const map = cellMap(tt);
  const runs = [];
  for (const day of visibleDays(tt)) {
    let cur = null;
    for (let i = 0; i < tt.periods.length; i++) {
      const courses = map.get(`${day}|${i}`);
      if (!courses) { cur = null; continue; }
      const key = courses.map((c) => c.id).sort().join('+');
      if (cur && cur.key === key) cur.to = i;
      else {
        cur = { day, from: i, to: i, key, courses, conflict: courses.length > 1 };
        runs.push(cur);
      }
    }
  }
  return runs;
}

/** 衝堂清單:每組「兩門課 + 星期 + 重疊節次」 */
export function findConflicts(tt) {
  const map = cellMap(tt);
  const pairs = new Map();
  const keys = [...map.keys()].sort((a, b) => {
    const [d1, i1] = a.split('|').map(Number);
    const [d2, i2] = b.split('|').map(Number);
    return d1 - d2 || i1 - i2;
  });
  for (const key of keys) {
    const courses = map.get(key);
    if (courses.length < 2) continue;
    const [day, i] = key.split('|').map(Number);
    for (let x = 0; x < courses.length; x++) {
      for (let y = x + 1; y < courses.length; y++) {
        const k = `${courses[x].id}|${courses[y].id}|${day}`;
        let p = pairs.get(k);
        if (!p) { p = { a: courses[x], b: courses[y], day, indexes: [] }; pairs.set(k, p); }
        p.indexes.push(i);
      }
    }
  }
  return [...pairs.values()].map((p) => ({
    a: p.a,
    b: p.b,
    day: p.day,
    ids: p.indexes.map((i) => tt.periods[i].id),
    text: `${dayLabel(p.day)} ${runText(tt.periods, p.indexes)}`,
  }));
}

function runText(periods, indexes) {
  const parts = [];
  let from = indexes[0];
  let prev = from;
  for (const i of [...indexes.slice(1), Infinity]) {
    if (i !== prev + 1) { parts.push(rangeLabel(periods, from, prev)); from = i; }
    prev = i;
  }
  return parts.join('、');
}

/** 一個時段的人類可讀描述 */
export function describeSlot(slot, periods) {
  const runs = slotRuns(slot, periods);
  if (!runs.length) return `${dayLabel(slot.day)}(無節次)`;
  return runs.map((r) => `${dayLabel(slot.day)} ${rangeLabel(periods, r.from, r.to)} ${r.start}–${r.end}`).join('、');
}

export function stats(tt) {
  const map = cellMap(tt);
  const totalCredits = tt.courses.reduce((n, c) => n + (Number(c.credits) || 0), 0);
  const days = visibleDays(tt);
  const perDay = days.map((day) => {
    let periods = 0;
    let minutes = 0;
    for (let i = 0; i < tt.periods.length; i++) {
      if (map.has(`${day}|${i}`)) {
        periods++;
        minutes += toMinutes(tt.periods[i].end) - toMinutes(tt.periods[i].start);
      }
    }
    return { day, periods, minutes };
  });
  let earliest = null;
  let latest = null;
  for (const key of map.keys()) {
    const [day, i] = key.split('|').map(Number);
    const p = tt.periods[i];
    const s = toMinutes(p.start);
    const e = toMinutes(p.end);
    if (!earliest || s < earliest.minutes || (s === earliest.minutes && day < earliest.day)) earliest = { minutes: s, time: p.start, day };
    if (!latest || e > latest.minutes || (e === latest.minutes && day < latest.day)) latest = { minutes: e, time: p.end, day };
  }
  return {
    courseCount: tt.courses.length,
    totalCredits,
    perDay,
    totalPeriods: perDay.reduce((n, d) => n + d.periods, 0),
    earliest,
    latest,
  };
}
