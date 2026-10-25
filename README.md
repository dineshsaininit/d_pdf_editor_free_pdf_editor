# D-pdf Editor

A free online PDF editor and toolkit with 33 tools. Every file is processed **inside the user's browser**. Nothing is uploaded, so the site has no server costs and can be hosted for free on Vercel, Netlify, Cloudflare Pages or any static host.

## Tools

| Category | Tools |
| --- | --- |
| Edit & Sign | Edit PDF (text, images, shapes, freehand, highlight, whiteout, checkmark, date), Sign PDF (draw / type / upload signature + initials), Fill PDF Forms, Redact PDF (true redaction), Add Page Numbers, Add Watermark, Crop PDF, Edit Metadata |
| Organize | Merge, Split, Organize Pages (drag-reorder, rotate, delete, duplicate, insert blank, combine several PDFs), Remove Pages, Extract Pages, Rotate |
| Optimize | Compress (lossless + 3 lossy levels), Repair, Grayscale, Resize Pages (A4/Letter/…) |
| Convert to PDF | Image (JPG/PNG/WEBP/GIF/BMP) to PDF, Word (DOCX) to PDF, Excel (XLSX/XLS/CSV/ODS) to PDF, HTML to PDF, Text to PDF |
| Convert from PDF | PDF to Word (editable or exact layout), PDF to JPG/PNG, PDF to Excel, PDF to PowerPoint, PDF to Text |
| Security | Protect (AES-256 password), Unlock, Flatten |
| Advanced | OCR (searchable PDF + text, 18 languages), Compare PDFs |

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve the production build
```

## Deploy for free

### Vercel (recommended)
1. Push this folder to a GitHub repository.
2. Go to https://vercel.com/new, import the repository and click **Deploy**. Vercel detects Vite automatically (build: `npm run build`, output: `dist`).
3. `vercel.json` already sends every page URL (e.g. `/merge-pdf`) to the app.

You can also deploy without GitHub: `npm i -g vercel`, then run `vercel` in this folder.

### Netlify / Cloudflare Pages
Build command `npm run build`, publish directory `dist`. `public/_redirects` already handles page URLs.

### Custom domain
After deploying, add your domain in the host's dashboard (Vercel → Project → Settings → Domains).

## Tech
React + Vite, [pdf-lib (@cantoo fork)](https://github.com/cantoo-scribe/pdf-lib) for editing/encryption, [pdf.js](https://mozilla.github.io/pdf.js/) for rendering and text extraction, mammoth (DOCX), SheetJS (Excel), docx, pptxgenjs, jsPDF + html2canvas, tesseract.js (OCR).

## Notes and limits
- Lossy compression, grayscale and redaction turn the affected pages into images, so their text can't be selected afterwards. (Lossless compression keeps text selectable.)
- Word/Excel/HTML → PDF output looks like the document but the text isn't selectable. Run **OCR PDF** on the result if you need selectable text.
- PDF → Word "Editable text" rebuilds paragraphs and headings. Complex layouts, such as multi-column pages or tables, are better served by "Exact layout".
- Old `.doc` files aren't supported. Save them as `.docx` first.
- OCR downloads its engine and language data from a CDN the first time it runs.
