// Turn pdf.js text items into positioned lines / paragraphs / table cells.
import { pdfjsLib } from './pdf';

export async function getPageLines(page) {
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const items = [];
  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) continue;
    const t = pdfjsLib.Util.transform(vp.transform, it.transform);
    const size = Math.hypot(t[2], t[3]) || 10;
    const family = tc.styles[it.fontName]?.fontFamily || '';
    items.push({
      str: it.str,
      x: t[4],
      y: t[5],
      w: it.width * (vp.scale || 1),
      size,
      bold: /bold|black|heavy|semibold/i.test(it.fontName + family),
      italic: /italic|oblique/i.test(it.fontName + family),
    });
  }
  items.sort((a, b) => a.y - b.y || a.x - b.x);

  const lines = [];
  for (const it of items) {
    const line = lines.find((l) => Math.abs(l.y - it.y) < Math.max(2, it.size * 0.45));
    if (line) line.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    l.size = Math.max(...l.items.map((i) => i.size));
    l.x = l.items[0].x;
    l.bold = l.items.every((i) => i.bold);
    l.text = joinItems(l.items);
  }
  lines.sort((a, b) => a.y - b.y);
  return { lines, width: vp.width, height: vp.height };
}

function joinItems(items) {
  let out = '';
  let prevEnd = null;
  for (const it of items) {
    if (prevEnd !== null) {
      const gap = it.x - prevEnd;
      if (gap > it.size * 0.15 && !out.endsWith(' ') && !it.str.startsWith(' ')) out += ' ';
    }
    out += it.str;
    prevEnd = it.x + it.w;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Group lines into paragraphs using vertical spacing and font size. */
export function linesToParagraphs(lines) {
  const paras = [];
  let cur = null;
  let prev = null;
  for (const l of lines) {
    const gap = prev ? l.y - prev.y : 0;
    const sameStyle = prev && Math.abs(l.size - prev.size) < 1 && l.bold === prev.bold;
    if (cur && sameStyle && gap < l.size * 1.75 && gap > 0) {
      cur.text = cur.text.endsWith('-') ? cur.text.slice(0, -1) + l.text : `${cur.text} ${l.text}`;
    } else {
      cur = { text: l.text, size: l.size, bold: l.bold, x: l.x };
      paras.push(cur);
    }
    prev = l;
  }
  return paras;
}

/** Split lines into cells and align them into columns. */
export function linesToTable(lines) {
  const rows = lines.map((l) => {
    const cells = [];
    let cur = null;
    let prevEnd = null;
    for (const it of l.items) {
      if (cur && it.x - prevEnd < it.size * 1.2) {
        cur.items.push(it);
      } else {
        cur = { x: it.x, items: [it] };
        cells.push(cur);
      }
      prevEnd = it.x + it.w;
    }
    return cells.map((c) => ({ x: c.x, text: joinItems(c.items) }));
  });
  const starts = rows.flat().map((c) => c.x).sort((a, b) => a - b);
  const cols = [];
  for (const x of starts) if (!cols.length || x - cols[cols.length - 1] > 12) cols.push(x);
  return rows.map((cells) => {
    const r = new Array(cols.length).fill('');
    for (const c of cells) {
      let idx = 0;
      for (let i = 0; i < cols.length; i++) if (cols[i] <= c.x + 6) idx = i;
      r[idx] = r[idx] ? `${r[idx]} ${c.text}` : c.text;
    }
    return r;
  });
}

export function toNumberIfNumeric(s) {
  const t = s.replace(/,/g, '').trim();
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : s;
}
