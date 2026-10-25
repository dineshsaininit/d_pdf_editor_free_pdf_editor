import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, Link, NavLink, useParams, useLocation } from 'react-router-dom';
import { Search, ShieldCheck, Zap, Heart, Infinity as InfinityIcon, Menu, X } from 'lucide-react';
import { TOOLS, CATEGORIES, toolById } from './tools/registry';
import { ToolIcon } from './components/Icon';

const FormTool = lazy(() => import('./components/FormTool'));
const EditorTool = lazy(() => import('./components/EditorTool'));
const OrganizeTool = lazy(() => import('./components/OrganizeTool'));
const FormsTool = lazy(() => import('./components/FormsTool'));

function Header() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const popular = ['merge-pdf', 'split-pdf', 'compress-pdf', 'edit-pdf', 'sign-pdf', 'pdf-to-word'].map(toolById);
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link to="/" className="brand" aria-label="D-pdf Editor home">
          <img src="/logo.png" alt="D-pdf Editor" />
        </Link>
        <nav className={open ? 'open' : ''}>
          {popular.map((t) => <NavLink key={t.id} to={`/${t.id}`}>{t.name.replace(' (eSign)', '')}</NavLink>)}
          <NavLink to="/" end>All tools</NavLink>
        </nav>
        <button className="icon-btn menu-btn" onClick={() => setOpen(!open)} aria-label="Menu">{open ? <X /> : <Menu />}</button>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <img src="/logo.png" alt="D-pdf Editor" className="footer-logo" />
          <p className="muted">Free online PDF tools for everyone. All processing happens in your browser — your files are never uploaded.</p>
        </div>
        {CATEGORIES.slice(0, 4).map((c) => (
          <div key={c.id}>
            <h4>{c.name}</h4>
            {TOOLS.filter((t) => t.category === c.id).slice(0, 6).map((t) => <Link key={t.id} to={`/${t.id}`}>{t.name}</Link>)}
          </div>
        ))}
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} D-pdf Editor</span>
        <span><Link to="/privacy">Privacy</Link> · <Link to="/about">About</Link></span>
      </div>
    </footer>
  );
}

function ToolCard({ t }) {
  return (
    <Link to={`/${t.id}`} className="tool-card">
      <ToolIcon tool={t} />
      <h3>{t.name}</h3>
      <p>{t.desc}</p>
    </Link>
  );
}

function Home() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const ql = q.trim().toLowerCase();
  const list = TOOLS.filter((t) => (cat === 'all' || t.category === cat) && (!ql || `${t.name} ${t.desc}`.toLowerCase().includes(ql)));
  useEffect(() => { document.title = 'D-pdf Editor — Free online PDF editor & tools'; }, []);
  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>Every PDF tool you need, <span className="grad">100% free</span></h1>
          <p className="lead">Edit, sign, merge, split, compress and convert PDFs right in your browser. No sign-up, no watermarks, no limits — and your files never leave your device.</p>
          <div className="search">
            <Search size={18} />
            <input placeholder={`Search ${TOOLS.length} tools… e.g. "compress", "word", "sign"`} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="chips">
            <button className={cat === 'all' ? 'active' : ''} onClick={() => setCat('all')}>All</button>
            {CATEGORIES.map((c) => <button key={c.id} className={cat === c.id ? 'active' : ''} onClick={() => setCat(c.id)}>{c.name}</button>)}
          </div>
        </div>
      </section>
      <section className="container">
        {list.length === 0 && <p className="center muted">No tools match “{q}”.</p>}
        {cat === 'all' && !ql
          ? CATEGORIES.map((c) => (
              <div key={c.id} className="cat-block">
                <h2>{c.name}</h2>
                <div className="tool-grid">{TOOLS.filter((t) => t.category === c.id).map((t) => <ToolCard key={t.id} t={t} />)}</div>
              </div>
            ))
          : <div className="tool-grid">{list.map((t) => <ToolCard key={t.id} t={t} />)}</div>}
      </section>
      <section className="features container">
        <div><ShieldCheck /><h3>Private by design</h3><p>Files are processed locally in your browser. Nothing is uploaded to any server.</p></div>
        <div><InfinityIcon /><h3>Free & unlimited</h3><p>No accounts, no daily limits, no watermarks, no premium tier.</p></div>
        <div><Zap /><h3>Fast</h3><p>No waiting for uploads or downloads — your device does the work instantly.</p></div>
        <div><Heart /><h3>Works everywhere</h3><p>Windows, Mac, Linux, Android and iPhone. Just open the site in a modern browser.</p></div>
      </section>
    </>
  );
}

function ToolPage() {
  const { toolId } = useParams();
  const tool = toolById(toolId);
  useEffect(() => {
    if (tool) document.title = `${tool.name} — Free online | D-pdf Editor`;
    window.scrollTo(0, 0);
  }, [tool]);
  if (!tool) return <NotFound />;
  const related = TOOLS.filter((t) => t.category === tool.category && t.id !== tool.id).slice(0, 4);
  let body;
  if (tool.kind === 'editor') body = <EditorTool key={tool.id} mode={tool.mode} tool={tool} />;
  else if (tool.kind === 'organize') body = <OrganizeTool key={tool.id} />;
  else if (tool.kind === 'forms') body = <FormsTool key={tool.id} />;
  else body = <FormTool key={tool.id} tool={tool} />;
  return (
    <div className="container tool-page">
      <div className="tool-head">
        <ToolIcon tool={tool} size={26} />
        <div>
          <h1>{tool.name}</h1>
          <p className="muted">{tool.desc}</p>
        </div>
      </div>
      <Suspense fallback={<p className="center muted">Loading…</p>}>{body}</Suspense>
      {related.length > 0 && (
        <div className="related">
          <h3>Related tools</h3>
          <div className="tool-grid small">{related.map((t) => <ToolCard key={t.id} t={t} />)}</div>
        </div>
      )}
    </div>
  );
}

function TextPage({ title, children }) {
  useEffect(() => { document.title = `${title} | D-pdf Editor`; }, [title]);
  return <div className="container text-page card"><h1>{title}</h1>{children}</div>;
}

function NotFound() {
  return (
    <TextPage title="Page not found">
      <p>That page doesn’t exist. <Link to="/">See all tools →</Link></p>
    </TextPage>
  );
}

export default function App() {
  return (
    <>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/privacy" element={
            <TextPage title="Privacy">
              <p>D-pdf Editor processes every file entirely inside your web browser using JavaScript and WebAssembly. Your documents are <b>never uploaded</b> to our servers or anyone else’s.</p>
              <p>Saved signatures are stored only in your browser’s local storage on your device, and you can remove them at any time from the signature dialog.</p>
              <p>The OCR tool downloads its recognition engine and language data from a public CDN the first time you use it. Your document is not sent with that request.</p>
            </TextPage>
          } />
          <Route path="/about" element={
            <TextPage title="About D-pdf Editor">
              <p>D-pdf Editor is a free collection of {TOOLS.length} PDF tools — edit, sign, merge, split, compress, convert, protect and more — built to be usable by everyone, with no sign-ups or limits.</p>
              <p>Because all the work happens on your device, it’s fast, private and costs nothing to run.</p>
            </TextPage>
          } />
          <Route path="/:toolId" element={<ToolPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}
