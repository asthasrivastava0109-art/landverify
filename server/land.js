import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, now, uid, audit, tx, UPLOAD_DIR } from './db.js';

// Official land-record sources: UP Bhulekh and UP Bhunaksha.
// LandVerify does not call either portal. The user looks a record up on the official site and imports it.
// See docs/INTEGRATION-UP-LAND-RECORDS.md for the access investigation behind this design.

export const PORTALS = {
  bhulekh: {
    key: 'bhulekh', name: 'UP Bhulekh', role: 'Revenue records', url: 'https://upbhulekh.gov.in/',
    access: 'guided_manual',
    api: { status: 'not_configured', note: 'An official district page mentions a Bhulekh Data API, but no public documentation or access route was found. Access needs authorisation from the Board of Revenue, Uttar Pradesh.' },
    fields: [
      { key: 'area', label: 'Recorded area', hindi: 'क्षेत्रफल', unit: true, hint: 'Exactly as shown, with its unit' },
      { key: 'khata', label: 'Khata number', hindi: 'खाता संख्या' },
      { key: 'tenure_holder', label: 'Tenure holder entry', hindi: 'खातेदार का नाम', multi: true, hint: 'One entry per name shown' },
      { key: 'land_class', label: 'Land classification', hindi: 'भूमि का प्रकार' },
      { key: 'sale_status', label: 'Sale or transaction status', hindi: '', hint: 'Only if the portal shows one' },
      { key: 'dispute_status', label: 'Dispute or litigation status', hindi: '', hint: 'Only if the portal shows one' },
      { key: 'other', label: 'Other recorded detail', hindi: '', multi: true },
    ],
  },
  bhunaksha: {
    key: 'bhunaksha', name: 'UP Bhunaksha', role: 'Cadastral map', url: 'https://upbhunaksha.gov.in/',
    access: 'guided_manual',
    api: { status: 'not_configured', note: 'No documented map service, tile endpoint or geometry download was found. The official viewer is the only supported surface identified.' },
    fields: [
      { key: 'map_area', label: 'Plot area shown on the map', hindi: '', unit: true, hint: 'Only if the viewer shows one' },
      { key: 'map_reference', label: 'Map or sheet reference', hindi: '' },
      { key: 'adjacent_plots', label: 'Adjacent plot numbers', hindi: '', multi: true },
      { key: 'other', label: 'Other map detail', hindi: '', multi: true },
    ],
  },
};
const FIELD_META = Object.fromEntries(Object.entries(PORTALS).map(([p, v]) => [p, Object.fromEntries(v.fields.map((f) => [f.key, f]))]));

export const CLASS_LABEL = {
  match: 'Match', potential_discrepancy: 'Potential discrepancy', source_unavailable: 'Source unavailable',
  manual_review: 'Manual review required', not_matched: 'Record could not be matched', outdated: 'Outdated or cached data',
};

