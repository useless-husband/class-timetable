// 用 Canvas 2D 畫課表圖片(不依賴任何函式庫)。
import { COLORS } from './palette.js';
import { buildRuns, visibleDays, stats } from './schedule.js';
import { dayLabel } from './periods.js';

const FONT = '"PingFang TC","Noto Sans TC","Microsoft JhengHei","Heiti TC",sans-serif';

const THEMES = {
  light: { bg: '#FFFFFF', text: '#1B1B1F', sub: '#5B5B66', line: '#D0D0D8', head: '#F1F1F5', conflict: '#B3261E', hatch: '#F6D5D2' },
  dark: { bg: '#18181B', text: '#F2F2F5', sub: '#A6A6B2', line: '#3A3A44', head: '#26262C', conflict: '#F2B8B5', hatch: '#4A2422' },
};

const ROW_H = 84;
const PAD = 40;
const TITLE_H = 96;
const HEAD_H = 52;

export function measureTimetable(tt, width = 1600) {
  return { width, height: PAD + TITLE_H + HEAD_H + tt.periods.length * ROW_H + PAD };
}

/** 逐字換行(中文沒有空白可以斷詞)。measure(str) 回傳寬度 */
export function wrapText(measure, text, maxWidth) {
  const lines = [];
  let cur = '';
  for (const ch of String(text)) {
    if (ch === '\n') { lines.push(cur); cur = ''; continue; }
    if (cur && measure(cur + ch) > maxWidth) { lines.push(cur); cur = ch; }
    else cur += ch;
  }
  if (cur || !lines.length) lines.push(cur);
  return lines;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawLines(ctx, lines, x, y, maxW, maxH, lineH, fonts, colors) {
  // lines: [{text, font, color}] 已展開;超出高度就在最後一行加「…」
  const fit = Math.max(1, Math.floor(maxH / lineH));
  const shown = lines.slice(0, fit);
  if (lines.length > fit) {
    let last = shown[shown.length - 1].text;
    while (last && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
    shown[shown.length - 1] = { ...shown[shown.length - 1], text: last + '…' };
  }
  shown.forEach((l, i) => {
    ctx.font = l.font;
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, x, y + i * lineH);
  });
}

export function drawTimetable(ctx, tt, { width = 1600, theme = 'light' } = {}) {
  const T = THEMES[theme] || THEMES.light;
  const { height } = measureTimetable(tt, width);
  const days = visibleDays(tt);
  const labelW = 150;
  const colW = (width - PAD * 2 - labelW) / days.length;
  const top = PAD + TITLE_H;
  const gridTop = top + HEAD_H;

  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = 'top';

  // 標題與摘要
  const st = stats(tt);
  ctx.fillStyle = T.text;
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText(tt.name, PAD, PAD);
  ctx.fillStyle = T.sub;
  ctx.font = `400 22px ${FONT}`;
  ctx.fillText(`${st.courseCount} 門課 ・ 共 ${st.totalCredits} 學分`, PAD, PAD + 56);

  // 表頭
  ctx.fillStyle = T.head;
  ctx.fillRect(PAD, top, width - PAD * 2, HEAD_H);
  ctx.fillStyle = T.text;
  ctx.font = `600 24px ${FONT}`;
  ctx.textAlign = 'center';
  days.forEach((d, i) => ctx.fillText(dayLabel(d), PAD + labelW + colW * i + colW / 2, top + 14));

  // 節次欄 + 橫線
  tt.periods.forEach((p, i) => {
    const y = gridTop + i * ROW_H;
    ctx.strokeStyle = T.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, y + 0.5);
    ctx.lineTo(width - PAD, y + 0.5);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = T.text;
    ctx.font = `700 26px ${FONT}`;
    ctx.fillText(p.label, PAD + labelW / 2, y + 12);
    ctx.fillStyle = T.sub;
    ctx.font = `400 18px ${FONT}`;
    ctx.fillText(`${p.start}–${p.end}`, PAD + labelW / 2, y + 48);
  });
  const bottom = gridTop + tt.periods.length * ROW_H;
  ctx.strokeStyle = T.line;
  ctx.beginPath();
  ctx.moveTo(PAD, bottom + 0.5);
  ctx.lineTo(width - PAD, bottom + 0.5);
  ctx.stroke();
  for (let i = 0; i <= days.length; i++) {
    const x = PAD + labelW + colW * i;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, top);
    ctx.lineTo(x + 0.5, bottom);
    ctx.stroke();
  }

  // 課程區塊
  ctx.textAlign = 'left';
  for (const run of buildRuns(tt)) {
    const col = days.indexOf(run.day);
    const x = PAD + labelW + colW * col + 3;
    const y = gridTop + run.from * ROW_H + 3;
    const w = colW - 6;
    const h = (run.to - run.from + 1) * ROW_H - 6;
    const innerW = w - 20;
    ctx.save();
    roundRectPath(ctx, x, y, w, h, 8);
    let fg;
    if (run.conflict) {
      ctx.fillStyle = T.hatch;
      ctx.fill();
      ctx.clip();
      ctx.strokeStyle = T.conflict;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 2;
      for (let k = -h; k < w; k += 14) {
        ctx.beginPath();
        ctx.moveTo(x + k, y + h);
        ctx.lineTo(x + k + h, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      fg = T.text;
    } else {
      const c = COLORS[run.courses[0].color] || COLORS[0];
      const pal = c[theme] || c.light;
      ctx.fillStyle = pal.bg;
      ctx.fill();
      fg = pal.fg;
    }
    ctx.restore();
    if (run.conflict) {
      ctx.save();
      roundRectPath(ctx, x, y, w, h, 8);
      ctx.strokeStyle = T.conflict;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
    const nameFont = `700 22px ${FONT}`;
    const smallFont = `400 18px ${FONT}`;
    const measure = (font) => (s) => { ctx.font = font; return ctx.measureText(s).width; };
    const lines = [];
    if (run.conflict) {
      for (const t of wrapText(measure(nameFont), '衝堂', innerW)) lines.push({ text: t, font: nameFont, color: T.conflict });
    }
    for (const c of run.courses) {
      for (const t of wrapText(measure(nameFont), c.name, innerW)) lines.push({ text: t, font: nameFont, color: fg });
      if (!run.conflict) {
        for (const extra of [c.room, c.teacher]) {
          if (extra) for (const t of wrapText(measure(smallFont), extra, innerW)) lines.push({ text: t, font: smallFont, color: fg });
        }
      }
    }
    ctx.save();
    roundRectPath(ctx, x, y, w, h, 8);
    ctx.clip();
    drawLines(ctx, lines, x + 10, y + 10, innerW, h - 16, 27, null, null);
    ctx.restore();
  }
  ctx.textAlign = 'left';
  return { width, height };
}
