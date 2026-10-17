import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, Logo, ProvMark, PROV, SeverityChip, SeverityGlyph, useReveal } from '../ui.jsx';

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ */
export function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on(); window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  const close = () => setOpen(false);
  return (
    <header className={`nav ${scrolled ? 'scrolled' : ''}`}>
      <div className="nav-in">
        <Link to="/" className="wordmark" aria-label="LandVerify home"><Logo />LandVerify</Link>
        <nav className={`nav-links ${open ? 'open' : ''}`} aria-label="Primary">
          <a href="#platform" onClick={close}>Platform</a>
          <a href="#how" onClick={close}>How It Works</a>
          <a href="#investors" onClick={close}>For Investors</a>
          <a href="#professionals" onClick={close}>For Professionals</a>
          <Link to="/login" onClick={close} style={{ display: open ? 'block' : 'none' }}>Sign in</Link>
        </nav>
        <Link to="/login" className="btn quiet sm nav-cta" style={{ marginLeft: 0 }}>Sign in</Link>
        <Link to="/signup" className="btn sm nav-cta">Start Verification</Link>
        <button className="nav-menu" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name={open ? 'x' : 'menu'} size={22} /></button>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
const PARCEL = '120,300 168,124 356,72 522,150 490,332 292,372';
const FINDINGS = [
  { id: 'a', x: 168, y: 124, sev: 'high', title: 'Plot area differs between records', body: 'Two supplied documents state different areas. Confirm against the authoritative record and ask a legal reviewer.' },
  { id: 'b', x: 522, y: 150, sev: 'medium', title: 'Record of rights not yet supplied', body: 'No revenue record is on file, so the claimed owner has not been compared with it.' },
  { id: 'c', x: 292, y: 372, sev: 'low', title: 'Physical inspection not recorded', body: 'No one has recorded an inspection of the boundary yet.' },
];
const DOCS = [
  ['Sale deed', 'source'],
  ['Survey sketch', 'entered'],
  ['Encumbrance certificate', 'supplied'],
  ['Khatauni extract', null],
  ['Land-use certificate', null],
  ['Identity documents', 'supplied'],
];

function Instrument() {
  const [sel, setSel] = useState('a');
  const f = FINDINGS.find((x) => x.id === sel);
  const have = DOCS.filter((d) => d[1]).length;
  return (
    <div className="stage" id="demo-hero">
      <div className="plate">
        <svg className="plate-svg" viewBox="0 0 640 440" role="img" aria-label="Illustrative land parcel outline with three marked findings. Demonstration data.">
          <defs>
            <pattern id="g" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#E3E3DD" strokeWidth="1" /></pattern>
          </defs>
          <rect x="0" y="0" width="640" height="440" fill="url(#g)" opacity=".7" />
          {[[12, 12], [628, 12], [12, 428], [628, 428]].map(([x, y], i) => (
            <path key={i} d={`M${x - (x > 300 ? 10 : -10)} ${y}H${x}V${y - (y > 200 ? 10 : -10)}`} stroke="#8A8A85" strokeWidth="1.2" fill="none" />
          ))}
          <polygon points={PARCEL} fill="#E8EEF8" fillOpacity=".55" className="fade-in" style={{ animationDelay: '1.2s' }} />
          <polygon points={PARCEL} fill="none" stroke="#174EA6" strokeWidth="2" strokeLinejoin="round" strokeDasharray="7 6" pathLength="1000" opacity=".0" />
          <polygon points={PARCEL} fill="none" stroke="#171717" strokeWidth="2.2" strokeLinejoin="round" pathLength="1000" className="draw" style={{ '--len': 1000 }} />
          {/* document layers */}
          {[0, 1, 2].map((i) => (
            <g key={i} className="fade-in" style={{ animationDelay: `${1.0 + i * 0.18}s` }} transform={`translate(${22 + i * 7} ${22 + i * 7}) scale(.8)`}>
              <rect width="86" height="108" rx="4" fill="#fff" stroke="#CFCFC8" />
              {i === 2 && (<>
                <rect x="12" y="16" width="44" height="5" rx="2.5" fill="#EAEAE5" /><rect x="12" y="30" width="60" height="5" rx="2.5" fill="#EAEAE5" /><rect x="12" y="44" width="52" height="5" rx="2.5" fill="#EAEAE5" /><rect x="12" y="58" width="58" height="5" rx="2.5" fill="#EAEAE5" />
                <text x="12" y="94" fontSize="9" fill="#6B6B6B" fontFamily="var(--font)">Deed, sketch, extract</text>
              </>)}
            </g>
          ))}
          <text x="320" y="228" textAnchor="middle" fontSize="13" fill="#6B6B6B" fontFamily="var(--font)" className="fade-in" style={{ animationDelay: '1.5s' }}>Illustrative boundary</text>
          <text x="320" y="246" textAnchor="middle" fontSize="11.5" fill="#8A8A85" fontFamily="var(--font)" className="fade-in" style={{ animationDelay: '1.5s' }}>Not taken from survey data</text>
          {FINDINGS.map((m, i) => (
            <g key={m.id} className={`marker fade-in ${sel === m.id ? 'on' : ''}`} style={{ animationDelay: `${1.7 + i * 0.2}s` }} tabIndex={0} role="button" aria-label={`${m.title}. ${m.sev} risk`} aria-pressed={sel === m.id}
              onClick={() => setSel(m.id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSel(m.id))}>
              <circle className="ring" cx={m.x} cy={m.y} r="9" fill="#fff" stroke={m.sev === 'high' ? '#B3261E' : m.sev === 'medium' ? '#8F5F00' : '#6B6B6B'} strokeWidth="2.2" />
              <circle cx={m.x} cy={m.y} r="3.2" fill={m.sev === 'high' ? '#B3261E' : m.sev === 'medium' ? '#8F5F00' : '#6B6B6B'} />
            </g>
          ))}
        </svg>
        <div className="legend" style={{ padding: '0 0 0 4px' }}>
          <span><i />Illustrative outline</span>
          <span>Markers are findings. Select one.</span>
        </div>
      </div>
      <div className="readout">
        <div>
          <span className="tag-demo"><Icon name="info" size={13} />Demonstration data</span>
          <h3 style={{ fontSize: 22, letterSpacing: '-.02em', fontWeight: 640, marginTop: 14 }}>Sample parcel, fictional</h3>
          <p className="mono muted" style={{ marginTop: 4 }}>LV-DEMO01 &nbsp; Khasra 000/0</p>
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span>Documents on file</span><span className="muted">{have} of {DOCS.length}</span></div>
          <div className="meter" style={{ gridTemplateColumns: `repeat(${DOCS.length}, 1fr)`, margin: '10px 0 14px' }} aria-hidden="true">
            {DOCS.map((d, i) => <i key={i} className={d[1] ? 'on' : ''} />)}
          </div>
          <ul className="rule-list" style={{ fontSize: 14 }}>
            {DOCS.map(([n, l]) => (
              <li key={n} style={{ padding: '8px 0', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ color: l ? 'var(--ink)' : 'var(--muted)' }}>{n}</span>
                {l ? <span className="prov"><ProvMark level={l} />{PROV[l].short}</span> : <span className="muted">Not supplied</span>}
              </li>
            ))}
          </ul>
        </div>
        <div aria-live="polite" style={{ borderTop: '1px solid var(--line-strong)', paddingTop: 18 }}>
          <SeverityChip s={f.sev} />
          <h4 style={{ fontSize: 17, fontWeight: 620, marginTop: 10 }}>{f.title}</h4>
          <p className="muted" style={{ fontSize: 14.5, marginTop: 4 }}>{f.body}</p>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="hero" aria-labelledby="h1">
      <div className="wrap">
        <div className="hero-top">
          <div className="h">
            <p className="eyebrow">Land intelligence, reimagined</p>
            <h1 id="h1" className="display" style={{ marginTop: 22 }}>Before the deal, know the land.</h1>
          </div>
          <div className="hero-aside">
            <p className="lead" style={{ fontSize: 18 }}>Bring land records, ownership documents and verification checks into one clear picture, before making your next move.</p>
            <div className="cta-row">
              <a href="#demo" className="btn">Explore a Property</a>
              <a href="#how" className="btn secondary">See How It Works</a>
            </div>
          </div>
        </div>
        <Instrument />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
const SHEETS = [
  { t: 'Sale deed', x: -40, y: 20, r: -7 },
  { t: 'Khatauni extract', x: 220, y: -10, r: 5 },
  { t: 'Survey sketch', x: 20, y: 300, r: 4 },
  { t: 'Mutation order', x: 250, y: 250, r: -5 },
  { t: 'Encumbrance certificate', x: 110, y: 150, r: 8 },
  { t: 'Permission letter', x: 300, y: 130, r: -3 },
];
const ease = (t) => 1 - Math.pow(1 - t, 3);

function Problem() {
  const ref = useRef();
  const [p, setP] = useState(0);
  const [stat, setStat] = useState(false);
  useEffect(() => {
    if (reduced()) { setStat(true); setP(1); return; }
    let raf = 0;
    const calc = () => {
      raf = 0;
      const el = ref.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const span = r.height - window.innerHeight + 60;
      setP(Math.max(0, Math.min(1, -r.top / Math.max(span, 1))));
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(calc); };
    calc();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); cancelAnimationFrame(raf); };
  }, []);
  const t = ease(Math.max(0, Math.min(1, (p - 0.08) / 0.62)));
  const op = (a, b) => Math.max(0, Math.min(1, Math.min((p - a) / 0.04, (b - p) / 0.04)));
  const copy = [
    ['Deeds sit in one folder. Revenue records sit in another.', op(-1, 0.3)],
    ['Maps, permissions and court papers come from different offices, in different formats.', op(0.34, 0.64)],
    ['LandVerify gathers them into one property file, each record with its source and what has been checked.', op(0.68, 2)],
  ];
  return (
    <section id="how" className={`band ${stat ? '' : ''}`} aria-labelledby="problem-h" style={{ padding: 0 }}>
      <div className="wrap" style={{ paddingTop: 'var(--s9)' }}>
        <h2 id="problem-h" className="h-section" style={{ maxWidth: '14em' }}>Land paperwork tells a story. Make it easier to understand.</h2>
      </div>
      <div className="converge" ref={ref} style={stat ? { height: 'auto' } : undefined}>
        <div className="converge-sticky" style={stat ? { position: 'static', height: 'auto', padding: '56px 0' } : undefined}>
          <div className="wrap converge-grid">
            <div className="converge-copy" aria-live="off">
              {copy.map(([c, o], i) => <p key={i} className="lead" style={{ opacity: stat ? 1 : o, position: stat ? 'static' : 'absolute', marginBottom: stat ? 16 : 0, transform: stat ? 'none' : `translateY(${(1 - o) * 10}px)`, color: i === 2 ? 'var(--ink)' : undefined }}>{c}</p>)}
            </div>
            <div className="sheets" aria-hidden="true">
              <div className="file-label" style={{ '--fo': Math.max(0, (p - 0.72) / 0.2) }}>One property file</div>
              {SHEETS.map((s, i) => {
                const fx = 70 + i * 7, fy = 36 + i * 9;
                const x = s.x * (1 - t) + fx * t, y = s.y * (1 - t) + fy * t, r = s.r * (1 - t);
                return (
                  <div key={s.t} className="sheet" style={{ transform: `translate(${x}px, ${y}px) rotate(${r}deg)`, zIndex: i, width: '52%', background: '#fff' }}>
                    <b>{s.t}</b>
                    <div className="ln" /><div className="ln m" /><div className="ln s" />
                    {t > 0.95 && i === SHEETS.length - 1 && <div style={{ marginTop: 8, color: 'var(--blue)', fontSize: 12 }}>Linked to LV-DEMO01</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
function StoryA() {
  const rows = [
    { k: 'Seller', v: 'Demo Seller B', note: 'Page 1, parties clause', m: 'm1' },
    { k: 'Area', v: '1.2 bigha', note: 'Page 2, schedule of property', m: 'm2' },
    { k: 'Plot', v: 'Khasra 000/0', note: 'Page 2, schedule of property', m: 'm3' },
  ];
  const [on, setOn] = useState('m2');
  const cur = rows.find((r) => r.m === on);
  const mk = (id, txt) => <mark className={on === id ? 'on' : ''}>{txt}</mark>;
  return (
    <div className="story" id="platform">
      <div className="wrap story-grid">
        <div className="copy rv">
          <h3 className="h-feature">Every document, in context.</h3>
          <p>Keep deeds, extracts and maps in one workspace. Each detail you record points back to the page it came from, so anyone can check it.</p>
        </div>
        <div className="vis rv">
          <div className="doc-pane">
            <div className="paper" aria-label="Sample document, fictional">
              <div className="mono muted" style={{ fontSize: 12 }}>Sale deed (demonstration)</div>
              <p style={{ marginTop: 14, lineHeight: 1.9 }}>This deed is made between {mk('m1', 'Demo Seller B')} and the buyer, for the property described below.</p>
              <div className="ln" /><div className="ln" style={{ width: '70%' }} />
              <p style={{ marginTop: 14, lineHeight: 1.9 }}>Area {mk('m2', '1.2 bigha')}, situated at {mk('m3', 'Khasra 000/0')}, Sample Village.</p>
              <div className="ln" style={{ width: '85%' }} /><div className="ln" style={{ width: '55%' }} />
            </div>
            <div className="data">
              {rows.map((r) => (
                <button key={r.m} className={on === r.m ? 'on' : ''} onClick={() => setOn(r.m)} onFocus={() => setOn(r.m)}>
                  <span className="muted" style={{ fontSize: 13 }}>{r.k}</span><b style={{ fontWeight: 560 }}>{r.v}</b><ProvMark level="entered" />
                </button>
              ))}
              <p className="muted" style={{ padding: '14px 20px 6px', fontSize: 13.5 }} aria-live="polite">Source: {cur.note}. Entered by a person. Not yet confirmed.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StoryB() {
  const items = [
    ['high', 'Plot area differs between records', 'The sale deed and the survey sketch state different areas.'],
    ['medium', 'Record of rights not yet supplied', 'The revenue record has not been compared with the claimed owner.'],
    ['medium', 'Plot number is written two ways', 'One document uses a different format for the same Khasra number. Confirm they refer to the same plot.'],
    ['low', 'Inspection not recorded', 'Nobody has noted what the land looks like on the ground.'],
  ];
  return (
    <div className="story wide">
      <div className="wrap story-grid">
        <div className="copy rv">
          <h3 className="h-feature">See what needs attention.</h3>
          <p>Missing records, mismatched details and unfinished checks surface in plain language. Nothing is called fraud. Everything has a next step.</p>
        </div>
        <div className="vis rv">
          {items.map(([s, t, b]) => (
            <div className="attn-row" key={t}>
              <SeverityGlyph s={s} />
              <div><h4>{t}</h4><p>{b}</p></div>
              <SeverityChip s={s} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StoryC() {
  const init = [
    ['Upload a recent Khatauni extract', 'Owner', false],
    ['Confirm the area against the revenue record', 'Buyer', false],
    ['Review the sale deed and survey sketch together', 'Legal reviewer', false],
    ['Record who inspected the boundary', 'Acquisition team', true],
  ];
  const [items, setItems] = useState(init);
  const left = items.filter((i) => !i[2]).length;
  return (
    <div className="story flip">
      <div className="wrap story-grid">
        <div className="copy rv">
          <h3 className="h-feature">Know the next step.</h3>
          <p>Turn open questions into a checklist with a named owner for each item. Try it: select an item to mark it done.</p>
        </div>
        <div className="vis rv">
          <div className="muted" style={{ fontSize: 14, marginBottom: 12 }} aria-live="polite">{left === 0 ? 'Every item is done. That does not make the title clear. A legal reviewer still decides.' : `${left} of ${items.length} still to do`}</div>
          {items.map(([t, who, done], i) => (
            <button key={t} className="todo" aria-pressed={done} onClick={() => setItems(items.map((x, j) => (j === i ? [x[0], x[1], !x[2]] : x)))}>
              <span className="box"><svg viewBox="0 0 24 24" fill="none" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg></span>
              <span className="t" style={{ fontSize: 16 }}>{t}</span>
              <span className="chip">{who}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Reveal() {
  return (
    <section className="band" style={{ paddingBottom: 0 }} aria-labelledby="reveal-h">
      <div className="wrap"><h2 id="reveal-h" className="h-section" style={{ maxWidth: '12em' }}>One property. One clear picture.</h2></div>
      <div style={{ marginTop: 56 }}><StoryA /><StoryB /><StoryC /></div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
const DEMO_TABS = ['Overview', 'Documents', 'Ownership timeline', 'Checklist', 'Risk register', 'Review status'];
function Demo() {
  const [tab, setTab] = useState(0);
  const onKey = (e) => {
    if (e.key === 'ArrowRight') setTab((tab + 1) % DEMO_TABS.length);
    if (e.key === 'ArrowLeft') setTab((tab + DEMO_TABS.length - 1) % DEMO_TABS.length);
  };
  return (
    <section id="demo" className="band" aria-labelledby="demo-h">
      <div className="wrap">
        <div className="grid12" style={{ rowGap: 20, marginBottom: 40 }}>
          <h2 id="demo-h" className="h-section" style={{ gridColumn: 'span 7' }}>See a property file, not a promise.</h2>
          <p className="prose" style={{ gridColumn: '9 / span 4', alignSelf: 'end' }}>Click through a fictional file. Everything below is demonstration data.</p>
        </div>
        <div className="demo">
          <div className="demo-bar">
            <span className="tag-demo"><Icon name="info" size={13} />Demonstration data</span>
            <span className="muted" style={{ fontSize: 13.5 }}>Fictional property. Not checked against any government record.</span>
          </div>
          <div className="demo-tabs" role="tablist" aria-label="Property file sections" onKeyDown={onKey}>
            {DEMO_TABS.map((t, i) => <button key={t} role="tab" id={`dt${i}`} aria-selected={tab === i} aria-controls="demo-panel" tabIndex={tab === i ? 0 : -1} onClick={() => setTab(i)}>{t}</button>)}
          </div>
          <div className="demo-body" key={tab} id="demo-panel" role="tabpanel" aria-labelledby={`dt${tab}`}>
            {tab === 0 && <DemoOverview />}
            {tab === 1 && <DemoDocs />}
            {tab === 2 && <DemoTimeline />}
            {tab === 3 && <DemoChecklist />}
            {tab === 4 && <DemoRisks />}
            {tab === 5 && <DemoReview />}
          </div>
        </div>
      </div>
    </section>
  );
}
const Dl = ({ rows }) => <dl className="dl" style={{ margin: 0 }}>{rows.map(([k, v]) => [<dt key={k}>{k}</dt>, <dd key={k + 'v'}>{v}</dd>])}</dl>;
function DemoOverview() {
  return (
    <div className="grid12" style={{ rowGap: 28 }}>
      <div style={{ gridColumn: 'span 7' }}>
        <h3 style={{ fontSize: 24, fontWeight: 640, letterSpacing: '-.02em' }}>Sample parcel, fictional</h3>
        <p className="mono muted" style={{ margin: '4px 0 22px' }}>LV-DEMO01</p>
        <Dl rows={[
          ['Location', 'Sample Village, Sample Tehsil, Sample District, Uttar Pradesh'],
          ['Claimed area', <span>1.2 bigha <span className="chip" style={{ marginLeft: 8 }}><ProvMark level="supplied" size={13} />Supplied</span></span>],
          ['Property type', 'Agricultural (supplied)'],
          ['Claimed owner', 'Demo Owner A, fictional (supplied)'],
          ['Documents', '3 of 6 on file'],
          ['Unresolved findings', '2, including 1 high risk'],
          ['Reviewer', 'Not yet assigned'],
        ]} />
      </div>
      <div style={{ gridColumn: '9 / span 4' }}>
        <div className="banner blue"><Icon name="info" /><div>Nothing on this file has been independently verified. That is shown, not hidden.</div></div>
      </div>
    </div>
  );
}
function DemoDocs() {
  const rows = [['Sale deed', 'Entered fields', 'source', 'Checked against a copy held by the demo team'], ['Survey sketch', 'Needs manual review', 'entered', 'Area differs from the sale deed'], ['Encumbrance certificate', 'Needs manual review', 'supplied', 'Not yet reviewed']];
  return (
    <div className="table-wrap"><table className="table"><thead><tr><th>Document</th><th>Extraction</th><th>Verification</th><th>Note</th></tr></thead>
      <tbody>{rows.map(([a, b, l, n]) => <tr key={a} className="row"><td><b style={{ fontWeight: 560 }}>{a}</b></td><td>{b}</td><td><span className="prov"><ProvMark level={l} />{PROV[l].short}</span></td><td className="muted">{n}</td></tr>)}</tbody></table></div>
  );
}
function DemoTimeline() {
  const ev = [['2009', 'Demo Seller B recorded as owner in the record of rights', 'supplied'], ['2014', 'Sale deed: Demo Seller B to Demo Owner A', 'source'], ['2015', 'Mutation entry expected. Not on file', null], ['2019', 'Survey sketch prepared. States 1.0 bigha', 'entered']];
  return (
    <ol className="timeline" style={{ maxWidth: 640 }}>
      {ev.map(([y, t, l]) => (
        <li key={y}><div className="when">{y}</div><div style={{ fontWeight: 520 }}>{t}</div>
          <div style={{ marginTop: 4 }}>{l ? <span className="prov"><ProvMark level={l} />{PROV[l].short}</span> : <span className="chip amber"><Icon name="info" size={13} />Missing record</span>}</div></li>
      ))}
    </ol>
  );
}
function DemoChecklist() {
  const c = [['Claimed owner matches title documents', 'Completed', 'No issue found'], ['Area stated consistently across documents', 'Completed', 'Issue found'], ['Khatauni matches claimed owner', 'Waiting for evidence', 'No result recorded'], ['Encumbrance certificate obtained', 'Verification not completed', 'No result recorded']];
  return (
    <div>
      <p className="muted" style={{ marginBottom: 14, maxWidth: 44 + 'em' }}>Progress and findings are separate. A check can be completed and still report an issue.</p>
      {c.map(([t, s, o]) => <div className="attn-row" key={t} style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto' }}><b style={{ fontWeight: 520 }}>{t}</b><span className={`chip ${s === 'Completed' ? 'green' : s.startsWith('Waiting') ? 'amber' : ''}`}>{s}</span><span className={`chip ${o === 'Issue found' ? 'red' : o === 'No issue found' ? 'green' : 'plain'}`}>{o}</span></div>)}
    </div>
  );
}
function DemoRisks() {
  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><SeverityChip s="high" /><span className="muted">Open</span></div>
      <h3 style={{ fontSize: 22, fontWeight: 640, letterSpacing: '-.02em', margin: '10px 0' }}>Plot area differs between records</h3>
      <p>Two supplied documents state different areas for the same property. Confirm the correct area against the relevant authoritative records and obtain professional review before proceeding.</p>
      <Dl rows={[['Evidence', 'Sale deed states 1.2 bigha. Survey sketch states 1.0 bigha.'], ['Source', 'Supplied documents (demonstration data)'], ['Owner', 'Unassigned'], ['Next step', 'Confirm the area against the revenue record. Ask the legal reviewer to advise.']]} />
      <p className="muted" style={{ fontSize: 13.5, marginTop: 12 }}>An illustrative finding. Not a statement about any real property.</p>
    </div>
  );
}
function DemoReview() {
  return (
    <div style={{ maxWidth: 720 }}>
      <div className="banner amber"><Icon name="info" /><div><b>Professional review: not started.</b> No qualified professional has reviewed this file.</div></div>
      <ol className="timeline" style={{ marginTop: 28 }}>
        {[['Documents collected', 'In progress'], ['Checks completed', 'Not started'], ['Ready for legal review', 'Not started'], ['Internal approval', 'Not started']].map(([s, st]) => <li key={s}><div style={{ fontWeight: 520 }}>{s}</div><div className="when">{st}</div></li>)}
      </ol>
      <p className="muted" style={{ fontSize: 14 }}>An internal approval records a team decision. It is not legal certification, government approval or registration.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function Philosophy() {
  const T = [['supplied', 'Supplied by you', 'What an owner, buyer or agent tells us, and the files they upload. Useful, and unchecked.'], ['entered', 'Entered from documents', 'Details typed in from a page. Preliminary until someone confirms them.'], ['source', 'Checked against a source', 'A person compared it with a named record and wrote down what they found.'], ['professional', 'Reviewed by a professional', 'A qualified reviewer examined the evidence and recorded their view.']];
  return (
    <section id="investors" className="band" aria-labelledby="phil-h">
      <div className="wrap">
        <h2 id="phil-h" className="h-section" style={{ maxWidth: '10em' }}>Clarity begins with evidence.</h2>
        <p className="lead" style={{ marginTop: 20 }}>Every detail in LandVerify carries a mark that says how much is known about it.</p>
        <div className="tiers" style={{ marginTop: 56 }}>
          {T.map(([l, h, p]) => <div className="tier rv" key={l}><span style={{ display: 'block' }}><ProvMark level={l} size={40} /></span><h3>{h}</h3><p>{p}</p></div>)}
        </div>
        <div className="grid12" style={{ marginTop: 72, rowGap: 32 }}>
          <div style={{ gridColumn: 'span 6' }}>
            <p className="muted" style={{ fontSize: 14 }}>What we do not do</p>
            <p style={{ fontSize: 'clamp(40px,5vw,64px)', letterSpacing: '-.04em', fontWeight: 640, textDecoration: 'line-through', textDecorationThickness: 3, textDecorationColor: 'var(--line-strong)', color: 'var(--soft)', marginTop: 8 }}>Safety score 82</p>
          </div>
          <div style={{ gridColumn: '7 / span 6' }}>
            <p className="muted" style={{ fontSize: 14 }}>What you see instead</p>
            <ul className="rule-list" style={{ marginTop: 8, fontSize: 17 }}>
              <li style={{ display: 'flex', gap: 12 }}><SeverityGlyph s="high" />1 high-risk finding, unresolved</li>
              <li style={{ display: 'flex', gap: 12 }}><SeverityGlyph s="medium" />1 record missing: Khatauni extract</li>
              <li style={{ display: 'flex', gap: 12 }}><SeverityGlyph s="low" />2 of 15 checks completed</li>
            </ul>
            <p className="prose" style={{ marginTop: 18 }}>A missing record or an unresolved difference stays visible until someone resolves it, and the reason is recorded.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Collab() {
  const log = [['AS', 'Owner', 'Uploaded the survey sketch', '2 days ago', null], ['RK', 'Lawyer', 'Requested a recent Khatauni extract', '2 days ago', 'Evidence request'], ['MP', 'Acquisition team', 'Commented: area on the sketch looks smaller than the deed', 'Yesterday', null], ['RK', 'Lawyer', 'Held the file until the area is confirmed', 'Today', 'Decision: hold']];
  return (
    <section id="professionals" className="band" aria-labelledby="col-h">
      <div className="wrap grid12" style={{ rowGap: 48, alignItems: 'center' }}>
        <div style={{ gridColumn: 'span 5' }}>
          <h2 id="col-h" className="h-section">Better decisions, with everyone on the same page.</h2>
          <p className="prose" style={{ marginTop: 20 }}>Owners, buyers, lawyers, acquisition teams and authorised DAO members review the same evidence. They leave comments, request missing documents and record decisions, and every step is kept in the history.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 24 }}>{['Owner', 'Buyer', 'Lawyer', 'Acquisition team', 'DAO member'].map((r) => <span key={r} className="chip">{r}</span>)}</div>
        </div>
        <div style={{ gridColumn: '7 / span 6' }} className="rv">
          <div className="review-trail">
            <div className="head"><div><b style={{ fontWeight: 600 }}>Sample parcel, fictional</b><div className="mono muted">LV-DEMO01</div></div><span className="tag-demo">Demonstration data</span></div>
            {log.map(([a, r, t, w, k]) => (
              <div className="rt-item" key={t}><span className="avatar" aria-hidden="true">{a}</span>
                <div><div style={{ fontSize: 14.5 }}><b style={{ fontWeight: 560 }}>{r}</b> <span className="muted">{w}</span></div><div style={{ marginTop: 2 }}>{t}</div>{k && <span className="chip blue" style={{ marginTop: 8 }}>{k}</span>}</div></div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Future() {
  const R = [['Document verification', 'Available now, recorded by people', 'now'], ['Collaborative due diligence', 'Available now', 'now'], ['Transaction preparation', 'Early stage', 'next'], ['Stamp-duty assessment', 'Planned', ''], ['Registration readiness', 'Planned', ''], ['Post-registration record tracking', 'Planned', '']];
  return (
    <section className="band" aria-labelledby="fut-h">
      <div className="wrap">
        <h2 id="fut-h" className="h-section" style={{ maxWidth: '12em' }}>From due diligence to transaction readiness.</h2>
        <div className="roadmap">{R.map(([t, s, c]) => <div className={`rm ${c}`} key={t}><h4>{t}</h4><div className="st">{s}</div></div>)}</div>
        <p className="prose" style={{ marginTop: 48, fontSize: 15 }}>Today, LandVerify helps you organise documents and record checks. No government integration or registration service is live. When one is added it will be named, configured per state, and marked as completed only when a check actually completes.</p>
      </div>
    </section>
  );
}

function Final() {
  return (
    <section className="band final" aria-labelledby="fin-h" style={{ borderTop: 0 }}>
      <div className="wrap" style={{ textAlign: 'left' }}>
        <h2 id="fin-h" className="h-section" style={{ maxWidth: '11em' }}>Start with the land. Move forward with clarity.</h2>
        <p style={{ marginTop: 20, fontSize: 19, maxWidth: '30em' }}>Create a structured property file and bring the next steps into focus.</p>
        <Link to="/signup" className="btn lg" style={{ marginTop: 32 }}>Create Your First Land File</Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-grid">
          <div><Link to="/" className="wordmark"><Logo />LandVerify</Link><p style={{ marginTop: 12, maxWidth: '22em' }}>Land due diligence for India. Organise documents, record checks, see what is unresolved.</p></div>
          <div><h5>Product</h5><ul><li><a href="#platform">Platform</a></li><li><a href="#how">How it works</a></li><li><a href="#demo">Demonstration</a></li></ul></div>
          <div><h5>Trust</h5><ul><li><a href="#security">Security</a></li><li><a href="#privacy">Privacy</a></li><li><a href="#terms">Terms</a></li></ul></div>
          <div><h5>Contact</h5><ul><li><a href="mailto:hello@landverify.example">hello@landverify.example</a></li><li>India</li></ul></div>
        </div>
        <div className="legal-note" id="terms">
          <p><b style={{ color: 'var(--ink)', fontWeight: 600 }}>Legal limitations.</b> LandVerify is a workflow and record-keeping tool. It does not provide legal advice, certify title, or replace a qualified lawyer. Reports describe only the checks that people recorded. Internal approvals are not government approval or registration.</p>
          <p id="security" style={{ marginTop: 10 }}><b style={{ color: 'var(--ink)', fontWeight: 600 }}>Security.</b> Documents are stored privately, served only to signed-in members of your workspace, and every view and change is written to an audit log.</p>
          <p id="privacy" style={{ marginTop: 10 }}><b style={{ color: 'var(--ink)', fontWeight: 600 }}>Privacy.</b> Uploaded deeds and personal details stay inside your workspace. Review this policy with your counsel before real use.</p>
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  useReveal();
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <Nav />
      <main id="main">
        <Hero />
        <Problem />
        <Reveal />
        <Demo />
        <Philosophy />
        <Collab />
        <Future />
        <Final />
      </main>
      <Footer />
    </>
  );
}
