import { useEffect, useRef, useState } from 'react';
import { X, Trash2 } from 'lucide-react';

const FONTS = ['Great Vibes', 'Dancing Script', 'Satisfy', 'Caveat'];
const COLORS = ['#111111', '#1d4ed8', '#b91c1c'];

function storageKey(kind) {
  return `dpdf-saved-${kind}`;
}
function loadSaved(kind) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(kind)) || '[]');
  } catch {
    return [];
  }
}
function storeSaved(kind, list) {
  try {
    localStorage.setItem(storageKey(kind), JSON.stringify(list.slice(0, 6)));
  } catch { /* storage unavailable: signatures just won't be remembered */ }
}

/** Crop transparent borders; returns { src, aspect }. */
function trim(canvas) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const d = ctx.getImageData(0, 0, width, height).data;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (d[(y * width + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  const pad = 6;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(width - 1, x1 + pad); y1 = Math.min(height - 1, y1 + pad);
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return { src: out.toDataURL('image/png'), aspect: out.width / out.height };
}

function DrawPad({ color, padRef }) {
  const drawing = useRef(null);
  useEffect(() => {
    const c = padRef.current;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.clientWidth * ratio;
    c.height = c.clientHeight * ratio;
    c.getContext('2d').scale(ratio, ratio);
  }, [padRef]);

  const pos = (e) => {
    const r = padRef.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const down = (e) => {
    padRef.current.setPointerCapture(e.pointerId);
    drawing.current = [pos(e)];
  };
  const move = (e) => {
    if (!drawing.current) return;
    const pts = drawing.current;
    pts.push(pos(e));
    if (pts.length < 3) return;
    const ctx = padRef.current.getContext('2d');
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.6;
    ctx.lineCap = ctx.lineJoin = 'round';
    const [a, b, c] = pts.slice(-3);
    ctx.beginPath();
    ctx.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    ctx.quadraticCurveTo(b[0], b[1], (b[0] + c[0]) / 2, (b[1] + c[1]) / 2);
    ctx.stroke();
  };
  const up = () => { drawing.current = null; };
  return <canvas ref={padRef} className="sig-pad" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />;
}

export default function SignatureModal({ kind = 'signature', onDone, onClose }) {
  const [tab, setTab] = useState('draw');
  const [color, setColor] = useState(COLORS[0]);
  const [name, setName] = useState('');
  const [font, setFont] = useState(FONTS[0]);
  const [upload, setUpload] = useState(null);
  const [removeBg, setRemoveBg] = useState(true);
  const [saved, setSaved] = useState(() => loadSaved(kind));
  const [error, setError] = useState('');
  const padRef = useRef();
  const title = kind === 'initials' ? 'Initials' : 'Signature';

  const finish = (result) => {
    const next = [result, ...saved.filter((s) => s.src !== result.src)];
    storeSaved(kind, next);
    onDone(result);
  };

  const create = async () => {
    setError('');
    let canvas;
    if (tab === 'draw') {
      canvas = padRef.current;
    } else if (tab === 'type') {
      if (!name.trim()) return setError('Type your name first.');
      await document.fonts.load(`96px "${font}"`).catch(() => {});
      canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.font = `96px "${font}"`;
      canvas.width = Math.ceil(ctx.measureText(name).width) + 60;
      canvas.height = 180;
      ctx.font = `96px "${font}"`;
      ctx.fillStyle = color;
      ctx.textBaseline = 'middle';
      ctx.fillText(name, 30, 90);
    } else {
      if (!upload) return setError('Choose an image first.');
      canvas = upload;
      if (removeBg) {
        const copy = document.createElement('canvas');
        copy.width = canvas.width;
        copy.height = canvas.height;
        const ctx = copy.getContext('2d');
        ctx.drawImage(canvas, 0, 0);
        const img = ctx.getImageData(0, 0, copy.width, copy.height);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const light = (d[i] + d[i + 1] + d[i + 2]) / 3;
          if (light > 200) d[i + 3] = Math.max(0, 255 - (light - 200) * 4.6);
        }
        ctx.putImageData(img, 0, 0);
        canvas = copy;
      }
    }
    const result = trim(canvas);
    if (!result) return setError(tab === 'draw' ? 'Draw your signature in the box first.' : 'The image appears to be empty.');
    finish(result);
  };

  const onUpload = (file) => {
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const s = Math.min(1, 1200 / img.naturalWidth);
      c.width = img.naturalWidth * s;
      c.height = img.naturalHeight * s;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      setUpload(c);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  };

  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal card">
        <div className="modal-head">
          <h3>Create your {title.toLowerCase()}</h3>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        {saved.length > 0 && (
          <div className="saved-sigs">
            <small className="muted">Saved on this device — click to use:</small>
            <div>
              {saved.map((s, i) => (
                <div key={i} className="saved-sig">
                  <img src={s.src} alt="" onClick={() => onDone(s)} />
                  <button title="Remove" onClick={() => { const n = saved.filter((_, k) => k !== i); setSaved(n); storeSaved(kind, n); }}><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="tabs">
          {['draw', 'type', 'upload'].map((t) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
          ))}
        </div>
        {tab !== 'upload' && (
          <div className="colors">
            {COLORS.map((c) => (
              <button key={c} className={`swatch${c === color ? ' active' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Color ${c}`} />
            ))}
          </div>
        )}
        {tab === 'draw' && (
          <div className="pad-wrap">
            <DrawPad color={color} padRef={padRef} />
            <button className="btn small clear" onClick={() => { const c = padRef.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); }}>Clear</button>
            <span className="pad-line">Sign above the line</span>
          </div>
        )}
        {tab === 'type' && (
          <div>
            <input className="sig-name" placeholder={kind === 'initials' ? 'Your initials' : 'Your full name'} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <div className="font-choices">
              {FONTS.map((f) => (
                <button key={f} className={f === font ? 'active' : ''} style={{ fontFamily: `"${f}", cursive`, color }} onClick={() => setFont(f)}>
                  {name || (kind === 'initials' ? 'AB' : 'Your Name')}
                </button>
              ))}
            </div>
          </div>
        )}
        {tab === 'upload' && (
          <div className="upload-sig">
            <input type="file" accept="image/*" onChange={(e) => onUpload(e.target.files[0])} />
            {upload && <img src={upload.toDataURL()} alt="Uploaded signature" />}
            <label className="check"><input type="checkbox" checked={removeBg} onChange={(e) => setRemoveBg(e.target.checked)} /> Remove white background</label>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={create}>Use this {title.toLowerCase()}</button>
        </div>
      </div>
    </div>
  );
}
