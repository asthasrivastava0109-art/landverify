import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, fmtDate, fmtDateTime } from '../api.js';
import { Empty, ErrorState, ExtractionChip, Icon, Loading, Modal, Prov, ProvMark, PROV, docLevel, useLoad, useToast } from '../ui.jsx';
import { NewFinding } from './Property.jsx';

const FSTATE = { unconfirmed: ['Preliminary', 'amber'], confirmed: ['Confirmed by a person', 'green'], corrected: ['Corrected by a person', 'blue'] };
const canWrite = (u) => u.role !== 'viewer';

export default function DocViewer({ p, user, team, reload }) {
  const { docId } = useParams();
  const { data: d, loading, error, reload: rl } = useLoad(() => api.get(`/api/documents/${docId}`), [docId]);
  const toast = useToast();
  const [sel, setSel] = useState(null);
  const [adding, setAdding] = useState({ key: '', value: '', source_note: '' });
  const [err, setErr] = useState('');
  const [finding, setFinding] = useState(null);
  const [ver, setVer] = useState({ status: '', note: '' });
  const fileRef = useRef();
  const refresh = () => { rl(); reload(); };

  if (loading && !d) return <div style={{ marginTop: 32 }}><Loading label="Opening document" /></div>;
  if (error) return error.status === 404 ? <div style={{ marginTop: 32 }}><Empty title="Document not found" action={<Link className="btn" to={`/app/properties/${p.id}/documents`}>Back to documents</Link>}>It may have been removed.</Empty></div> : <ErrorState error={error} retry={rl} />;

  const write = canWrite(user);
  const isImg = d.mime?.startsWith('image/');
  const fileUrl = `/api/documents/${d.id}/file`;
  const isLatest = d.versions[0].id === d.id;

  async function act(fn, msg) { try { await fn(); if (msg) toast(msg); refresh(); } catch (x) { toast(x.message, 'err'); } }
  async function addField(e) {
    e.preventDefault(); setErr('');
    try { await api.post(`/api/documents/${d.id}/fields`, adding); toast('Field recorded as preliminary.'); setAdding({ key: '', value: '', source_note: '' }); refresh(); } catch (x) { setErr(x.message); }
  }
  async function setStatus() {
    if (!ver.status) return;
    await act(() => api.patch(`/api/documents/${d.id}`, { verification_status: ver.status, verification_note: ver.note }), 'Verification status recorded.');
    setVer({ status: '', note: '' });
  }
  async function newVersion(e) {
    const f = e.target.files[0]; if (!f) return;
    const fd = new FormData(); fd.append('file', f);
    await act(() => api.post(`/api/documents/${d.id}/versions`, fd), 'New version added. Earlier versions are kept.');
    e.target.value = '';
  }

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <Link to={`/app/properties/${p.id}/documents`} className="sub">All documents</Link>
          <h2 className="page-h" style={{ fontSize: 26, marginTop: 4 }}>{d.title}</h2>
          <div className="sub" style={{ marginTop: 4 }}>{d.doc_type} · {d.doc_date ? fmtDate(d.doc_date) : 'Date not recorded'} · Version {d.version} of {d.versions.length}{!isLatest && ' (not the latest)'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {d.has_file && <a className="btn secondary sm" href={fileUrl} target="_blank" rel="noopener noreferrer"><Icon name="out" size={15} />Open in a new tab</a>}
          {d.has_file && <a className="btn secondary sm" href={`${fileUrl}?download=1`}><Icon name="download" size={15} />Download</a>}
          {write && isLatest && <><input ref={fileRef} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff" onChange={newVersion} /><button className="btn secondary sm" onClick={() => fileRef.current.click()}><Icon name="upload" size={15} />Upload new version</button></>}
        </div>
      </div>

      <div className="split">
        <div className="pv">
          {!d.has_file ? <div className="empty-pv"><div><h3 style={{ color: 'var(--ink)', fontWeight: 600 }}>No file attached</h3><p style={{ marginTop: 6 }}>This is a demonstration record. Upload a file as a new version to preview it here.</p></div></div>
            : isImg ? <img src={fileUrl} alt={`Preview of ${d.title}`} /> : <iframe src={fileUrl} title={`Preview of ${d.title}`} />}
        </div>
        <div className="ex">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <ExtractionChip s={d.extraction_status} />
            <Prov level={docLevel(d.verification_status)} />
          </div>
          <p className="sub" style={{ marginTop: 10 }}>Details below were entered by people. LandVerify does not read the file automatically, so every field stays preliminary until a person confirms it.</p>

          {d.flags.length > 0 && (
            <div className="flag" role="note">
              <b>Possible difference to review.</b>
              {d.flags.map((fl, i) => (
                <div key={i} style={{ marginTop: 8 }}>
                  <div>{fl.key}: this document says <b>{fl.this_value}</b>. {fl.other_title} says <b>{fl.other_value}</b>. This may be a typing difference or a real discrepancy. Check both against an authoritative record.</div>
                  {write && <button className="btn secondary sm" style={{ marginTop: 8 }} onClick={() => setFinding({ document_id: d.id, title: `${fl.key} differs between records`, explanation: `${d.title} states ${fl.this_value}. ${fl.other_title} states ${fl.other_value}. Confirm the correct value against the relevant authoritative records and obtain professional review before proceeding.`, evidence: `${d.title}: ${fl.this_value}. ${fl.other_title}: ${fl.other_value}.` })}>Record as a finding</button>}
                </div>
              ))}
            </div>
          )}

          <h3 className="sec-h" style={{ marginTop: 28 }}>Details</h3>
          {d.fields.length === 0 && <p className="muted" style={{ margin: '8px 0 16px' }}>No details recorded yet. Add what the document says, such as area, parties or plot number.</p>}
          {d.fields.map((f) => (
            <Field key={f.id} f={f} sel={sel === f.id} onSel={() => setSel(sel === f.id ? null : f.id)} write={write} act={act} />
          ))}

          {write && (
            <form onSubmit={addField} style={{ marginTop: 18, display: 'grid', gap: 10 }} noValidate>
              <div className="form-grid">
                <div className="field"><label htmlFor="af-k">Field</label><input id="af-k" className="input" value={adding.key} onChange={(e) => setAdding({ ...adding, key: e.target.value })} placeholder="Area, Seller, Plot" /></div>
                <div className="field"><label htmlFor="af-v">Value as written</label><input id="af-v" className="input" value={adding.value} onChange={(e) => setAdding({ ...adding, value: e.target.value })} /></div>
                <div className="field full"><label htmlFor="af-s">Where in the document</label><input id="af-s" className="input" value={adding.source_note} onChange={(e) => setAdding({ ...adding, source_note: e.target.value })} placeholder="Page 2, schedule of property" /></div>
              </div>
              {err && <div className="error-text" role="alert"><Icon name="warn" size={16} />{err}</div>}
              <div><button className="btn sm">Add detail</button></div>
            </form>
          )}

          <h3 className="sec-h" style={{ marginTop: 36 }}>Review state</h3>
          <div className="field" style={{ marginTop: 8 }}>
            <label htmlFor="ex-s">Details in this document</label>
            <select id="ex-s" className="input" value={d.extraction_status} disabled={!write} onChange={(e) => act(() => api.patch(`/api/documents/${d.id}`, { extraction_status: e.target.value }), 'Review state updated.')}>
              <option value="manual_review">Needs manual review</option><option value="completed">Fields reviewed by a person</option><option value="failed">Could not be read</option><option value="processing">Being worked on</option>
            </select>
          </div>

          <h3 className="sec-h" style={{ marginTop: 28 }}>Verification</h3>
          <p className="sub" style={{ margin: '4px 0 10px' }}>{d.verification_note || 'No verification recorded.'}</p>
          {write && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div className="field"><label htmlFor="vs">Record a status</label>
                <select id="vs" className="input" value={ver.status} onChange={(e) => setVer({ ...ver, status: e.target.value })}>
                  <option value="">Choose</option><option value="supplied">Supplied. Not checked</option><option value="checked_source">Checked against a source</option><option value="discrepancy">Difference flagged</option>
                  {(user.role === 'admin' || user.role === 'reviewer') && <option value="professionally_reviewed">Reviewed by a professional</option>}
                </select></div>
              {ver.status && <div className="field"><label htmlFor="vn">Source and date</label><input id="vn" className="input" value={ver.note} onChange={(e) => setVer({ ...ver, note: e.target.value })} placeholder="Which record you compared it with, and when" /><span className="hint">Required for “Checked against a source”. A person records this. LandVerify did not query any government system.</span></div>}
              {ver.status && <div><button className="btn sm" onClick={setStatus}>Save status</button></div>}
            </div>
          )}

          <h3 className="sec-h" style={{ marginTop: 36 }}>Version history</h3>
          <ol className="timeline" style={{ marginTop: 10 }}>
            {d.versions.map((v) => <li key={v.id}><div>{v.id === d.id ? <b style={{ fontWeight: 600 }}>Version {v.version}, viewing</b> : <Link to={`/app/properties/${p.id}/documents/${v.id}`}>Version {v.version}</Link>}<span className="sub"> · {v.file_name || 'No file'}</span></div><div className="when">{fmtDateTime(v.created_at)}</div></li>)}
          </ol>
        </div>
      </div>
      {finding && <NewFinding p={p} team={team} preset={finding} onClose={() => setFinding(null)} onDone={() => { setFinding(null); refresh(); }} />}
    </div>
  );
}

