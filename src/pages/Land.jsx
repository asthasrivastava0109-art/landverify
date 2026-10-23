import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate, fmtDateTime } from '../api.js';
import { Empty, ErrorState, Icon, Loading, Modal, useLoad, useToast } from '../ui.jsx';
import { EditProperty } from './Property.jsx';

const canWrite = (u) => u.role !== 'viewer';
const isReviewer = (u) => u.role === 'admin' || u.role === 'reviewer';

const CLASS = {
  match: ['Match', 'green', 'check'],
  potential_discrepancy: ['Potential discrepancy', 'red', 'warn'],
  source_unavailable: ['Source unavailable', '', 'info'],
  manual_review: ['Manual review required', 'amber', 'info'],
  not_matched: ['Record could not be matched', 'red', 'warn'],
  outdated: ['Outdated or cached data', 'amber', 'info'],
};
const REQUIRED = [['district', 'District'], ['tehsil', 'Tehsil'], ['village', 'Village'], ['gata', 'Plot (Gata/Khasra) number']];

function Copy({ text }) {
  const toast = useToast();
  return <button type="button" className="btn quiet sm" onClick={async () => { try { await navigator.clipboard.writeText(text); toast('Copied.'); } catch { toast('Copy is not available here. Select the text instead.', 'err'); } }} aria-label={`Copy ${text}`}>Copy</button>;
}

function recordState(r) {
  if (!r) return ['Not retrieved', '', 'info'];
  if (r.status === 'not_found') return ['Record not found (reported by a person)', 'amber', 'info'];
  if (r.status === 'unavailable') return ['Portal unavailable (reported by a person)', 'amber', 'info'];
  if (r.reviewed_at) return ['Reviewed by a person', 'green', 'check'];
  return ['Imported by a person', 'blue', 'upload'];
}