const norm = (s) => String(s ?? '').toLowerCase().replace(/[.,;:()\[\]\/\\\-_'"]/g, ' ').replace(/\s+/g, ' ').trim();
const unitNorm = (u) => ({ 'sq m': 'sqm', 'sq. m': 'sqm', 'sq meter': 'sqm', 'square metre': 'sqm', 'sq ft': 'sqft', 'sq. ft': 'sqft', hectare: 'ha', hectares: 'ha', acres: 'acre', bighas: 'bigha', biswas: 'biswa' }[norm(u)] || norm(u));
const num = (v) => { const m = String(v ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; };
const tokens = (s) => new Set(norm(s).split(' ').filter((t) => t.length > 1));
const subset = (a, b) => a.size > 0 && [...a].every((t) => b.has(t));
const hashOf = (o) => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 16);
const isUP = (p) => (p.state || '').toLowerCase().includes('uttar pradesh');
const DAY = 86400000;

export default function registerLand(app, h) {
  const { auth, need, wrap, bad, str, getProperty, touch, WRITERS, REVIEWERS, upload, parseProp } = h;

  app.get('/api/land/portals', auth, (req, res) => res.json(Object.values(PORTALS)));

  function loadRecords(pid) {
    const rows = db.prepare(`SELECT r.*, u.name imported_by_name, rv.name reviewed_by_name, d.title document_title, d.mime document_mime
      FROM land_records r LEFT JOIN users u ON u.id = r.imported_by LEFT JOIN users rv ON rv.id = r.reviewed_by LEFT JOIN documents d ON d.id = r.document_id
      WHERE r.property_id = ? ORDER BY r.imported_at DESC`).all(pid);
    const fields = db.prepare(`SELECT f.* FROM land_record_fields f JOIN land_records r ON r.id = f.record_id WHERE r.property_id = ? ORDER BY f.sort`).all(pid);
    return rows.map((r) => ({ ...r, fields: fields.filter((f) => f.record_id === r.id) }));
  }
  function loadCrossrefs(pid) {
    return db.prepare(`SELECT c.*, u.name reviewed_by_name, f.status finding_status, f.title finding_title FROM crossrefs c LEFT JOIN users u ON u.id = c.reviewed_by LEFT JOIN findings f ON f.id = c.finding_id WHERE c.property_id = ? ORDER BY c.rowid`).all(pid)
      .map((c) => ({ ...c, vals: JSON.parse(c.vals) }));
  }

  app.get('/api/properties/:pid/land', auth, (req, res) => {
    const p = getProperty(req, res); if (!p) return;
    const prop = parseProp(p);
    res.json({
      eligible: isUP(p),
      identity: { district: p.district, tehsil: p.tehsil, village: p.village, gata: prop.identifiers.khasra || '', khata: prop.identifiers.khata || '', district_code: prop.identifiers.district_code || '', tehsil_code: prop.identifiers.tehsil_code || '', village_code: prop.identifiers.village_code || '' },
      portals: PORTALS, records: loadRecords(p.id), crossrefs: loadCrossrefs(p.id),
    });
  });

  // Import a record the user looked up on the official portal.
  app.post('/api/properties/:pid/land/records', auth, need(WRITERS), (req, res, next) => {
    upload.single('file')(req, res, (err) => (err ? bad(res, err.code === 'LIMIT_FILE_SIZE' ? 'That file is over 25 MB.' : err.message) : next()));
  }, wrap((req, res) => {
    const p = getProperty(req, res);
    const drop = () => { if (req.file) fs.rmSync(req.file.path, { force: true }); };
    if (!p) return drop();
    if (!isUP(p)) { drop(); return bad(res, 'Land-record import is available for Uttar Pradesh properties.'); }
    const b = req.body;
    const portal = PORTALS[b.portal] ? b.portal : null;
    if (!portal) { drop(); return bad(res, 'Choose UP Bhulekh or UP Bhunaksha.'); }
    const loc = { district: str(b.district, 100), tehsil: str(b.tehsil, 100), village: str(b.village, 100), gata: str(b.gata, 60) };
    for (const [k, l] of [['district', 'district'], ['tehsil', 'tehsil'], ['village', 'village'], ['gata', 'plot (Gata) number']]) {
      if (!loc[k]) { drop(); return bad(res, `Enter the ${l} exactly as the record shows it. It is used to check the record belongs to this property.`); }
    }
    let fields = [];
    try { fields = JSON.parse(b.fields || '[]'); } catch { drop(); return bad(res, 'The record values could not be read. Try again.'); }
    fields = (Array.isArray(fields) ? fields : []).map((f) => ({ key: str(f.key, 30), value: str(f.value, 500), unit: str(f.unit, 30), original_text: str(f.original_text, 500) })).filter((f) => f.value && FIELD_META[portal][f.key]);
    if (!fields.length && !req.file) { drop(); return bad(res, 'Attach the downloaded record or map, or enter at least one value you read from it.'); }
    for (const f of fields) if (FIELD_META[portal][f.key].unit && !f.unit && f.key.endsWith('area')) { drop(); return bad(res, 'Enter the unit exactly as the record states it. BhuVerify does not convert units.'.replace('BhuVerify', 'LandVerify')); }
    let when = str(b.retrieved_on_portal_at, 40);
    if (when) { const t = new Date(when); if (isNaN(t) || t.getTime() > Date.now() + 3600000) { drop(); return bad(res, 'Enter the date you looked the record up, not a future date.'); } when = t.toISOString(); }
    const sourceUrl = /^https:\/\/upbhu(lekh|naksha)\.gov\.in(\/|$)/.test(str(b.source_url, 300)) ? str(b.source_url, 300) : PORTALS[portal].url;
    const id = uid('lr_'), t = now();
    let docId = null;
    tx(() => {
      db.prepare(`UPDATE land_records SET currency = 'historical' WHERE property_id = ? AND portal = ? AND currency = 'current'`).run(p.id, portal);
      if (req.file) {
        docId = uid('doc_');
        const type = portal === 'bhulekh' ? 'Khatauni / Record of Rights' : 'Survey sketch / map';
        db.prepare(`INSERT INTO documents (id, org_id, property_id, group_id, version, doc_type, title, file_name, stored_name, mime, size, doc_date, parties, identifiers,
          extraction_status, verification_status, verification_note, origin, uploaded_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(docId, req.user.org_id, p.id, docId, 1, type, `${PORTALS[portal].name} ${portal === 'bhulekh' ? 'record' : 'map'} (imported)`, path.basename(req.file.originalname).slice(0, 200), path.basename(req.file.path), req.file.mimetype, req.file.size,
            when ? when.slice(0, 10) : null, '', loc.gata, 'manual_review', 'supplied', 'User-imported official-source material, pending validation.', 'imported_official_source', req.user.id, t);
      }
      db.prepare(`INSERT INTO land_records (id, org_id, property_id, portal, method, status, currency, district, tehsil, village, gata, khata, district_code, tehsil_code, village_code, record_ref, source_url, data_format, retrieved_on_portal_at, imported_at, document_id, note, imported_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, req.user.org_id, p.id, portal, req.file ? 'uploaded_import' : 'manual_entry', 'imported', 'current', loc.district, loc.tehsil, loc.village, loc.gata, str(b.khata, 60), str(b.district_code, 20), str(b.tehsil_code, 20), str(b.village_code, 20),
          str(b.record_ref, 120), sourceUrl, req.file ? (req.file.mimetype === 'application/pdf' ? 'pdf' : 'image') : 'manual', when || null, t, docId, str(b.note, 500), req.user.id);
      fields.forEach((f, i) => db.prepare('INSERT INTO land_record_fields (id, record_id, key, label, value, unit, original_text, sort) VALUES (?,?,?,?,?,?,?,?)')
        .run(uid('lf_'), id, f.key, FIELD_META[portal][f.key].label, f.value, f.unit || null, f.original_text || null, i));
      touch(p.id);
      audit(req.user.org_id, p.id, req.user.id, 'land.imported', `${PORTALS[portal].name}: imported by a person (${req.file ? 'file attached' : 'values only'}). Any earlier record is now a historical snapshot.`);
    });
    res.status(201).json({ id, document_id: docId });
  }));

  // The user reports that the lookup found nothing, or that the portal could not be used.
  app.post('/api/properties/:pid/land/outcome', auth, need(WRITERS), wrap((req, res) => {
    const p = getProperty(req, res); if (!p) return;
    const portal = PORTALS[req.body.portal] ? req.body.portal : null;
    const status = ['not_found', 'unavailable'].includes(req.body.status) ? req.body.status : null;
    if (!portal || !status) return bad(res, 'Choose a portal and an outcome.');
    const note = str(req.body.note, 500);
    if (!note) return bad(res, 'Add a short note about what you saw, such as the message the portal showed.');
    const prop = parseProp(p), id = uid('lr_');
    db.prepare(`INSERT INTO land_records (id, org_id, property_id, portal, method, status, currency, district, tehsil, village, gata, source_url, retrieved_on_portal_at, imported_at, note, imported_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, req.user.org_id, p.id, portal, 'user_reported', status, 'historical', p.district, p.tehsil, p.village, prop.identifiers.khasra || '', PORTALS[portal].url, now(), now(), note, req.user.id);
    touch(p.id);
    audit(req.user.org_id, p.id, req.user.id, 'land.outcome', `${PORTALS[portal].name}: ${status === 'not_found' ? 'record not found' : 'portal unavailable'} (reported by a person). ${note}`);
    res.status(201).json({ id });
  }));

  // A reviewer records that they compared the imported values with the original source.
  app.post('/api/land/records/:id/review', auth, need(REVIEWERS), wrap((req, res) => {
    const r = db.prepare('SELECT * FROM land_records WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
    if (!r || r.status !== 'imported') return bad(res, 'Record not found.', 404);
    const note = str(req.body.note, 500);
    if (!note) return bad(res, 'Say what you compared the values against, so the check can be repeated.');
    db.prepare('UPDATE land_records SET reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ?').run(req.user.id, now(), note, r.id);
    touch(r.property_id);
    audit(req.user.org_id, r.property_id, req.user.id, 'land.reviewed', `${PORTALS[r.portal].name}: imported values reviewed by a person. ${note}`);
    res.json({ ok: true });
  }));

  /* ---------- cross-reference ---------- */
  function compute(p) {
    const prop = parseProp(p);
    const out = [];
    const add = (key, label, classification, summary, vals = []) => out.push({ key, label, classification, summary, vals });
    const current = db.prepare(`SELECT * FROM land_records WHERE property_id = ? AND currency = 'current' AND status = 'imported'`).all(p.id);
    const fieldsOf = (id) => db.prepare('SELECT * FROM land_record_fields WHERE record_id = ? ORDER BY sort').all(id);
    const rec = { bhulekh: current.find((r) => r.portal === 'bhulekh'), bhunaksha: current.find((r) => r.portal === 'bhunaksha') };
    const src = (r) => `${PORTALS[r.portal].name}, user-imported${r.retrieved_on_portal_at ? `, looked up ${r.retrieved_on_portal_at.slice(0, 10)}` : `, imported ${r.imported_at.slice(0, 10)}`}`;
    const stamp = (r) => r.retrieved_on_portal_at || r.imported_at;
    const matched = {};

    for (const portal of ['bhulekh', 'bhunaksha']) {
      const r = rec[portal], name = PORTALS[portal].name;
      if (!r) { add(`identity.${portal}`, `${name}: parcel identity`, 'source_unavailable', `No ${name} record has been imported. Missing information is not evidence of a problem, and not evidence of none.`); continue; }
      const checks = [['District', p.district, r.district], ['Tehsil', p.tehsil, r.tehsil], ['Village', p.village, r.village], ['Plot (Gata) number', prop.identifiers.khasra, r.gata]];
      if (prop.identifiers.village_code && r.village_code) checks.push(['Village code', prop.identifiers.village_code, r.village_code]);
      const missing = checks.filter(([, a]) => !norm(a));
      const diff = checks.filter(([, a, b]) => norm(a) && norm(b) && norm(a) !== norm(b));
      const vals = checks.map(([l, a, b]) => ({ label: l, value: `Property file: ${a || 'not recorded'}. Imported record: ${b || 'not recorded'}`, source: src(r), at: stamp(r) }));
      if (diff.length) { add(`identity.${portal}`, `${name}: parcel identity`, 'not_matched', `The imported ${name} record does not match this property on: ${diff.map((d) => d[0]).join(', ')}. It has not been linked to this parcel, and no other comparison uses it.`, vals); }
      else if (missing.length) { matched[portal] = true; add(`identity.${portal}`, `${name}: parcel identity`, 'manual_review', `The property file has no value for: ${missing.map((m) => m[0]).join(', ')}. Add it so the record can be matched. A matching plot number alone does not show two records are the same parcel.`, vals); }
      else { matched[portal] = true; add(`identity.${portal}`, `${name}: parcel identity`, 'match', `District, tehsil, village and plot number agree with the property file. This is a technical match, not a legal conclusion.`, vals); }
      const age = Date.now() - new Date(stamp(r)).getTime();
      if (age > 90 * DAY) add(`freshness.${portal}`, `${name}: age of record`, 'outdated', `This record was looked up ${Math.floor(age / DAY)} days ago. It is a historical snapshot, not a live record. Look it up again before relying on it.`, [{ label: 'Looked up', value: stamp(r).slice(0, 10), source: src(r), at: stamp(r) }]);
    }

    const bf = rec.bhulekh && matched.bhulekh ? fieldsOf(rec.bhulekh.id) : [];
    const mf = rec.bhunaksha && matched.bhunaksha ? fieldsOf(rec.bhunaksha.id) : [];

    // Khata
    const khataVals = [];
    if (prop.identifiers.khata) khataVals.push({ label: 'Property file', value: prop.identifiers.khata, source: 'Entered by a user', at: p.updated_at });
    const bk = bf.find((f) => f.key === 'khata')?.value || (matched.bhulekh && rec.bhulekh.khata);
    if (bk) khataVals.push({ label: 'Bhulekh record', value: bk, source: src(rec.bhulekh), at: stamp(rec.bhulekh) });
    if (khataVals.length < 2) add('khata', 'Khata number', 'source_unavailable', 'Khata number is missing from the property file or the imported record, so it cannot be compared.', khataVals);
    else add('khata', 'Khata number', norm(khataVals[0].value) === norm(khataVals[1].value) ? 'match' : 'potential_discrepancy', norm(khataVals[0].value) === norm(khataVals[1].value) ? 'The Khata numbers agree.' : 'The Khata numbers differ between the property file and the imported record.', khataVals);

    // Area
    const areaVals = [];
    if (p.area_value != null) areaVals.push({ label: 'Claimed area (property file)', value: `${p.area_value} ${p.area_unit || ''}`.trim(), source: 'Entered by a user', at: p.updated_at, n: p.area_value, u: unitNorm(p.area_unit) });
    const ba = bf.find((f) => f.key === 'area');
    if (ba) areaVals.push({ label: 'Bhulekh recorded area', value: `${ba.value} ${ba.unit || ''}`.trim(), source: src(rec.bhulekh), at: stamp(rec.bhulekh), n: num(ba.value), u: unitNorm(ba.unit) });
    const ma = mf.find((f) => f.key === 'map_area');
    if (ma) areaVals.push({ label: 'Bhunaksha map area', value: `${ma.value} ${ma.unit || ''}`.trim(), source: src(rec.bhunaksha), at: stamp(rec.bhunaksha), n: num(ma.value), u: unitNorm(ma.unit) });
    for (const d of db.prepare(`SELECT f.value, d.title, d.created_at FROM fields f JOIN documents d ON d.id = f.document_id WHERE d.property_id = ? AND lower(f.key) = 'area' AND d.origin != 'imported_official_source' AND d.version = (SELECT MAX(version) FROM documents WHERE group_id = d.group_id)`).all(p.id))
      areaVals.push({ label: `Area in ${d.title}`, value: d.value, source: 'Entered by a user from a supplied document', at: d.created_at, n: num(d.value), u: unitNorm(String(d.value).replace(/[\d.,\s]/g, '')) });
    const strip = (v) => ({ label: v.label, value: v.value, source: v.source, at: v.at });
    if (areaVals.length < 2) add('area', 'Recorded area', 'source_unavailable', 'Fewer than two area values are available, so none can be compared.', areaVals.map(strip));
    else if (areaVals.some((v) => v.n == null || !v.u)) add('area', 'Recorded area', 'manual_review', 'At least one area value has no readable number or unit. Check each against its source.', areaVals.map(strip));
    else if (new Set(areaVals.map((v) => v.u)).size > 1) add('area', 'Recorded area', 'manual_review', 'The values use different units. LandVerify does not convert between local units such as bigha and biswa, because they vary by district. Compare them against the sources.', areaVals.map(strip));
    else {
      const same = Math.max(...areaVals.map((v) => v.n)) - Math.min(...areaVals.map((v) => v.n)) <= 0.01;
      add('area', 'Recorded area', same ? 'match' : 'potential_discrepancy', same ? 'All available area values agree.' : 'The available area values differ. Both values and their sources are kept. LandVerify does not decide which is authoritative.', areaVals.map(strip));
    }

    // Owner
    const holders = bf.filter((f) => f.key === 'tenure_holder');
    if (!p.claimed_owner || !holders.length) add('owner', 'Claimed owner and tenure holders', 'source_unavailable', 'The claimed owner or the imported tenure-holder entries are missing, so they cannot be compared.', holders.map((f) => ({ label: 'Tenure holder entry', value: f.value, source: src(rec.bhulekh), at: stamp(rec.bhulekh) })));
    else {
      const ct = tokens(p.claimed_owner);
      const hit = holders.some((f) => { const ht = tokens(f.value); return subset(ct, ht) || subset(ht, ct); });
      add('owner', 'Claimed owner and tenure holders', hit ? 'match' : 'potential_discrepancy',
        hit ? 'The claimed owner appears among the recorded tenure holders. Names are compared as text. A match here does not confirm ownership.' : 'The claimed owner does not appear among the recorded tenure holders. Spelling and script differences are common, so review both before drawing any conclusion.',
        [{ label: 'Claimed owner (property file)', value: p.claimed_owner, source: 'Entered by a user', at: p.updated_at }, ...holders.map((f) => ({ label: 'Tenure holder entry', value: f.value + (f.original_text ? ` (${f.original_text})` : ''), source: src(rec.bhulekh), at: stamp(rec.bhulekh) }))]);
    }

    // Statuses are shown as written, never interpreted.
    for (const [k, label] of [['sale_status', 'Sale or transaction status'], ['dispute_status', 'Dispute or litigation status']]) {
      const f = bf.find((x) => x.key === k);
      if (!rec.bhulekh || !matched.bhulekh) continue;
      if (!f) add(k, label, 'source_unavailable', 'No value was imported for this. That is not evidence that nothing exists. Check the official source.');
      else add(k, label, 'manual_review', 'The record shows an entry. LandVerify does not interpret it. A qualified person should read it in context.', [{ label, value: f.value + (f.original_text ? ` (${f.original_text})` : ''), source: src(rec.bhulekh), at: stamp(rec.bhulekh) }]);
    }
    return out;
  }

  const FIND = {
    area: ['Area discrepancy between records', 'high', 'Review the source documents and seek clarification from the relevant revenue authority or a qualified professional.'],
    owner: ['Claimed owner not found among recorded tenure holders', 'high', 'Compare the names on the original record, allowing for spelling and script differences, and ask a legal reviewer to advise.'],
    khata: ['Khata number differs between records', 'medium', 'Confirm the Khata number against the original record.'],
    'identity.bhulekh': ['Bhulekh record could not be matched to this property', 'high', 'Check the location and plot details entered on the property and on the imported record, then import the correct record.'],
    'identity.bhunaksha': ['Bhunaksha map could not be matched to this property', 'high', 'Check the location and plot details entered on the property and on the imported map, then import the correct one.'],
  };

  app.post('/api/properties/:pid/land/compare', auth, need(WRITERS), wrap((req, res) => {
    const p = getProperty(req, res); if (!p) return;
    const results = compute(p), t = now();
    let raised = 0;
    tx(() => {
      const keep = new Set(results.map((r) => r.key));
      for (const old of db.prepare('SELECT key FROM crossrefs WHERE property_id = ?').all(p.id)) if (!keep.has(old.key)) db.prepare('DELETE FROM crossrefs WHERE property_id = ? AND key = ?').run(p.id, old.key);
      for (const r of results) {
        const hash = hashOf([r.classification, r.vals.map((v) => [v.label, v.value, v.source])]);
        const prev = db.prepare('SELECT * FROM crossrefs WHERE property_id = ? AND key = ?').get(p.id, r.key);
        const unchanged = prev && prev.values_hash === hash;
        let findingId = unchanged ? prev.finding_id : null;
        const openFinding = findingId && db.prepare(`SELECT 1 FROM findings WHERE id = ? AND status IN ('open','in_review')`).get(findingId);
        const flagged = FIND[r.key] && ['potential_discrepancy', 'not_matched'].includes(r.classification);
        if (flagged && openFinding) {
          const evidence = r.vals.map((v) => `${v.label}: ${v.value} (${v.source}; ${String(v.at).slice(0, 16).replace('T', ' ')} UTC)`).join('\n');
          if (!unchanged) db.prepare('UPDATE findings SET explanation = ?, evidence = ?, updated_at = ? WHERE id = ?').run(r.summary, evidence, t, findingId);
        } else if (flagged && !(unchanged && findingId)) {
          const [title, severity, next] = FIND[r.key];
          const evidence = r.vals.map((v) => `${v.label}: ${v.value} (${v.source}; ${String(v.at).slice(0, 16).replace('T', ' ')} UTC)`).join('\n');
          findingId = uid('fnd_');
          db.prepare(`INSERT INTO findings (id, property_id, title, explanation, severity, evidence, source, source_date, owner_id, next_step, status, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
            .run(findingId, p.id, title, r.summary, severity, evidence, 'UP land-record sources, user-imported', t.slice(0, 10), null, next, 'open', req.user.id, t, t);
          raised++;
        }
        db.prepare(`INSERT INTO crossrefs (id, property_id, key, label, classification, summary, vals, values_hash, finding_id, reviewed_by, reviewed_at, review_note, computed_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(property_id, key) DO UPDATE SET label=excluded.label, classification=excluded.classification, summary=excluded.summary, vals=excluded.vals,
          values_hash=excluded.values_hash, finding_id=excluded.finding_id, reviewed_by=excluded.reviewed_by, reviewed_at=excluded.reviewed_at, review_note=excluded.review_note, computed_at=excluded.computed_at`)
          .run(uid('xr_'), p.id, r.key, r.label, r.classification, r.summary, JSON.stringify(r.vals), hash, findingId,
            unchanged ? prev.reviewed_by : null, unchanged ? prev.reviewed_at : null, unchanged ? prev.review_note : null, t);
      }
      touch(p.id);
      audit(req.user.org_id, p.id, req.user.id, 'land.compared', `Compared official-source records with the property file: ${results.length} comparisons, ${results.filter((r) => ['potential_discrepancy', 'not_matched'].includes(r.classification)).length} need review, ${raised} new finding${raised === 1 ? '' : 's'} raised.`);
    });
    res.json({ crossrefs: loadCrossrefs(p.id), raised });
  }));

  app.post('/api/crossrefs/:id/confirm', auth, need(REVIEWERS), wrap((req, res) => {
    const c = db.prepare(`SELECT c.*, p.org_id FROM crossrefs c JOIN properties p ON p.id = c.property_id WHERE c.id = ?`).get(req.params.id);
    if (!c || c.org_id !== req.user.org_id) return bad(res, 'Comparison not found.', 404);
    const note = str(req.body.note, 500);
    if (!note) return bad(res, 'Say what you checked, so the confirmation can be understood later.');
    db.prepare('UPDATE crossrefs SET reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ?').run(req.user.id, now(), note, c.id);
    touch(c.property_id);
    audit(req.user.org_id, c.property_id, req.user.id, 'land.confirmed', `${c.label}: confirmed by a reviewer (${CLASS_LABEL[c.classification]}). ${note}`);
    res.json({ ok: true });
  }));
}
