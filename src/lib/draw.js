// Drawing helpers that work in "view space": the page as the user sees it
// (origin top-left, y down, page rotation already applied).
import { rgb, degrees, StandardFonts } from '@cantoo/pdf-lib';

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export const pageRotation = (page) => (((page.getRotation().angle % 360) + 360) % 360);

/** Width/height of the page as displayed. */
export function viewSize(page) {
  const { width, height } = page.getCropBox();
  const r = pageRotation(page);
  return r === 90 || r === 270 ? { width: height, height: width } : { width, height };
}

/** Convert a view-space point to PDF user space. */
export function viewToPdf(page, vx, vy) {
  const { x: cx, y: cy, width: W, height: H } = page.getCropBox();
  switch (pageRotation(page)) {
    case 90: return { x: cx + vy, y: cy + vx };
    case 180: return { x: cx + W - vx, y: cy + vy };
    case 270: return { x: cx + W - vy, y: cy + H - vx };
    default: return { x: cx + vx, y: cy + H - vy };
  }
}

export const FONT_MAP = {
  Helvetica: { normal: StandardFonts.Helvetica, bold: StandardFonts.HelveticaBold, css: 'Helvetica, Arial, sans-serif' },
  Times: { normal: StandardFonts.TimesRoman, bold: StandardFonts.TimesRomanBold, css: '"Times New Roman", Times, serif' },
  Courier: { normal: StandardFonts.Courier, bold: StandardFonts.CourierBold, css: '"Courier New", Courier, monospace' },
};

const fontCache = new WeakMap();
export async function getFont(doc, family = 'Helvetica', bold = false) {
  let m = fontCache.get(doc);
  if (!m) fontCache.set(doc, (m = new Map()));
  const key = FONT_MAP[family]?.[bold ? 'bold' : 'normal'] || StandardFonts.Helvetica;
  if (!m.has(key)) m.set(key, await doc.embedFont(key));
  return m.get(key);
}

const charsetCache = new WeakMap();
// pdf-lib silently swaps unsupported characters for "?", so check the font's charset ourselves.
function canEncode(font, text) {
  let set = charsetCache.get(font);
  if (!set) charsetCache.set(font, (set = new Set(font.getCharacterSet())));
  for (const ch of text) if (!set.has(ch.codePointAt(0))) return false;
  return true;
}

/** Render text to a PNG so characters outside the standard PDF fonts still work. */
function textToPng(text, { size, color, family, bold }) {
  const scale = 4;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = `${bold ? 'bold ' : ''}${size * scale}px ${FONT_MAP[family]?.css || 'sans-serif'}`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 4;
  c.width = Math.max(w, 1);
  c.height = Math.ceil(size * 1.3 * scale);
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, 2, size * scale);
  return { dataUrl: c.toDataURL('image/png'), width: c.width / scale, height: c.height / scale };
}

/**
 * Draw one line of text with its baseline-left at view point (vx, vy).
 * `angle` is extra rotation (degrees, counter-clockwise) on top of the page rotation.
 */
export async function drawTextView(doc, page, text, { vx, vy, size = 12, color = '#000000', family = 'Helvetica', bold = false, opacity = 1, angle = 0 }) {
  if (!text) return;
  const rot = pageRotation(page) + angle;
  const font = await getFont(doc, family, bold);
  const p = viewToPdf(page, vx, vy);
  if (canEncode(font, text)) {
    page.drawText(text, { x: p.x, y: p.y, size, font, color: hexToRgb(color), opacity, rotate: degrees(rot) });
    return;
  }
  const img = textToPng(text, { size, color, family, bold });
  const png = await doc.embedPng(img.dataUrl);
  // image bottom sits 0.3*size below the baseline
  const a = (rot * Math.PI) / 180;
  const drop = img.height - size;
  page.drawImage(png, {
    x: p.x + Math.sin(a) * drop,
    y: p.y - Math.cos(a) * drop,
    width: img.width,
    height: img.height,
    opacity,
    rotate: degrees(rot),
  });
}

export async function textWidth(doc, text, { size, family = 'Helvetica', bold = false }) {
  const font = await getFont(doc, family, bold);
  if (canEncode(font, text)) return font.widthOfTextAtSize(text, size);
  const c = document.createElement('canvas').getContext('2d');
  c.font = `${bold ? 'bold ' : ''}${size}px ${FONT_MAP[family]?.css || 'sans-serif'}`;
  return c.measureText(text).width;
}

/** Draw an axis-aligned (in view space) box: rectangle, image, ellipse. */
export function boxOrigin(page, { x, y, h }) {
  return viewToPdf(page, x, y + h);
}

export function drawRectView(page, box, opts) {
  const o = boxOrigin(page, box);
  page.drawRectangle({ x: o.x, y: o.y, width: box.w, height: box.h, rotate: degrees(pageRotation(page)), ...opts });
}

export function drawImageView(page, image, box, opts = {}) {
  const o = boxOrigin(page, box);
  page.drawImage(image, { x: o.x, y: o.y, width: box.w, height: box.h, rotate: degrees(pageRotation(page)), ...opts });
}

export function drawEllipseView(page, box, opts) {
  const c = viewToPdf(page, box.x + box.w / 2, box.y + box.h / 2);
  const r = pageRotation(page);
  const swap = r === 90 || r === 270;
  page.drawEllipse({ x: c.x, y: c.y, xScale: (swap ? box.h : box.w) / 2, yScale: (swap ? box.w : box.h) / 2, ...opts });
}

export function drawLineView(page, a, b, opts) {
  page.drawLine({ start: viewToPdf(page, a.x, a.y), end: viewToPdf(page, b.x, b.y), ...opts });
}
