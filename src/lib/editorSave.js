// Apply editor objects (in view space, scale 1) to the original PDF.
import { BlendMode, LineCapStyle } from '@cantoo/pdf-lib';
import { PDFDocument, openPdfLib, openPdfJs, renderPage, canvasToBytes } from './pdf';
import { hexToRgb, drawTextView, drawRectView, drawEllipseView, drawLineView, drawImageView } from './draw';

export const CHECK_PATH = [[4, 12.5], [9.5, 18], [20, 6]]; // in a 24x24 box

const BASELINE = { Helvetica: 0.94, Times: 0.94, Courier: 0.87 };

async function embedDataUrl(doc, src) {
  return src.startsWith('data:image/png') ? doc.embedPng(src) : doc.embedJpg(src);
}

/** Points of a freehand / check object mapped to absolute view coords. */
export function shapePoints(o) {
  const sx = o.w / (o.baseW || 1);
  const sy = o.h / (o.baseH || 1);
  return o.points.map(([x, y]) => ({ x: o.x + x * sx, y: o.y + y * sy }));
}

async function drawObject(doc, page, o) {
  const color = hexToRgb(o.color || '#000000');
  switch (o.type) {
    case 'text': {
      const lines = o.text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        await drawTextView(doc, page, lines[i], {
          vx: o.x,
          vy: o.y + o.size * ((BASELINE[o.family] ?? 0.94) + 1.2 * i),
          size: o.size, color: o.color, family: o.family, bold: o.bold,
        });
      }
      break;
    }
    case 'image':
      drawImageView(page, await embedDataUrl(doc, o.src), o, { opacity: o.opacity ?? 1 });
      break;
    case 'rect':
      drawRectView(page, o, { borderColor: color, borderWidth: o.stroke, color: o.fill ? hexToRgb(o.fill) : undefined });
      break;
    case 'ellipse':
      drawEllipseView(page, o, { borderColor: color, borderWidth: o.stroke, color: o.fill ? hexToRgb(o.fill) : undefined });
      break;
    case 'whiteout':
      drawRectView(page, o, { color: hexToRgb('#ffffff') });
      break;
    case 'highlight':
      drawRectView(page, o, { color, opacity: 0.4, blendMode: BlendMode.Multiply });
      break;
    case 'line':
      drawLineView(page, { x: o.x, y: o.y }, { x: o.x + o.w, y: o.y + o.h }, { thickness: o.stroke, color, lineCap: LineCapStyle.Round });
      break;
    case 'draw':
    case 'check': {
      const pts = shapePoints(o);
      const thickness = o.type === 'check' ? Math.max(1.5, o.w / 9) : o.stroke;
      for (let i = 1; i < pts.length; i++) drawLineView(page, pts[i - 1], pts[i], { thickness, color, lineCap: LineCapStyle.Round });
      break;
    }
    default:
  }
}

export async function saveEdits(bytes, objects) {
  const redactions = objects.filter((o) => o.type === 'redact');
  const others = objects.filter((o) => o.type !== 'redact');

  let doc = await openPdfLib(bytes);
  const pages = doc.getPages();
  for (const o of others) await drawObject(doc, pages[o.page], o);
  if (!redactions.length) return doc.save({ useObjectStreams: true });

  // True redaction: re-render affected pages as images with the boxes burned in,
  // so the original text/vector content underneath is gone.
  const edited = await doc.save();
  const pdf = await openPdfJs(edited);
  const src = await PDFDocument.load(edited);
  const out = await PDFDocument.create();
  const redactedPages = new Set(redactions.map((r) => r.page));
  for (let i = 0; i < src.getPageCount(); i++) {
    if (!redactedPages.has(i)) {
      const [p] = await out.copyPages(src, [i]);
      out.addPage(p);
      continue;
    }
    const scale = 2.5;
    const canvas = await renderPage(pdf, i + 1, scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    for (const r of redactions.filter((x) => x.page === i)) ctx.fillRect(r.x * scale, r.y * scale, r.w * scale, r.h * scale);
    const img = await out.embedJpg(await canvasToBytes(canvas, 'image/jpeg', 0.92));
    const w = canvas.width / scale, h = canvas.height / scale;
    out.addPage([w, h]).drawImage(img, { x: 0, y: 0, width: w, height: h });
  }
  await pdf.destroy();
  doc = null;
  return out.save({ useObjectStreams: true });
}
