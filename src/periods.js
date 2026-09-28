// 節次與時間計算(純函式,無 DOM 依賴)

const U = [
  ['0', '0', '07:10', '08:00'],
  ['1', '1', '08:10', '09:00'],
  ['2', '2', '09:10', '10:00'],
  ['3', '3', '10:20', '11:10'],
  ['4', '4', '11:20', '12:10'],
  ['5', '5', '12:20', '13:10'],
  ['6', '6', '13:20', '14:10'],
  ['7', '7', '14:20', '15:10'],
  ['8', '8', '15:30', '16:20'],
  ['9', '9', '16:30', '17:20'],
  ['10', '10', '17:30', '18:20'],
  ['A', 'A', '18:25', '19:15'],
  ['B', 'B', '19:20', '20:10'],
  ['C', 'C', '20:20', '21:10'],
  ['D', 'D', '21:15', '22:05'],
];

const H = [
  ['m', '早自習', '07:30', '08:10'],
  ['1', '1', '08:10', '09:00'],
  ['2', '2', '09:10', '10:00'],
  ['3', '3', '10:10', '11:00'],
  ['4', '4', '11:10', '12:00'],
  ['5', '5', '13:10', '14:00'],
  ['6', '6', '14:10', '15:00'],
  ['7', '7', '15:10', '16:00'],
  ['8', '8', '16:10', '17:00'],
];

export const PRESETS = {
  university: { name: '大學常見', rows: U },
  high: { name: '高中', rows: H },
};

const toPeriods = (rows) => rows.map(([id, label, start, end]) => ({ id, label, start, end }));

/** 取得預設節次(每次回傳新物件,可放心修改)。未知的 key 回傳大學常見。 */
export function presetPeriods(key) {
  return toPeriods((PRESETS[key] || PRESETS.university).rows);
}

export const DAY_CHARS = ['', '一', '二', '三', '四', '五', '六', '日'];
export const dayLabel = (d) => `週${DAY_CHARS[d] || '?'}`;

export function isValidTime(s) {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** "08:10" -> 490;格式不對回傳 NaN */
export function toMinutes(s) {
  if (!isValidTime(s)) return NaN;
  return Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
}

/** 490 -> "08:10" */
export function fmtMinutes(m) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

export const durationMinutes = (p) => toMinutes(p.end) - toMinutes(p.start);

/** id -> 位置索引 */
export function indexMap(periods) {
  const m = new Map();
  periods.forEach((p, i) => m.set(p.id, i));
  return m;
}

/** 節次 id 陣列去重、丟掉不存在的,並依節次順序排序 */
export function normalizePeriodIds(ids, periods) {
  const idx = indexMap(periods);
  const set = new Set();
  for (const id of ids || []) if (idx.has(id)) set.add(id);
  return [...set].sort((a, b) => idx.get(a) - idx.get(b));
}

/**
 * 把一個時段拆成「連續」的區塊。
 * 例如第 1、2、3、5 節 -> [1–3] 與 [5] 兩塊,各自有起訖時間。
 */
export function slotRuns(slot, periods) {
  const idx = indexMap(periods);
  const positions = [...new Set((slot.periods || []).map((id) => idx.get(id)).filter((i) => i !== undefined))].sort((a, b) => a - b);
  const runs = [];
  for (const i of positions) {
    const last = runs[runs.length - 1];
    if (last && last.to === i - 1) last.to = i;
    else runs.push({ from: i, to: i });
  }
  return runs.map((r) => ({
    from: r.from,
    to: r.to,
    start: periods[r.from].start,
    end: periods[r.to].end,
    ids: periods.slice(r.from, r.to + 1).map((p) => p.id),
  }));
}

/** 「3–4 節」或「早自習」之類的簡短標籤 */
export function rangeLabel(periods, from, to) {
  const a = periods[from].label;
  const b = periods[to].label;
  if (from === to) return /^\d+$|^[A-Za-z]$/.test(a) ? `第 ${a} 節` : a;
  return `${a}–${b} 節`;
}
