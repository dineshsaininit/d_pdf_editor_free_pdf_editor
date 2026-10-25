// Processing code is loaded on demand so the home page stays light.
const op = (name) => (...args) => import('./ops').then((m) => m[name](...args));

export const CATEGORIES = [
  { id: 'edit', name: 'Edit & Sign' },
  { id: 'organize', name: 'Organize' },
  { id: 'optimize', name: 'Optimize' },
  { id: 'to-pdf', name: 'Convert to PDF' },
  { id: 'from-pdf', name: 'Convert from PDF' },
  { id: 'security', name: 'Security' },
  { id: 'advanced', name: 'Advanced' },
];

const PDF = '.pdf,application/pdf';
const pagesOpt = (label = 'Pages', help = 'Leave empty for all pages. Example: 1-3, 5, 8-') => ({ key: 'pages', label, type: 'text', default: '', placeholder: 'All pages', help });
const pageLayout = [
  { key: 'pageSize', label: 'Page size', type: 'select', default: 'A4', choices: ['A4', 'Letter', 'Legal', 'A3', 'A5'] },
  { key: 'orientation', label: 'Orientation', type: 'select', default: 'portrait', choices: [['portrait', 'Portrait'], ['landscape', 'Landscape']] },
  { key: 'margin', label: 'Margin (mm)', type: 'number', default: 15, min: 0, max: 50 },
];