function Field({ f, sel, onSel, write, act }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(f.value); const [s, setS] = useState(f.source_note || '');
  const [label, tone] = FSTATE[f.status];
  return (
    <div className={`fld ${sel ? 'sel' : ''}`}>
      <div className="k"><span>{f.key}</span><span className={`chip ${tone}`}>{label}</span></div>
      {edit ? (
        <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
          <input className="input" value={v} onChange={(e) => setV(e.target.value)} aria-label={`${f.key} value`} />
          <input className="input" value={s} onChange={(e) => setS(e.target.value)} aria-label={`${f.key} source location`} placeholder="Where in the document" />
          <div style={{ display: 'flex', gap: 8 }}><button className="btn sm" onClick={() => act(() => api.patch(`/api/fields/${f.id}`, { value: v, source_note: s }), 'Detail corrected.').then(() => setEdit(false))}>Save correction</button><button className="btn secondary sm" onClick={() => setEdit(false)}>Cancel</button></div>
        </div>
      ) : (
        <>
          <div className="v">{f.value}</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6, marginLeft: -12 }}>
            <button className="btn quiet sm" aria-expanded={sel} onClick={onSel}>{sel ? 'Hide source' : 'View source'}</button>
            {write && f.status !== 'confirmed' && <button className="btn quiet sm" onClick={() => act(() => api.patch(`/api/fields/${f.id}`, { status: 'confirmed' }), 'Confirmed.')}>Confirm</button>}
            {write && <button className="btn quiet sm" onClick={() => setEdit(true)}>Correct</button>}
            {write && <button className="btn quiet sm" style={{ color: 'var(--red)' }} onClick={() => act(() => api.del(`/api/fields/${f.id}`), 'Detail removed.')}>Remove</button>}
          </div>
          {sel && (
            <div className="sub" style={{ marginTop: 6 }}>
              <div><b style={{ fontWeight: 560, color: 'var(--ink)' }}>Source location:</b> {f.source_note || 'Not recorded. Add where in the document this appears.'}</div>
              <div>Entered by {f.updated_by_name || 'a team member'} on {fmtDateTime(f.updated_at)}. Entered by a person, not read automatically.</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
