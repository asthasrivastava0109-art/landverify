import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api, ago, fmtDate, fmtDateTime } from '../api.js';
import {
  CHECK_STATUS, Empty, ErrorState, ExtractionChip, FSTATUS, Icon, Loading, Modal, OutcomeChip, OUTCOME, Prov, ProvMark, PROV, SeverityChip, SeverityGlyph, StatusChip, docLevel, useLoad, useToast,
} from '../ui.jsx';
import { ACTION_LABEL, DOC_TYPES, PROPERTY_TYPES, STAGES, illustrativeOutline, pickJurisdiction } from '../lib.js';
import DocViewer from './DocViewer.jsx';
import Land from './Land.jsx';

export function ActivityList({ items, showProperty }) {
  if (!items.length) return <p className="muted">Nothing has happened yet.</p>;
  return (
    <ol className="timeline">
      {items.map((a) => (
        <li key={a.id}>
          <div><b style={{ fontWeight: 560 }}>{a.user_name || 'System'}</b> {ACTION_LABEL[a.action] || a.action}{showProperty && a.property_name ? <> on <Link to={`/app/properties/${a.property_id}`}>{a.property_name}</Link></> : null}</div>
          {a.detail && <div className="sub" style={{ marginTop: 2 }}>{a.detail}</div>}
          <div className="when" title={a.created_at}>{ago(a.created_at)} <span className="mono" style={{ marginLeft: 6, color: 'var(--soft)' }}>{a.id.slice(4, 12)}</span></div>
        </li>
      ))}
    </ol>
  );
}

export default function Property({ user }) {
  const { id } = useParams();
  const prop = useLoad(() => api.get(`/api/properties/${id}`), [id]);
  const team = useLoad(() => api.get('/api/team'));
  const cfg = useLoad(() => api.get('/api/config'));
  if (prop.loading && !prop.data) return <Loading label="Opening property" />;
  if (prop.error) return prop.error.status === 404
    ? <Empty title="Property not found" action={<Link className="btn" to="/app/properties">Back to properties</Link>}>It may have been deleted, or it belongs to another workspace.</Empty>
    : <ErrorState error={prop.error} retry={prop.reload} />;
  const p = prop.data;
  const ctx = { p, user, team: team.data || [], cfg: cfg.data, reload: prop.reload };
  const base = `/app/properties/${p.id}`;
  const tab = (to, label, badge) => <NavLink to={to ? `${base}/${to}` : base} end={to === ''} className={({ isActive }) => (isActive ? 'active' : '')}>{label}{badge ? <span className="badge">{badge}</span> : null}</NavLink>;
  return (
    <>
      <div className="ph">
        <h1>{p.name}{p.is_demo && <span className="tag-demo">Demonstration data</span>}</h1>
        <div className="ids">
          <span className="mono">{p.id}</span>
          <span>{[p.village, p.tehsil, p.district, p.state].filter(Boolean).join(', ')}</span>
          {p.jurisdiction.identifierFields.map((f) => p.identifiers?.[f.key] ? <span key={f.key}>{f.label.split(' / ')[0]} <span className="mono">{p.identifiers[f.key]}</span></span> : null)}
        </div>
        <nav className="tabs" aria-label="Property sections">
          {tab('', 'Overview')}{tab('documents', 'Documents', p.documents)}{tab('due-diligence', 'Due diligence', `${p.checks_done}/${p.checks_total}`)}
          {p.state === 'Uttar Pradesh' && tab('land', 'Maps & records')}{tab('findings', 'Findings', p.open_findings || '')}{tab('reviews', 'Reviews')}{tab('reports', 'Reports')}{tab('activity', 'Activity')}
        </nav>
      </div>
      <div style={{ paddingTop: 8 }}>
        <Routes>
          <Route index element={<Overview {...ctx} />} />
          <Route path="documents" element={<Documents {...ctx} />} />
          <Route path="documents/:docId" element={<DocViewer {...ctx} />} />
          <Route path="due-diligence" element={<Diligence {...ctx} />} />
          <Route path="land" element={<Land {...ctx} />} />
          <Route path="findings" element={<Findings {...ctx} />} />
          <Route path="reviews" element={<Reviews {...ctx} />} />
          <Route path="reports" element={<Reports {...ctx} />} />
          <Route path="activity" element={<Activity {...ctx} />} />
        </Routes>
      </div>
    </>
  );
}

const canWrite = (u) => u.role !== 'viewer';
const isReviewer = (u) => u.role === 'admin' || u.role === 'reviewer';

/* ---------------- overview ---------------- */
const KEY_DOCS = [['Sale deed', 'Gift deed', 'Will'], ['Khatauni / Record of Rights', 'Jamabandi', 'Khasra / Gata extract'], ['Survey sketch / map'], ['Encumbrance certificate'], ['Land-use certificate'], ['Identity document']];
const KEY_LABELS = ['Title deed', 'Record of rights', 'Map or sketch', 'Encumbrance certificate', 'Land-use certificate', 'Identity document'];

function Parcel({ p }) {
  const pts = useMemo(() => illustrativeOutline(p.id), [p.id]);
  const d = pts.map((x) => x.join(',')).join(' ');
  const sourced = p.boundary_source === 'survey';
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox="0 0 400 260" role="img" aria-label={sourced ? 'Parcel boundary from survey data' : 'Illustrative parcel outline, not from survey data'} style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 8, background: '#fff' }}>
        <defs><pattern id="pg" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#EDEDE8" /></pattern></defs>
        <rect width="400" height="260" fill="url(#pg)" />
        <polygon points={d} fill="#E8EEF8" fillOpacity=".6" stroke="#174EA6" strokeWidth="2" strokeDasharray={sourced ? '0' : '6 5'} strokeLinejoin="round" pathLength="1000" className="draw" style={{ '--len': 1000, animationDuration: '1.2s' }} />
        {pts.map((q, i) => <circle key={i} cx={q[0]} cy={q[1]} r="3" fill="#174EA6" className="fade-in" style={{ animationDelay: `${0.8 + i * 0.08}s` }} />)}
      </svg>
      <figcaption className="legend">
        <span><i className={sourced ? '' : 'dash'} />{sourced ? 'Boundary from survey data' : 'Illustrative outline'}</span>
        <span>{sourced ? 'Source recorded on the property.' : 'Not taken from any survey. Do not use to judge extent or boundaries.'}</span>
      </figcaption>
    </figure>
  );
}