export const TOOLS = [
  // ---- Edit & Sign
  { id: 'edit-pdf', name: 'Edit PDF', icon: 'PenTool', color: '#7c3aed', category: 'edit', kind: 'editor', mode: 'edit',
    desc: 'Add text, images, shapes, drawings, highlights and whiteout to any PDF.' },
  { id: 'sign-pdf', name: 'Sign PDF (eSign)', icon: 'Signature', color: '#2563eb', category: 'edit', kind: 'editor', mode: 'sign',
    desc: 'Draw, type or upload your signature and place it anywhere on the document.' },
  { id: 'fill-forms', name: 'Fill PDF Forms', icon: 'ClipboardList', color: '#0891b2', category: 'edit', kind: 'forms',
    desc: 'Fill in interactive PDF form fields and save the completed form.' },
  { id: 'redact-pdf', name: 'Redact PDF', icon: 'EyeOff', color: '#111827', category: 'edit', kind: 'editor', mode: 'redact',
    desc: 'Permanently black out sensitive text and images. The covered content is removed.' },
  { id: 'add-page-numbers', name: 'Add Page Numbers', icon: 'Hash', color: '#ea580c', category: 'edit', accept: PDF, multiple: true,
    desc: 'Number your pages with the position, format and style you want.', run: op('pageNumbers'),
    options: [
      { key: 'position', label: 'Position', type: 'select', default: 'bottom-center', choices: [['bottom-center', 'Bottom center'], ['bottom-right', 'Bottom right'], ['bottom-left', 'Bottom left'], ['top-center', 'Top center'], ['top-right', 'Top right'], ['top-left', 'Top left']] },
      { key: 'format', label: 'Format', type: 'select', default: 'number', choices: [['number', '1'], ['page', 'Page 1'], ['pageOf', 'Page 1 of 10'], ['slash', '1 / 10'], ['custom', 'Custom…']] },
      { key: 'custom', label: 'Custom text', type: 'text', default: '{n}', help: 'Use {n} for the page number and {total} for the page count.', show: (o) => o.format === 'custom' },
      { key: 'start', label: 'Start at', type: 'number', default: 1, min: 0 },
      { key: 'fontSize', label: 'Font size', type: 'number', default: 11, min: 6, max: 72 },
      { key: 'margin', label: 'Margin (mm)', type: 'number', default: 10, min: 0, max: 60 },
      { key: 'color', label: 'Color', type: 'color', default: '#000000' },
      pagesOpt('Pages to number'),
    ] },
  { id: 'watermark', name: 'Add Watermark', icon: 'Stamp', color: '#db2777', category: 'edit', accept: PDF, multiple: true,
    desc: 'Stamp text like "CONFIDENTIAL" or "DRAFT" over your pages.', run: op('watermark'),
    options: [
      { key: 'text', label: 'Watermark text', type: 'text', default: 'CONFIDENTIAL' },
      { key: 'layout', label: 'Layout', type: 'select', default: 'center', choices: [['center', 'Single, centered'], ['tile', 'Tiled (repeat)']] },
      { key: 'fontSize', label: 'Font size', type: 'number', default: 60, min: 8, max: 200 },
      { key: 'angle', label: 'Rotation (°)', type: 'number', default: 45, min: -180, max: 180 },
      { key: 'opacity', label: 'Opacity', type: 'range', default: 0.25, min: 0.05, max: 1, step: 0.05 },
      { key: 'color', label: 'Color', type: 'color', default: '#ff0000' },
      pagesOpt(),
    ] },
  { id: 'crop-pdf', name: 'Crop PDF', icon: 'Crop', color: '#0d9488', category: 'edit', accept: PDF, multiple: true,
    desc: 'Trim the margins of your pages.', run: op('crop'),
    options: [
      { key: 'top', label: 'Top (mm)', type: 'number', default: 10, min: 0 },
      { key: 'right', label: 'Right (mm)', type: 'number', default: 10, min: 0 },
      { key: 'bottom', label: 'Bottom (mm)', type: 'number', default: 10, min: 0 },
      { key: 'left', label: 'Left (mm)', type: 'number', default: 10, min: 0 },
      pagesOpt(),
    ] },
  { id: 'edit-metadata', name: 'Edit Metadata', icon: 'Tags', color: '#4f46e5', category: 'edit', accept: PDF,
    desc: 'Change the title, author, subject and keywords stored in the PDF.', run: op('metadata'), prefill: op('metadataPrefill'),
    options: [
      { key: 'title', label: 'Title', type: 'text', default: '' },
      { key: 'author', label: 'Author', type: 'text', default: '' },
      { key: 'subject', label: 'Subject', type: 'text', default: '' },
      { key: 'keywords', label: 'Keywords', type: 'text', default: '', help: 'Comma separated' },
      { key: 'creator', label: 'Creator', type: 'text', default: '' },
      { key: 'producer', label: 'Producer', type: 'text', default: '' },
    ] },

  // ---- Organize
  { id: 'merge-pdf', name: 'Merge PDF', icon: 'Combine', color: '#dc2626', category: 'organize', accept: PDF, multiple: true, reorder: true,
    desc: 'Combine multiple PDFs into one file, in the order you want.', run: op('merge') },
  { id: 'split-pdf', name: 'Split PDF', icon: 'Scissors', color: '#ea580c', category: 'organize', accept: PDF,
    desc: 'Split a PDF by page ranges, every N pages, or into single pages.', run: op('split'),
    options: [
      { key: 'mode', label: 'Split mode', type: 'select', default: 'ranges', choices: [['ranges', 'Custom ranges'], ['every', 'Every N pages'], ['all', 'Every page into its own PDF']] },
      { key: 'ranges', label: 'Ranges', type: 'text', default: '', placeholder: '1-3, 4-6, 7-', help: 'Each range becomes a separate PDF.', show: (o) => o.mode === 'ranges' },
      { key: 'every', label: 'Pages per file', type: 'number', default: 1, min: 1, show: (o) => o.mode === 'every' },
    ] },
  { id: 'organize-pdf', name: 'Organize Pages', icon: 'LayoutGrid', color: '#16a34a', category: 'organize', kind: 'organize',
    desc: 'Reorder, rotate, delete, duplicate pages or insert blank ones visually.' },
  { id: 'remove-pages', name: 'Remove Pages', icon: 'FileMinus', color: '#e11d48', category: 'organize', accept: PDF,
    desc: 'Delete the pages you don’t need.', run: op('removePages'),
    options: [{ ...pagesOpt('Pages to remove', 'Example: 2, 5-7'), placeholder: 'e.g. 2, 5-7' }] },
  { id: 'extract-pages', name: 'Extract Pages', icon: 'FileOutput', color: '#0284c7', category: 'organize', accept: PDF,
    desc: 'Pull selected pages out into a new PDF.', run: op('extractPages'),
    options: [
      { ...pagesOpt('Pages to extract', 'Example: 1, 3-5'), placeholder: 'e.g. 1, 3-5' },
      { key: 'separate', label: 'Save each page as a separate PDF', type: 'checkbox', default: false },
    ] },
  { id: 'rotate-pdf', name: 'Rotate PDF', icon: 'RotateCw', color: '#9333ea', category: 'organize', accept: PDF, multiple: true,
    desc: 'Rotate all or selected pages permanently.', run: op('rotate'),
    options: [
      { key: 'angle', label: 'Rotate', type: 'select', default: '90', choices: [['90', '90° clockwise'], ['180', '180°'], ['270', '90° counter-clockwise']] },
      { key: 'which', label: 'Apply to', type: 'select', default: 'all', choices: [['all', 'All selected pages'], ['portrait', 'Only portrait pages'], ['landscape', 'Only landscape pages']] },
      pagesOpt(),
    ] },

  // ---- Optimize
  { id: 'compress-pdf', name: 'Compress PDF', icon: 'Minimize2', color: '#16a34a', category: 'optimize', accept: PDF, multiple: true,
    desc: 'Reduce file size while keeping the best quality possible.', run: op('compress'),
    options: [
      { key: 'level', label: 'Compression level', type: 'radio', default: 'recommended', choices: [
        ['lossless', 'Lossless', 'Keeps text selectable. Smaller savings.'],
        ['low', 'Low', 'High quality, some size reduction.'],
        ['recommended', 'Recommended', 'Good quality, good compression.'],
        ['extreme', 'Extreme', 'Smallest file, lower quality.'],
      ] },
    ],
    note: 'Lossy levels convert pages to optimized images, so text will no longer be selectable. Use "Lossless" to keep text.' },
  { id: 'repair-pdf', name: 'Repair PDF', icon: 'Wrench', color: '#ca8a04', category: 'optimize', accept: PDF, multiple: true,
    desc: 'Try to recover a damaged or corrupted PDF.', run: op('repair') },
  { id: 'grayscale-pdf', name: 'Grayscale PDF', icon: 'Contrast', color: '#475569', category: 'optimize', accept: PDF, multiple: true,
    desc: 'Convert color pages to black & white to save ink.', run: op('grayscale') },
  { id: 'resize-pdf', name: 'Resize Pages', icon: 'Scaling', color: '#0369a1', category: 'optimize', accept: PDF, multiple: true,
    desc: 'Fit every page onto A4, Letter or another standard paper size.', run: op('resize'),
    options: [
      { key: 'size', label: 'Paper size', type: 'select', default: 'A4', choices: ['A4', 'Letter', 'Legal', 'A3', 'A5'] },
      { key: 'orientation', label: 'Orientation', type: 'select', default: 'auto', choices: [['auto', 'Match each page'], ['portrait', 'Portrait'], ['landscape', 'Landscape']] },
    ] },

  // ---- Convert to PDF
  { id: 'image-to-pdf', name: 'Image to PDF', icon: 'FileImage', color: '#ca8a04', category: 'to-pdf', accept: 'image/*', multiple: true, reorder: true,
    desc: 'Convert JPG, PNG, WEBP, GIF and other images into a PDF.', run: op('imagesToPdf'),
    options: [
      { key: 'pageSize', label: 'Page size', type: 'select', default: 'A4', choices: [['fit', 'Same as image'], 'A4', 'Letter', 'Legal', 'A3', 'A5'] },
      { key: 'orientation', label: 'Orientation', type: 'select', default: 'auto', choices: [['auto', 'Auto'], ['portrait', 'Portrait'], ['landscape', 'Landscape']], show: (o) => o.pageSize !== 'fit' },
      { key: 'margin', label: 'Margin', type: 'select', default: 'small', choices: [['none', 'No margin'], ['small', 'Small'], ['big', 'Big']] },
    ] },
  { id: 'word-to-pdf', name: 'Word to PDF', icon: 'FileType', color: '#2563eb', category: 'to-pdf', accept: '.docx,.doc', multiple: true,
    desc: 'Convert DOCX documents to PDF.', run: op('wordToPdf'), options: pageLayout },
  { id: 'excel-to-pdf', name: 'Excel to PDF', icon: 'FileSpreadsheet', color: '#16a34a', category: 'to-pdf', accept: '.xlsx,.xls,.csv,.ods', multiple: true,
    desc: 'Convert spreadsheets (XLSX, XLS, CSV, ODS) to PDF.', run: op('excelToPdf'),
    options: pageLayout.map((o) => (o.key === 'orientation' ? { ...o, default: 'landscape' } : o)) },
  { id: 'html-to-pdf', name: 'HTML to PDF', icon: 'Code', color: '#ea580c', category: 'to-pdf', accept: '.html,.htm', multiple: true, allowNoFiles: true,
    desc: 'Convert an HTML file or pasted HTML code into a PDF.', run: op('htmlFileToPdf'),
    options: [{ key: 'html', label: 'Or paste HTML', type: 'textarea', default: '', placeholder: '<h1>Hello</h1>', show: (o, files) => !files.length }, ...pageLayout] },
  { id: 'text-to-pdf', name: 'Text to PDF', icon: 'Type', color: '#64748b', category: 'to-pdf', accept: '.txt,.md,.csv,.log,.json,text/plain', multiple: true, allowNoFiles: true,
    desc: 'Turn plain text files, or text you type, into a PDF.', run: op('textToPdf'),
    options: [
      { key: 'text', label: 'Or type text', type: 'textarea', default: '', placeholder: 'Type or paste text here…', show: (o, files) => !files.length },
      { key: 'fontSize', label: 'Font size', type: 'number', default: 11, min: 6, max: 36 },
      ...pageLayout,
    ] },

  // ---- Convert from PDF
  { id: 'pdf-to-word', name: 'PDF to Word', icon: 'FileText', color: '#2563eb', category: 'from-pdf', accept: PDF, multiple: true,
    desc: 'Convert PDF into an editable DOCX document.', run: op('pdfToWord'),
    options: [{ key: 'mode', label: 'Conversion mode', type: 'radio', default: 'text', choices: [
      ['text', 'Editable text', 'Extracts text and headings so you can edit them in Word.'],
      ['layout', 'Exact layout', 'Each page looks identical, placed as an image.'],
    ] }] },
  { id: 'pdf-to-jpg', name: 'PDF to JPG / PNG', icon: 'Image', color: '#ca8a04', category: 'from-pdf', accept: PDF, multiple: true,
    desc: 'Convert each PDF page into a high quality image.', run: op('pdfToImages'),
    options: [
      { key: 'format', label: 'Format', type: 'select', default: 'jpg', choices: [['jpg', 'JPG'], ['png', 'PNG']] },
      { key: 'dpi', label: 'Quality', type: 'select', default: '150', choices: [['72', 'Low (72 DPI)'], ['150', 'Normal (150 DPI)'], ['300', 'High (300 DPI)']] },
      pagesOpt(),
    ] },
  { id: 'pdf-to-excel', name: 'PDF to Excel', icon: 'Sheet', color: '#16a34a', category: 'from-pdf', accept: PDF, multiple: true,
    desc: 'Pull tables and data from PDFs into an Excel spreadsheet.', run: op('pdfToExcel'),
    options: [{ key: 'sheets', label: 'Sheets', type: 'select', default: 'perPage', choices: [['perPage', 'One sheet per page'], ['single', 'Everything in one sheet']] }] },
  { id: 'pdf-to-ppt', name: 'PDF to PowerPoint', icon: 'Presentation', color: '#ea580c', category: 'from-pdf', accept: PDF, multiple: true,
    desc: 'Turn each PDF page into a PowerPoint slide.', run: op('pdfToPpt') },
  { id: 'pdf-to-text', name: 'PDF to Text', icon: 'AlignLeft', color: '#64748b', category: 'from-pdf', accept: PDF, multiple: true,
    desc: 'Extract all the text from a PDF into a .txt file.', run: op('pdfToText') },

  // ---- Security
  { id: 'protect-pdf', name: 'Protect PDF', icon: 'Lock', color: '#0f766e', category: 'security', accept: PDF, multiple: true,
    desc: 'Encrypt your PDF with a password (AES-256).', run: op('protect'),
    options: [
      { key: 'password', label: 'Password', type: 'password', default: '' },
      { key: 'confirm', label: 'Confirm password', type: 'password', default: '' },
      { key: 'ownerPassword', label: 'Owner password (optional)', type: 'password', default: '', help: 'Lets you change permissions later. Defaults to the same password.' },
      { key: 'allowPrint', label: 'Allow printing', type: 'checkbox', default: true },
      { key: 'allowCopy', label: 'Allow copying text', type: 'checkbox', default: true },
      { key: 'allowEdit', label: 'Allow editing', type: 'checkbox', default: false },
    ] },
  { id: 'unlock-pdf', name: 'Unlock PDF', icon: 'LockOpen', color: '#0891b2', category: 'security', accept: PDF, multiple: true,
    desc: 'Remove the password from a PDF you have the password for.', run: op('unlock'),
    options: [{ key: 'password', label: 'Current password', type: 'password', default: '', help: 'Leave empty if the PDF only has editing restrictions.' }] },
  { id: 'flatten-pdf', name: 'Flatten PDF', icon: 'Layers', color: '#7c3aed', category: 'security', accept: PDF, multiple: true,
    desc: 'Make form fields permanent so they can no longer be changed.', run: op('flatten') },

  // ---- Advanced
  { id: 'ocr-pdf', name: 'OCR PDF', icon: 'ScanText', color: '#be123c', category: 'advanced', accept: PDF, multiple: true,
    desc: 'Make scanned PDFs searchable and copyable with text recognition.', run: op('ocr'),
    options: [{ key: 'lang', label: 'Document language', type: 'select', default: 'eng', choices: [
      ['eng', 'English'], ['hin', 'Hindi'], ['spa', 'Spanish'], ['fra', 'French'], ['deu', 'German'], ['ita', 'Italian'], ['por', 'Portuguese'],
      ['rus', 'Russian'], ['ara', 'Arabic'], ['ben', 'Bengali'], ['tam', 'Tamil'], ['tel', 'Telugu'], ['mar', 'Marathi'], ['guj', 'Gujarati'],
      ['urd', 'Urdu'], ['chi_sim', 'Chinese (Simplified)'], ['jpn', 'Japanese'], ['kor', 'Korean'], ['eng+hin', 'English + Hindi'],
    ] }],
    note: 'OCR runs on your device. The first run downloads the recognition engine (~10 MB). Large documents can take a while.' },
  { id: 'compare-pdf', name: 'Compare PDF', icon: 'GitCompareArrows', color: '#4f46e5', category: 'advanced', accept: PDF, multiple: true, reorder: true, maxFiles: 2,
    desc: 'Find the text differences between two versions of a PDF.', run: op('compare') },
];

export const toolById = (id) => TOOLS.find((t) => t.id === id);
