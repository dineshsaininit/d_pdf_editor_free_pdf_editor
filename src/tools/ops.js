// Processing functions for the form-based tools.
// Each receives { files, opts, progress } and returns [{ name, blob }] or { results, info, html }.
import { degrees } from '@cantoo/pdf-lib';
import {
  PDFDocument, readBytes, openPdfJs, openPdfLib, renderPage, canvasToBytes, canvasToBlob,
  pdfBlob, parsePages, parseRangeGroups, baseName, imageFileToCanvas, PAGE_SIZES, mm, formatSize,
} from '../lib/pdf';
import { viewSize, viewToPdf, drawTextView, textWidth, pageRotation } from '../lib/draw';
import { getPageLines, linesToParagraphs, linesToTable, toNumberIfNumeric } from '../lib/text';
import { htmlToPdf, escapeHtml } from '../lib/htmlToPdf';

const savePdf = async (doc, name) => ({ name, blob: pdfBlob(await doc.save({ useObjectStreams: true })) });

function newDocLike(src) {
  return PDFDocument.create().then((d) => {
    const t = src.getTitle?.();
    if (t) d.setTitle(t);
    d.setProducer('D-pdf Editor');
    d.setCreator('D-pdf Editor');
    return d;
  });
}

async function copyInto(dst, src, indices) {
  const pages = await dst.copyPages(src, indices);
  pages.forEach((p) => dst.addPage(p));
}

/** Replace each page with a rendered image of itself. */
async function rasterize(file, { scale, quality, gray = false, progress }) {
  const bytes = await readBytes(file);
  const pdf = await openPdfJs(bytes);
  const out = await PDFDocument.create();
  for (let i = 1; i <= pdf.numPages; i++) {
    progress((i - 1) / pdf.numPages, `Processing page ${i} of ${pdf.numPages}…`);
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const canvas = await renderPage(pdf, i, scale);
    if (gray) {
      const ctx = canvas.getContext('2d');
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = img.data;
      for (let p = 0; p < d.length; p += 4) {
        const g = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
        d[p] = d[p + 1] = d[p + 2] = g;
      }
      ctx.putImageData(img, 0, 0);
    }
    const jpg = await out.embedJpg(await canvasToBytes(canvas, 'image/jpeg', quality));
    const p = out.addPage([vp.width, vp.height]);
    p.drawImage(jpg, { x: 0, y: 0, width: vp.width, height: vp.height });
  }
  await pdf.destroy();
  return { out, original: bytes };
}

// ---------- Organize ----------

export async function merge({ files, progress }) {
  if (files.length < 2) throw new Error('Add at least two PDF files to merge.');
  const out = await PDFDocument.create();
  for (let i = 0; i < files.length; i++) {
    progress(i / files.length, `Adding ${files[i].name}…`);
    const src = await openPdfLib(await readBytes(files[i]));
    await copyInto(out, src, src.getPageIndices());
  }
  return [await savePdf(out, 'merged.pdf')];
}

export async function split({ files, opts, progress }) {
  const file = files[0];
  const src = await openPdfLib(await readBytes(file));
  const total = src.getPageCount();
  let groups;
  if (opts.mode === 'all') groups = Array.from({ length: total }, (_, i) => [i + 1]);
  else if (opts.mode === 'every') {
    const n = Math.max(1, +opts.every || 1);
    groups = [];
    for (let i = 1; i <= total; i += n) groups.push(Array.from({ length: Math.min(n, total - i + 1) }, (_, k) => i + k));
  } else {
    if (!opts.ranges?.trim()) throw new Error('Enter at least one page range, e.g. 1-3, 4-6.');
    groups = parseRangeGroups(opts.ranges, total);
  }
  const results = [];
  for (let g = 0; g < groups.length; g++) {
    progress(g / groups.length, `Creating file ${g + 1} of ${groups.length}…`);
    const out = await newDocLike(src);
    await copyInto(out, src, groups[g].map((n) => n - 1));
    const pages = groups[g];
    const label = pages.length === 1 ? `page-${pages[0]}` : `pages-${pages[0]}-${pages[pages.length - 1]}`;
    results.push(await savePdf(out, `${baseName(file.name)}-${label}.pdf`));
  }
  return results;
}