function Overview({ p, user, team, cfg, reload }) {
  const docs = useLoad(() => api.get(`/api/properties/${p.id}/documents`), [p.id, p.updated_at]);
  const checks = useLoad(() => api.get(`/api/properties/${p.id}/checks`), [p.id, p.updated_at]);
  const act = useLoad(() => api.get(`/api/properties/${p.id}/activity`), [p.id, p.updated_at]);
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const toast = useToast();
  const nav = useNavigate();
  async function assign(e) { try { await api.patch(`/api/properties/${p.id}`, { reviewer_id: e.target.value }); toast('Reviewer updated.'); reload(); } catch (x) { toast(x.message, 'err'); } }
  const present = docs.data ? KEY_DOCS.map((g) => docs.data.some((d) => g.includes(d.doc_type))) : [];
  const have = present.filter(Boolean).length;
  const verifiedDocs = docs.data?.filter((d) => ['checked_source', 'professionally_reviewed'].includes(d.verification_status)) || [];
  const doneChecks = checks.data?.filter((c) => c.status === 'completed') || [];
  const next = p.high_findings ? { t: 'Resolve the high-risk findings', to: 'findings', btn: 'Resolve finding' }
    : have < 3 ? { t: 'Add the missing documents', to: 'documents', btn: 'Request missing records' }
      : p.checks_done < p.checks_total ? { t: 'Continue the checklist', to: 'due-diligence', btn: 'Review documents' }
        : { t: 'Send the file for legal review', to: 'reviews', btn: 'Ready for legal review' };
  return (
    <div className="cols">
      <div>
        <div className="banner blue"><Icon name="info" /><div><b>Supplied is not verified.</b> Details in the first section were entered by a person. Only the second section lists what has been checked against a source or reviewed.</div></div>

        <section style={{ marginTop: 40 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <h2 className="sec-h" style={{ fontSize: 18 }}>As supplied</h2>
            {canWrite(user) && <button className="btn quiet sm" onClick={() => setEdit(true)}>Edit details</button>}
          </div>
          <p className="sec-sub"><Prov level="supplied" /></p>
          <dl className="dl">
            <dt>Claimed area</dt><dd>{p.area_value != null ? `${p.area_value} ${p.area_unit || ''}` : <span className="muted">Not recorded</span>}</dd>
            <dt>Property type</dt><dd>{p.property_type || <span className="muted">Not recorded</span>}</dd>
            <dt>Claimed owner</dt><dd>{p.claimed_owner || <span className="muted">Not recorded</span>}</dd>
            {p.jurisdiction.identifierFields.map((f) => [<dt key={f.key}>{f.label}</dt>, <dd key={f.key + 'v'} className="mono">{p.identifiers?.[f.key] || <span className="muted" style={{ fontFamily: 'var(--font)' }}>Not recorded</span>}</dd>])}
            <dt>Land records term</dt><dd>{p.jurisdiction.recordTerms.ownershipRegister} <span className="muted">(for {p.jurisdiction.name})</span></dd>
          </dl>
        </section>

        <section style={{ marginTop: 48 }}>
          <h2 className="sec-h" style={{ fontSize: 18 }}>Independently verified</h2>
          <p className="sec-sub">Only items a person has checked against a named source, or a reviewer has signed off.</p>
          {docs.loading || checks.loading ? <Loading /> : (!verifiedDocs.length && !doneChecks.filter((c) => c.outcome === 'no_issue_found').length) ? (
            <div className="banner amber"><Icon name="info" /><div><b>Nothing has been verified yet.</b> Verification not completed for every item on this file.</div></div>
          ) : (
            <ul className="rule-list">
              {verifiedDocs.map((d) => <li key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><span><b style={{ fontWeight: 560 }}>{d.title}</b><span className="sub"> · {d.verification_note}</span></span><Prov level={docLevel(d.verification_status)} /></li>)}
              {doneChecks.filter((c) => c.outcome === 'no_issue_found').map((c) => <li key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><span><b style={{ fontWeight: 560 }}>{c.title}</b><span className="sub"> · Source: {c.source}</span></span><span className="chip green"><Icon name="check" size={13} stroke={2} />No issue found</span></li>)}
            </ul>
          )}
          <p className="sub" style={{ marginTop: 12 }}>A check reporting no issue is not a legal opinion that the title is clear.</p>
        </section>

        <section style={{ marginTop: 48 }}>
          <h2 className="sec-h" style={{ fontSize: 18 }}>Progress</h2>
          <p className="sec-sub">Collection, verification and risk are tracked separately.</p>
          <dl className="dl">
            <dt>Document collection</dt><dd>{docs.loading ? '...' : <><b style={{ fontWeight: 560 }}>{have} of {KEY_DOCS.length}</b> key document types<div className="sub" style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: '2px 14px' }}>{KEY_LABELS.map((l, i) => <span key={l} style={{ whiteSpace: 'nowrap', color: present[i] ? 'var(--ink)' : 'var(--soft)' }}>{present[i] ? '✓' : '○'} {l}</span>)}</div></>}</dd>
            <dt>Verification activity</dt><dd>{p.checks_done} of {p.checks_total} checks completed</dd>
            {p.state === 'Uttar Pradesh' && <><dt>Official records</dt><dd><Link to={`/app/properties/${p.id}/land`}>UP Bhulekh and UP Bhunaksha</Link><div className="sub">Imported by a person from the official sites. Not retrieved automatically, and pending validation.</div></dd></>}
            <dt>Unresolved findings</dt><dd>{p.open_findings ? <>{p.open_findings}{p.high_findings ? <span className="chip red" style={{ marginLeft: 8 }}><Icon name="warn" size={13} />{p.high_findings} high</span> : null}</> : 'None recorded'}</dd>
            <dt>Workflow stage</dt><dd>{p.stage === 'collecting' ? 'Collecting documents' : p.stage}<div className="sub">An internal stage. Not legal certification.</div></dd>
            <dt>Assigned reviewer</dt><dd>{isReviewer(user) ? <select className="input" style={{ maxWidth: 260 }} value={p.reviewer_id || ''} onChange={assign} aria-label="Assigned reviewer"><option value="">Not assigned</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.role})</option>)}</select> : (p.reviewer_name || <span className="muted">Not assigned</span>)}</dd>
            <dt>Last updated</dt><dd>{fmtDateTime(p.updated_at)}</dd>
          </dl>
        </section>

        <section style={{ marginTop: 48 }}>
          <h2 className="sec-h" style={{ fontSize: 18, marginBottom: 14 }}>Parcel</h2>
          <Parcel p={p} />
        </section>
        {user.role === 'admin' && <div style={{ marginTop: 56 }}><button className="btn danger sm" onClick={() => setDel(true)}>Delete property</button></div>}
      </div>

      <aside>
        <div style={{ borderTop: '2px solid var(--ink)', paddingTop: 18 }}>
          <span className="chip blue">Next step</span>
          <h3 style={{ fontSize: 20, fontWeight: 620, letterSpacing: '-.015em', margin: '10px 0 14px' }}>{next.t}</h3>
          <Link className="btn" to={`/app/properties/${p.id}/${next.to}`}>{next.btn}</Link>
        </div>
        <h3 className="sec-h" style={{ marginTop: 48, marginBottom: 16 }}>Recent activity</h3>
        {act.loading ? <Loading /> : act.error ? <ErrorState error={act.error} retry={act.reload} /> : <ActivityList items={act.data.slice(0, 6)} />}
        <Link to={`/app/properties/${p.id}/activity`} className="sub">See full history</Link>
      </aside>
      {edit && <EditProperty p={p} cfg={cfg} onClose={() => setEdit(false)} onDone={() => { setEdit(false); reload(); }} />}
      {del && (
        <Modal title="Delete this property?" onClose={() => setDel(false)}>
          <p>This permanently removes <b>{p.name}</b>, its documents, checks, findings and reports. The audit log keeps a record that it was deleted.</p>
          <div className="actions"><button className="btn secondary" onClick={() => setDel(false)}>Keep property</button><button className="btn danger" onClick={async () => { try { await api.del(`/api/properties/${p.id}`); toast('Property deleted.'); nav('/app/properties'); } catch (x) { toast(x.message, 'err'); } }}>Delete permanently</button></div>
        </Modal>
      )}
    </div>
  );
}

