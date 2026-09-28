// localStorage 存取(儲存空間以參數傳入,方便測試)
import { presetPeriods } from './periods.js';
import { sanitizeTimetable, uid } from './validate.js';

export const KEY = 'class-timetable:v1';

export function createTimetable(name = '我的課表', preset = 'university') {
  return { id: uid(), name, preset, dayEnd: 5, periods: presetPeriods(preset), courses: [] };
}

export function freshStore() {
  const t = createTimetable();
  return { activeId: t.id, tables: [t] };
}

export function loadStore(storage) {
  try {
    const text = storage.getItem(KEY);
    if (!text) return freshStore();
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.tables)) return freshStore();
    const tables = [];
    const ids = new Set();
    for (const raw of data.tables.slice(0, 50)) {
      const r = sanitizeTimetable(raw);
      if (!r.ok) continue;
      if (ids.has(r.value.id)) r.value.id = uid();
      ids.add(r.value.id);
      tables.push(r.value);
    }
    if (!tables.length) return freshStore();
    const activeId = tables.some((t) => t.id === data.activeId) ? data.activeId : tables[0].id;
    return { activeId, tables };
  } catch {
    return freshStore();
  }
}

export function saveStore(storage, store) {
  try {
    storage.setItem(KEY, JSON.stringify({ activeId: store.activeId, tables: store.tables }));
    return true;
  } catch {
    return false;
  }
}
