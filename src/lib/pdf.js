// Shared helpers: loading, rendering, saving. Everything runs in the browser.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { PDFDocument } from '@cantoo/pdf-lib';
import JSZip from 'jszip';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const PDFJS_CDN = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}`;

export { pdfjsLib, PDFDocument };

export const readBytes = (file) => file.arrayBuffer().then((b) => new Uint8Array(b));

export function baseName(name) {
  return name.replace(/\.[^.]+$/, '');
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** Load a PDF with pdf.js (for rendering / text extraction). */
export async function openPdfJs(bytes, password) {
  const task = pdfjsLib.getDocument({
    data: bytes.slice(0), // pdf.js transfers the buffer; keep caller's copy intact
    password,
    cMapUrl: `${PDFJS_CDN}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDFJS_CDN}/standard_fonts/`,
    wasmUrl: `${PDFJS_CDN}/wasm/`,
  });
  try {
    const doc = await task.promise;
    // pdf.js v6 only exposes destroy() on the loading task.
    if (typeof doc.destroy !== 'function') doc.destroy = () => task.destroy();
    return doc;
  } catch (e) {
    if (e?.name === 'PasswordException') {
      throw new Error('This PDF is password protected. Unlock it first with the "Unlock PDF" tool.');
    }
    throw e;
  }
}

/** Load a PDF with pdf-lib (for modifying). */
export async function openPdfLib(bytes, opts = {}) {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false, ...opts });
  } catch (e) {
    if (/encrypt|password/i.test(e?.message || '')) {
      throw new Error('This PDF is password protected. Unlock it first with the "Unlock PDF" tool.');
    }
    throw e;
  }
}

/** Render one page (1-based) to a canvas. */
export async function renderPage(pdf, pageNum, scale = 1.5, { background = '#ffffff' } = {}) {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, canvas, viewport }).promise;
  page.cleanup();
  return canvas;
}

export async function renderThumb(pdf, pageNum, width = 160) {
  const page = await pdf.getPage(pageNum);
  const vp = page.getViewport({ scale: 1 });
  const canvas = await renderPage(pdf, pageNum, (width / vp.width) * (window.devicePixelRatio || 1));
  return canvas.toDataURL('image/jpeg', 0.8);
}

export const canvasToBlob = (canvas, type = 'image/jpeg', quality = 0.92) =>
  new Promise((res) => canvas.toBlob(res, type, quality));

export async function canvasToBytes(canvas, type = 'image/jpeg', quality = 0.92) {
  const blob = await canvasToBlob(canvas, type, quality);
  return new Uint8Array(await blob.arrayBuffer());
}

export const pdfBlob = (bytes) => new Blob([bytes], { type: 'application/pdf' });

/**
 * Parse a page selection like "1-3, 5, 8-" into sorted unique 1-based page numbers.
 * Empty string selects all pages.
 */
export function parsePages(input, total) {
  const text = (input || '').trim();
  if (!text) return Array.from({ length: total }, (_, i) => i + 1);
  const out = new Set();
  for (const part of text.split(',')) {
    const p = part.trim();
    if (!p) continue;
    const m = p.match(/^(\d*)\s*-\s*(\d*)$/);
    if (m) {
      const a = m[1] ? +m[1] : 1;
      const b = m[2] ? +m[2] : total;
      for (let i = Math.max(1, a); i <= Math.min(total, b); i++) out.add(i);
    } else if (/^\d+$/.test(p)) {
      const n = +p;
      if (n >= 1 && n <= total) out.add(n);
    } else {
      throw new Error(`Invalid page selection: "${p}"`);
    }
  }
  if (!out.size) throw new Error('The page selection does not match any page in this PDF.');
  return [...out].sort((a, b) => a - b);
}

/** Parse "1-3, 4-6" into groups, keeping the user's order. */
export function parseRangeGroups(input, total) {
  return input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((r) => parsePages(r, total));
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function zipResults(results, zipName) {
  const zip = new JSZip();
  const used = new Set();
  for (const r of results) {
    let n = r.name;
    for (let i = 2; used.has(n); i++) n = r.name.replace(/(\.[^.]+)?$/, ` (${i})$1`);
    used.add(n);
    zip.file(n, r.blob);
  }
  return { name: zipName, blob: await zip.generateAsync({ type: 'blob' }) };
}

/** Decode any browser-supported image file into a canvas. */
export async function imageFileToCanvas(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error(`Could not read image "${file.name}".`));
      i.src = url;
    });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const PAGE_SIZES = {
  A4: [595.28, 841.89],
  A3: [841.89, 1190.55],
  A5: [419.53, 595.28],
  Letter: [612, 792],
  Legal: [612, 1008],
};

export const mm = (v) => (v * 72) / 25.4;