export async function removePages({ files, opts }) {
  const file = files[0];
  const src = await openPdfLib(await readBytes(file));
  const del = new Set(parsePages(opts.pages, src.getPageCount()));
  if (!opts.pages?.trim()) throw new Error('Enter the pages to remove.');
  const keep = src.getPageIndices().filter((i) => !del.has(i + 1));
  if (!keep.length) throw new Error('You cannot remove every page.');
  const out = await newDocLike(src);
  await copyInto(out, src, keep);
  return [await savePdf(out, `${baseName(file.name)}-removed.pdf`)];
}

export async function extractPages({ files, opts }) {
  const file = files[0];
  if (!opts.pages?.trim()) throw new Error('Enter the pages to extract.');
  const src = await openPdfLib(await readBytes(file));
  const pages = parsePages(opts.pages, src.getPageCount());
  if (opts.separate) {
    const results = [];
    for (const n of pages) {
      const out = await newDocLike(src);
      await copyInto(out, src, [n - 1]);
      results.push(await savePdf(out, `${baseName(file.name)}-page-${n}.pdf`));
    }
    return results;
  }
  const out = await newDocLike(src);
  await copyInto(out, src, pages.map((n) => n - 1));
  return [await savePdf(out, `${baseName(file.name)}-extracted.pdf`)];
}

export async function rotate({ files, opts }) {
  const results = [];
  for (const file of files) {
    const doc = await openPdfLib(await readBytes(file));
    const pages = new Set(parsePages(opts.pages, doc.getPageCount()));
    doc.getPages().forEach((p, i) => {
      if (!pages.has(i + 1)) return;
      const r = p.getRotation().angle;
      if (opts.which === 'portrait' && viewSize(p).width <= viewSize(p).height) return;
      if (opts.which === 'landscape' && viewSize(p).width > viewSize(p).height) return;
      p.setRotation(degrees((r + +opts.angle + 360) % 360));
    });
    results.push(await savePdf(doc, `${baseName(file.name)}-rotated.pdf`));
  }
  return results;
}

// ---------- Optimize ----------

const COMPRESS = {
  low: { scale: 2, quality: 0.8 },
  recommended: { scale: 1.5, quality: 0.65 },
  extreme: { scale: 1.1, quality: 0.45 },
};

export async function compress({ files, opts, progress }) {
  const results = [];
  const info = [];
  for (const file of files) {
    const bytes = await readBytes(file);
    let best;
    // Lossless pass first: rewrite with object streams.
    const doc = await openPdfLib(bytes);
    const lossless = await doc.save({ useObjectStreams: true });
    best = lossless.length < bytes.length ? lossless : bytes;
    if (opts.level !== 'lossless') {
      const { out } = await rasterize(file, { ...COMPRESS[opts.level], progress });
      const lossy = await out.save({ useObjectStreams: true });
      if (lossy.length < best.length) best = lossy;
    }
    const pct = Math.max(0, Math.round((1 - best.length / bytes.length) * 100));
    info.push(`${file.name}: ${formatSize(bytes.length)} → ${formatSize(best.length)} (${pct ? `-${pct}%` : 'already optimized'})`);
    results.push({ name: `${baseName(file.name)}-compressed.pdf`, blob: pdfBlob(best) });
  }
  return { results, info: info.join('\n') };
}

export async function grayscale({ files, progress }) {
  const results = [];
  for (const file of files) {
    const { out } = await rasterize(file, { scale: 2, quality: 0.85, gray: true, progress });
    results.push(await savePdf(out, `${baseName(file.name)}-grayscale.pdf`));
  }
  return results;
}

export async function repair({ files, progress }) {
  const results = [];
  for (const file of files) {
    const bytes = await readBytes(file);
    try {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false });
      const out = await newDocLike(src);
      await copyInto(out, src, src.getPageIndices());
      results.push(await savePdf(out, `${baseName(file.name)}-repaired.pdf`));
    } catch {
      progress(0, 'Structure is badly damaged, rebuilding from rendered pages…');
      const { out } = await rasterize(file, { scale: 2, quality: 0.9, progress });
      results.push(await savePdf(out, `${baseName(file.name)}-repaired.pdf`));
    }
  }
  return results;
}

