import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, ago, fmtDate } from '../api.js';
import { Empty, ErrorState, Icon, Loading, Logo, Modal, OutcomeChip, SeverityChip, useLoad, useToast } from '../ui.jsx';
import { ACTION_LABEL, PROPERTY_TYPES, STATES, pickJurisdiction } from '../lib.js';
import Property, { ActivityList } from './Property.jsx';

const NAV = [
  ['/app', 'Overview', 'overview', true],
  ['/app/properties', 'Properties', 'property'],
  ['/app/documents', 'Documents', 'file'],
  ['/app/due-diligence', 'Due Diligence', 'checks'],
  ['/app/reviews', 'Reviews', 'review'],
  ['/app/reports', 'Reports', 'report'],
  ['/app/team', 'Team and Access', 'team'],
];

export default function Shell({ session, onSignOut }) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => setOpen(false), [loc.pathname]);
  const { user, org } = session;
  async function out() { await api.post('/api/auth/logout').catch(() => {}); onSignOut(); nav('/'); }
  return (
    <div className="app">
      <aside className={`side ${open ? 'open' : ''}`} aria-label="Workspace">
        <Link to="/app" className="wordmark"><Logo />LandVerify</Link>
        <nav aria-label="Primary">
          {NAV.map(([to, label, icon, end]) => (
            <NavLink key={to} to={to} end={!!end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon name={icon} />{label}</NavLink>
          ))}
        </nav>
        <div className="sep" />
        <NavLink to="/app/transaction-readiness" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon name="route" />Transaction Readiness<span className="soon">Early</span></NavLink>
        <div className="foot">
          <div style={{ color: 'var(--ink)', fontWeight: 560 }}>{user.name}</div>
          <div>{org.name}</div>
          <div style={{ textTransform: 'capitalize' }}>{user.role}</div>
          <button className="nav-item" onClick={out} style={{ marginTop: 8, marginLeft: -10, width: 'calc(100% + 10px)' }}><Icon name="logout" />Sign out</button>
        </div>
      </aside>
      <div style={{ minWidth: 0 }}>
        <div className="topbar">
          <button className="menu-btn" aria-label="Open navigation" onClick={() => setOpen(true)}><Icon name="menu" size={22} /></button>
          <Crumbs />
          <span className="grow" />
          <span className="chip plain" title="Role"><Icon name="lock" size={13} />{user.role}</span>
        </div>
        <div className="main app-view" key={loc.pathname.split('/').slice(0, 4).join('/')}>
          <Routes>
            <Route index element={<Overview user={user} />} />
            <Route path="properties" element={<Properties user={user} />} />
            <Route path="properties/:id/*" element={<Property user={user} />} />
            <Route path="documents" element={<AllDocuments />} />
            <Route path="due-diligence" element={<AllDiligence />} />
            <Route path="reviews" element={<ReviewQueue />} />
            <Route path="reports" element={<AllReports />} />
            <Route path="team" element={<Team user={user} />} />
            <Route path="transaction-readiness" element={<Readiness />} />
            <Route path="*" element={<Empty title="This page does not exist" action={<Link className="btn" to="/app">Go to overview</Link>}>Check the address or use the navigation.</Empty>} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

function Crumbs() {
  const { pathname } = useLocation();
  const parts = pathname.replace('/app', '').split('/').filter(Boolean);
  const names = { properties: 'Properties', documents: 'Documents', 'due-diligence': 'Due Diligence', reviews: 'Reviews', reports: 'Reports', team: 'Team and Access', 'transaction-readiness': 'Transaction Readiness' };
  const first = parts[0] ? names[parts[0]] || '' : 'Overview';
  return <div className="crumbs"><span className={parts.length > 1 ? '' : 'cur'}>{parts.length > 1 ? <Link to={`/app/${parts[0]}`}>{first}</Link> : first}</span>{parts.length > 1 && <><span>/</span><span className="cur mono">{parts[1]}</span></>}</div>;
}

/* ---------------- overview ---------------- */
function Overview({ user }) {
  const dash = useLoad(() => api.get('/api/dashboard'));
  const props = useLoad(() => api.get('/api/properties'));
  const act = useLoad(() => api.get('/api/activity?limit=8'));
  const [creating, setCreating] = useState(false);
  const toast = useToast();
  const nav = useNavigate();
  const canWrite = user.role !== 'viewer';
  const welcome = new URLSearchParams(useLocation().search).get('welcome');

  async function demo() {
    try { const r = await api.post('/api/demo'); toast('Demonstration property added. All records in it are fictional.'); nav(`/app/properties/${r.id}`); } catch (e) { toast(e.message, 'err'); }
  }
  if (dash.loading || props.loading) return <Loading />;
  if (dash.error || props.error) return <ErrorState error={dash.error || props.error} retry={() => { dash.reload(); props.reload(); }} />;
  const d = dash.data;
  return (
    <>
      <h1 className="page-h">Your land portfolio.</h1>
      <p className="page-sub">Every property, every check, every outstanding question.</p>
      {welcome && <div className="banner blue" style={{ marginTop: 24 }}><Icon name="info" /><div>Your workspace is ready. Add a property, or load the fictional demonstration property to see how a finished file looks.</div></div>}

      {d.total === 0 ? (
        <div className="next-action">
          <div><span className="chip blue">Next step</span><h2>Create your first land file.</h2><p className="muted">Record the property, add its documents, and LandVerify builds the checklist for its state.</p></div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {canWrite && <button className="btn" onClick={() => setCreating(true)}>Create property</button>}
            {canWrite && <button className="btn secondary" onClick={demo}>Load demonstration property</button>}
          </div>
        </div>
      ) : d.next ? (
        <div className="next-action">
          <div><span className="chip blue">Next step</span><h2>{d.next.title}</h2><p className="muted">{d.next.property_name}. {d.next.next_step}</p><div style={{ marginTop: 10 }}><SeverityChip s={d.next.severity} /></div></div>
          <Link className="btn" to={`/app/properties/${d.next.property_id}/findings`}>Resolve finding</Link>
        </div>
      ) : (
        <div className="next-action">
          <div><span className="chip green"><Icon name="check" size={13} stroke={2} />No open findings</span><h2>Ask a legal reviewer to look at the evidence.</h2><p className="muted">No findings are open. That means none are recorded, not that none exist.</p></div>
          <Link className="btn" to="/app/reviews">Open reviews</Link>
        </div>
      )}

      <div className="counts">
        <div className="count"><div className="n">{d.inProgress}</div><div className="l">Properties in progress</div></div>
        <div className="count"><div className="n">{d.docsAwaiting}</div><div className="l">Documents awaiting review</div></div>
        <div className="count"><div className="n" style={{ color: d.high ? 'var(--red)' : undefined }}>{d.high}</div><div className="l">Unresolved high-risk findings</div></div>
        <div className="count"><div className="n">{d.reviews}</div><div className="l">Reviews awaiting action</div></div>
      </div>

      <div className="cols" style={{ marginTop: 56 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 className="sec-h" style={{ fontSize: 18 }}>Properties</h2>
            {canWrite && <button className="btn sm" onClick={() => setCreating(true)}><Icon name="plus" size={15} />New property</button>}
          </div>
          <PropertyTable embedded />
        </div>
        <div>
          <h2 className="sec-h" style={{ fontSize: 18, marginBottom: 16 }}>Recent activity</h2>
          {act.loading ? <Loading /> : act.error ? <ErrorState error={act.error} retry={act.reload} /> : <ActivityList items={act.data} showProperty />}
        </div>
      </div>
      {creating && <NewProperty onClose={() => setCreating(false)} />}
    </>
  );
}

/* ---------------- properties ---------------- */
function PropertyTable({ embedded }) {
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');
  const [attention, setAttention] = useState(false);
  const [dq, setDq] = useState('');
  useEffect(() => { const t = setTimeout(() => setDq(q), 250); return () => clearTimeout(t); }, [q]);
  const { data, loading, error, reload } = useLoad(() => api.get(`/api/properties?q=${encodeURIComponent(dq)}&stage=${encodeURIComponent(stage)}${attention ? '&attention=1' : ''}`), [dq, stage, attention]);
  return (
    <>
      <div className="toolbar" style={{ marginTop: 16 }}>
        <label className="sr-only" htmlFor="pq">Search properties</label>
        <input id="pq" className="input" placeholder="Search by name, ID, village or owner" value={q} onChange={(e) => setQ(e.target.value)} type="search" />
        <label className="sr-only" htmlFor="ps">Filter by stage</label>
        <select id="ps" className="input" value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="">All stages</option><option value="collecting">Collecting documents</option>
          <option>Documents collected</option><option>Checks completed</option><option>Ready for legal review</option><option>Internal approval</option>
        </select>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={attention} onChange={(e) => setAttention(e.target.checked)} />Needs attention</label>
      </div>
      {loading && !data ? <Loading /> : error ? <ErrorState error={error} retry={reload} /> : !data.length ? (
        <Empty title={dq || stage || attention ? 'No properties match' : 'No properties yet'}>{dq || stage || attention ? 'Clear the search or filters to see everything.' : 'Create a property to start collecting its documents.'}</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Property</th><th>Documents</th><th>Checks</th>{!embedded && <th>Reviewer</th>}<th>Open findings</th><th>Updated</th></tr></thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="row">
                  <td><Link className="title" to={`/app/properties/${p.id}`}>{p.name}</Link>{p.is_demo && <span className="chip amber" style={{ marginLeft: 8 }}>Demo</span>}<div className="sub"><span className="mono">{p.id}</span> · {[p.village, p.district, p.state].filter(Boolean).join(', ')}</div></td>
                  <td>{p.documents}</td>
                  <td>{p.checks_done} of {p.checks_total}</td>
                  {!embedded && <td>{p.reviewer_name || <span className="muted">Not assigned</span>}</td>}
                  <td>{p.open_findings ? <>{p.open_findings}{p.high_findings > 0 && <span className="chip red" style={{ marginLeft: 8 }}><Icon name="warn" size={13} />{p.high_findings} high</span>}</> : <span className="muted">None open</span>}</td>
                  <td className="sub" style={{ whiteSpace: 'nowrap' }}>{ago(p.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Properties({ user }) {
  const [creating, setCreating] = useState(false);
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div><h1 className="page-h">Properties</h1><p className="page-sub">Each property is one file: its documents, checks, findings and review history.</p></div>
        {user.role !== 'viewer' && <button className="btn" onClick={() => setCreating(true)}><Icon name="plus" size={16} />New property</button>}
      </div>
      <PropertyTable />
      {creating && <NewProperty onClose={() => setCreating(false)} />}
    </>
  );
}

function NewProperty({ onClose }) {
  const cfg = useLoad(() => api.get('/api/config'));
  const toast = useToast();
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', state: 'Uttar Pradesh', district: '', tehsil: '', village: '', area_value: '', area_unit: '', property_type: 'Agricultural', claimed_owner: '', identifiers: {} });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const j = cfg.data ? pickJurisdiction(cfg.data.jurisdictions, f.state) : null;
  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const r = await api.post('/api/properties', { ...f, area_unit: f.area_unit || j?.areaUnits[0] || '' }); toast('Property created. Its checklist is ready.'); nav(`/app/properties/${r.id}`); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  return (
    <Modal title="New property" onClose={onClose}>
      {cfg.loading ? <Loading /> : cfg.error ? <ErrorState error={cfg.error} retry={cfg.reload} /> : (
        <form onSubmit={submit} className="form-grid" noValidate>
          <div className="field full"><label htmlFor="np-n">Property name</label><input id="np-n" className="input" value={f.name} onChange={set('name')} placeholder="A name you will recognise" required /></div>
          <div className="field full"><label htmlFor="np-s">State</label><select id="np-s" className="input" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value, area_unit: '', identifiers: {} })}>{STATES.map((s) => <option key={s}>{s}</option>)}</select><span className="hint">The state decides which record names and checks are used. {j?.notes}</span></div>
          <div className="field"><label htmlFor="np-d">District</label><input id="np-d" className="input" value={f.district} onChange={set('district')} /></div>
          <div className="field"><label htmlFor="np-t">Tehsil</label><input id="np-t" className="input" value={f.tehsil} onChange={set('tehsil')} /></div>
          <div className="field full"><label htmlFor="np-v">Village</label><input id="np-v" className="input" value={f.village} onChange={set('village')} /></div>
          {j?.identifierFields.map((i) => (
            <div className="field" key={i.key}><label htmlFor={`id-${i.key}`}>{i.label}</label><input id={`id-${i.key}`} className="input" value={f.identifiers[i.key] || ''} onChange={(e) => setF({ ...f, identifiers: { ...f.identifiers, [i.key]: e.target.value } })} />{i.hint && <span className="hint">{i.hint}</span>}</div>
          ))}
          <div className="field"><label htmlFor="np-a">Claimed area</label><input id="np-a" className="input" inputMode="decimal" value={f.area_value} onChange={set('area_value')} /><span className="hint">As stated by the owner. Not verified.</span></div>
          <div className="field"><label htmlFor="np-u">Unit</label><select id="np-u" className="input" value={f.area_unit || j?.areaUnits[0]} onChange={set('area_unit')}>{j?.areaUnits.map((u) => <option key={u}>{u}</option>)}</select><span className="hint">No unit conversion is applied.</span></div>
          <div className="field"><label htmlFor="np-p">Property type</label><select id="np-p" className="input" value={f.property_type} onChange={set('property_type')}>{PROPERTY_TYPES.map((u) => <option key={u}>{u}</option>)}</select></div>
          <div className="field"><label htmlFor="np-o">Claimed owner</label><input id="np-o" className="input" value={f.claimed_owner} onChange={set('claimed_owner')} /></div>
          {err && <div className="error-text full" role="alert"><Icon name="warn" size={16} />{err}</div>}
          <div className="full" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
            <button className="btn" disabled={busy}>{busy ? 'Creating' : 'Create property'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/* ---------------- cross-property views ---------------- */
function AllDocuments() {
  const { data, loading, error, reload } = useLoad(() => api.get('/api/documents'));
  return (
    <>
      <h1 className="page-h">Documents</h1>
      <p className="page-sub">Every document across your properties. Open one to compare it with its extracted details.</p>
      {loading ? <Loading /> : error ? <ErrorState error={error} retry={reload} /> : !data.length ? <div style={{ marginTop: 32 }}><Empty title="No documents yet">Open a property and upload its deeds, extracts and maps.</Empty></div> : (
        <div className="table-wrap" style={{ marginTop: 28 }}><table className="table"><thead><tr><th>Document</th><th>Property</th><th>File</th><th>Added</th></tr></thead><tbody>
          {data.map((d) => <tr className="row" key={d.id}><td><Link className="title" to={`/app/properties/${d.property_id}/documents/${d.id}`}>{d.title}</Link><div className="sub">{d.doc_type}</div></td><td><Link to={`/app/properties/${d.property_id}`}>{d.property_name}</Link></td><td className="sub">{d.file_name || 'No file attached'}</td><td className="sub">{ago(d.created_at)}</td></tr>)}
        </tbody></table></div>
      )}
    </>
  );
}

function AllDiligence() {
  const { data, loading, error, reload } = useLoad(() => api.get('/api/properties'));
  return (
    <>
      <h1 className="page-h">Understand what has been checked.</h1>
      <p className="page-sub">Progress for each property. Completed checks do not mean a clear title.</p>
      {loading ? <Loading /> : error ? <ErrorState error={error} retry={reload} /> : !data.length ? <div style={{ marginTop: 32 }}><Empty title="Nothing to check yet">Create a property and its checklist appears here.</Empty></div> : (
        <div style={{ marginTop: 32 }}>
          {data.map((p) => (
            <Link key={p.id} to={`/app/properties/${p.id}/due-diligence`} className="attn-row" style={{ textDecoration: 'none', color: 'inherit', gridTemplateColumns: 'minmax(0,1fr) auto auto', alignItems: 'center' }}>
              <div><b style={{ fontWeight: 580 }}>{p.name}</b><div className="sub"><span className="mono">{p.id}</span></div></div>
              <span className="sub">{p.checks_done} of {p.checks_total} checks completed</span>
              {p.open_findings ? <span className={`chip ${p.high_findings ? 'red' : 'amber'}`}><Icon name="warn" size={13} />{p.open_findings} unresolved</span> : <span className="chip plain">No open findings</span>}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function ReviewQueue() {
  const { data, loading, error, reload } = useLoad(() => api.get('/api/reviews/queue'));
  const toast = useToast();
  async function close(r) { try { await api.patch(`/api/reviews/${r.id}`, { status: 'closed' }); toast('Request closed.'); reload(); } catch (e) { toast(e.message, 'err'); } }
  return (
    <>
      <h1 className="page-h">Reviews</h1>
      <p className="page-sub">Open requests for evidence and corrections, across all properties.</p>
      {loading ? <Loading /> : error ? <ErrorState error={error} retry={reload} /> : !data.length ? <div style={{ marginTop: 32 }}><Empty title="Nothing waiting">No evidence or correction requests are open. Record one from a property's Reviews tab.</Empty></div> : (
        <div style={{ marginTop: 28 }}>{data.map((r) => (
          <div className="attn-row" key={r.id} style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
            <div><span className={`chip ${r.kind === 'evidence_request' ? 'amber' : 'blue'}`}>{r.kind === 'evidence_request' ? 'Evidence requested' : 'Correction requested'}</span><p style={{ color: 'var(--ink)', fontSize: 16, marginTop: 8 }}>{r.body}</p><p className="sub">{r.author_name} · <Link to={`/app/properties/${r.property_id}/reviews`}>{r.property_name}</Link> · {ago(r.created_at)}</p></div>
            <button className="btn secondary sm" onClick={() => close(r)}>Mark as received</button>
          </div>))}</div>
      )}
    </>
  );
}

function AllReports() {
  const { data, loading, error, reload } = useLoad(() => api.get('/api/reports'));
  return (
    <>
      <h1 className="page-h">Reports</h1>
      <p className="page-sub">Each report states what was checked, what evidence was reviewed, and what is still uncertain. Generate one from a property.</p>
      {loading ? <Loading /> : error ? <ErrorState error={error} retry={reload} /> : !data.length ? <div style={{ marginTop: 32 }}><Empty title="No reports yet">Open a property and choose Generate report.</Empty></div> : (
        <div className="table-wrap" style={{ marginTop: 28 }}><table className="table"><thead><tr><th>Report</th><th>Property</th><th>Generated</th><th /></tr></thead><tbody>
          {data.map((r) => <tr className="row" key={r.id}><td><b style={{ fontWeight: 560 }}>{r.file_name}</b><div className="sub">By {r.generated_by_name}</div></td><td><Link to={`/app/properties/${r.property_id}/reports`}>{r.property_name}</Link></td><td className="sub">{fmtDate(r.created_at)}</td><td><a className="btn secondary sm" href={`/api/reports/${r.id}/file?download=1`}><Icon name="download" size={15} />Download</a></td></tr>)}
        </tbody></table></div>
      )}
    </>
  );
}

/* ---------------- team ---------------- */
const ROLE_HELP = { admin: 'Manages the team and everything else.', reviewer: 'Records decisions, approvals and professional reviews.', member: 'Adds properties, documents, checks and findings.', viewer: 'Reads and comments. Cannot change records.' };
function Team({ user }) {
  const { data, loading, error, reload } = useLoad(() => api.get('/api/team'));
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  async function role(m, r) { try { await api.patch(`/api/team/${m.id}`, { role: r }); toast(`${m.name} is now ${r}.`); reload(); } catch (e) { toast(e.message, 'err'); reload(); } }
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div><h1 className="page-h">Team and access</h1><p className="page-sub">Everyone here can see every property in this workspace. Roles decide what they can change.</p></div>
        {user.role === 'admin' && <button className="btn" onClick={() => setAdding(true)}><Icon name="plus" size={16} />Add team member</button>}
      </div>
      {loading ? <Loading /> : error ? <ErrorState error={error} retry={reload} /> : (
        <div className="table-wrap" style={{ marginTop: 32 }}><table className="table"><thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead><tbody>
          {data.map((m) => <tr className="row" key={m.id}><td><b style={{ fontWeight: 560 }}>{m.name}</b>{m.id === user.id && <span className="chip" style={{ marginLeft: 8 }}>You</span>}<div className="sub">{m.title}</div></td><td>{m.email}</td>
            <td>{user.role === 'admin' ? <select className="input" style={{ width: 160 }} value={m.role} aria-label={`Role for ${m.name}`} onChange={(e) => role(m, e.target.value)} disabled={m.id === user.id}>{Object.keys(ROLE_HELP).map((r) => <option key={r}>{r}</option>)}</select> : <span style={{ textTransform: 'capitalize' }}>{m.role}</span>}</td></tr>)}
        </tbody></table></div>
      )}
      <h2 className="sec-h" style={{ marginTop: 48 }}>What each role can do</h2>
      <dl className="dl" style={{ marginTop: 12 }}>{Object.entries(ROLE_HELP).map(([r, t]) => [<dt key={r} style={{ textTransform: 'capitalize' }}>{r}</dt>, <dd key={r + 'd'}>{t}</dd>])}</dl>
      {adding && <AddMember onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
    </>
  );
}
function AddMember({ onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ name: '', email: '', title: '', role: 'member', password: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) { e.preventDefault(); setErr(''); setBusy(true); try { await api.post('/api/team', f); toast(`${f.name} added. Share the temporary password privately.`); onDone(); } catch (x) { setErr(x.message); } finally { setBusy(false); } }
  return (
    <Modal title="Add team member" onClose={onClose}>
      <form onSubmit={submit} className="form-grid" noValidate>
        <div className="field"><label htmlFor="am-n">Name</label><input id="am-n" className="input" value={f.name} onChange={set('name')} /></div>
        <div className="field"><label htmlFor="am-e">Email</label><input id="am-e" type="email" className="input" value={f.email} onChange={set('email')} /></div>
        <div className="field"><label htmlFor="am-t">Position</label><input id="am-t" className="input" placeholder="Lawyer, buyer, DAO member" value={f.title} onChange={set('title')} /></div>
        <div className="field"><label htmlFor="am-r">Role</label><select id="am-r" className="input" value={f.role} onChange={set('role')}>{Object.keys(ROLE_HELP).map((r) => <option key={r}>{r}</option>)}</select><span className="hint">{ROLE_HELP[f.role]}</span></div>
        <div className="field full"><label htmlFor="am-p">Temporary password</label><input id="am-p" type="password" className="input" value={f.password} onChange={set('password')} autoComplete="new-password" /><span className="hint">At least 10 characters. Share it privately and ask them to keep it safe.</span></div>
        {err && <div className="error-text full" role="alert"><Icon name="warn" size={16} />{err}</div>}
        <div className="full" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={busy}>{busy ? 'Adding' : 'Add member'}</button></div>
      </form>
    </Modal>
  );
}

/* ---------------- transaction readiness ---------------- */
function Readiness() {
  const steps = [['Transaction preparation', 'Early stage', 'Gather the parties, documents and conditions needed before a sale agreement.'], ['Stamp-duty assessment', 'Planned', 'State-specific. Rates and rules differ, so this will be configured per state.'], ['Registration readiness', 'Planned', 'A checklist of what a registration office expects. Not a registration service.'], ['Post-registration record tracking', 'Planned', 'Follow mutation after a transfer is registered.']];
  return (
    <>
      <span className="chip amber">Early-stage capability</span>
      <h1 className="page-h" style={{ marginTop: 12 }}>Transaction readiness</h1>
      <p className="page-sub">Where due diligence leads. None of this is live yet.</p>
      <div className="banner amber" style={{ marginTop: 28, maxWidth: 760 }}><Icon name="info" /><div>LandVerify does not currently connect to any government system, assess stamp duty, or perform registration. Nothing on this page is available to run.</div></div>
      <div style={{ marginTop: 32, maxWidth: 760 }}>{steps.map(([t, s, d]) => <div className="attn-row" key={t} style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}><div><h4>{t}</h4><p>{d}</p></div><span className={`chip ${s === 'Early stage' ? 'blue' : ''}`}>{s}</span></div>)}</div>
    </>
  );
}
