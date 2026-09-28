// 介面層:把 store / schedule / ics / share / render 接到 DOM 上
import { PRESETS, presetPeriods, dayLabel, DAY_CHARS, rangeLabel } from './periods.js';
import { COLORS } from './palette.js';
import { visibleDays, buildRuns, findConflicts, stats, describeSlot } from './schedule.js';
import { loadStore, saveStore, createTimetable } from './store.js';
import { sanitizeTimetable, parseImport, wrapExport, uid, cleanStr } from './validate.js';
import { buildICS, defaultSemester } from './ics.js';
import { shareURL, decodeShare, codeFromHash } from './share.js';
import { drawTimetable, measureTimetable } from './render.js';

const $ = (id) => document.getElementById(id);
const store = loadStore(localStorage);
let preview = null; // 分享連結預覽中的課表(唯讀)

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k in e && k !== 'list') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return e;
}

const current = () => preview || store.tables.find((t) => t.id === store.activeId);
const readonly = () => !!preview;

function persist() { if (!preview && !saveStore(localStorage, store)) toast('無法寫入瀏覽器儲存空間,請用「匯出 JSON」備份'); }
function commit() { persist(); render(); }

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const safeName = (s) => (s || '課表').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40);

/* ---------- 主畫面 ---------- */
function render() {
  const tt = current();
  const ro = readonly();
  document.title = `${tt.name} - 課表產生器`;
  $('banner').hidden = !ro;
  $('tableBar').hidden = ro;
  $('editTools').hidden = ro;
  $('btnImport').hidden = ro;
  $('hint').hidden = ro;
  $('printTitle').textContent = tt.name;

  const sel = $('tableSelect');
  sel.replaceChildren(...store.tables.map((t) => el('option', { value: t.id, selected: t.id === store.activeId }, t.name)));
  $('btnDelTable').disabled = store.tables.length <= 1;
  $('presetSelect').value = tt.preset;
  $('dayEndSelect').value = String(tt.dayEnd);

  renderGrid(tt, ro);
  renderSide(tt, ro);
}

function renderGrid(tt, ro) {
  const days = visibleDays(tt);
  const g = $('grid');
  g.classList.toggle('compact', days.length >= 6);
  g.style.gridTemplateColumns = `minmax(44px, auto) repeat(${days.length}, minmax(0, 1fr))`;
  g.style.gridTemplateRows = `auto repeat(${tt.periods.length}, minmax(48px, auto))`;
  g.style.setProperty('--rows', tt.periods.length);
  const runs = buildRuns(tt);
  const covered = new Set();
  for (const r of runs) for (let i = r.from; i <= r.to; i++) covered.add(`${r.day}|${i}`);

  const kids = [el('div', { class: 'gh corner', style: 'grid-row:1;grid-column:1' })];
  days.forEach((d, i) => kids.push(el('div', { class: 'gh', style: `grid-row:1;grid-column:${i + 2}` }, dayLabel(d))));
  tt.periods.forEach((p, i) =>
    kids.push(el('div', { class: 'gp', style: `grid-row:${i + 2};grid-column:1` }, el('b', {}, p.label), el('small', {}, p.start), el('small', {}, p.end))),
  );
  tt.periods.forEach((p, i) => {
    days.forEach((d, c) => {
      if (covered.has(`${d}|${i}`)) return;
      const pos = `grid-row:${i + 2};grid-column:${c + 2}`;
      if (ro) kids.push(el('div', { class: 'empty', style: pos }));
      else
        kids.push(el('button', { type: 'button', class: 'empty', style: pos, 'aria-label': `${dayLabel(d)} ${p.label} 節,新增課程`, onclick: () => openCourse(null, { day: d, period: p.id }) }, '+'));
    });
  });
  for (const r of runs) {
    const c = days.indexOf(r.day) + 2;
    const pos = `grid-row:${r.from + 2} / span ${r.to - r.from + 1};grid-column:${c}`;
    const first = r.courses[0];
    const label = `${dayLabel(r.day)} ${rangeLabel(tt.periods, r.from, r.to)}:${r.courses.map((x) => x.name).join('、')}${r.conflict ? '(衝堂)' : ''}`;
    const inner = [];
    if (r.conflict) inner.push(el('span', { class: 'tag' }, '衝堂'));
    for (const course of r.courses) {
      inner.push(el('span', { class: 'n' }, course.name));
      if (!r.conflict) {
        if (course.room) inner.push(el('span', { class: 's' }, course.room));
        if (course.teacher) inner.push(el('span', { class: 's' }, course.teacher));
      }
    }
    const attrs = { class: 'run' + (r.conflict ? ' conflict' : ''), 'data-color': first.color, style: pos, 'aria-label': label, title: label };
    if (ro) kids.push(el('div', attrs, inner));
    else kids.push(el('button', { ...attrs, type: 'button', onclick: () => openCourse(first.id) }, inner));
  }
  g.replaceChildren(...kids);
}