export async function resize({ files, opts }) {
  const results = [];
  for (const file of files) {
    const src = await openPdfLib(await readBytes(file));
    const out = await newDocLike(src);
    const [bw, bh] = PAGE_SIZES[opts.size];
    for (const sp of src.getPages()) {
      const rot = pageRotation(sp);
      const sideways = rot === 90 || rot === 270;
      const vs = viewSize(sp);
      const landscape = opts.orientation === 'auto' ? vs.width > vs.height : opts.orientation === 'landscape';
      let [tw, th] = landscape ? [bh, bw] : [bw, bh];
      if (sideways) [tw, th] = [th, tw]; // work in unrotated space
      const emb = await out.embedPage(sp);
      const { width: ew, height: eh } = emb;
      const s = Math.min(tw / ew, th / eh);
      const np = out.addPage([tw, th]);
      np.drawPage(emb, { x: (tw - ew * s) / 2, y: (th - eh * s) / 2, xScale: s, yScale: s });
      if (rot) np.setRotation(degrees(rot));
    }
    results.push(await savePdf(out, `${baseName(file.name)}-${opts.size}.pdf`));
  }
  return results;
}

// ---------- Convert to PDF ----------

export async function imagesToPdf({ files, opts, progress }) {
  if (!files.length) throw new Error('Add at least one image.');
  const out = await PDFDocument.create();
  const margin = { none: 0, small: mm(10), big: mm(25) }[opts.margin];
  for (let i = 0; i < files.length; i++) {
    progress(i / files.length, `Adding ${files[i].name}…`);
    const canvas = await imageFileToCanvas(files[i]);
    const isPng = /png|gif|webp|bmp|svg/i.test(files[i].type);
    const img = isPng
      ? await out.embedPng(await canvasToBytes(canvas, 'image/png'))
      : await out.embedJpg(await canvasToBytes(canvas, 'image/jpeg', 0.92));
    let pw, ph;
    if (opts.pageSize === 'fit') {
      pw = img.width * 0.75 + margin * 2; // 96dpi pixels → points
      ph = img.height * 0.75 + margin * 2;
    } else {
      [pw, ph] = PAGE_SIZES[opts.pageSize];
      const land = opts.orientation === 'auto' ? img.width > img.height : opts.orientation === 'landscape';
      if (land) [pw, ph] = [ph, pw];
    }
    const page = out.addPage([pw, ph]);
    const s = Math.min((pw - margin * 2) / img.width, (ph - margin * 2) / img.height);
    const w = img.width * s;
    const h = img.height * s;
    page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  }
  const name = files.length === 1 ? `${baseName(files[0].name)}.pdf` : 'images.pdf';
  return [await savePdf(out, name)];
}

const htmlOpts = (opts) => ({ pageSize: opts.pageSize, orientation: opts.orientation, marginMm: +opts.margin });

export async function wordToPdf({ files, opts, progress }) {
  const mammoth = (await import('mammoth')).default;
  const results = [];
  for (const file of files) {
    if (/\.doc$/i.test(file.name)) throw new Error(`"${file.name}" is an old .doc file. Open it in Word/Google Docs and save as .docx first.`);
    progress(0.05, `Reading ${file.name}…`);
    const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    const blob = await htmlToPdf(value, htmlOpts(opts), progress);
    results.push({ name: `${baseName(file.name)}.pdf`, blob });
  }
  return results;
}

export async function excelToPdf({ files, opts, progress }) {
  const XLSX = await import('xlsx');
  const results = [];
  for (const file of files) {
    progress(0.05, `Reading ${file.name}…`);
    const wb = XLSX.read(await file.arrayBuffer());
    const html = wb.SheetNames.map((n) => {
      const table = XLSX.utils.sheet_to_html(wb.Sheets[n], { header: '', footer: '' });
      return `${wb.SheetNames.length > 1 ? `<h3>${escapeHtml(n)}</h3>` : ''}${table}`;
    }).join('<div style="height:24px"></div>');
    const blob = await htmlToPdf(html, htmlOpts(opts), progress);
    results.push({ name: `${baseName(file.name)}.pdf`, blob });
  }
  return results;
}

export async function htmlFileToPdf({ files, opts, progress }) {
  const sources = files.length
    ? await Promise.all(files.map(async (f) => ({ name: baseName(f.name), html: await f.text() })))
    : [{ name: 'document', html: opts.html || '' }];
  if (!sources[0].html.trim()) throw new Error('Upload an HTML file or paste some HTML.');
  const results = [];
  for (const s of sources) {
    // Pull out <style> and <body> so the page's own styles still apply.
    const docEl = new DOMParser().parseFromString(s.html, 'text/html');
    const css = [...docEl.querySelectorAll('style')].map((st) => st.textContent).join('\n');
    docEl.querySelectorAll('script').forEach((sc) => sc.remove());
    results.push({ name: `${s.name}.pdf`, blob: await htmlToPdf(docEl.body.innerHTML, { ...htmlOpts(opts), css }, progress) });
  }
  return results;
}

