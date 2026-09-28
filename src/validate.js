// 匯入資料驗證:任何來源(JSON 檔、網址、localStorage)的資料都先過這裡
import { PRESETS, presetPeriods, isValidTime, toMinutes, normalizePeriodIds } from './periods.js';
import { clampColor } from './palette.js';

export const LIMITS = { periods: 30, courses: 150, slots: 14, name: 60 };
export const FORMAT = 'class-timetable';

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function cleanStr(v, max, multiline = false) {
  if (typeof v !== 'string') return '';
  let s = v.replace(CONTROL, '');
  if (!multiline) s = s.replace(/[\r\n\t]+/g, ' ');
  return s.trim().slice(0, max);
}

let counter = 0;
export function uid() {
  counter++;
  return Date.now().toString(36) + counter.toString(36) + Math.random().toString(36).slice(2, 6);
}

function sanitizePeriods(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > LIMITS.periods) return null;
  const seen = new Set();
  const out = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') return null;
    const id = cleanStr(p.id, 8);
    const label = cleanStr(p.label, 8) || id;
    if (!id || seen.has(id)) return null;
    if (!isValidTime(p.start) || !isValidTime(p.end)) return null;
    if (toMinutes(p.end) <= toMinutes(p.start)) return null;
    seen.add(id);
    out.push({ id, label, start: p.start, end: p.end });
  }
  return out;
}

function sanitizeCourse(raw, periods, usedIds) {
  if (!raw || typeof raw !== 'object') return null;
  const name = cleanStr(raw.name, LIMITS.name);
  if (!name) return null;
  let id = cleanStr(raw.id, 40);
  if (!id || usedIds.has(id)) id = uid();
  usedIds.add(id);
  const slots = [];
  if (Array.isArray(raw.slots)) {
    for (const s of raw.slots.slice(0, LIMITS.slots)) {
      if (!s || typeof s !== 'object') continue;
      if (!Number.isInteger(s.day) || s.day < 1 || s.day > 7) continue;
      const ids = normalizePeriodIds(Array.isArray(s.periods) ? s.periods.filter((x) => typeof x === 'string') : [], periods);
      if (ids.length) slots.push({ day: s.day, periods: ids });
    }
  }
  let credits = typeof raw.credits === 'number' && Number.isFinite(raw.credits) ? raw.credits : 0;
  credits = Math.min(99, Math.max(0, Math.round(credits * 2) / 2));
  return {
    id,
    name,
    teacher: cleanStr(raw.teacher, 40),
    room: cleanStr(raw.room, 40),
    credits,
    color: clampColor(raw.color),
    note: cleanStr(raw.note, 500, true),
    slots,
  };
}

/**
 * 驗證並整理一份課表。壞的欄位盡量補預設值,壞到無法救的回傳 ok:false。
 * @returns {{ok:true,value:object,warnings:string[]}|{ok:false,error:string}}
 */
export function sanitizeTimetable(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: '資料不是課表物件' };
  const warnings = [];
  const preset = raw.preset in PRESETS ? raw.preset : 'custom';
  let periods = sanitizePeriods(raw.periods);
  if (!periods) {
    if (raw.periods !== undefined) warnings.push('節次資料有誤,已改用「大學常見」');
    periods = presetPeriods('university');
  }
  const usedIds = new Set();
  const courses = [];
  const rawCourses = Array.isArray(raw.courses) ? raw.courses : [];
  if (rawCourses.length > LIMITS.courses) warnings.push(`課程超過 ${LIMITS.courses} 門,多的已忽略`);
  let dropped = 0;
  for (const c of rawCourses.slice(0, LIMITS.courses)) {
    const cc = sanitizeCourse(c, periods, usedIds);
    if (cc) courses.push(cc);
    else dropped++;
  }
  if (dropped) warnings.push(`有 ${dropped} 門課程資料不完整,已略過`);
  return {
    ok: true,
    warnings,
    value: {
      id: cleanStr(raw.id, 40) || uid(),
      name: cleanStr(raw.name, 40) || '我的課表',
      preset,
      dayEnd: [5, 6, 7].includes(raw.dayEnd) ? raw.dayEnd : 5,
      periods,
      courses,
    },
  };
}

/** 匯出用外框 */
export function wrapExport(tt) {
  const { id, ...rest } = tt;
  return { format: FORMAT, version: 1, timetable: rest };
}

/** 解析使用者選的 JSON 檔文字 */
export function parseImport(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: '檔案是空的' };
  if (text.length > 2_000_000) return { ok: false, error: '檔案太大' };
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: '不是有效的 JSON' };
  }
  if (data && typeof data === 'object' && data.format === FORMAT) {
    if (data.version !== 1) return { ok: false, error: `不支援的版本:${String(data.version).slice(0, 10)}` };
    data = data.timetable;
  }
  const r = sanitizeTimetable(data);
  if (r.ok) r.value.id = uid();
  return r;
}
