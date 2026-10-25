import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MousePointer2, Type, Image as ImageIcon, Square, Circle, Minus, Pencil, Highlighter, Eraser, Signature,
  Check, CalendarDays, Undo2, Trash2, ZoomIn, ZoomOut, Copy, Bold, SquareX, CaseUpper,
} from 'lucide-react';
import Dropzone from './Dropzone';
import Results from './Results';
import SignatureModal from './SignatureModal';
import { openPdfJs, readBytes, pdfBlob, baseName } from '../lib/pdf';
import { saveEdits, CHECK_PATH } from '../lib/editorSave';
import { FONT_MAP } from '../lib/draw';

const TOOLSETS = {
  edit: ['select', 'text', 'draw', 'highlight', 'whiteout', 'rect', 'ellipse', 'line', 'image', 'signature', 'check', 'date'],
  sign: ['select', 'signature', 'initials', 'text', 'date', 'check'],
  redact: ['select', 'redact'],
};

const TOOL_INFO = {
  select: { label: 'Select', icon: MousePointer2 },
  text: { label: 'Text', icon: Type },
  draw: { label: 'Draw', icon: Pencil },
  highlight: { label: 'Highlight', icon: Highlighter },
  whiteout: { label: 'Whiteout', icon: Eraser },
  rect: { label: 'Rectangle', icon: Square },
  ellipse: { label: 'Ellipse', icon: Circle },
  line: { label: 'Line', icon: Minus },
  image: { label: 'Image', icon: ImageIcon },
  signature: { label: 'Signature', icon: Signature },
  initials: { label: 'Initials', icon: CaseUpper },
  check: { label: 'Checkmark', icon: Check },
  date: { label: 'Date', icon: CalendarDays },
  redact: { label: 'Redact area', icon: SquareX },
};

// Blur the text box being edited so its onBlur commits before React unmounts it.
const commitEditing = () => {
  if (document.activeElement?.isContentEditable) document.activeElement.blur();
};

const DRAG_CREATE = new Set(['rect', 'ellipse', 'line', 'highlight', 'whiteout', 'redact']);
const COLORS = ['#000000', '#1d4ed8', '#dc2626', '#16a34a', '#f59e0b', '#7c3aed', '#ffffff'];
let uid = 0;

function PageCanvas({ pdf, num, zoom, width, height }) {
  const ref = useRef();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: '800px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let task;
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(num);
      if (cancelled) return;
      const ratio = window.devicePixelRatio || 1;
      const vp = page.getViewport({ scale: zoom * ratio });
      const c = ref.current;
      c.width = Math.ceil(vp.width);
      c.height = Math.ceil(vp.height);
      task = page.render({ canvasContext: c.getContext('2d'), canvas: c, viewport: vp });
      task.promise.catch(() => {});
    })();
    return () => { cancelled = true; task?.cancel(); };
  }, [visible, pdf, num, zoom]);
  return <canvas ref={ref} style={{ width: width * zoom, height: height * zoom }} />;
}