export async function textToPdf({ files, opts, progress }) {
  const sources = files.length
    ? await Promise.all(files.map(async (f) => ({ name: baseName(f.name), text: await f.text() })))
    : [{ name: 'text', text: opts.text || '' }];
  if (!sources[0].text.trim()) throw new Error('Upload a text file or type some text.');
  const results = [];
  for (const s of sources) {
    const html = `<pre style="font-size:${+opts.fontSize}pt">${escapeHtml(s.text)}</pre>`;
    results.push({ name: `${s.name}.pdf`, blob: await htmlToPdf(html, htmlOpts(opts), progress) });
  }
  return results;
}

// ---------- Convert from PDF ----------

export async function pdfToImages({ files, opts, progress }) {
  const results = [];
  const type = opts.format === 'png' ? 'image/png' : 'image/jpeg';
  const ext = opts.format === 'png' ? 'png' : 'jpg';
  for (const file of files) {
    const pdf = await openPdfJs(await readBytes(file));
    const pages = parsePages(opts.pages, pdf.numPages);
    for (const n of pages) {
      progress(results.length / pages.length, `Rendering page ${n}…`);
      const canvas = await renderPage(pdf, n, +opts.dpi / 72);
      results.push({ name: `${baseName(file.name)}-page-${n}.${ext}`, blob: await canvasToBlob(canvas, type, 0.92) });
    }
    await pdf.destroy();
  }
  return results;
}

export async function pdfToWord({ files, opts, progress }) {
  const docx = await import('docx');
  const { Document, Packer, Paragraph, TextRun, ImageRun, PageBreak, HeadingLevel } = docx;
  const results = [];
  for (const file of files) {
    const pdf = await openPdfJs(await readBytes(file));
    const sections = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      progress((i - 1) / pdf.numPages, `Converting page ${i} of ${pdf.numPages}…`);
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      if (opts.mode === 'layout') {
        const canvas = await renderPage(pdf, i, 2);
        const data = await canvasToBytes(canvas, 'image/jpeg', 0.9);
        const twip = (pt) => Math.round(pt * 20);
        sections.push({
          properties: { page: { size: { width: twip(vp.width), height: twip(vp.height) }, margin: { top: 0, right: 0, bottom: 0, left: 0 } } },
          children: [new Paragraph({ children: [new ImageRun({ type: 'jpg', data, transformation: { width: vp.width * (96 / 72), height: vp.height * (96 / 72) } })] })],
        });
        continue;
      }
      const { lines } = await getPageLines(page);
      const paras = linesToParagraphs(lines);
      const sizes = paras.map((p) => p.size).sort((a, b) => a - b);
      const body = sizes[Math.floor(sizes.length / 2)] || 11;
      const children = paras.map((p) => {
        const heading = p.size > body * 1.35 ? HeadingLevel.HEADING_1 : p.size > body * 1.15 ? HeadingLevel.HEADING_2 : undefined;
        return new Paragraph({
          heading,
          spacing: { after: 120 },
          children: [new TextRun({ text: p.text, bold: p.bold || !!heading, size: Math.round(p.size * 2), color: heading ? '000000' : undefined })],
        });
      });
      if (i < pdf.numPages) children.push(new Paragraph({ children: [new PageBreak()] }));
      if (!sections.length) sections.push({ children: [] });
      sections[0].children.push(...children);
    }
    await pdf.destroy();
    const doc = new Document({ creator: 'D-pdf Editor', sections });
    results.push({ name: `${baseName(file.name)}.docx`, blob: await Packer.toBlob(doc) });
  }
  return results;
}

export async function pdfToText({ files, progress }) {
  const results = [];
  for (const file of files) {
    const pdf = await openPdfJs(await readBytes(file));
    const parts = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      progress((i - 1) / pdf.numPages, `Reading page ${i}…`);
      const { lines } = await getPageLines(await pdf.getPage(i));
      parts.push(lines.map((l) => l.text).join('\n'));
    }
    await pdf.destroy();
    const text = parts.join('\n\n');
    if (!text.trim()) throw new Error('No text found. This PDF may be scanned — try the "OCR PDF" tool.');
    results.push({ name: `${baseName(file.name)}.txt`, blob: new Blob([text], { type: 'text/plain;charset=utf-8' }) });
  }
  return results;
}

