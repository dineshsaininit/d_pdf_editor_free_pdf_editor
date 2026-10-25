import { useEffect, useMemo, useState } from 'react';
import { X, ArrowUp, ArrowDown, FileText, Plus } from 'lucide-react';
import Dropzone from './Dropzone';
import Results from './Results';
import { formatSize, openPdfJs, readBytes, renderThumb } from '../lib/pdf';

function FileThumb({ file }) {
  const [src, setSrc] = useState(null);
  const [pages, setPages] = useState(null);
  useEffect(() => {
    let alive = true;
    let url;
    if (file.type.startsWith('image/')) {
      url = URL.createObjectURL(file);
      setSrc(url);
    } else if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      (async () => {
        try {
          const pdf = await openPdfJs(await readBytes(file));
          const t = await renderThumb(pdf, 1, 110);
          if (alive) { setSrc(t); setPages(pdf.numPages); }
          pdf.destroy();
        } catch {
          if (alive) setPages('locked');
        }
      })();
    }
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [file]);
  return (
    <div className="thumb">
      {src ? <img src={src} alt="" /> : <FileText size={34} />}
      {pages && <span className="badge">{pages === 'locked' ? '🔒' : `${pages} p`}</span>}
    </div>
  );
}

function Field({ opt, value, onChange }) {
  const common = { id: `opt-${opt.key}`, value: value ?? '', onChange: (e) => onChange(e.target.value) };
  const choices = (opt.choices || []).map((c) => (Array.isArray(c) ? c : [c, c]));
  switch (opt.type) {
    case 'select':
      return <select {...common}>{choices.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
    case 'radio':
      return (
        <div className="radio-cards">
          {choices.map(([v, l, d]) => (
            <label key={v} className={value === v ? 'active' : ''}>
              <input type="radio" name={opt.key} checked={value === v} onChange={() => onChange(v)} />
              <strong>{l}</strong>
              {d && <span>{d}</span>}
            </label>
          ))}
        </div>
      );
    case 'checkbox':
      return null;
    case 'textarea':
      return <textarea {...common} rows={8} placeholder={opt.placeholder} />;
    case 'range':
      return (
        <div className="range">
          <input type="range" min={opt.min} max={opt.max} step={opt.step} {...common} />
          <span>{Math.round(value * 100)}%</span>
        </div>
      );
    case 'color':
      return <input type="color" {...common} />;
    case 'number':
      return <input type="number" min={opt.min} max={opt.max} {...common} />;
    case 'password':
      return <input type="password" autoComplete="new-password" {...common} />;
    default:
      return <input type="text" placeholder={opt.placeholder} {...common} />;
  }
}

export default function FormTool({ tool }) {
  const defaults = useMemo(() => Object.fromEntries((tool.options || []).map((o) => [o.key, o.default])), [tool]);
  const [files, setFiles] = useState([]);
  const [opts, setOpts] = useState(defaults);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ v: 0, msg: '' });
  const [error, setError] = useState('');
  const [output, setOutput] = useState(null);

  useEffect(() => {
    if (!tool.prefill || !files.length) return;
    tool.prefill(files).then((p) => setOpts((o) => ({ ...o, ...p }))).catch(() => {});
  }, [files, tool]);

  const addFiles = (list) => {
    setError('');
    setFiles((prev) => {
      const next = tool.multiple ? [...prev, ...list] : list.slice(0, 1);
      return tool.maxFiles ? next.slice(0, tool.maxFiles) : next;
    });
  };
  const move = (i, d) => setFiles((f) => {
    const n = [...f];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    return n;
  });
  const reset = () => { setFiles([]); setOutput(null); setError(''); setOpts(defaults); };

  const run = async () => {
    setBusy(true);
    setError('');
    setProgress({ v: 0, msg: 'Starting…' });
    try {
      const res = await tool.run({ files, opts, progress: (v, msg) => setProgress({ v, msg }) });
      setOutput(Array.isArray(res) ? { results: res } : res);
    } catch (e) {
      console.error(e);
      setError(e?.message || 'Something went wrong while processing your file.');
    } finally {
      setBusy(false);
    }
  };

  if (output) return <Results {...output} onReset={reset} zipName={`${tool.id}.zip`} />;

  const visible = (tool.options || []).filter((o) => !o.show || o.show(opts, files));
  const canRun = files.length > 0 || tool.allowNoFiles;

  return (
    <div className={`form-tool${files.length || tool.allowNoFiles ? ' has-files' : ''}`}>
      <div className="files-pane">
        {files.length === 0 ? (
          <Dropzone accept={tool.accept} multiple={tool.multiple} onFiles={addFiles} />
        ) : (
          <>
            <div className="file-grid">
              {files.map((f, i) => (
                <div className="file-card" key={`${f.name}-${i}`}>
                  <button className="remove" title="Remove" onClick={() => setFiles(files.filter((_, k) => k !== i))}><X size={14} /></button>
                  <FileThumb file={f} />
                  <div className="file-name" title={f.name}>{f.name}</div>
                  <div className="file-size">{formatSize(f.size)}</div>
                  {tool.reorder && files.length > 1 && (
                    <div className="order">
                      <button disabled={i === 0} onClick={() => move(i, -1)} title="Move earlier"><ArrowUp size={14} /></button>
                      <span>{i + 1}</span>
                      <button disabled={i === files.length - 1} onClick={() => move(i, 1)} title="Move later"><ArrowDown size={14} /></button>
                    </div>
                  )}
                </div>
              ))}
              {tool.multiple && (!tool.maxFiles || files.length < tool.maxFiles) && (
                <div className="file-card add">
                  <Dropzone accept={tool.accept} multiple onFiles={addFiles} compact label={<><Plus size={14} /> Add more</>} />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {(files.length > 0 || tool.allowNoFiles) && (
        <aside className="options-pane card">
          <h3>Options</h3>
          {visible.length === 0 && <p className="muted">No options needed — just click the button below.</p>}
          {visible.map((o) =>
            o.type === 'checkbox' ? (
              <label key={o.key} className="check">
                <input type="checkbox" checked={!!opts[o.key]} onChange={(e) => setOpts({ ...opts, [o.key]: e.target.checked })} />
                {o.label}
              </label>
            ) : (
              <div className="field" key={o.key}>
                <label htmlFor={`opt-${o.key}`}>{o.label}</label>
                <Field opt={o} value={opts[o.key]} onChange={(v) => setOpts({ ...opts, [o.key]: v })} />
                {o.help && <small>{o.help}</small>}
              </div>
            )
          )}
          {tool.note && <p className="note">{tool.note}</p>}
          {error && <p className="error">{error}</p>}
          {busy ? (
            <div className="progress">
              <div className="bar"><span style={{ width: `${Math.max(4, progress.v * 100)}%` }} /></div>
              <small>{progress.msg}</small>
            </div>
          ) : (
            <button className="btn primary big block" disabled={!canRun} onClick={run}>
              {tool.name}
            </button>
          )}
        </aside>
      )}
    </div>
  );
}
