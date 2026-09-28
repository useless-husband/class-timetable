import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStore, saveStore, KEY, createTimetable } from '../src/store.js';
import { wrapText, measureTimetable, drawTimetable } from '../src/render.js';
import { course, table } from './helpers.js';

class MemStorage {
  constructor(init = {}) { this.m = new Map(Object.entries(init)); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
}

test('空的儲存空間 -> 一份預設課表', () => {
  const s = loadStore(new MemStorage());
  assert.equal(s.tables.length, 1);
  assert.equal(s.activeId, s.tables[0].id);
});

test('儲存後讀回,多份課表與目前選擇都保留', () => {
  const st = new MemStorage();
  const a = createTimetable('大二上');
  const b = createTimetable('大二下', 'high');
  b.courses = [course('x', '國文', [{ day: 1, periods: ['1'] }])];
  assert.equal(saveStore(st, { activeId: b.id, tables: [a, b] }), true);
  const s = loadStore(st);
  assert.deepEqual(s.tables.map((t) => t.name), ['大二上', '大二下']);
  assert.equal(s.activeId, b.id);
  assert.equal(s.tables[1].courses[0].name, '國文');
});

test('儲存空間內容損壞 -> 不壞掉,回到預設', () => {
  for (const junk of ['{oops', 'null', '{"tables":5}', '{"tables":[]}', '{"tables":[null,1]}', '[]']) {
    const s = loadStore(new MemStorage({ [KEY]: junk }));
    assert.equal(s.tables.length, 1, junk);
  }
});

test('activeId 指向不存在的課表 -> 改選第一份;重複 id 會被修正', () => {
  const a = createTimetable('A');
  const b = { ...createTimetable('B'), id: a.id };
  const s = loadStore(new MemStorage({ [KEY]: JSON.stringify({ activeId: 'gone', tables: [a, b] }) }));
  assert.equal(s.activeId, a.id);
  assert.notEqual(s.tables[0].id, s.tables[1].id);
});

test('儲存空間拋例外(滿了/被禁用)時不壞', () => {
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  assert.equal(saveStore(bad, { activeId: 'x', tables: [] }), false);
  assert.equal(loadStore(bad).tables.length, 1);
});

test('wrapText:中文逐字換行、換行符、空字串', () => {
  const m = (s) => [...s].length * 10;
  assert.deepEqual(wrapText(m, '普通物理學實驗', 40), ['普通物理', '學實驗']);
  assert.deepEqual(wrapText(m, 'a\nb', 100), ['a', 'b']);
  assert.deepEqual(wrapText(m, '', 100), ['']);
});

test('measureTimetable 高度隨節次數增加', () => {
  const u = measureTimetable(table([], 'university'));
  const h = measureTimetable(table([], 'high'));
  assert.ok(u.height > h.height);
  assert.equal(u.width, 1600);
});

test('drawTimetable 用假 context 畫一遍不會丟例外,且畫出課名', () => {
  const texts = [];
  const ctx = new Proxy({}, {
    get: (t, k) => {
      if (k === 'measureText') return (s) => ({ width: [...String(s)].length * 12 });
      if (k === 'fillText') return (s) => texts.push(s);
      if (k in t) return t[k];
      return () => {};
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const tt = table([
    course('a', '微積分', [{ day: 1, periods: ['2', '3'] }], { room: '數館101', teacher: '王' }),
    course('b', '物理', [{ day: 1, periods: ['3'] }]),
    course('c', '週六活動', [{ day: 6, periods: ['1'] }]),
  ]);
  const size = drawTimetable(ctx, tt, { theme: 'dark' });
  assert.equal(size.width, 1600);
  assert.ok(texts.includes('微積分'));
  assert.ok(texts.includes('週六'));
  assert.ok(texts.includes('衝堂'));
});