function ObjectView({ o, zoom, selected, editing, onPointerDown, onResizeDown, onDoubleClick, onTextCommit }) {
  const textRef = useRef();
  useEffect(() => {
    if (editing && textRef.current) {
      const el = textRef.current;
      el.innerText = o.text;
      setTimeout(() => {
        el.focus();
        window.getSelection().selectAllChildren(el);
      }, 0);
    }
    // only when entering edit mode
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const nx = Math.min(o.x, o.x + o.w), ny = Math.min(o.y, o.y + o.h);
  const box = o.type === 'text'
    ? { left: o.x * zoom, top: o.y * zoom }
    : { left: nx * zoom, top: ny * zoom, width: Math.abs(o.w) * zoom, height: Math.abs(o.h) * zoom };
  let inner = null;
  switch (o.type) {
    case 'text':
      {
        const textStyle = { fontSize: o.size * zoom, color: o.color, fontFamily: FONT_MAP[o.family].css, fontWeight: o.bold ? 700 : 400 };
        // Separate keyed elements so React never reconciles text the browser has edited.
        inner = editing ? (
          <div
            key="edit"
            ref={textRef}
            className="obj-text"
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            onBlur={(e) => onTextCommit(e.currentTarget.innerText.replace(/\n$/, ''))}
            onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.blur(); e.stopPropagation(); }}
            style={textStyle}
          />
        ) : (
          <div key="view" className="obj-text" style={textStyle}>{o.text}</div>
        );
      }
      break;
    case 'image':
      inner = <img src={o.src} alt="" draggable={false} />;
      break;
    case 'rect':
    case 'ellipse':
      inner = <div className="fill" style={{ border: `${o.stroke * zoom}px solid ${o.color}`, background: o.fill || 'transparent', borderRadius: o.type === 'ellipse' ? '50%' : 0 }} />;
      break;
    case 'highlight':
      inner = <div className="fill" style={{ background: o.color, opacity: 0.4, mixBlendMode: 'multiply' }} />;
      break;
    case 'whiteout':
      inner = <div className="fill" style={{ background: '#fff', outline: '1px dashed #cbd5e1' }} />;
      break;
    case 'redact':
      inner = <div className="fill" style={{ background: '#000' }} />;
      break;
    case 'line':
    case 'draw':
    case 'check': {
      const w = Math.abs(o.w) || 1, h = Math.abs(o.h) || 1;
      let pts;
      let sw;
      if (o.type === 'line') {
        pts = [[o.w < 0 ? w : 0, o.h < 0 ? h : 0], [o.w < 0 ? 0 : w, o.h < 0 ? 0 : h]];
        sw = o.stroke;
      } else {
        pts = o.points.map(([x, y]) => [(x * w) / (o.baseW || 1), (y * h) / (o.baseH || 1)]);
        sw = o.type === 'check' ? Math.max(1.5, w / 9) : o.stroke;
      }
      inner = (
        <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} overflow="visible">
          <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={o.color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
      break;
    }
    default:
  }
  return (
    <div
      className={`obj obj-${o.type}${selected ? ' selected' : ''}${editing ? ' editing' : ''}`}
      style={box}
      onPointerDown={editing ? (e) => e.stopPropagation() : onPointerDown}
      onDoubleClick={onDoubleClick}
    >
      {inner}
      {selected && !editing && (
        <span
          className="handle"
          onPointerDown={onResizeDown}
          style={o.type === 'line' ? { left: (o.w < 0 ? 0 : o.w * zoom) - 7, top: (o.h < 0 ? 0 : o.h * zoom) - 7 } : undefined}
        />
      )}
    </div>
  );
}

export default function EditorTool({ mode = 'edit', tool: toolDef }) {
  const [file, setFile] = useState(null);
  const [bytes, setBytes] = useState(null);
  const [pdf, setPdf] = useState(null);
  const [sizes, setSizes] = useState([]);
  const [zoom, setZoom] = useState(1);
  const [objects, setObjects] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [tool, setTool] = useState(mode === 'sign' ? 'signature' : mode === 'redact' ? 'redact' : 'select');
  const [pending, setPending] = useState(null); // image / signature waiting to be placed
  const [sigModal, setSigModal] = useState(null);
  const [style, setStyle] = useState({ color: '#000000', size: 14, family: 'Helvetica', bold: false, stroke: 2, highlight: '#facc15' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [output, setOutput] = useState(null);
  const history = useRef([]);
  const objectsRef = useRef(objects);
  objectsRef.current = objects;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const scrollRef = useRef();
  const imageInput = useRef();

  const load = async ([f]) => {
    setError('');
    try {
      const b = await readBytes(f);
      const doc = await openPdfJs(b);
      const s = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const vp = (await doc.getPage(i)).getViewport({ scale: 1 });
        s.push({ w: vp.width, h: vp.height });
      }
      setFile(f);
      setBytes(b);
      setPdf(doc);
      setSizes(s);
      const avail = Math.min(window.innerWidth, 1100) - 48;
      setZoom(Math.min(1.5, Math.max(0.4, avail / Math.max(...s.map((x) => x.w)))));
      if (mode === 'sign') setSigModal('signature');
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => () => pdf?.destroy(), [pdf]);

  const snapshot = () => {
    history.current.push(objectsRef.current);
    if (history.current.length > 100) history.current.shift();
  };
  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (prev) { setObjects(prev); setSelectedId(null); setEditingId(null); }
  }, []);
  const updateObj = (id, patch) => setObjects((os) => os.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  const removeObj = useCallback((id) => {
    snapshot();
    setObjects((os) => os.filter((o) => o.id !== id));
    setSelectedId(null);
    setEditingId(null);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (editingId || /input|textarea|select/i.test(e.target.tagName)) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) { e.preventDefault(); removeObj(selectedId); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
      if (e.key === 'Escape') { setSelectedId(null); setPending(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, editingId, removeObj, undo]);

  /** Generic pointer drag helper; fn receives (dx, dy, point) in page units. */
  const startDrag = (e, pageEl, onMove, onEnd) => {
    e.preventDefault();
    const rect = pageEl.getBoundingClientRect();
    const toPt = (ev) => ({ x: (ev.clientX - rect.left) / zoomRef.current, y: (ev.clientY - rect.top) / zoomRef.current });
    const start = toPt(e);
    const move = (ev) => { const p = toPt(ev); onMove(p.x - start.x, p.y - start.y, p); };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onEnd?.(toPt(ev));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return start;
  };

  const chooseTool = (t) => {
    setSelectedId(null);
    setEditingId(null);
    if (t === 'image') { imageInput.current.click(); return; }
    if (t === 'signature' || t === 'initials') { setSigModal(t); return; }
    setPending(null);
    setTool(t);
  };

  const onImagePicked = (f) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Normalise to PNG/JPEG data URL that pdf-lib can embed.
        let src = reader.result;
        if (!/^data:image\/(png|jpeg)/.test(src)) {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          src = c.toDataURL('image/png');
        }
        setPending({ type: 'image', src, aspect: img.naturalWidth / img.naturalHeight, width: 200 });
        setTool('place');
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(f);
  };

  const onPagePointerDown = (e, pageIndex) => {
    if (e.button !== 0) return;
    if (tool !== 'select') e.preventDefault(); // keep focus on newly created text boxes
    const pageEl = e.currentTarget;
    const rect = pageEl.getBoundingClientRect();
    const pt = { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
    commitEditing();
    setEditingId(null);

    if (tool === 'select') { setSelectedId(null); return; }

    if (tool === 'place' && pending) {
      snapshot();
      const w = pending.width, h = w / pending.aspect;
      const o = { id: ++uid, page: pageIndex, type: 'image', src: pending.src, aspect: pending.aspect, x: pt.x - w / 2, y: pt.y - h / 2, w, h };
      setObjects((os) => [...os, o]);
      setSelectedId(o.id);
      if (pending.type === 'image') { setPending(null); setTool('select'); }
      return;
    }

    if (tool === 'text' || tool === 'date') {
      snapshot();
      const text = tool === 'date' ? new Date().toLocaleDateString() : 'Type here';
      const o = { id: ++uid, page: pageIndex, type: 'text', text, x: pt.x, y: pt.y - style.size * 0.6, w: 0, h: 0, size: style.size, color: style.color, family: style.family, bold: style.bold };
      setObjects((os) => [...os, o]);
      setSelectedId(o.id);
      if (tool === 'text') setEditingId(o.id);
      setTool('select');
      return;
    }

    if (tool === 'check') {
      snapshot();
      const s = Math.max(14, style.size * 1.3);
      const o = { id: ++uid, page: pageIndex, type: 'check', points: CHECK_PATH, baseW: 24, baseH: 24, x: pt.x - s / 2, y: pt.y - s / 2, w: s, h: s, color: style.color };
      setObjects((os) => [...os, o]);
      setSelectedId(o.id);
      return;
    }

    if (tool === 'draw') {
      snapshot();
      const id = ++uid;
      const pts = [[pt.x, pt.y]];
      setObjects((os) => [...os, { id, page: pageIndex, type: 'draw', rawPoints: pts, points: [[0, 0]], x: pt.x, y: pt.y, w: 0, h: 0, color: style.color, stroke: style.stroke }]);
      const toObj = (raw) => {
        const xs = raw.map((p) => p[0]), ys = raw.map((p) => p[1]);
        const x = Math.min(...xs), y = Math.min(...ys);
        const w = Math.max(1, Math.max(...xs) - x), h = Math.max(1, Math.max(...ys) - y);
        return { x, y, w, h, baseW: w, baseH: h, points: raw.map(([px, py]) => [px - x, py - y]) };
      };
      startDrag(e, pageEl, (dx, dy, p) => {
        pts.push([p.x, p.y]);
        updateObj(id, toObj(pts));
      }, () => {
        if (pts.length < 2) setObjects((os) => os.filter((o) => o.id !== id));
      });
      return;
    }

    if (DRAG_CREATE.has(tool)) {
      snapshot();
      const id = ++uid;
      const color = tool === 'highlight' ? style.highlight : style.color;
      setObjects((os) => [...os, { id, page: pageIndex, type: tool, x: pt.x, y: pt.y, w: 0, h: 0, color, stroke: style.stroke }]);
      startDrag(e, pageEl, (dx, dy) => {
        if (tool === 'line') updateObj(id, { w: dx, h: dy });
        else updateObj(id, { x: Math.min(pt.x, pt.x + dx), y: Math.min(pt.y, pt.y + dy), w: Math.abs(dx), h: Math.abs(dy) });
      }, (end) => {
        const big = Math.hypot(end.x - pt.x, end.y - pt.y) > 4;
        if (!big) setObjects((os) => os.filter((o) => o.id !== id));
        else setSelectedId(id);
      });
    }
  };

  const onObjPointerDown = (e, o) => {
    e.stopPropagation();
    if (tool !== 'select' && tool !== 'place' && !['signature', 'initials'].includes(tool)) setTool('select');
    setSelectedId(o.id);
    if (editingId && editingId !== o.id) { commitEditing(); setEditingId(null); }
    const pageEl = e.currentTarget.closest('.page-overlay');
    snapshot();
    let moved = false;
    startDrag(e, pageEl, (dx, dy) => {
      moved = true;
      updateObj(o.id, { x: o.x + dx, y: o.y + dy });
    }, () => { if (!moved) history.current.pop(); });
  };

  const onResizeDown = (e, o) => {
    e.stopPropagation();
    const pageEl = e.currentTarget.closest('.page-overlay');
    snapshot();
    startDrag(e, pageEl, (dx, dy) => {
      if (o.type === 'text') updateObj(o.id, { size: Math.max(5, Math.round(o.size + dy / 1.5)) });
      else if (o.type === 'line') updateObj(o.id, { w: o.w + dx, h: o.h + dy });
      else if (o.type === 'image' || o.type === 'check') {
        const w = Math.max(10, o.w + dx);
        updateObj(o.id, { w, h: w / (o.aspect || 1) });
      } else updateObj(o.id, { w: Math.max(4, o.w + dx), h: Math.max(4, o.h + dy) });
    });
  };

  const selected = objects.find((o) => o.id === selectedId);
  const setProp = (patch) => {
    setStyle((s) => ({ ...s, ...patch }));
    if (selected) {
      snapshot();
      const p = { ...patch };
      if (selected.type === 'highlight' && p.highlight) p.color = p.highlight;
      updateObj(selected.id, p);
    }
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const out = await saveEdits(bytes, objects.filter((o) => o.type !== 'text' || o.text.trim()));
      const suffix = mode === 'sign' ? 'signed' : mode === 'redact' ? 'redacted' : 'edited';
      setOutput({ results: [{ name: `${baseName(file.name)}-${suffix}.pdf`, blob: pdfBlob(out) }] });
    } catch (e) {
      console.error(e);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (output) {
    return <Results {...output} onReset={() => { setOutput(null); setFile(null); setPdf(null); setObjects([]); history.current = []; }} />;
  }
  if (!pdf) {
    return (
      <div className="form-tool">
        <div className="files-pane">
          <Dropzone accept=".pdf,application/pdf" onFiles={load} />
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    );
  }

  const showText = selected?.type === 'text' || (!selected && ['text', 'date'].includes(tool));
  const showStroke = selected ? ['rect', 'ellipse', 'line', 'draw'].includes(selected.type) : ['rect', 'ellipse', 'line', 'draw'].includes(tool);
  const showHighlight = selected?.type === 'highlight' || (!selected && tool === 'highlight');
  const showColor = !['image', 'whiteout', 'redact', 'highlight'].includes(selected?.type) && !(!selected && ['whiteout', 'redact', 'select', 'highlight'].includes(tool));
  const cursor = tool === 'select' ? 'default' : tool === 'text' || tool === 'date' ? 'text' : 'crosshair';
  const currentColor = selected?.color ?? style.color;

  return (
    <div className="editor">
      <input ref={imageInput} type="file" accept="image/*" hidden onChange={(e) => { onImagePicked(e.target.files[0]); e.target.value = ''; }} />
      <div className="editor-toolbar card">
        <div className="tool-buttons">
          {TOOLSETS[mode].map((t) => {
            const I = TOOL_INFO[t].icon;
            const active = tool === t || (tool === 'place' && pending?.type === t);
            return (
              <button key={t} className={active ? 'active' : ''} onClick={() => chooseTool(t)} title={TOOL_INFO[t].label}>
                <I size={18} /><span>{TOOL_INFO[t].label}</span>
              </button>
            );
          })}
        </div>
        <div className="spacer" />
        <button className="icon-btn" onClick={undo} title="Undo (Ctrl+Z)"><Undo2 size={18} /></button>
        <button className="icon-btn" onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.15).toFixed(2)))} title="Zoom out"><ZoomOut size={18} /></button>
        <span className="zoom-label">{Math.round(zoom * 100)}%</span>
        <button className="icon-btn" onClick={() => setZoom((z) => Math.min(3, +(z + 0.15).toFixed(2)))} title="Zoom in"><ZoomIn size={18} /></button>
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : mode === 'sign' ? 'Finish & download' : mode === 'redact' ? 'Apply redactions' : 'Save PDF'}</button>
      </div>

      <div className="prop-bar card">
        {tool === 'place' && pending && <span className="hint">Click on the page to place your {pending.type === 'image' ? 'image' : pending.type}. Press Esc when done.</span>}
        {tool === 'redact' && <span className="hint">Drag over anything you want to permanently remove. Redacted pages are flattened so the hidden content can’t be recovered.</span>}
        {tool === 'select' && !selected && <span className="hint">Pick a tool above, then click or drag on the page. Double-click text to edit it.</span>}
        {showColor && (
          <div className="colors">
            {COLORS.map((c) => (
              <button key={c} className={`swatch${currentColor === c ? ' active' : ''}`} style={{ background: c }} onClick={() => setProp({ color: c })} aria-label={`Color ${c}`} />
            ))}
            <input type="color" value={currentColor} onChange={(e) => setProp({ color: e.target.value })} title="Custom color" />
          </div>
        )}
        {showHighlight && (
          <div className="colors">
            {['#facc15', '#4ade80', '#60a5fa', '#f472b6', '#fb923c'].map((c) => (
              <button key={c} className={`swatch${(selected?.color ?? style.highlight) === c ? ' active' : ''}`} style={{ background: c }} onClick={() => setProp({ highlight: c })} aria-label={`Highlight ${c}`} />
            ))}
          </div>
        )}
        {showText && (
          <>
            <select value={selected?.family ?? style.family} onChange={(e) => setProp({ family: e.target.value })}>
              {Object.keys(FONT_MAP).map((f) => <option key={f}>{f}</option>)}
            </select>
            <label className="inline">Size <input type="number" min={5} max={144} value={selected?.size ?? style.size} onChange={(e) => setProp({ size: +e.target.value || 12 })} /></label>
            <button className={`icon-btn${(selected?.bold ?? style.bold) ? ' active' : ''}`} onClick={() => setProp({ bold: !(selected?.bold ?? style.bold) })} title="Bold"><Bold size={16} /></button>
          </>
        )}
        {showStroke && (
          <label className="inline">Thickness <input type="range" min={1} max={12} value={selected?.stroke ?? style.stroke} onChange={(e) => setProp({ stroke: +e.target.value })} /></label>
        )}
        {selected && ['rect', 'ellipse'].includes(selected.type) && (
          <label className="check inline"><input type="checkbox" checked={!!selected.fill} onChange={(e) => setProp({ fill: e.target.checked ? selected.color : null })} /> Filled</label>
        )}
        {selected && (
          <>
            <div className="spacer" />
            <button className="btn small" onClick={() => { snapshot(); const c = { ...selected, id: ++uid, x: selected.x + 12, y: selected.y + 12 }; setObjects((os) => [...os, c]); setSelectedId(c.id); }}><Copy size={14} /> Duplicate</button>
            <button className="btn small danger" onClick={() => removeObj(selected.id)}><Trash2 size={14} /> Delete</button>
          </>
        )}
      </div>
      {error && <p className="error">{error}</p>}

      <div className="pages-scroll" ref={scrollRef}>
        {sizes.map((s, i) => (
          <div key={i} className="page-wrap" style={{ width: s.w * zoom }}>
            <PageCanvas pdf={pdf} num={i + 1} zoom={zoom} width={s.w} height={s.h} />
            <div
              className={`page-overlay${tool !== 'select' ? ' drawing' : ''}`}
              style={{ cursor }}
              onPointerDown={(e) => onPagePointerDown(e, i)}
            >
              {objects.filter((o) => o.page === i).map((o) => (
                <ObjectView
                  key={o.id}
                  o={o}
                  zoom={zoom}
                  selected={o.id === selectedId}
                  editing={o.id === editingId}
                  onPointerDown={(e) => onObjPointerDown(e, o)}
                  onResizeDown={(e) => onResizeDown(e, o)}
                  onDoubleClick={() => o.type === 'text' && setEditingId(o.id)}
                  onTextCommit={(text) => {
                    setEditingId(null);
                    if (!text.trim()) setObjects((os) => os.filter((x) => x.id !== o.id));
                    else if (text !== o.text) { snapshot(); updateObj(o.id, { text }); }
                  }}
                />
              ))}
            </div>
            <span className="page-label">{i + 1} / {sizes.length}</span>
          </div>
        ))}
      </div>

      {sigModal && (
        <SignatureModal
          kind={sigModal}
          onClose={() => setSigModal(null)}
          onDone={(sig) => {
            setPending({ type: sigModal, src: sig.src, aspect: sig.aspect, width: sigModal === 'initials' ? 70 : 170 });
            setTool('place');
            setSigModal(null);
          }}
        />
      )}
      <p className="muted small center">{toolDef?.name}: {file.name} · {sizes.length} page(s) · Your file never leaves this device.</p>
    </div>
  );
}