export async function pdfToExcel({ files, opts, progress }) {
  const XLSX = await import('xlsx');
  const results = [];
  for (const file of files) {
    const pdf = await openPdfJs(await readBytes(file));
    const wb = XLSX.utils.book_new();
    const all = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      progress((i - 1) / pdf.numPages, `Reading page ${i}…`);
      const { lines } = await getPageLines(await pdf.getPage(i));
      const rows = linesToTable(lines).map((r) => r.map(toNumberIfNumeric));
      if (opts.sheets === 'perPage') XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), `Page ${i}`);
      else all.push(...rows, []);
    }
    await pdf.destroy();
    if (opts.sheets !== 'perPage') XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(all), 'Sheet1');
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    results.push({ name: `${baseName(file.name)}.xlsx`, blob: new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) });
  }
  return results;
}

export async function pdfToPpt({ files, progress }) {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const results = [];
  for (const file of files) {
    const pdf = await openPdfJs(await readBytes(file));
    const first = (await pdf.getPage(1)).getViewport({ scale: 1 });
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: 'PDF', width: first.width / 72, height: first.height / 72 });
    pptx.layout = 'PDF';
    for (let i = 1; i <= pdf.numPages; i++) {
      progress((i - 1) / pdf.numPages, `Converting page ${i}…`);
      const canvas = await renderPage(pdf, i, 2);
      const slide = pptx.addSlide();
      slide.addImage({ data: canvas.toDataURL('image/jpeg', 0.9), x: 0, y: 0, w: first.width / 72, h: first.height / 72 });
    }
    await pdf.destroy();
    results.push({ name: `${baseName(file.name)}.pptx`, blob: await pptx.write({ outputType: 'blob' }) });
  }
  return results;
}

// ---------- Edit ----------

function formatNumber(fmt, n, total, custom) {
  switch (fmt) {
    case 'page': return `Page ${n}`;
    case 'pageOf': return `Page ${n} of ${total}`;
    case 'slash': return `${n} / ${total}`;
    case 'custom': return (custom || '{n}').replaceAll('{n}', n).replaceAll('{total}', total);
    default: return `${n}`;
  }
}

export async function pageNumbers({ files, opts }) {
  const results = [];
  for (const file of files) {
    const doc = await openPdfLib(await readBytes(file));
    const pages = doc.getPages();
    const selected = new Set(parsePages(opts.pages, pages.length));
    const size = +opts.fontSize;
    const margin = mm(+opts.margin);
    const total = pages.length + (+opts.start - 1);
    for (let i = 0; i < pages.length; i++) {
      if (!selected.has(i + 1)) continue;
      const page = pages[i];
      const text = formatNumber(opts.format, i + +opts.start, total, opts.custom);
      const { width, height } = viewSize(page);
      const tw = await textWidth(doc, text, { size });
      const [v, h] = opts.position.split('-');
      const vx = h === 'left' ? margin : h === 'right' ? width - margin - tw : (width - tw) / 2;
      const vy = v === 'top' ? margin + size : height - margin;
      await drawTextView(doc, page, text, { vx, vy, size, color: opts.color });
    }
    results.push(await savePdf(doc, `${baseName(file.name)}-numbered.pdf`));
  }
  return results;
}

export async function watermark({ files, opts }) {
  const results = [];
  for (const file of files) {
    const doc = await openPdfLib(await readBytes(file));
    const pages = doc.getPages();
    const selected = new Set(parsePages(opts.pages, pages.length));
    const size = +opts.fontSize;
    const angle = +opts.angle;
    const text = opts.text || 'CONFIDENTIAL';
    const tw = await textWidth(doc, text, { size, bold: true });
    for (let i = 0; i < pages.length; i++) {
      if (!selected.has(i + 1)) continue;
      const page = pages[i];
      const { width, height } = viewSize(page);
      const a = (angle * Math.PI) / 180;
      const centers = [];
      if (opts.layout === 'tile') {
        const stepX = tw + size * 3;
        const stepY = size * 6;
        for (let y = stepY / 2; y < height + stepY; y += stepY)
          for (let x = ((y / stepY) % 2) * (stepX / 2); x < width + stepX; x += stepX) centers.push([x, y]);
      } else centers.push([width / 2, height / 2]);
      for (const [cx, cy] of centers) {
        // shift from center to baseline-start along the rotated axes (view space: y down)
        const dx = tw / 2, dy = size * 0.35;
        const vx = cx - dx * Math.cos(a) + dy * Math.sin(a);
        const vy = cy + dx * Math.sin(a) + dy * Math.cos(a);
        await drawTextView(doc, page, text, { vx, vy, size, color: opts.color, bold: true, opacity: +opts.opacity, angle });
      }
    }
    results.push(await savePdf(doc, `${baseName(file.name)}-watermarked.pdf`));
  }
  return results;
}

