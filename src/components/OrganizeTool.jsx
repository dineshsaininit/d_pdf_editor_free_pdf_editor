import { useRef, useState } from 'react';
import { RotateCw, RotateCcw, Trash2, Copy, FilePlus, ArrowDownUp, Plus } from 'lucide-react';
import { degrees } from '@cantoo/pdf-lib';
import Dropzone from './Dropzone';
import Results from './Results';
import { PDFDocument, openPdfJs, openPdfLib, readBytes, renderThumb, pdfBlob, baseName } from '../lib/pdf';

let uid = 0;

export default function OrganizeTool() {
  const [sources, setSources] = useState([]); // { name, bytes }
  const [pages, setPages] = useState([]); // { key, src, index, rot, thumb, blank }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [output, setOutput] = useState(null);
  const [busy, setBusy] = useState(false);
  const drag = useRef(null);
  const [overKey, setOverKey] = useState(null);

  const addFiles = async (files) => {
    setLoading(true);
    setError('');
    try {
      let srcIdx = sources.length;
      const newSources = [];
      const newPages = [];
      for (const f of files) {
        const bytes = await readBytes(f);
        const pdf = await openPdfJs(bytes);
        for (let i = 1; i <= pdf.numPages; i++) {
          newPages.push({ key: ++uid, src: srcIdx, index: i - 1, rot: 0, thumb: await renderThumb(pdf, i, 150) });
        }
        pdf.destroy();
        newSources.push({ name: f.name, bytes });
        srcIdx++;
      }
      setSources((s) => [...s, ...newSources]);
      setPages((p) => [...p, ...newPages]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const update = (key, fn) => setPages((ps) => ps.map((p) => (p.key === key ? fn(p) : p)));
  const removeAt = (key) => setPages((ps) => ps.filter((p) => p.key !== key));
  const duplicate = (key) => setPages((ps) => {
    const i = ps.findIndex((p) => p.key === key);
    return [...ps.slice(0, i + 1), { ...ps[i], key: ++uid }, ...ps.slice(i + 1)];
  });
  const insertBlank = (key) => setPages((ps) => {
    const i = ps.findIndex((p) => p.key === key);
    return [...ps.slice(0, i + 1), { key: ++uid, blank: true, rot: 0, refKey: ps[i].key }, ...ps.slice(i + 1)];
  });
  const rotateAll = (d) => setPages((ps) => ps.map((p) => ({ ...p, rot: (p.rot + d + 360) % 360 })));

  const onDrop = (targetKey) => {
    const from = drag.current;
    setOverKey(null);
    if (from == null || from === targetKey) return;
    setPages((ps) => {
      const item = ps.find((p) => p.key === from);
      const rest = ps.filter((p) => p.key !== from);
      const ti = rest.findIndex((p) => p.key === targetKey);
      rest.splice(ti, 0, item);
      return rest;
    });
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const docs = await Promise.all(sources.map((s) => openPdfLib(s.bytes)));
      const out = await PDFDocument.create();
      let lastSize = [595.28, 841.89];
      for (const p of pages) {
        if (p.blank) {
          const np = out.addPage(lastSize);
          if (p.rot) np.setRotation(degrees(p.rot));
          continue;
        }
        const [copied] = await out.copyPages(docs[p.src], [p.index]);
        const base = copied.getRotation().angle;
        copied.setRotation(degrees((base + p.rot) % 360));
        out.addPage(copied);
        lastSize = [copied.getWidth(), copied.getHeight()];
      }
      const name = sources.length === 1 ? `${baseName(sources[0].name)}-organized.pdf` : 'organized.pdf';
      setOutput({ results: [{ name, blob: pdfBlob(await out.save({ useObjectStreams: true })) }] });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (output) return <Results {...output} onReset={() => { setOutput(null); setPages([]); setSources([]); }} />;
  if (!pages.length) {
    return (
      <div className="form-tool">
        <div className="files-pane">
          {loading ? <p className="center muted">Loading pages…</p> : <Dropzone accept=".pdf,application/pdf" multiple onFiles={addFiles} />}
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="organize">
      <div className="toolbar card">
        <span className="muted">{pages.length} pages · drag to reorder</span>
        <div className="spacer" />
        <button className="btn small" onClick={() => rotateAll(-90)}><RotateCcw size={15} /> Rotate all</button>
        <button className="btn small" onClick={() => rotateAll(90)}><RotateCw size={15} /> Rotate all</button>
        <button className="btn small" onClick={() => setPages((p) => [...p].reverse())}><ArrowDownUp size={15} /> Reverse</button>
        <label className="btn small">
          <Plus size={15} /> Add PDF
          <input type="file" hidden accept=".pdf,application/pdf" multiple onChange={(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />
        </label>
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save PDF'}</button>
      </div>
      {error && <p className="error">{error}</p>}
      {loading && <p className="muted center">Loading pages…</p>}
      <div className="page-grid">
        {pages.map((p, i) => (
          <div
            key={p.key}
            className={`page-card${overKey === p.key ? ' over' : ''}`}
            draggable
            onDragStart={() => { drag.current = p.key; }}
            onDragOver={(e) => { e.preventDefault(); setOverKey(p.key); }}
            onDragLeave={() => setOverKey(null)}
            onDrop={() => onDrop(p.key)}
          >
            <div className="page-thumb">
              {p.blank ? <div className="blank" style={{ transform: `rotate(${p.rot}deg)` }} /> : <img src={p.thumb} alt={`Page ${i + 1}`} style={{ transform: `rotate(${p.rot}deg)` }} draggable={false} />}
            </div>
            <div className="page-actions">
              <button title="Rotate left" onClick={() => update(p.key, (x) => ({ ...x, rot: (x.rot + 270) % 360 }))}><RotateCcw size={14} /></button>
              <button title="Rotate right" onClick={() => update(p.key, (x) => ({ ...x, rot: (x.rot + 90) % 360 }))}><RotateCw size={14} /></button>
              <button title="Duplicate" onClick={() => duplicate(p.key)}><Copy size={14} /></button>
              <button title="Insert blank page after" onClick={() => insertBlank(p.key)}><FilePlus size={14} /></button>
              <button title="Delete" className="danger" onClick={() => removeAt(p.key)}><Trash2 size={14} /></button>
            </div>
            <span className="page-num">{i + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
