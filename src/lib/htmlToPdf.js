// Render HTML into a paginated PDF. Uses a real browser canvas so any script
// (Hindi, Arabic, CJK, emoji...) renders correctly.
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { PAGE_SIZES } from './pdf';

const PX_PER_PT = 96 / 72;

/** Find a row near `target` that is (almost) blank so page breaks don't cut text. */
function findBreak(ctx, width, target, minY) {
  const searchFrom = Math.max(minY, Math.floor(target - (target - minY) * 0.2));
  const data = ctx.getImageData(0, searchFrom, width, target - searchFrom).data;
  for (let row = target - searchFrom - 1; row >= 0; row--) {
    let blank = true;
    for (let x = 0; x < width; x += 2) {
      const i = (row * width + x) * 4;
      if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) {
        blank = false;
        break;
      }
    }
    if (blank) return searchFrom + row + 1;
  }
  return target;
}

export async function htmlToPdf(html, { pageSize = 'A4', orientation = 'portrait', marginMm = 15, css = '' } = {}, onProgress) {
  let [wPt, hPt] = PAGE_SIZES[pageSize] || PAGE_SIZES.A4;
  if (orientation === 'landscape') [wPt, hPt] = [hPt, wPt];
  const marginPt = (marginMm * 72) / 25.4;
  const contentWpx = Math.round((wPt - marginPt * 2) * PX_PER_PT);

  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${contentWpx}px;background:#fff;color:#000;`;
  host.innerHTML = `<style>
    .dpdf-doc{font-family:Arial,"Noto Sans",sans-serif;font-size:12pt;line-height:1.45;color:#000;word-wrap:break-word}
    .dpdf-doc img{max-width:100%;height:auto}
    .dpdf-doc table{border-collapse:collapse;max-width:100%}
    .dpdf-doc td,.dpdf-doc th{border:1px solid #999;padding:3px 6px;font-size:10pt;vertical-align:top}
    .dpdf-doc pre{white-space:pre-wrap;font-family:"Courier New",monospace;font-size:10.5pt}
    .dpdf-doc h1,.dpdf-doc h2,.dpdf-doc h3{line-height:1.25}
    ${css}
  </style><div class="dpdf-doc">${html}</div>`;
  document.body.appendChild(host);

  try {
    await Promise.all(
      [...host.querySelectorAll('img')].map((img) =>
        img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })
      )
    );
    onProgress?.(0.2, 'Rendering document…');
    const scale = 2;
    const canvas = await html2canvas(host, { scale, backgroundColor: '#ffffff', useCORS: true, logging: false });
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const pageHpx = Math.floor((hPt - marginPt * 2) * PX_PER_PT * scale);

    const pdf = new jsPDF({ unit: 'pt', format: [wPt, hPt], orientation: wPt > hPt ? 'landscape' : 'portrait' });
    let y = 0;
    let first = true;
    while (y < canvas.height - 2) {
      let end = Math.min(canvas.height, y + pageHpx);
      if (end < canvas.height) end = findBreak(ctx, canvas.width, end, y + Math.floor(pageHpx * 0.5));
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = end - y;
      slice.getContext('2d').drawImage(canvas, 0, y, canvas.width, end - y, 0, 0, canvas.width, end - y);
      if (!first) pdf.addPage([wPt, hPt], wPt > hPt ? 'landscape' : 'portrait');
      first = false;
      const hSlicePt = slice.height / scale / PX_PER_PT;
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', marginPt, marginPt, wPt - marginPt * 2, hSlicePt);
      y = end;
      onProgress?.(0.2 + 0.8 * (y / canvas.height), 'Building pages…');
    }
    return pdf.output('blob');
  } finally {
    host.remove();
  }
}

export const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