export async function crop({ files, opts }) {
  const results = [];
  for (const file of files) {
    const doc = await openPdfLib(await readBytes(file));
    const pages = doc.getPages();
    const selected = new Set(parsePages(opts.pages, pages.length));
    const [t, r, b, l] = [opts.top, opts.right, opts.bottom, opts.left].map((v) => mm(+v || 0));
    for (let i = 0; i < pages.length; i++) {
      if (!selected.has(i + 1)) continue;
      const page = pages[i];
      const { width, height } = viewSize(page);
      if (l + r >= width || t + b >= height) throw new Error('Crop margins are larger than the page.');
      const p1 = viewToPdf(page, l, t);
      const p2 = viewToPdf(page, width - r, height - b);
      const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
      const w = Math.abs(p1.x - p2.x), h = Math.abs(p1.y - p2.y);
      page.setCropBox(x, y, w, h);
      page.setMediaBox(x, y, w, h);
    }
    results.push(await savePdf(doc, `${baseName(file.name)}-cropped.pdf`));
  }
  return results;
}

export async function metadataPrefill(files) {
  const doc = await openPdfLib(await readBytes(files[0]));
  return {
    title: doc.getTitle() || '',
    author: doc.getAuthor() || '',
    subject: doc.getSubject() || '',
    keywords: doc.getKeywords() || '',
    creator: doc.getCreator() || '',
    producer: doc.getProducer() || '',
  };
}

export async function metadata({ files, opts }) {
  const file = files[0];
  const doc = await openPdfLib(await readBytes(file));
  doc.setTitle(opts.title || '');
  doc.setAuthor(opts.author || '');
  doc.setSubject(opts.subject || '');
  doc.setKeywords((opts.keywords || '').split(',').map((s) => s.trim()).filter(Boolean));
  doc.setCreator(opts.creator || '');
  doc.setProducer(opts.producer || '');
  doc.setModificationDate(new Date());
  return [await savePdf(doc, file.name)];
}

export async function flatten({ files }) {
  const results = [];
  for (const file of files) {
    const doc = await openPdfLib(await readBytes(file));
    const form = doc.getForm();
    if (!form.getFields().length) throw new Error(`"${file.name}" has no form fields to flatten.`);
    form.flatten();
    results.push(await savePdf(doc, `${baseName(file.name)}-flattened.pdf`));
  }
  return results;
}

// ---------- Security ----------

export async function protect({ files, opts }) {
  if (!opts.password) throw new Error('Enter a password.');
  if (opts.password !== opts.confirm) throw new Error('Passwords do not match.');
  const results = [];
  for (const file of files) {
    const doc = await openPdfLib(await readBytes(file));
    doc.encrypt({
      userPassword: opts.password,
      ownerPassword: opts.ownerPassword || opts.password,
      permissions: {
        printing: opts.allowPrint ? 'highResolution' : false,
        copying: !!opts.allowCopy,
        modifying: !!opts.allowEdit,
        annotating: !!opts.allowEdit,
        fillingForms: true,
        contentAccessibility: true,
        documentAssembly: !!opts.allowEdit,
      },
    });
    results.push(await savePdf(doc, `${baseName(file.name)}-protected.pdf`));
  }
  return results;
}

export async function unlock({ files, opts }) {
  const results = [];
  for (const file of files) {
    const bytes = await readBytes(file);
    let src;
    try {
      src = await PDFDocument.load(bytes, { password: opts.password ?? '', updateMetadata: false });
    } catch (e) {
      if (/password|decrypt|encrypt/i.test(e.message)) throw new Error(`Wrong password for "${file.name}".`);
      throw e;
    }
    // Saving the decrypted doc keeps the /Encrypt entry, so copy pages into a fresh document.
    const out = await newDocLike(src);
    await copyInto(out, src, src.getPageIndices());
    results.push(await savePdf(out, `${baseName(file.name)}-unlocked.pdf`));
  }
  return results;
}