export default function Land({ p, user, cfg, reload }) {
  const d = useLoad(() => api.get(`/api/properties/${p.id}/land`), [p.id, p.updated_at]);
  const [guide, setGuide] = useState(null);
  const [imp, setImp] = useState(null);
  const [outc, setOutc] = useState(null);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  if (d.loading && !d.data) return <Loading label="Opening records" />;
  if (d.error) return <ErrorState error={d.error} retry={d.reload} />;
  const L = d.data;
  if (!L.eligible) return <Empty title="Maps & land records is for Uttar Pradesh properties">UP Bhulekh and UP Bhunaksha cover Uttar Pradesh only. This property is recorded under {p.state}.</Empty>;
  const missing = REQUIRED.filter(([k]) => !L.identity[k]);
  const cur = (portal) => L.records.find((r) => r.portal === portal && r.currency === 'current') || L.records.find((r) => r.portal === portal && r.status !== 'imported');
  const hist = (portal) => L.records.filter((r) => r.portal === portal && r !== cur(portal));
  const write = canWrite(user);
  const imported = L.records.some((r) => r.status === 'imported' && r.currency === 'current');
  const hasFind = L.crossrefs.some((c) => c.finding_id);
  async function compare() {
    setBusy(true);
    try { const r = await api.post(`/api/properties/${p.id}/land/compare`); toast(r.raised ? `${r.raised} new finding${r.raised > 1 ? 's' : ''} raised for review.` : 'Comparison saved.'); d.reload(); reload(); }
    catch (x) { toast(x.message, 'err'); } finally { setBusy(false); }
  }
  const steps = [
    ['Verify UP Property', 'Open the guide and look the property up on the official sites.', () => setGuide(true), L.records.length > 0],
    ['Review Retrieved Records', 'Import what you found, then check the values against the original.', null, imported],
    ['Compare Sources', 'Compare the records with each other and with the file.', null, L.crossrefs.length > 0],
    ['Save Evidence', 'Imported files are kept in the private vault.', null, L.records.some((r) => r.document_id)],
    ['Review Findings', 'Differences become findings for a person to resolve.', null, hasFind],
  ];

  return (
    <div>
      <div className="ph-sub" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <h2 className="sec-h" style={{ fontSize: 22 }}>Maps &amp; land records</h2>
          <p className="sec-sub" style={{ maxWidth: 640 }}>UP Bhulekh (revenue records) and UP Bhunaksha (cadastral map), brought together for this property.</p>
        </div>
        {write && <button className="btn" onClick={() => setGuide(true)}><Icon name="route" size={16} />Verify UP Property</button>}
      </div>

      <div className="banner blue" style={{ marginTop: 16 }}>
        <Icon name="info" />
        <div><b>LandVerify does not retrieve records from these portals automatically.</b> You look the property up on the official site, then import the record here. Imported material is <b>user-imported official-source material, pending validation</b>. It is not live, certified, or verified by any government service.</div>
      </div>

      <ol className="land-steps" aria-label="Verification path">
        {steps.map(([t, s, fn, done], i) => (
          <li key={t} className={done ? 'done' : ''}>
            <span className="n" aria-hidden="true">{done ? <Icon name="check" size={13} stroke={2.2} /> : i + 1}</span>
            <div><b>{t}</b><div className="sub">{s}</div>{done && <span className="sub">Has activity</span>}</div>
          </li>
        ))}
      </ol>

      <section style={{ marginTop: 36 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <h3 className="sec-h" style={{ fontSize: 17 }}>Property identity used for lookup</h3>
          {write && <button className="btn quiet sm" onClick={() => setEdit(true)}>Edit details</button>}
        </div>
        <dl className="dl">
          {REQUIRED.flatMap(([k, l]) => [<dt key={k}>{l}</dt>, <dd key={k + 'v'}>{L.identity[k] ? <span className="mono">{L.identity[k]}</span> : <span className="chip amber"><Icon name="warn" size={13} />Required, not recorded</span>}</dd>])}
          <dt>Khata number</dt><dd>{L.identity.khata ? <span className="mono">{L.identity.khata}</span> : <span className="muted">Not recorded (optional)</span>}</dd>
          <dt>Official codes</dt><dd>{[['District', L.identity.district_code], ['Tehsil', L.identity.tehsil_code], ['Village', L.identity.village_code]].map(([l, v]) => <span key={l} style={{ marginRight: 14 }}>{l} <span className="mono">{v || 'not recorded'}</span></span>)}</dd>
        </dl>
        {missing.length > 0 && <div className="banner amber" style={{ marginTop: 12 }}><Icon name="warn" /><div>Add {missing.map((m) => m[1]).join(', ')} to the property before importing. Without them a record cannot be checked against this parcel.</div></div>}
      </section>

      <div className="land-panels">
        <PortalPanel portal="bhulekh" meta={L.portals.bhulekh} rec={cur('bhulekh')} hist={hist('bhulekh')} user={user} write={write} blocked={missing.length > 0} onGuide={() => setGuide(true)} onImport={() => setImp('bhulekh')} onOutcome={() => setOutc('bhulekh')} reload={d.reload} />
        <PortalPanel portal="bhunaksha" meta={L.portals.bhunaksha} rec={cur('bhunaksha')} hist={hist('bhunaksha')} user={user} write={write} blocked={missing.length > 0} onGuide={() => setGuide(true)} onImport={() => setImp('bhunaksha')} onOutcome={() => setOutc('bhunaksha')} reload={d.reload} />
      </div>

      <section style={{ marginTop: 44 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <div>
            <h3 className="sec-h" style={{ fontSize: 17 }}>Compare sources</h3>
            <p className="sec-sub" style={{ maxWidth: 640 }}>Checks the property file against imported records. A match is technical, not a legal conclusion. A difference is something for a person to look into, not proof of a problem.</p>
          </div>
          {write && <button className="btn secondary" onClick={compare} disabled={busy} aria-busy={busy}>{busy ? 'Comparing…' : L.crossrefs.length ? 'Compare again' : 'Compare sources'}</button>}
        </div>
        {!L.crossrefs.length ? <p className="sub" style={{ marginTop: 10 }}>Not compared yet.</p> : (
          <div className="xr-list">
            {L.crossrefs.map((c) => <Crossref key={c.id} c={c} p={p} user={user} reload={() => { d.reload(); reload(); }} />)}
          </div>
        )}
      </section>

      {guide && <GuideModal L={L} p={p} onClose={() => setGuide(null)} onImport={(x) => { setGuide(null); setImp(x); }} />}
      {imp && <ImportModal portal={imp} meta={L.portals[imp]} L={L} p={p} onClose={() => setImp(null)} onDone={() => { setImp(null); d.reload(); reload(); }} />}
      {outc && <OutcomeModal portal={outc} meta={L.portals[outc]} p={p} onClose={() => setOutc(null)} onDone={() => { setOutc(null); d.reload(); reload(); }} />}
      {edit && <EditProperty p={p} cfg={cfg} onClose={() => setEdit(false)} onDone={() => { setEdit(false); reload(); }} />}
    </div>
  );
}

function PortalPanel({ portal, meta, rec, hist, user, write, blocked, onGuide, onImport, onOutcome, reload }) {
  const toast = useToast();
  const [rv, setRv] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [st, st_c, st_i] = recordState(rec);
  const [note, setNote] = useState('');
  const isMap = portal === 'bhunaksha';
  const imported = rec?.status === 'imported';
  async function review(e) {
    e.preventDefault();
    try { await api.post(`/api/land/records/${rec.id}/review`, { note }); toast('Review recorded.'); setRv(false); setNote(''); reload(); } catch (x) { toast(x.message, 'err'); }
  }
  return (
    <section className="land-panel" aria-label={`${meta.name} ${meta.role}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div><h3 style={{ fontSize: 18, fontWeight: 620, letterSpacing: '-.015em' }}>{meta.role}</h3><div className="sub">Source: {meta.name}</div></div>
        <span className={`chip ${st_c}`}><Icon name={st_i} size={13} />{st}</span>
      </div>

      {!rec && <p className="sub" style={{ margin: '14px 0' }}>Nothing has been imported for this property. Missing information is not evidence of a problem, and not evidence of none.</p>}

      {rec && (
        <>
          <dl className="dl" style={{ marginTop: 14 }}>
            <dt>Looked up on the portal</dt><dd>{rec.retrieved_on_portal_at ? `${fmtDate(rec.retrieved_on_portal_at)} (stated by the person who imported it)` : <span className="muted">Date not stated</span>}</dd>
            <dt>Imported into LandVerify</dt><dd>{fmtDateTime(rec.imported_at)}{rec.imported_by_name ? ` by ${rec.imported_by_name}` : ''}</dd>
            <dt>Method</dt><dd>{{ uploaded_import: 'Uploaded file, with values typed by a person', manual_entry: 'Values typed by a person', user_reported: 'Reported by a person', api: 'Authorised connection' }[rec.method]}</dd>
            <dt>Source link</dt><dd><a href={rec.source_url} target="_blank" rel="noopener noreferrer" className="mono" style={{ fontSize: 13 }}>{rec.source_url.replace('https://', '')}</a></dd>
            <dt>Changes made</dt><dd>{rec.transformation}</dd>
            {rec.note && <><dt>Note</dt><dd>{rec.note}</dd></>}
          </dl>
          {imported && (
            <>
              <h4 className="label" style={{ marginTop: 14 }}>Values as imported</h4>
              {rec.fields.length ? (
                <div className="table-wrap"><table className="table"><thead><tr><th>Item</th><th>Value</th><th>Original wording</th></tr></thead><tbody>
                  {rec.fields.map((f) => <tr key={f.id}><td>{f.label}</td><td><b style={{ fontWeight: 560 }}>{f.value}</b>{f.unit ? ` ${f.unit}` : ''}</td><td lang="hi">{f.original_text || <span className="muted">—</span>}</td></tr>)}
                </tbody></table></div>
              ) : <p className="sub">No values were typed in. The attached file is the only content.</p>}
              <p className="sub" style={{ marginTop: 8 }}>Location on the imported record: {[rec.gata && `plot ${rec.gata}`, rec.khata && `Khata ${rec.khata}`, rec.village, rec.tehsil, rec.district].filter(Boolean).join(', ')}.</p>
              {rec.reviewed_at && <p className="sub" style={{ marginTop: 6 }}><b style={{ fontWeight: 560 }}>Reviewed by {rec.reviewed_by_name}</b> on {fmtDate(rec.reviewed_at)}: {rec.review_note}</p>}
              {rec.currency === 'historical' && <p className="chip amber" style={{ marginTop: 8 }}>Historical snapshot, not live</p>}
              {rec.document_id && (isMap ? (
                <div className="map-view">
                  {rec.document_mime === 'application/pdf'
                    ? <p style={{ padding: 18 }}>PDF map saved. <a href={`/api/documents/${rec.document_id}/file`} target="_blank" rel="noopener noreferrer">Open the map in a new tab</a></p>
                    : <><div className="map-tools"><button type="button" className="btn quiet sm" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} aria-label="Zoom out">−</button><button type="button" className="btn quiet sm" onClick={() => setZoom((z) => Math.min(4, z + 0.5))} aria-label="Zoom in">+</button><button type="button" className="btn quiet sm" onClick={() => setZoom(1)}>Reset</button><span className="sub">{Math.round(zoom * 100)}%</span></div>
                      <div className="map-scroll"><img src={`/api/documents/${rec.document_id}/file`} alt={`${meta.name} map imported by a person`} style={{ width: `${zoom * 100}%` }} /></div></>}
                  <p className="sub" style={{ padding: '8px 12px' }}>Cadastral maps may contain inaccuracies. This is the image a person imported. No boundary or coordinates are drawn from it.</p>
                </div>
              ) : <p style={{ marginTop: 10 }}><Link to={`/app/properties/${rec.property_id}/documents/${rec.document_id}`}>Open the saved file in the vault</Link></p>)}
            </>
          )}
          {!imported && <p className="sub" style={{ marginTop: 8 }}>{fmtDateTime(rec.imported_at)}: {rec.note}</p>}
        </>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
        <a className="btn secondary sm" href={meta.url} target="_blank" rel="noopener noreferrer">Open {meta.name}<Icon name="out" size={14} /></a>
        {write && <button className="btn sm" onClick={onImport} disabled={blocked} title={blocked ? 'Complete the property identity first' : ''}>{imported ? 'Import a newer record' : `Import from ${meta.name}`}</button>}
        {write && <button className="btn quiet sm" onClick={onOutcome}>Report not found or unavailable</button>}
        {isReviewer(user) && imported && !rec.reviewed_at && rec.currency === 'current' && <button className="btn quiet sm" onClick={() => setRv(!rv)}>Mark as reviewed</button>}
      </div>
      {rv && (
        <form onSubmit={review} className="field" style={{ marginTop: 12 }}>
          <label htmlFor={`rv-${portal}`}>What did you compare the typed values against?</label>
          <input id={`rv-${portal}`} className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: the downloaded PDF dated 10 Oct 2026" />
          <div><button className="btn sm" type="submit">Record review</button></div>
        </form>
      )}
      {hist.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary className="sub" style={{ cursor: 'pointer' }}>Earlier snapshots ({hist.length}). Not live.</summary>
          <ul className="rule-list">{hist.map((h) => <li key={h.id}>{fmtDateTime(h.imported_at)} · {recordState(h)[0]}{h.status === 'imported' ? ` · ${h.fields.length} values` : ` · ${h.note}`}</li>)}</ul>
        </details>
      )}
    </section>
  );
}

function Crossref({ c, p, user, reload }) {
  const toast = useToast();
  const [open, setOpen] = useState(c.classification !== 'match' && c.classification !== 'source_unavailable');
  const [conf, setConf] = useState(false);
  const [note, setNote] = useState('');
  const [label, tone, icon] = CLASS[c.classification];
  async function confirm(e) {
    e.preventDefault();
    try { await api.post(`/api/crossrefs/${c.id}/confirm`, { note }); toast('Recorded.'); setConf(false); reload(); } catch (x) { toast(x.message, 'err'); }
  }
  const needsConfirm = ['potential_discrepancy', 'not_matched', 'manual_review'].includes(c.classification);
  return (
    <div className="xr">
      <button type="button" className="xr-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="xr-title">{c.label}</span>
        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {c.reviewed_at && <span className="chip green"><Icon name="check" size={13} />Confirmed by reviewer</span>}
          <span className={`chip ${tone}`}><Icon name={icon} size={13} />{label}</span>
        </span>
      </button>
      {open && (
        <div className="xr-body">
          <p>{c.summary}</p>
          {c.vals.length > 0 && (
            <div className="table-wrap"><table className="table"><thead><tr><th>Item</th><th>Value</th><th>Source</th><th>As of</th></tr></thead><tbody>
              {c.vals.map((v, i) => <tr key={i}><td>{v.label}</td><td>{v.value}</td><td>{v.source}</td><td>{fmtDate(v.at)}</td></tr>)}
            </tbody></table></div>
          )}
          {c.reviewed_at && <p className="sub">Confirmed by {c.reviewed_by_name} on {fmtDate(c.reviewed_at)}: {c.review_note}. This confirms the difference was looked at. It is not a legal conclusion.</p>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
            {c.finding_id && <Link className="btn secondary sm" to={`/app/properties/${p.id}/findings`}>View finding{c.finding_status ? ` (${c.finding_status.replace('_', ' ')})` : ''}</Link>}
            {isReviewer(user) && needsConfirm && !c.reviewed_at && <button className="btn quiet sm" onClick={() => setConf(!conf)}>Confirm after review</button>}
          </div>
          {conf && (
            <form onSubmit={confirm} className="field" style={{ marginTop: 10 }}>
              <label htmlFor={`cf-${c.id}`}>What did you check?</label>
              <input id={`cf-${c.id}`} className="input" value={note} onChange={(e) => setNote(e.target.value)} />
              <div><button className="btn sm" type="submit">Record confirmation</button></div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function GuideModal({ L, p, onClose, onImport }) {
  const id = L.identity;
  const rows = [['District', id.district], ['Tehsil', id.tehsil], ['Village', id.village], ['Plot (Gata/Khasra)', id.gata], ['Khata', id.khata], ['Claimed owner', p.claimed_owner]].filter(([, v]) => v);
  return (
    <Modal title="Verify UP Property" onClose={onClose}>
      <p className="sub" style={{ marginBottom: 14 }}>LandVerify cannot look the property up for you. Use these details on the official sites, then bring the record back.</p>
      <div className="table-wrap"><table className="table"><tbody>{rows.map(([l, v]) => <tr key={l}><td>{l}</td><td><b style={{ fontWeight: 560 }}>{v}</b></td><td style={{ textAlign: 'right' }}><Copy text={v} /></td></tr>)}</tbody></table></div>
      <ol className="guide-list">
        <li><b>UP Bhulekh.</b> Choose the district, tehsil and village from the drop-downs, then search by plot number. Download or print the record, or read the values off the screen.</li>
        <li><b>UP Bhunaksha.</b> Choose the same district, tehsil and village, then select the plot. Save a screenshot or print the map to PDF.</li>
        <li><b>Official codes.</b> The portals show numeric codes for each location. Copy them if you want them kept with the record.</li>
        <li><b>Import.</b> Return here and import each record. Type the values exactly as shown, including the unit, and keep the Hindi wording if you can.</li>
        <li><b>If the portal fails or shows nothing,</b> report that here. It is stored as what you saw, not as a finding about the land.</li>
      </ol>
      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        <a className="btn secondary" href="https://upbhulekh.gov.in/" target="_blank" rel="noopener noreferrer">Open UP Bhulekh<Icon name="out" size={14} /></a>
        <a className="btn secondary" href="https://upbhunaksha.gov.in/" target="_blank" rel="noopener noreferrer">Open UP Bhunaksha<Icon name="out" size={14} /></a>
      </div>
      <div className="actions"><button className="btn quiet" onClick={() => onImport('bhulekh')}>Import Bhulekh record</button><button className="btn quiet" onClick={() => onImport('bhunaksha')}>Import Bhunaksha map</button><button className="btn secondary" onClick={onClose}>Close</button></div>
    </Modal>
  );
}

function ImportModal({ portal, meta, L, p, onClose, onDone }) {
  const toast = useToast();
  const id = L.identity;
  const [f, setF] = useState({ district: id.district, tehsil: id.tehsil, village: id.village, gata: id.gata, khata: id.khata, district_code: id.district_code, tehsil_code: id.tehsil_code, village_code: id.village_code, retrieved: '', note: '' });
  const [vals, setVals] = useState(() => Object.fromEntries(meta.fields.map((x) => [x.key, [{ value: '', unit: '', original_text: '' }]])));
  const [file, setFile] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setV = (k, i, key, v) => setVals({ ...vals, [k]: vals[k].map((x, j) => (j === i ? { ...x, [key]: v } : x)) });
  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    const fields = meta.fields.flatMap((m) => vals[m.key].filter((x) => x.value.trim()).map((x) => ({ key: m.key, ...x })));
    const fd = new FormData();
    fd.set('portal', portal); fd.set('source_url', meta.url); fd.set('retrieved_on_portal_at', f.retrieved);
    for (const k of ['district', 'tehsil', 'village', 'gata', 'khata', 'district_code', 'tehsil_code', 'village_code', 'note']) fd.set(k, f[k] || '');
    fd.set('fields', JSON.stringify(fields));
    if (file) fd.set('file', file);
    try { await api.post(`/api/properties/${p.id}/land/records`, fd); toast('Imported. Review the values against the original.'); onDone(); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  return (
    <Modal title={`Import from ${meta.name}`} onClose={onClose}>
      <form onSubmit={submit} className="form-grid" noValidate>
        <div className="banner blue full"><Icon name="info" /><div>Enter only what the official page or document shows. LandVerify stores it as typed, labels it as imported by a person, and does not convert units.</div></div>
        <div className="field full"><label htmlFor="im-file">Downloaded record or map (optional)</label><input id="im-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff" onChange={(e) => setFile(e.target.files[0] || null)} /><span className="hint">PDF, PNG, JPG or TIFF, up to 25 MB. Kept in the private vault.</span></div>
        <div className="field"><label htmlFor="im-when">Date you looked it up</label><input id="im-when" type="date" className="input" max={new Date().toISOString().slice(0, 10)} value={f.retrieved} onChange={set('retrieved')} /></div>
        <div className="field"><label htmlFor="im-ref">Khata shown on the record</label><input id="im-ref" className="input" value={f.khata} onChange={set('khata')} /></div>
        <p className="label full" style={{ margin: '6px 0 0' }}>Location exactly as the record shows it</p>
        {[['district', 'District'], ['tehsil', 'Tehsil'], ['village', 'Village'], ['gata', 'Plot (Gata) number']].map(([k, l]) => <div className="field" key={k}><label htmlFor={`im-${k}`}>{l}</label><input id={`im-${k}`} className="input" value={f[k]} onChange={set(k)} /></div>)}
        {[['district_code', 'District code'], ['tehsil_code', 'Tehsil code'], ['village_code', 'Village code']].map(([k, l]) => <div className="field" key={k}><label htmlFor={`im-${k}`}>{l} (optional)</label><input id={`im-${k}`} className="input mono" value={f[k]} onChange={set(k)} /></div>)}
        <p className="label full" style={{ margin: '6px 0 0' }}>Values shown on the record</p>
        {meta.fields.map((m) => (
          <div className="field full" key={m.key}>
            <label>{m.label}{m.hindi ? <span className="muted" lang="hi"> · {m.hindi}</span> : null}</label>
            {vals[m.key].map((x, i) => (
              <div key={i} className="val-row">
                <input className="input" aria-label={`${m.label} value`} value={x.value} onChange={(e) => setV(m.key, i, 'value', e.target.value)} placeholder={m.hint || ''} />
                {m.unit && <input className="input" aria-label={`${m.label} unit`} value={x.unit} onChange={(e) => setV(m.key, i, 'unit', e.target.value)} placeholder="Unit as stated" />}
                <input className="input" lang="hi" aria-label={`${m.label} original wording`} value={x.original_text} onChange={(e) => setV(m.key, i, 'original_text', e.target.value)} placeholder="Original wording (optional)" />
              </div>
            ))}
            {m.multi && <div><button type="button" className="btn quiet sm" onClick={() => setVals({ ...vals, [m.key]: [...vals[m.key], { value: '', unit: '', original_text: '' }] })}>Add another</button></div>}
          </div>
        ))}
        <div className="field full"><label htmlFor="im-note">Note (optional)</label><input id="im-note" className="input" value={f.note} onChange={set('note')} /></div>
        {err && <div className="banner red full" role="alert"><Icon name="warn" /><div>{err}</div></div>}
        <div className="actions full"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" type="submit" disabled={busy} aria-busy={busy}>{busy ? 'Saving…' : 'Save imported record'}</button></div>
      </form>
    </Modal>
  );
}

function OutcomeModal({ portal, meta, p, onClose, onDone }) {
  const toast = useToast();
  const [status, setStatus] = useState('not_found');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault(); setErr('');
    try { await api.post(`/api/properties/${p.id}/land/outcome`, { portal, status, note }); toast('Recorded.'); onDone(); } catch (x) { setErr(x.message); }
  }
  return (
    <Modal title={`${meta.name}: report what you saw`} onClose={onClose}>
      <form onSubmit={submit} className="form-grid" noValidate>
        <div className="field full"><label htmlFor="oc-s">What happened</label><select id="oc-s" className="input" value={status} onChange={(e) => setStatus(e.target.value)}><option value="not_found">The portal found no record for these details</option><option value="unavailable">The portal was down, or I could not use it</option></select></div>
        <div className="field full"><label htmlFor="oc-n">What did the portal show?</label><input id="oc-n" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: the message shown, or the error" /><span className="hint">Saved with the time, as something you reported. Not found on a portal does not mean the land has no record.</span></div>
        {err && <div className="banner red full" role="alert"><Icon name="warn" /><div>{err}</div></div>}
        <div className="actions full"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" type="submit">Save</button></div>
      </form>
    </Modal>
  );
}