function fmtHours(min) {
  const h = min / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} 小時`;
}

function renderSide(tt, ro) {
  const st = stats(tt);
  const row = (k, v) => el('tr', {}, el('th', { scope: 'row' }, k), el('td', {}, v));
  const rows = [row('課程數', `${st.courseCount} 門`), row('總學分', `${st.totalCredits} 學分`), row('每週總節數', `${st.totalPeriods} 節`)];
  rows.push(row('最早上課', st.earliest ? `${dayLabel(st.earliest.day)} ${st.earliest.time}` : '-'));
  rows.push(row('最晚下課', st.latest ? `${dayLabel(st.latest.day)} ${st.latest.time}` : '-'));
  $('stats').replaceChildren(
    el('table', { class: 'stat' }, el('tbody', {}, rows)),
    el('p', { class: 'stat-h' }, '每天上課時數'),
    el('table', { class: 'stat' }, el('tbody', {}, st.perDay.map((d) => row(dayLabel(d.day), d.periods ? `${d.periods} 節 / ${fmtHours(d.minutes)}` : '沒課')))),
  );

  const conflicts = findConflicts(tt);
  $('conflicts').replaceChildren(
    conflicts.length
      ? el('ul', { class: 'conflict-list' }, conflicts.map((c) => el('li', {}, el('strong', {}, `${c.a.name}`), ' 與 ', el('strong', {}, `${c.b.name}`), el('br'), c.text)))
      : el('p', { class: 'none' }, '沒有衝堂。'),
  );

  const list = $('courseList');
  if (!tt.courses.length) { list.replaceChildren(el('li', { class: 'none' }, '還沒有課程。點課表上的空格,或按「新增課程」。')); return; }
  list.replaceChildren(
    ...tt.courses.map((c) => {
      const body = [
        el('span', { class: 'dot', 'data-color': c.color }),
        el('span', {}, el('strong', {}, c.name), el('small', {}, [c.teacher, c.room, c.credits ? `${c.credits} 學分` : ''].filter(Boolean).join(' ・ ')), ...c.slots.map((s) => el('small', {}, describeSlot(s, tt.periods)))),
      ];
      return el('li', {}, ro ? el('div', { class: 'item' }, body) : el('button', { type: 'button', onclick: () => openCourse(c.id) }, body));
    }),
  );
}

/* ---------- 對話框 ---------- */
const dlg = $('dlg');
function openDialog(...content) {
  dlg.replaceChildren(...content);
  if (!dlg.open) dlg.showModal();
}
const closeDialog = () => dlg.open && dlg.close();

function field(label, input) {
  return el('label', { class: 'field' }, label, input);
}

function openCourse(id, prefill) {
  const tt = current();
  const existing = id ? tt.courses.find((c) => c.id === id) : null;
  const draft = existing
    ? { ...existing, slots: existing.slots.map((s) => ({ day: s.day, periods: new Set(s.periods) })) }
    : { name: '', teacher: '', room: '', credits: 3, color: tt.courses.length % COLORS.length, note: '', slots: [{ day: prefill?.day || 1, periods: new Set(prefill?.period ? [prefill.period] : []) }] };

  const name = el('input', { type: 'text', required: true, maxLength: 60, value: draft.name, autocomplete: 'off' });
  const teacher = el('input', { type: 'text', maxLength: 40, value: draft.teacher });
  const room = el('input', { type: 'text', maxLength: 40, value: draft.room });
  const credits = el('input', { type: 'number', min: 0, max: 99, step: 0.5, value: draft.credits, inputMode: 'decimal' });
  const note = el('textarea', { maxLength: 500 }, draft.note);
  const err = el('p', { class: 'err', role: 'alert' });
  const slotBox = el('div', { class: 'slots' });
  let color = draft.color;

  const swatches = el('fieldset', {}, el('legend', {}, '顏色'), el('div', { class: 'swatches' }, COLORS.map((c, i) =>
    el('label', { class: 'swatch', title: c.name }, el('input', { type: 'radio', name: 'color', value: i, checked: i === color, 'aria-label': c.name, onchange: () => { color = i; } }), el('span', { 'data-color': i }, c.name)),
  )));

  function drawSlots() {
    slotBox.replaceChildren(...draft.slots.map((s, si) => {
      const daySel = el('select', { 'aria-label': '星期', onchange: (e) => { s.day = +e.target.value; } },
        [1, 2, 3, 4, 5, 6, 7].map((d) => el('option', { value: d, selected: d === s.day }, dayLabel(d))));
      const chips = el('div', { class: 'chips' }, tt.periods.map((p) =>
        el('label', { class: 'chip', title: `${p.start}–${p.end}` }, el('input', { type: 'checkbox', checked: s.periods.has(p.id), 'aria-label': `${dayLabel(s.day)} ${p.label} 節 ${p.start}`, onchange: (e) => { e.target.checked ? s.periods.add(p.id) : s.periods.delete(p.id); } }), el('span', {}, p.label))));
      return el('div', { class: 'slot' },
        el('div', { class: 'head' }, el('strong', {}, `時段 ${si + 1}`), daySel,
          draft.slots.length > 1 ? el('button', { type: 'button', onclick: () => { draft.slots.splice(si, 1); drawSlots(); } }, '移除') : null),
        chips);
    }));
  }
  drawSlots();

  const form = el('form', { method: 'dialog', onsubmit: (e) => {
    e.preventDefault();
    const slots = draft.slots.filter((s) => s.periods.size).map((s) => ({ day: s.day, periods: [...s.periods] }));
    if (!name.value.trim()) { err.textContent = '請輸入課名'; name.focus(); return; }
    if (!slots.length) { err.textContent = '至少要選一個節次'; return; }
    const data = { name: name.value, teacher: teacher.value, room: room.value, credits: parseFloat(credits.value) || 0, color, note: note.value, slots };
    const r = sanitizeTimetable({ ...tt, courses: [{ ...data, id: existing?.id }] });
    const clean = r.value.courses[0];
    if (!clean) { err.textContent = '課程資料有問題'; return; }
    if (existing) Object.assign(existing, clean);
    else tt.courses.push({ ...clean, id: uid() });
    closeDialog();
    commit();
    const n = findConflicts(tt).filter((c) => c.a.id === (existing?.id || tt.courses.at(-1).id) || c.b.id === (existing?.id || tt.courses.at(-1).id)).length;
    toast(n ? `已儲存,但和其他課衝堂(${n} 處)` : '已儲存');
  } },
    el('h2', {}, existing ? '編輯課程' : '新增課程'),
    field('課名', name),
    el('div', { class: 'two' }, field('老師', teacher), field('教室', room)),
    el('div', { class: 'two' }, field('學分', credits), el('div')),
    swatches,
    el('fieldset', {}, el('legend', {}, '上課時段(可多個)'), slotBox,
      el('p', {}, el('button', { type: 'button', onclick: () => { draft.slots.push({ day: 1, periods: new Set() }); drawSlots(); } }, '再加一個時段'))),
    field('備註', note),
    err,
    el('div', { class: 'actions' },
      existing ? el('button', { type: 'button', class: 'danger left', onclick: () => {
        if (!confirm(`確定刪除「${existing.name}」?`)) return;
        tt.courses.splice(tt.courses.indexOf(existing), 1);
        closeDialog(); commit(); toast('已刪除');
      } }, '刪除') : null,
      el('button', { type: 'button', onclick: closeDialog }, '取消'),
      el('button', { type: 'submit', class: 'primary' }, '儲存')),
  );
  openDialog(form);
  name.focus();
}

function openPeriods() {
  const tt = current();
  const rows = tt.periods.map((p) => ({ ...p }));
  const err = el('p', { class: 'err', role: 'alert' });
  const body = el('tbody');
  function draw() {
    body.replaceChildren(...rows.map((r, i) => el('tr', {},
      el('td', {}, el('input', { type: 'text', value: r.label, maxLength: 8, 'aria-label': `第 ${i + 1} 列名稱`, oninput: (e) => { r.label = e.target.value; } })),
      el('td', {}, el('input', { type: 'time', value: r.start, required: true, 'aria-label': `${r.label} 開始`, oninput: (e) => { r.start = e.target.value; } })),
      el('td', {}, el('input', { type: 'time', value: r.end, required: true, 'aria-label': `${r.label} 結束`, oninput: (e) => { r.end = e.target.value; } })),
      el('td', {}, el('button', { type: 'button', 'aria-label': `刪除 ${r.label}`, disabled: rows.length <= 1, onclick: () => { rows.splice(i, 1); draw(); } }, '刪')))));
  }
  draw();
  const form = el('form', { method: 'dialog', onsubmit: (e) => {
    e.preventDefault();
    const next = rows.map((r, i) => ({ id: r.id || `p${i}-${uid().slice(-4)}`, label: r.label.trim() || r.id, start: r.start, end: r.end }));
    const r = sanitizeTimetable({ ...tt, periods: next, preset: 'custom' });
    if (r.warnings.some((w) => w.startsWith('節次'))) { err.textContent = '每一節都要有開始與結束時間,而且結束要晚於開始'; return; }
    tt.periods = r.value.periods;
    tt.preset = 'custom';
    tt.courses = r.value.courses; // 已移除不存在的節次
    closeDialog(); commit(); toast('節次時間已更新');
  } },
    el('h2', {}, '編輯節次時間'),
    el('div', { class: 'scroll' }, el('table', { class: 'ptable' }, el('thead', {}, el('tr', {}, el('th', {}, '名稱'), el('th', {}, '開始'), el('th', {}, '結束'), el('th'))), body)),
    el('div', { class: 'row' },
      el('button', { type: 'button', onclick: () => { const last = rows.at(-1); rows.push({ id: '', label: String(rows.length), start: last?.end || '08:00', end: last?.end || '08:50' }); draw(); } }, '新增一節'),
      el('button', { type: 'button', onclick: () => { rows.splice(0, rows.length, ...presetPeriods(tt.preset in PRESETS ? tt.preset : 'university')); draw(); } }, '還原成預設')),
    el('p', { class: 'none' }, '刪除某一節時,課程裡選了那一節的時段也會一併移除。'),
    err,
    el('div', { class: 'actions' }, el('button', { type: 'button', onclick: closeDialog }, '取消'), el('button', { type: 'submit', class: 'primary' }, '儲存')));
  openDialog(form);
}

function openName(title, initial, onOk) {
  const input = el('input', { type: 'text', value: initial, maxLength: 40, required: true });
  openDialog(el('form', { method: 'dialog', onsubmit: (e) => { e.preventDefault(); const v = cleanStr(input.value, 40); if (!v) return; closeDialog(); onOk(v); } },
    el('h2', {}, title), field('名稱(例如:大二上)', input),
    el('div', { class: 'actions' }, el('button', { type: 'button', onclick: closeDialog }, '取消'), el('button', { type: 'submit', class: 'primary' }, '確定'))));
  input.select();
}

function openIcs() {
  const tt = current();
  const d = defaultSemester();
  const start = el('input', { type: 'date', value: d.start, required: true });
  const end = el('input', { type: 'date', value: d.end, required: true });
  const err = el('p', { class: 'err', role: 'alert' });
  openDialog(el('form', { method: 'dialog', onsubmit: (e) => {
    e.preventDefault();
    try {
      const text = buildICS(tt, { start: start.value, end: end.value });
      download(`${safeName(tt.name)}.ics`, new Blob([text], { type: 'text/calendar;charset=utf-8' }));
      closeDialog();
      toast('已下載 .ics,用 Google 或 Apple 行事曆匯入即可');
    } catch (x) { err.textContent = x.message; }
  } },
    el('h2', {}, '匯出行事曆 (.ics)'),
    el('p', { class: 'none' }, '每堂課會變成「每週重複」的事件,重複到結束日為止。時區為 Asia/Taipei。'),
    el('div', { class: 'two' }, field('學期開始日', start), field('學期結束日', end)),
    err,
    el('div', { class: 'actions' }, el('button', { type: 'button', onclick: closeDialog }, '取消'), el('button', { type: 'submit', class: 'primary' }, '下載'))));
}

function openPng() {
  const tt = current();
  const scale = 2;
  const { width, height } = measureTimetable(tt);
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  drawTimetable(ctx, tt, { width, theme: 'light' });
  canvas.toBlob((blob) => {
    if (!blob) { toast('無法產生圖片'); return; }
    const url = URL.createObjectURL(blob);
    const name = `${safeName(tt.name)}.png`;
    openDialog(el('div', { class: 'dbody' },
      el('h2', {}, '課表圖片'),
      el('img', { class: 'preview-img', src: url, alt: `${tt.name} 課表圖片預覽` }),
      el('p', { class: 'none' }, `${canvas.width} × ${canvas.height} 像素`),
      el('div', { class: 'actions' }, el('button', { type: 'button', onclick: closeDialog }, '關閉'),
        el('button', { type: 'button', class: 'primary', onclick: () => download(name, blob) }, '下載 PNG'))));
    dlg.addEventListener('close', () => URL.revokeObjectURL(url), { once: true });
  }, 'image/png');
}

async function openShare() {
  const tt = current();
  const url = await shareURL(tt, location.href);
  const input = el('input', { type: 'text', class: 'urlbox', value: url, readOnly: true, 'aria-label': '分享連結', onfocus: (e) => e.target.select() });
  openDialog(el('div', { class: 'dbody' },
    el('h2', {}, '分享連結'),
    el('p', { class: 'none' }, '課表內容已壓縮放在網址裡,不會上傳到任何伺服器。收到的人打開就能預覽,並複製到自己的課表。'),
    input,
    el('p', { class: 'none' }, `網址長度 ${url.length} 字元${url.length > 8000 ? '(很長,部分通訊軟體可能會截斷)' : ''}`),
    el('div', { class: 'actions' }, el('button', { type: 'button', onclick: closeDialog }, '關閉'),
      el('button', { type: 'button', class: 'primary', onclick: async () => {
        try { await navigator.clipboard.writeText(url); toast('已複製連結'); } catch { input.select(); toast('請手動複製(Ctrl/⌘ + C)'); }
      } }, '複製連結'))));
}

/* ---------- 事件 ---------- */
$('tableSelect').onchange = (e) => { store.activeId = e.target.value; commit(); };
$('btnNewTable').onclick = () => openName('新增課表', `課表 ${store.tables.length + 1}`, (n) => {
  const t = createTimetable(n, current().preset === 'high' ? 'high' : 'university');
  store.tables.push(t); store.activeId = t.id; commit();
});
$('btnRename').onclick = () => openName('重新命名', current().name, (n) => { current().name = n; commit(); });
$('btnDupTable').onclick = () => openName('複製課表', `${current().name} 複本`, (n) => {
  const r = sanitizeTimetable(structuredClone(current()));
  r.value.id = uid(); r.value.name = n;
  store.tables.push(r.value); store.activeId = r.value.id; commit();
});
$('btnDelTable').onclick = () => {
  const tt = current();
  if (store.tables.length <= 1 || !confirm(`確定刪除課表「${tt.name}」?這個動作無法復原。`)) return;
  store.tables = store.tables.filter((t) => t !== tt);
  store.activeId = store.tables[0].id;
  commit();
};
$('presetSelect').onchange = (e) => {
  const tt = current();
  const key = e.target.value;
  if (key === 'custom') return;
  const periods = presetPeriods(key);
  const ids = new Set(periods.map((p) => p.id));
  const lost = tt.courses.filter((c) => c.slots.some((s) => s.periods.some((p) => !ids.has(p)))).length;
  if (lost && !confirm(`切換後有 ${lost} 門課的部分節次在新的節次組合裡不存在,這些時段會被移除。要繼續嗎?`)) { e.target.value = tt.preset; return; }
  tt.preset = key;
  tt.periods = periods;
  tt.courses = sanitizeTimetable(tt).value.courses.filter((c) => c.slots.length);
  commit();
};
$('dayEndSelect').onchange = (e) => { current().dayEnd = +e.target.value; commit(); };
$('btnPeriods').onclick = openPeriods;
$('btnAdd').onclick = () => openCourse(null);
$('btnPng').onclick = openPng;
$('btnPrint').onclick = () => window.print();
$('btnIcs').onclick = openIcs;
$('btnShare').onclick = openShare;
$('btnJson').onclick = () => {
  const tt = current();
  download(`${safeName(tt.name)}.json`, new Blob([JSON.stringify(wrapExport(tt), null, 2)], { type: 'application/json' }));
};
$('btnImport').onclick = () => $('fileInput').click();
$('fileInput').onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const r = parseImport(await f.text());
  if (!r.ok) { toast(`匯入失敗:${r.error}`); return; }
  store.tables.push(r.value);
  store.activeId = r.value.id;
  commit();
  toast(r.warnings.length ? `已匯入(${r.warnings.join(';')})` : `已匯入「${r.value.name}」`);
};

async function checkHash() {
  const code = codeFromHash(location.hash);
  if (code === null) { if (preview) { preview = null; render(); } return; }
  const r = await decodeShare(code);
  if (!r.ok) { toast(r.error); history.replaceState(null, '', location.pathname + location.search); preview = null; render(); return; }
  preview = r.value;
  render();
}
function leavePreview() {
  preview = null;
  history.replaceState(null, '', location.pathname + location.search);
  render();
}
$('btnLeave').onclick = leavePreview;
$('btnCopyMine').onclick = () => {
  const t = { ...preview, id: uid() };
  store.tables.push(t); store.activeId = t.id;
  leavePreview();
  persist();
  toast(`已複製「${t.name}」到我的課表`);
};
window.addEventListener('hashchange', checkHash);

dlg.addEventListener('click', (e) => { if (e.target === dlg) closeDialog(); });
render();
checkHash();