// ---------- Advanced ----------

export async function ocr({ files, opts, progress }) {
  const { createWorker } = await import('tesseract.js');
  const results = [];
  progress(0, 'Downloading OCR engine & language data (first time only)…');
  const worker = await createWorker(opts.lang);
  try {
    for (const file of files) {
      const pdf = await openPdfJs(await readBytes(file));
      const out = await PDFDocument.create();
      const texts = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        progress((i - 1) / pdf.numPages, `Recognizing text on page ${i} of ${pdf.numPages}…`);
        const vp = (await pdf.getPage(i)).getViewport({ scale: 1 });
        const canvas = await renderPage(pdf, i, 2.5);
        const { data } = await worker.recognize(canvas, { pdfTitle: file.name }, { pdf: true, text: true });
        texts.push(data.text);
        const pagePdf = await PDFDocument.load(new Uint8Array(data.pdf));
        const [p] = await out.copyPages(pagePdf, [0]);
        const s = vp.width / p.getWidth();
        p.scale(s, s);
        out.addPage(p);
      }
      await pdf.destroy();
      results.push(await savePdf(out, `${baseName(file.name)}-searchable.pdf`));
      results.push({ name: `${baseName(file.name)}-ocr.txt`, blob: new Blob([texts.join('\n\n')], { type: 'text/plain;charset=utf-8' }) });
    }
  } finally {
    await worker.terminate();
  }
  return results;
}

function diffLines(a, b) {
  const n = a.length, m = b.length;
  if (n * m > 4e6) {
    // Too big for LCS in the browser: fall back to set membership.
    const sb = new Set(b), sa = new Set(a);
    return [...a.map((t) => ({ t, k: sb.has(t) ? '=' : '-' })), ...b.filter((t) => !sa.has(t)).map((t) => ({ t, k: '+' }))];
  }
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ t: a[i], k: '=' }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: a[i++], k: '-' });
    else out.push({ t: b[j++], k: '+' });
  }
  while (i < n) out.push({ t: a[i++], k: '-' });
  while (j < m) out.push({ t: b[j++], k: '+' });
  return out;
}

export async function compare({ files, progress }) {
  if (files.length !== 2) throw new Error('Add exactly two PDF files to compare.');
  const texts = [];
  for (const f of files) {
    const pdf = await openPdfJs(await readBytes(f));
    const lines = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      progress((texts.length + i / pdf.numPages) / 2, `Reading ${f.name}…`);
      lines.push(...(await getPageLines(await pdf.getPage(i))).lines.map((l) => l.text));
    }
    await pdf.destroy();
    texts.push(lines);
  }
  const diff = diffLines(texts[0], texts[1]);
  const added = diff.filter((d) => d.k === '+').length;
  const removed = diff.filter((d) => d.k === '-').length;
  const body = diff
    .map((d) => `<div class="diff-${d.k === '+' ? 'add' : d.k === '-' ? 'del' : 'eq'}"><span>${d.k === '=' ? ' ' : d.k}</span>${escapeHtml(d.t) || '&nbsp;'}</div>`)
    .join('');
  const summary = `<p><b>${escapeHtml(files[0].name)}</b> vs <b>${escapeHtml(files[1].name)}</b>: <span class="diff-add-t">${added} line(s) added</span>, <span class="diff-del-t">${removed} line(s) removed</span>.</p>`;
  const html = `${summary}<div class="diff">${body}</div>`;
  const report = `<!doctype html><meta charset="utf-8"><title>PDF comparison</title><style>
    body{font-family:system-ui,sans-serif;max-width:900px;margin:24px auto;padding:0 16px}
    .diff div{font-family:ui-monospace,monospace;font-size:13px;padding:2px 8px;white-space:pre-wrap}
    .diff span{display:inline-block;width:18px;color:#888}
    .diff-add{background:#e6ffec}.diff-del{background:#ffebe9;text-decoration:line-through}
    .diff-add-t{color:#1a7f37}.diff-del-t{color:#cf222e}</style>${html}`;
  return {
    results: [{ name: 'comparison-report.html', blob: new Blob([report], { type: 'text/html' }) }],
    html,
  };
}
