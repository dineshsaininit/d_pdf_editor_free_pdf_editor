import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, RotateCcw, CheckCircle2, Archive } from 'lucide-react';
import { downloadBlob, formatSize, zipResults } from '../lib/pdf';

export default function Results({ results, info, html, onReset, zipName = 'd-pdf-files.zip' }) {
  const [zipping, setZipping] = useState(false);
  const many = results.length > 1;

  const downloadAll = async () => {
    setZipping(true);
    try {
      const z = await zipResults(results, zipName);
      downloadBlob(z.blob, z.name);
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="results card">
      <div className="results-head">
        <CheckCircle2 size={36} className="ok" />
        <div>
          <h2>Done! Your {many ? `${results.length} files are` : 'file is'} ready.</h2>
          {info && <pre className="info">{info}</pre>}
        </div>
      </div>
      <div className="results-actions">
        {many ? (
          <button className="btn primary big" onClick={downloadAll} disabled={zipping}>
            <Archive size={18} /> {zipping ? 'Zipping…' : 'Download all (ZIP)'}
          </button>
        ) : (
          <button className="btn primary big" onClick={() => downloadBlob(results[0].blob, results[0].name)}>
            <Download size={18} /> Download {results[0].name.split('.').pop().toUpperCase()}
          </button>
        )}
        <button className="btn ghost" onClick={onReset}>
          <RotateCcw size={16} /> Start over
        </button>
      </div>
      {many && (
        <ul className="result-list">
          {results.map((r, i) => (
            <li key={i}>
              <span className="name">{r.name}</span>
              <span className="size">{formatSize(r.blob.size)}</span>
              <button className="btn small" onClick={() => downloadBlob(r.blob, r.name)}>
                <Download size={14} /> Download
              </button>
            </li>
          ))}
        </ul>
      )}
      {html && <div className="html-report" dangerouslySetInnerHTML={{ __html: html }} />}
      <p className="muted small center">
        Processed entirely in your browser — nothing was uploaded. <Link to="/">Try another tool →</Link>
      </p>
    </div>
  );
}