export function EditProperty({ p, cfg, onClose, onDone }) {
  const toast = useToast();
  const j = cfg ? pickJurisdiction(cfg.jurisdictions, p.state) : p.jurisdiction;
  const [f, setF] = useState({ name: p.name, district: p.district || '', tehsil: p.tehsil || '', village: p.village || '', area_value: p.area_value ?? '', area_unit: p.area_unit || j.areaUnits[0], property_type: p.property_type || '', claimed_owner: p.claimed_owner || '', identifiers: { ...p.identifiers } });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) { e.preventDefault(); setBusy(true); setErr(''); try { await api.patch(`/api/properties/${p.id}`, f); toast('Details saved.'); onDone(); } catch (x) { setErr(x.message); } finally { setBusy(false); } }
  return (
    <Modal title="Edit property details" onClose={onClose}>
      <form onSubmit={submit} className="form-grid" noValidate>
        <div className="field full"><label htmlFor="ep-n">Property name</label><input id="ep-n" className="input" value={f.name} onChange={set('name')} /></div>
        <div className="field"><label htmlFor="ep-d">District</label><input id="ep-d" className="input" value={f.district} onChange={set('district')} /></div>
        <div className="field"><label htmlFor="ep-t">Tehsil</label><input id="ep-t" className="input" value={f.tehsil} onChange={set('tehsil')} /></div>
        <div className="field full"><label htmlFor="ep-v">Village</label><input id="ep-v" className="input" value={f.village} onChange={set('village')} /></div>
        {j.identifierFields.map((i) => <div className="field" key={i.key}><label htmlFor={`ei-${i.key}`}>{i.label}</label><input id={`ei-${i.key}`} className="input" value={f.identifiers[i.key] || ''} onChange={(e) => setF({ ...f, identifiers: { ...f.identifiers, [i.key]: e.target.value } })} /></div>)}
        <div className="field"><label htmlFor="ep-a">Claimed area</label><input id="ep-a" className="input" inputMode="decimal" value={f.area_value} onChange={set('area_value')} /></div>
        <div className="field"><label htmlFor="ep-u">Unit</label><select id="ep-u" className="input" value={f.area_unit} onChange={set('area_unit')}>{j.areaUnits.map((u) => <option key={u}>{u}</option>)}</select></div>
        <div className="field"><label htmlFor="ep-p">Property type</label><select id="ep-p" className="input" value={f.property_type} onChange={set('property_type')}><option value="">Not recorded</option>{PROPERTY_TYPES.map((u) => <option key={u}>{u}</option>)}</select></div>
        <div className="field"><label htmlFor="ep-o">Claimed owner</label><input id="ep-o" className="input" value={f.claimed_owner} onChange={set('claimed_owner')} /></div>
        {err && <div className="error-text full" role="alert"><Icon name="warn" size={16} />{err}</div>}
        <div className="full" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={busy}>{busy ? 'Saving' : 'Save changes'}</button></div>
      </form>
    </Modal>
  );
}

