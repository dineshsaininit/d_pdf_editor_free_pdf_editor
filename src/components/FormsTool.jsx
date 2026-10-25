import { useState } from 'react';
import { PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup, PDFOptionList } from '@cantoo/pdf-lib';
import Dropzone from './Dropzone';
import Results from './Results';
import { openPdfLib, readBytes, pdfBlob, baseName } from '../lib/pdf';

function describe(field) {
  const name = field.getName();
  if (field instanceof PDFTextField) return { name, type: 'text', value: field.getText() || '', multiline: field.isMultiline() };
  if (field instanceof PDFCheckBox) return { name, type: 'check', value: field.isChecked() };
  if (field instanceof PDFDropdown) return { name, type: 'select', options: field.getOptions(), value: field.getSelected()[0] || '' };
  if (field instanceof PDFOptionList) return { name, type: 'select', options: field.getOptions(), value: field.getSelected()[0] || '' };
  if (field instanceof PDFRadioGroup) return { name, type: 'radio', options: field.getOptions(), value: field.getSelected() || '' };
  return null;
}

export default function FormsTool() {
  const [file, setFile] = useState(null);
  const [bytes, setBytes] = useState(null);
  const [fields, setFields] = useState([]);
  const [flatten, setFlatten] = useState(false);
  const [error, setError] = useState('');
  const [output, setOutput] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async ([f]) => {
    setError('');
    try {
      const b = await readBytes(f);
      const doc = await openPdfLib(b);
      const list = doc.getForm().getFields().map(describe).filter(Boolean);
      if (!list.length) throw new Error('This PDF has no fillable form fields. Use "Edit PDF" to type text anywhere on the page instead.');
      setFile(f);
      setBytes(b);
      setFields(list);
    } catch (e) {
      setError(e.message);
    }
  };

  const set = (name, value) => setFields((fs) => fs.map((f) => (f.name === name ? { ...f, value } : f)));

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const doc = await openPdfLib(bytes);
      const form = doc.getForm();
      for (const f of fields) {
        const field = form.getField(f.name);
        if (f.type === 'text') field.setText(f.value);
        else if (f.type === 'check') (f.value ? field.check() : field.uncheck());
        else if (f.type === 'select' && f.value) field.select(f.value);
        else if (f.type === 'radio' && f.value) field.select(f.value);
      }
      if (flatten) form.flatten();
      setOutput({ results: [{ name: `${baseName(file.name)}-filled.pdf`, blob: pdfBlob(await doc.save()) }] });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (output) return <Results {...output} onReset={() => { setOutput(null); setFile(null); setFields([]); }} />;
  if (!file) {
    return (
      <div className="form-tool">
        <div className="files-pane">
          <Dropzone accept=".pdf,application/pdf" onFiles={load} />
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="card forms-card">
      <h3>{file.name} — {fields.length} field(s)</h3>
      <div className="forms-grid">
        {fields.map((f) => (
          <div className="field" key={f.name}>
            {f.type === 'check' ? (
              <label className="check">
                <input type="checkbox" checked={f.value} onChange={(e) => set(f.name, e.target.checked)} /> {f.name}
              </label>
            ) : (
              <>
                <label>{f.name}</label>
                {f.type === 'text' && (f.multiline
                  ? <textarea rows={3} value={f.value} onChange={(e) => set(f.name, e.target.value)} />
                  : <input value={f.value} onChange={(e) => set(f.name, e.target.value)} />)}
                {(f.type === 'select' || f.type === 'radio') && (
                  <select value={f.value} onChange={(e) => set(f.name, e.target.value)}>
                    <option value="">—</option>
                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      <label className="check"><input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} /> Flatten form after filling (make it non-editable)</label>
      {error && <p className="error">{error}</p>}
      <button className="btn primary big" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save filled PDF'}</button>
    </div>
  );
}
