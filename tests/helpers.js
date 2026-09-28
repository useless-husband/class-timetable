import { createTimetable } from '../src/store.js';

export function course(id, name, slots, extra = {}) {
  return { id, name, teacher: '', room: '', credits: 3, color: 0, note: '', slots, ...extra };
}

export function table(courses = [], preset = 'university') {
  const t = createTimetable('測試', preset);
  t.courses = courses;
  return t;
}