/* ---------------- documents ---------------- */
function Documents({ p, user, reload }) {
  const { data, loading, error, reload: rl } = useLoad(() => api.get(`/api/properties/${p.id}/documents`), [p.id]);
  const [up, setUp] = useState(false);
  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div><h2 className="page-h" style={{ fontSize: 28 }}>Document vault</h2><p className="page-sub" style={{ fontSize: 16 }}>Stored privately. Every view is recorded in the activity history.</p></div>
        {canWrite(user) && <button className="btn" onClick={() => setUp(true)}><Icon name="upload" size={16} />Upload document</button>}
      </div>
      {loading ? <Loading /> : error ? <ErrorState error={error} retry={rl} /> : !data.length ? (
        <div style={{ marginTop: 28 }}><Empty title="No documents yet" action={canWrite(user) ? <button className="btn" onClick={() => setUp(true)}>Upload the first document</button> : null}>Start with the most recent deed, then the revenue record. PDF, PNG, JPG and TIFF files up to 25 MB are accepted.</Empty></div>
      ) : (
        <div className="table-wrap" style={{ marginTop: 28 }}>
          <table className="table">
            <thead><tr><th>Document</th><th>Date</th><th>Parties</th><th>Identifiers</th><th>Extraction</th><th>Verification</th><th>Version</th></tr></thead>
            <tbody>{data.map((d) => (
              <tr className="row" key={d.id}>
                <td><Link className="title" to={`/app/properties/${p.id}/documents/${d.id}`}>{d.title}</Link><div className="sub">{d.doc_type} · {d.file_name || 'No file attached'}{d.origin === 'imported_official_source' && <span className="chip blue" style={{ marginLeft: 8 }}>Imported official-source material, pending validation</span>}</div></td>
                <td className="sub" style={{ whiteSpace: 'nowrap' }}>{d.doc_date || 'Not recorded'}</td>
                <td className="sub" style={{ maxWidth: 200 }}>{d.parties || 'Not recorded'}</td>
                <td className="sub mono">{d.identifiers || '-'}</td>
                <td><ExtractionChip s={d.extraction_status} /></td>
                <td><Prov level={docLevel(d.verification_status)} short />{d.verification_status === 'discrepancy' && <div className="chip amber" style={{ marginTop: 6 }}><Icon name="info" size={13} />Difference flagged</div>}</td>
                <td className="sub">v{d.version}{d.versions > 1 ? ` of ${d.versions}` : ''}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
      )}
      <p className="sub" style={{ marginTop: 16, maxWidth: '48em' }}>LandVerify does not read documents automatically yet. Details are entered by people and stay marked as preliminary until confirmed.</p>
      {up && <Upload p={p} onClose={() => setUp(false)} onDone={() => { setUp(false); rl(); reload(); }} />}
    </div>
  );
}

function Upload({ p, onClose, onDone }) {
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [f, setF] = useState({ doc_type: 'Sale deed', title: '', doc_date: '', parties: '', identifiers: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault(); setErr('');
    if (!file) return setErr('Choose a file to upload.');
    setBusy(true);
    try { const fd = new FormData(); Object.entries(f).forEach(([k, v]) => fd.append(k, v)); fd.append('file', file); await api.post(`/api/properties/${p.id}/documents`, fd); toast('Document uploaded and stored privately.'); onDone(); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  return (
    <Modal title="Upload document" onClose={onClose}>
      <form onSubmit={submit} className="form-grid" noValidate>
        <div className="field full"><label htmlFor="u-f">File</label><input id="u-f" type="file" className="input" accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff" onChange={(e) => setFile(e.target.files[0] || null)} /><span className="hint">PDF, PNG, JPG or TIFF, up to 25 MB.</span></div>
        <div className="field"><label htmlFor="u-t">Document type</label><select id="u-t" className="input" value={f.doc_type} onChange={set('doc_type')}>{DOC_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="field"><label htmlFor="u-d">Document date</label><input id="u-d" type="date" className="input" value={f.doc_date} onChange={set('doc_date')} /></div>
        <div className="field full"><label htmlFor="u-n">Title</label><input id="u-n" className="input" value={f.title} onChange={set('title')} placeholder={f.doc_type} /></div>
        <div className="field"><label htmlFor="u-p">Related parties</label><input id="u-p" className="input" value={f.parties} onChange={set('parties')} /></div>
        <div className="field"><label htmlFor="u-i">Property identifiers on the document</label><input id="u-i" className="input" value={f.identifiers} onChange={set('identifiers')} /></div>
        {err && <div className="error-text full" role="alert"><Icon name="warn" size={16} />{err}</div>}
        <div className="full" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={busy}>{busy ? 'Uploading' : 'Upload'}</button></div>
      </form>
    </Modal>
  );
}

/* ---------------- due diligence ---------------- */
function Diligence({ p, user, team, cfg, reload }) {
  const { data, loading, error, reload: rl } = useLoad(() => api.get(`/api/properties/${p.id}/checks`), [p.id]);
  const [adding, setAdding] = useState(null);
  const done = (cat) => data.filter((c) => c.category === cat && c.status === 'completed').length;
  return (
    <div style={{ marginTop: 32 }}>
      <h2 className="page-h" style={{ fontSize: 28 }}>Understand what has been checked.</h2>
      <p className="page-sub" style={{ fontSize: 16, maxWidth: '40em' }}>Completion and findings are separate. A completed check can still report an issue, and a completed checklist does not mean the property has a legally clear title.</p>
      {loading ? <Loading /> : error ? <ErrorState error={error} retry={rl} /> : (
        <div style={{ marginTop: 32 }}>
          {cfg?.categories.map((c) => {
            const list = data.filter((x) => x.category === c.key);
            return (
              <section className="check-group" key={c.key}>
                <h3>{c.label}<span className="sub" style={{ fontWeight: 400, fontSize: 14 }}>{done(c.key)} of {list.length} completed</span></h3>
                {list.map((k) => <CheckRow key={k.id} k={k} p={p} user={user} team={team} onSaved={() => { rl(); reload(); }} />)}
                {canWrite(user) && <button className="btn quiet sm" style={{ marginTop: 8 }} onClick={() => setAdding(c)}><Icon name="plus" size={14} />Add a check</button>}
              </section>
            );
          })}
        </div>
      )}
      {adding && <AddCheck p={p} cat={adding} onClose={() => setAdding(null)} onDone={() => { setAdding(null); rl(); reload(); }} />}
    </div>
  );
}

function CheckRow({ k, p, user, team, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ status: k.status, outcome: k.outcome, source: k.source || '', evidence: k.evidence || '', next_action: k.next_action || '', reviewer_id: k.reviewer_id || '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [flash, setFlash] = useState(false);
  const [finding, setFinding] = useState(false);
  const set = (key) => (e) => setF({ ...f, [key]: e.target.value });
  const write = canWrite(user);
  async function save(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await api.patch(`/api/checks/${k.id}`, f); toast('Check saved.'); setFlash(true); setTimeout(() => setFlash(false), 1100); onSaved(); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  return (
    <details className="check">
      <summary>
        <span className="ct">{k.title}</span>
        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}><StatusChip status={k.status} /><OutcomeChip outcome={k.outcome} /></span>
        <Icon name="chevron" size={14} className="chev" />
      </summary>
      <form className={`check-body ${flash ? 'saved-flash' : ''}`} onSubmit={save} noValidate>
        {k.description && <p className="muted" style={{ maxWidth: '44em' }}>{k.description}</p>}
        <div className="form-grid">
          <div className="field"><label htmlFor={`s${k.id}`}>Status</label><select id={`s${k.id}`} className="input" value={f.status} onChange={set('status')} disabled={!write}>{Object.entries(CHECK_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="field"><label htmlFor={`o${k.id}`}>What the check found</label><select id={`o${k.id}`} className="input" value={f.outcome} onChange={set('outcome')} disabled={!write}>{Object.entries(OUTCOME).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="field full"><label htmlFor={`so${k.id}`}>Source</label><input id={`so${k.id}`} className="input" value={f.source} onChange={set('source')} placeholder="Which record or office, and when" disabled={!write} /><span className="hint">Required before a check can be completed.</span></div>
          <div className="field full"><label htmlFor={`e${k.id}`}>Evidence</label><textarea id={`e${k.id}`} className="input" value={f.evidence} onChange={set('evidence')} placeholder="What you looked at and what it showed" disabled={!write} /></div>
          <div className="field"><label htmlFor={`r${k.id}`}>Reviewer</label><select id={`r${k.id}`} className="input" value={f.reviewer_id} onChange={set('reviewer_id')} disabled={!write}><option value="">Not assigned</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
          <div className="field"><label htmlFor={`n${k.id}`}>Next action</label><input id={`n${k.id}`} className="input" value={f.next_action} onChange={set('next_action')} disabled={!write} /></div>
        </div>
        {err && <div className="error-text" role="alert"><Icon name="warn" size={16} />{err}</div>}
        {write && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn sm" disabled={busy}>{busy ? 'Saving' : 'Save check'}</button>
          {(k.outcome === 'issue_found' || f.outcome === 'issue_found') && <button type="button" className="btn secondary sm" onClick={() => setFinding(true)}>Raise a finding</button>}
        </div>}
      </form>
      {finding && <NewFinding p={p} team={team} preset={{ check_id: k.id, title: k.title, evidence: f.evidence, source: f.source }} onClose={() => setFinding(false)} onDone={() => { setFinding(false); onSaved(); }} />}
    </details>
  );
}

function AddCheck({ p, cat, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ title: '', description: '' }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e) { e.preventDefault(); setBusy(true); setErr(''); try { await api.post(`/api/properties/${p.id}/checks`, { ...f, category: cat.key }); toast('Check added.'); onDone(); } catch (x) { setErr(x.message); } finally { setBusy(false); } }
  return (
    <Modal title={`Add a check: ${cat.label}`} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 16 }} noValidate>
        <div className="field"><label htmlFor="ac-t">What needs checking</label><input id="ac-t" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div className="field"><label htmlFor="ac-d">Detail (optional)</label><textarea id="ac-d" className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        {err && <div className="error-text" role="alert"><Icon name="warn" size={16} />{err}</div>}
        <div className="actions" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={busy}>Add check</button></div>
      </form>
    </Modal>
  );
}

/* ---------------- findings ---------------- */
export function NewFinding({ p, team, preset = {}, onClose, onDone }) {
  const toast = useToast();
  const docs = useLoad(() => api.get(`/api/properties/${p.id}/documents`), [p.id]);
  const [f, setF] = useState({ title: preset.title || '', explanation: preset.explanation || '', severity: 'medium', evidence: preset.evidence || '', source: preset.source || '', source_date: '', owner_id: '', next_step: '', document_id: preset.document_id || '', check_id: preset.check_id || '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) { e.preventDefault(); setErr(''); setBusy(true); try { await api.post(`/api/properties/${p.id}/findings`, f); toast('Finding recorded.'); onDone(); } catch (x) { setErr(x.message); } finally { setBusy(false); } }
  return (
    <Modal title="Record a finding" onClose={onClose}>
      <form onSubmit={submit} className="form-grid" noValidate>
        <div className="field full"><label htmlFor="nf-t">Short title</label><input id="nf-t" className="input" value={f.title} onChange={set('title')} placeholder="For example, Plot area differs between records" /></div>
        <div className="field full"><label htmlFor="nf-e">What is the issue, in plain language</label><textarea id="nf-e" className="input" value={f.explanation} onChange={set('explanation')} /><span className="hint">Describe what differs or is missing. Avoid calling anything fraud.</span></div>
        <div className="field"><label htmlFor="nf-s">Severity</label><select id="nf-s" className="input" value={f.severity} onChange={set('severity')}><option value="low">Low risk</option><option value="medium">Medium risk</option><option value="high">High risk</option><option value="critical">Critical risk</option></select></div>
        <div className="field"><label htmlFor="nf-o">Owner</label><select id="nf-o" className="input" value={f.owner_id} onChange={set('owner_id')}><option value="">Unassigned</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
        <div className="field full"><label htmlFor="nf-v">Supporting evidence</label><textarea id="nf-v" className="input" style={{ minHeight: 64 }} value={f.evidence} onChange={set('evidence')} /></div>
        <div className="field"><label htmlFor="nf-r">Source</label><input id="nf-r" className="input" value={f.source} onChange={set('source')} /></div>
        <div className="field"><label htmlFor="nf-d">Source date</label><input id="nf-d" type="date" className="input" value={f.source_date} onChange={set('source_date')} /></div>
        <div className="field full"><label htmlFor="nf-doc">Related document</label><select id="nf-doc" className="input" value={f.document_id} onChange={set('document_id')}><option value="">None</option>{docs.data?.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></div>
        <div className="field full"><label htmlFor="nf-n">Recommended next step</label><input id="nf-n" className="input" value={f.next_step} onChange={set('next_step')} /></div>
        {err && <div className="error-text full" role="alert"><Icon name="warn" size={16} />{err}</div>}
        <div className="full" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={busy}>{busy ? 'Saving' : 'Record finding'}</button></div>
      </form>
    </Modal>
  );
}

function Findings({ p, user, team, reload }) {
  const { data, loading, error, reload: rl } = useLoad(() => api.get(`/api/properties/${p.id}/findings`), [p.id]);
  const [show, setShow] = useState('open');
  const [adding, setAdding] = useState(false);
  const [resolve, setResolve] = useState(null);
  const toast = useToast();
  const refresh = () => { rl(); reload(); };
  async function patch(f, body, msg) { try { await api.patch(`/api/findings/${f.id}`, body); toast(msg); refresh(); } catch (x) { toast(x.message, 'err'); } }
  const list = data ? data.filter((f) => (show === 'open' ? ['open', 'in_review'].includes(f.status) : true)) : [];
  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div><h2 className="page-h" style={{ fontSize: 28 }}>What needs attention.</h2><p className="page-sub" style={{ fontSize: 16 }}>Each finding links to its evidence and says what to do next.</p></div>
        {canWrite(user) && <button className="btn" onClick={() => setAdding(true)}><Icon name="plus" size={16} />Record a finding</button>}
      </div>
      <div className="toolbar"><label className="sr-only" htmlFor="ff">Show</label><select id="ff" className="input" value={show} onChange={(e) => setShow(e.target.value)}><option value="open">Unresolved only</option><option value="all">All findings</option></select></div>
      {loading ? <Loading /> : error ? <ErrorState error={error} retry={rl} /> : !list.length ? (
        <Empty title={show === 'open' ? 'No unresolved findings' : 'No findings yet'}>{data.length ? 'Resolved findings are under All findings.' : 'None are recorded. That does not mean none exist. Record a finding when a check or a document shows a difference or a gap.'}</Empty>
      ) : list.map((f) => (
        <article className={`finding ${['resolved', 'accepted'].includes(f.status) ? 'closed' : ''}`} key={f.id}>
          <SeverityGlyph s={f.severity} />
          <div>
            <h3>{f.title}</h3>
            <div className="meta"><SeverityChip s={f.severity} /><span className={`chip ${f.status === 'resolved' ? 'green' : f.status === 'in_review' ? 'blue' : ''}`}>{FSTATUS[f.status]}</span><span className="sub">Owner: {f.owner_name || 'Unassigned'}</span></div>
            <p className="exp">{f.explanation}</p>
            <dl className="dl" style={{ marginTop: 14, maxWidth: '46em' }}>
              {f.evidence && <><dt>Evidence</dt><dd>{f.evidence}</dd></>}
              {f.document_title && <><dt>Document</dt><dd>{f.document_title}</dd></>}
              {f.check_title && <><dt>From check</dt><dd>{f.check_title}</dd></>}
              <dt>Source and date</dt><dd>{f.source || 'Not recorded'}{f.source_date ? `, ${fmtDate(f.source_date)}` : ''}</dd>
              {f.resolution_note && <><dt>Resolution</dt><dd>{f.resolution_note}</dd></>}
            </dl>
            {['open', 'in_review'].includes(f.status) && <div className="next"><b>Next step.</b> {f.next_step}</div>}
            {canWrite(user) && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              {f.status === 'open' && <button className="btn secondary sm" onClick={() => patch(f, { status: 'in_review' }, 'Moved to review.')}>Start review</button>}
              {['open', 'in_review'].includes(f.status) && <button className="btn sm" onClick={() => setResolve({ f, status: 'resolved' })}>Resolve finding</button>}
              {['open', 'in_review'].includes(f.status) && isReviewer(user) && <button className="btn secondary sm" onClick={() => setResolve({ f, status: 'accepted' })}>Accept risk</button>}
              {['resolved', 'accepted'].includes(f.status) && <button className="btn secondary sm" onClick={() => patch(f, { status: 'open' }, 'Finding reopened.')}>Reopen</button>}
              {['open', 'in_review'].includes(f.status) && <select className="input" style={{ width: 'auto', minHeight: 34, padding: '4px 10px' }} aria-label="Assign owner" value={f.owner_id || ''} onChange={(e) => patch(f, { owner_id: e.target.value }, 'Owner updated.')}><option value="">Unassigned</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}
            </div>}
          </div>
        </article>
      ))}
      {adding && <NewFinding p={p} team={team} onClose={() => setAdding(false)} onDone={() => { setAdding(false); refresh(); }} />}
      {resolve && <ResolveModal r={resolve} onClose={() => setResolve(null)} onDone={() => { setResolve(null); refresh(); }} />}
    </div>
  );
}

function ResolveModal({ r, onClose, onDone }) {
  const toast = useToast(); const [note, setNote] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const accept = r.status === 'accepted';
  async function submit(e) { e.preventDefault(); setBusy(true); setErr(''); try { await api.patch(`/api/findings/${r.f.id}`, { status: r.status, resolution_note: note }); toast(accept ? 'Risk accepted and recorded.' : 'Finding resolved.'); onDone(); } catch (x) { setErr(x.message); } finally { setBusy(false); } }
  return (
    <Modal title={accept ? 'Accept this risk' : 'Resolve this finding'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 16 }} noValidate>
        <p className="muted">{r.f.title}</p>
        <div className="field"><label htmlFor="rs-n">{accept ? 'Why is this risk acceptable?' : 'How was it resolved?'}</label><textarea id="rs-n" className="input" value={note} onChange={(e) => setNote(e.target.value)} /><span className="hint">This reason stays visible in the file, reports and history.</span></div>
        {err && <div className="error-text" role="alert"><Icon name="warn" size={16} />{err}</div>}
        <div className="actions" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={busy}>{accept ? 'Accept risk' : 'Resolve finding'}</button></div>
      </form>
    </Modal>
  );
}

/* ---------------- reviews ---------------- */
const KINDS = { comment: 'Comment', evidence_request: 'Request missing records', correction_request: 'Request a correction', decision: 'Record a review decision', stage_approval: 'Approve an internal stage' };
const DECISIONS = { proceed: 'Proceed', proceed_with_conditions: 'Proceed with conditions', hold: 'Hold', decline: 'Decline' };
function Reviews({ p, user, team, reload }) {
  const { data, loading, error, reload: rl } = useLoad(() => api.get(`/api/properties/${p.id}/reviews`), [p.id]);
  const toast = useToast();
  const [f, setF] = useState({ kind: 'comment', body: '', decision: 'hold', stage: STAGES[0], assignee_id: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const kinds = Object.entries(KINDS).filter(([k]) => (user.role === 'viewer' ? k === 'comment' : isReviewer(user) || !['decision', 'stage_approval'].includes(k)));
  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await api.post(`/api/properties/${p.id}/reviews`, f); toast('Recorded in the review history.'); setF({ ...f, body: '' }); rl(); reload(); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  async function close(r) { try { await api.patch(`/api/reviews/${r.id}`, { status: r.status === 'open' ? 'closed' : 'open' }); rl(); } catch (x) { toast(x.message, 'err'); } }
  const stageIdx = STAGES.indexOf(p.stage);
  return (
    <div className="cols" style={{ marginTop: 32 }}>
      <div>
        <h2 className="page-h" style={{ fontSize: 28 }}>Reviews and approvals</h2>
        <p className="page-sub" style={{ fontSize: 16 }}>Comment, request evidence and record decisions. Everything is kept in the history.</p>
        <div className="banner amber" style={{ marginTop: 24 }}><Icon name="info" /><div><b>An internal approval is not legal certification.</b> It records your team's decision about its own workflow. It is not a legal opinion, government approval or registration.</div></div>
        <form onSubmit={submit} style={{ display: 'grid', gap: 14, marginTop: 28 }} noValidate>
          <div className="form-grid">
            <div className="field"><label htmlFor="rv-k">What are you recording?</label><select id="rv-k" className="input" value={f.kind} onChange={set('kind')}>{kinds.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            {f.kind === 'decision' && <div className="field"><label htmlFor="rv-d">Decision</label><select id="rv-d" className="input" value={f.decision} onChange={set('decision')}>{Object.entries(DECISIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>}
            {f.kind === 'stage_approval' && <div className="field"><label htmlFor="rv-s">Stage</label><select id="rv-s" className="input" value={f.stage} onChange={set('stage')}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></div>}
            {['evidence_request', 'correction_request'].includes(f.kind) && <div className="field"><label htmlFor="rv-a">Ask</label><select id="rv-a" className="input" value={f.assignee_id} onChange={set('assignee_id')}><option value="">Anyone</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>}
          </div>
          <div className="field"><label htmlFor="rv-b">Note</label><textarea id="rv-b" className="input" value={f.body} onChange={set('body')} placeholder="Say what you saw and why" /></div>
          {err && <div className="error-text" role="alert"><Icon name="warn" size={16} />{err}</div>}
          <div><button className="btn" disabled={busy}>{busy ? 'Recording' : f.kind === 'comment' ? 'Add comment' : 'Record'}</button></div>
        </form>
        <h3 className="sec-h" style={{ marginTop: 48, marginBottom: 14 }}>History</h3>
        {loading ? <Loading /> : error ? <ErrorState error={error} retry={rl} /> : !data.length ? <Empty title="No review activity yet">Comments, requests and decisions will appear here.</Empty> : data.map((r) => (
          <div className="rt-item" key={r.id} style={{ padding: '18px 0', borderTop: '1px solid var(--line)' }}>
            <span className="avatar" aria-hidden="true">{r.author_name.split(' ').map((x) => x[0]).join('').slice(0, 2)}</span>
            <div>
              <div style={{ fontSize: 14.5 }}><b style={{ fontWeight: 560 }}>{r.author_name}</b> <span className="muted">({r.author_role}) · {ago(r.created_at)}</span></div>
              <div style={{ margin: '6px 0' }}>
                {r.kind === 'decision' && <span className={`chip ${r.decision === 'proceed' ? 'green' : r.decision === 'decline' || r.decision === 'hold' ? 'amber' : 'blue'}`}>Decision: {DECISIONS[r.decision]}</span>}
                {r.kind === 'stage_approval' && <span className="chip blue">Internal approval: {r.stage}</span>}
                {r.kind === 'evidence_request' && <span className="chip amber">Missing records requested{r.assignee_name ? ` from ${r.assignee_name}` : ''}</span>}
                {r.kind === 'correction_request' && <span className="chip amber">Correction requested{r.assignee_name ? ` from ${r.assignee_name}` : ''}</span>}
              </div>
              <p>{r.body}</p>
              {['evidence_request', 'correction_request'].includes(r.kind) && canWrite(user) && <button className="btn quiet sm" style={{ marginLeft: -12 }} onClick={() => close(r)}>{r.status === 'open' ? 'Mark as received' : 'Reopen request'}</button>}
              {r.status === 'closed' && <span className="chip green" style={{ marginLeft: 4 }}><Icon name="check" size={13} stroke={2} />Closed</span>}
            </div>
          </div>
        ))}
      </div>
      <aside>
        <h3 className="sec-h">Internal workflow stage</h3>
        <p className="sec-sub">Where the team has taken this file.</p>
        <ol className="timeline">
          {STAGES.map((s, i) => <li key={s}><div style={{ fontWeight: i === stageIdx ? 600 : 450, color: i <= stageIdx ? 'var(--ink)' : 'var(--muted)' }}>{s}</div><div className="when">{i < stageIdx ? 'Approved internally' : i === stageIdx ? 'Current stage' : 'Not yet approved'}</div></li>)}
        </ol>
        <p className="sub">Not legal certification, government approval or registration.</p>
      </aside>
    </div>
  );
}

/* ---------------- reports ---------------- */
function Reports({ p, user }) {
  const { data, loading, error, reload } = useLoad(() => api.get(`/api/properties/${p.id}/reports`), [p.id]);
  const toast = useToast(); const [busy, setBusy] = useState(false);
  async function gen() {
    setBusy(true);
    try { const r = await api.post(`/api/properties/${p.id}/reports`); toast('Report generated.'); reload(); window.open(`/api/reports/${r.id}/file`, '_blank', 'noopener'); }
    catch (x) { toast(x.message, 'err'); } finally { setBusy(false); }
  }
  return (
    <div style={{ marginTop: 32, maxWidth: 860 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div><h2 className="page-h" style={{ fontSize: 28 }}>Due diligence report</h2><p className="page-sub" style={{ fontSize: 16 }}>A PDF snapshot of this file as it stands today.</p></div>
        {canWrite(user) && <button className="btn" onClick={gen} disabled={busy}><Icon name="report" size={16} />{busy ? 'Generating' : 'Generate report'}</button>}
      </div>
      <h3 className="sec-h" style={{ marginTop: 32 }}>Every report includes</h3>
      <ul className="rule-list" style={{ fontSize: 14.5, marginTop: 8 }}>{['The scope of checks, grouped as on the Due diligence tab', 'Evidence reviewed, with how each document was verified', 'Sources consulted, and which integrations were not used', 'Findings, with severity, owner and next step', 'Limitations, and the questions still unresolved'].map((t) => <li key={t}>{t}</li>)}</ul>
      <h3 className="sec-h" style={{ marginTop: 40, marginBottom: 12 }}>Generated reports</h3>
      {loading ? <Loading /> : error ? <ErrorState error={error} retry={reload} /> : !data.length ? <Empty title="No reports yet">Generate one to share the current state of the file. A report is a snapshot. Generate a new one after the file changes.</Empty> : data.map((r) => (
        <div className="attn-row" key={r.id} style={{ gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center' }}>
          <div><b style={{ fontWeight: 560 }}>{r.file_name}</b><div className="sub">{fmtDateTime(r.created_at)} · {r.generated_by_name}</div></div>
          <div style={{ display: 'flex', gap: 8 }}><a className="btn secondary sm" href={`/api/reports/${r.id}/file`} target="_blank" rel="noopener noreferrer">Open</a><a className="btn secondary sm" href={`/api/reports/${r.id}/file?download=1`}><Icon name="download" size={15} />Download</a></div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- activity ---------------- */
function Activity({ p }) {
  const { data, loading, error, reload } = useLoad(() => api.get(`/api/properties/${p.id}/activity`), [p.id]);
  return (
    <div style={{ marginTop: 32, maxWidth: 760 }}>
      <h2 className="page-h" style={{ fontSize: 28 }}>Activity history</h2>
      <p className="page-sub" style={{ fontSize: 16 }}>A complete, append-only record of who did what on this property. Entries cannot be edited or removed.</p>
      <div style={{ marginTop: 32 }}>{loading ? <Loading /> : error ? <ErrorState error={error} retry={reload} /> : <ActivityList items={data} />}</div>
    </div>
  );
}
