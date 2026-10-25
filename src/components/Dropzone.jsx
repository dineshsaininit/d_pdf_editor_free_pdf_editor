import { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';

function matches(file, accept) {
  if (!accept) return true;
  return accept.split(',').some((a) => {
    a = a.trim().toLowerCase();
    if (a.startsWith('.')) return file.name.toLowerCase().endsWith(a);
    if (a.endsWith('/*')) return file.type.startsWith(a.slice(0, -1));
    return file.type === a;
  });
}

export default function Dropzone({ accept, multiple, onFiles, compact, label }) {
  const input = useRef();
  const [over, setOver] = useState(false);
  const [error, setError] = useState('');

  const handle = (list) => {
    const files = [...list];
    const ok = files.filter((f) => matches(f, accept));
    setError(ok.length < files.length ? `Some files were skipped because they are not supported here (${accept}).` : '');
    if (ok.length) onFiles(multiple ? ok : ok.slice(0, 1));
  };

  return (
    <>
      <div
        className={`dropzone${over ? ' over' : ''}${compact ? ' compact' : ''}`}
        onClick={() => input.current.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files); }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current.click()}
      >
        <UploadCloud size={compact ? 22 : 44} />
        <div>
          <strong>{label || (multiple ? 'Select files' : 'Select file')}</strong>
          {!compact && <p>or drag and drop here</p>}
        </div>
        <input
          ref={input}
          type="file"
          hidden
          accept={accept}
          multiple={multiple}
          onChange={(e) => { handle(e.target.files); e.target.value = ''; }}
        />
      </div>
      {error && <p className="warn">{error}</p>}
    </>
  );
}
