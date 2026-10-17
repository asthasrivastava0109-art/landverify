import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/* ---------- icons ---------- */
const P = {
  menu: 'M4 7h16M4 12h16M4 17h16',
  overview: 'M4 5h7v7H4zM13 5h7v4h-7zM13 11h7v8h-7zM4 14h7v5H4z',
  property: 'M4 20V9l8-5 8 5v11M9 20v-6h6v6',
  file: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  checks: 'M5 6l2 2 3-3M5 13l2 2 3-3M13 7h6M13 14h6M5 20h.01M13 20h6',
  review: 'M4 5h16v11H9l-5 4zM8 9h8M8 12h5',
  report: 'M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h7',
  team: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3 3-5 6-5s6 2 6 5M16 5.5a3 3 0 010 5.5M18 15c2 .6 3 2.2 3 5',
  route: 'M5 19a2 2 0 100-4 2 2 0 000 4zM19 9a2 2 0 100-4 2 2 0 000 4zM7 17h6a3 3 0 000-6h-2a3 3 0 010-6h6',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  plus: 'M12 5v14M5 12h14',
  warn: 'M12 4l9 16H3zM12 10v4M12 17h.01',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 8h.01',
  chevron: 'M9 6l6 6-6 6',
  check: 'M5 12.5l4.5 4.5L19 7',
  x: 'M6 6l12 12M18 6L6 18',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  out: 'M14 4h6v6M20 4l-9 9M18 14v5H5V6h5',
  download: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 018 0v3',
  logout: 'M10 4H5v16h5M15 8l4 4-4 4M19 12H9',
};
export function Icon({ name, size = 18, stroke = 1.7, className = '', style }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>
      <path d={P[name]} />
    </svg>
  );
}

export function Logo({ size = 22 }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#174EA6" />
      <path d="M8 21 L12 9 L24 12 L22 23 Z" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="12" cy="9" r="2" fill="#fff" />
    </svg>
  );
}

/* ---------- provenance marks ---------- */
// One visual language for how much we know. It is used on every screen so a reader
// can tell supplied information from checked evidence at a glance.
export const PROV = {
  supplied: { label: 'Supplied by a user', short: 'Supplied', desc: 'Entered or uploaded by a person. Not checked.' },
  entered: { label: 'Entered, not yet confirmed', short: 'Preliminary', desc: 'Details typed in from a document. Treat as preliminary.' },
  source: { label: 'Checked against a source', short: 'Source checked', desc: 'A person compared it with a named source and recorded the result.' },
  professional: { label: 'Reviewed by a professional', short: 'Professional review', desc: 'A qualified reviewer recorded their review.' },
};
export function ProvMark({ level, size = 16 }) {
  const c = '#174EA6';
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} aria-hidden="true">
      {level === 'supplied' && <circle cx="10" cy="10" r="6.5" fill="none" stroke="#6B6B6B" strokeWidth="1.6" />}
      {level === 'entered' && (<><circle cx="10" cy="10" r="6.5" fill="none" stroke={c} strokeWidth="1.6" /><path d="M10 3.5a6.5 6.5 0 010 13z" fill={c} /></>)}
      {level === 'source' && <circle cx="10" cy="10" r="6.5" fill={c} />}
      {level === 'professional' && (<><circle cx="10" cy="10" r="8.2" fill="none" stroke={c} strokeWidth="1.4" /><circle cx="10" cy="10" r="4.6" fill={c} /></>)}
    </svg>
  );
}
export function Prov({ level, short }) {
  const p = PROV[level] || PROV.supplied;
  return <span className="prov" title={p.desc}><ProvMark level={level} />{short ? p.short : p.label}</span>;
}
export const docLevel = (s) => ({ supplied: 'supplied', checked_source: 'source', professionally_reviewed: 'professional', discrepancy: 'supplied' }[s] || 'supplied');

/* ---------- chips: color is always paired with an icon and a word ---------- */
function SevIcon({ s }) {
  const common = { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round', strokeLinecap: 'round', 'aria-hidden': true };
  if (s === 'critical') return <svg {...common}><path d="M5 1.8h6L14.2 5v6L11 14.2H5L1.8 11V5z" /><path d="M8 5v3.4M8 10.8h.01" /></svg>;
  if (s === 'high') return <svg {...common}><path d="M8 2l6.5 11.5h-13z" /><path d="M8 6.5v3M8 11.5h.01" /></svg>;
  if (s === 'medium') return <svg {...common}><path d="M8 1.8l6.2 6.2L8 14.2 1.8 8z" /><path d="M8 5.5v3" /></svg>;
  return <svg {...common}><circle cx="8" cy="8" r="6" strokeDasharray="2.6 2.4" /></svg>;
}
export const SEV = { critical: ['Critical risk', 'red'], high: ['High risk', 'red'], medium: ['Medium risk', 'amber'], low: ['Low risk', ''] };
export function SeverityChip({ s }) {
  const [t, c] = SEV[s] || SEV.low;
  return <span className={`chip ${c}`}><SevIcon s={s} />{t}</span>;
}
export function SeverityGlyph({ s, size = 22 }) {
  const color = s === 'critical' || s === 'high' ? 'var(--red)' : s === 'medium' ? 'var(--amber)' : 'var(--muted)';
  return <span style={{ color, width: size, height: size, display: 'inline-flex' }}><SevIcon s={s} /></span>;
}

export const CHECK_STATUS = { not_started: 'Verification not completed', in_progress: 'In progress', needs_evidence: 'Waiting for evidence', completed: 'Completed' };
export const OUTCOME = { none: 'No result recorded', no_issue_found: 'No issue found', issue_found: 'Issue found', inconclusive: 'Inconclusive' };
export function StatusChip({ status }) {
  const m = { completed: ['green', 'check'], in_progress: ['blue', null], needs_evidence: ['amber', 'info'], not_started: ['', null] }[status] || ['', null];
  return <span className={`chip ${m[0]}`}>{m[1] && <Icon name={m[1]} size={13} stroke={2} />}{CHECK_STATUS[status]}</span>;
}
export function OutcomeChip({ outcome }) {
  const m = { none: ['plain', null], no_issue_found: ['green', 'check'], issue_found: ['red', 'warn'], inconclusive: ['amber', 'info'] }[outcome];
  return <span className={`chip ${m[0]}`}>{m[1] && <Icon name={m[1]} size={13} stroke={2} />}{OUTCOME[outcome]}</span>;
}
export const EXTRACTION = { processing: 'Processing', completed: 'Fields reviewed', failed: 'Failed', manual_review: 'Needs manual review' };
export function ExtractionChip({ s }) {
  const m = { processing: ['blue', null], completed: ['green', 'check'], failed: ['red', 'warn'], manual_review: ['amber', 'info'] }[s] || ['', null];
  return <span className={`chip ${m[0]}`}>{m[1] && <Icon name={m[1]} size={13} stroke={2} />}{EXTRACTION[s] || s}</span>;
}
export const FSTATUS = { open: 'Open', in_review: 'In review', resolved: 'Resolved', accepted: 'Risk accepted' };

/* ---------- feedback ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, kind = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setItems((i) => [...i, { id, message, kind }]);
    setTimeout(() => setItems((i) => i.filter((x) => x.id !== id)), kind === 'err' ? 6000 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-host" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'err' ? 'err' : ''}`}>
            {t.kind === 'err' ? <Icon name="warn" size={16} /> : <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path className="tick" d="M5 12.5l4.5 4.5L19 7" /></svg>}
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function Loading({ label = 'Loading' }) { return <div className="loading" role="status"><span className="spin" />{label}</div>; }
export function ErrorState({ error, retry }) {
  return (
    <div className="banner red" role="alert" style={{ margin: '24px 0' }}>
      <Icon name="warn" />
      <div><b>We could not load this.</b> {error?.message || ''}{retry && <> <button className="btn quiet sm" onClick={retry}>Try again</button></>}</div>
    </div>
  );
}
export function Empty({ title, children, action }) {
  return <div className="empty"><h3>{title}</h3><p>{children}</p>{action}</div>;
}

export function Modal({ title, onClose, children }) {
  const ref = useRef();
  useEffect(() => {
    const prev = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector('input, select, textarea, button')?.focus();
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <h2>{title}</h2>
        <div style={{ marginTop: 18 }}>{children}</div>
      </div>
    </div>
  );
}

/* tiny data hook */
export function useLoad(fn, deps = []) {
  const [state, set] = useState({ data: null, error: null, loading: true });
  const run = useCallback(() => {
    set((s) => ({ ...s, loading: true, error: null }));
    fn().then((data) => set({ data, error: null, loading: false })).catch((error) => set({ data: null, error, loading: false }));
    // eslint-disable-next-line
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run, setData: (d) => set((s) => ({ ...s, data: d })) };
}

export function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.rv');
    if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  });
}
