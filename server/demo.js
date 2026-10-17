import { db, now, uid, propertyId, audit, tx } from './db.js';
import { checkTemplate } from './jurisdictions.js';

// Creates a clearly fictional demonstration property. Nothing here has been
// checked against any government record, and no real person or place is named.
export function seedDemo(orgId, userId) {
  return tx(() => {
    const pid = propertyId();
    const t = now();
    db.prepare(`INSERT INTO properties (id, org_id, name, state, district, tehsil, village, identifiers, area_value, area_unit,
      property_type, claimed_owner, boundary_source, stage, reviewer_id, is_demo, created_by, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      pid, orgId, 'Demonstration parcel (fictional)', 'Uttar Pradesh', 'Sample District', 'Sample Tehsil', 'Sample Village',
      JSON.stringify({ khasra: '000/0 (demo)', khata: 'D-0000', survey: '' }),
      1.2, 'bigha', 'Agricultural', 'Demo Owner A (fictional)', 'illustrative', 'collecting', userId, 1, userId, t, t);

    const checkIds = {};
    checkTemplate('Uttar Pradesh').forEach((c, i) => {
      const id = uid('chk_');
      checkIds[c.title] = id;
      db.prepare(`INSERT INTO checks (id, property_id, category, title, description, sort, updated_at) VALUES (?,?,?,?,?,?,?)`)
        .run(id, pid, c.category, c.title, c.description, i, t);
    });
    const setCheck = (title, status, outcome, source, evidence, next) =>
      db.prepare('UPDATE checks SET status=?, outcome=?, source=?, evidence=?, next_action=?, reviewer_id=? WHERE id=?')
        .run(status, outcome, source, evidence, next, userId, checkIds[title]);
    setCheck('Chain of title documents collected', 'in_progress', 'none', 'Supplied documents', 'Two of three expected deeds uploaded.', 'Request the earliest deed in the chain.');
    setCheck('Claimed owner matches title documents', 'completed', 'no_issue_found', 'Supplied sale deed (demo)', 'Name in the deed matches the claimed owner.', null);
    setCheck('Khatauni matches claimed owner', 'needs_evidence', 'none', null, null, 'Upload a recent Khatauni extract.');
    setCheck('Area stated consistently across documents', 'completed', 'issue_found', 'Sale deed and survey sketch (demo)', 'The two documents state different areas.', 'Resolve the linked finding.');

    const docs = [
      ['Sale deed', 'Sale deed (demo)', '2014-06-12', 'Demo Owner A, Demo Seller B', 'completed', 'checked_source', 'Entered by a user. Compared with a copy held by the demo team.'],
      ['Survey sketch', 'Survey sketch (demo)', '2019-02-03', '', 'manual_review', 'discrepancy', 'Area differs from the sale deed.'],
      ['Encumbrance certificate', 'Encumbrance certificate (demo)', '2024-11-20', 'Demo Owner A', 'manual_review', 'supplied', null],
    ];
    const docIds = [];
    for (const [type, title, date, parties, ext, ver, note] of docs) {
      const id = uid('doc_');
      docIds.push(id);
      db.prepare(`INSERT INTO documents (id, org_id, property_id, group_id, version, doc_type, title, file_name, doc_date, parties, identifiers,
        extraction_status, verification_status, verification_note, uploaded_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, orgId, pid, id, 1, type, title, null, date, parties, '000/0 (demo)', ext, ver, note, userId, t);
    }
    const addField = (docIdx, key, value, source, status) =>
      db.prepare('INSERT INTO fields (id, document_id, key, value, source_note, origin, status, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(uid('fld_'), docIds[docIdx], key, value, source, 'entered_by_user', status, userId, t);
    addField(0, 'Area', '1.2 bigha', 'Page 2, schedule of property', 'confirmed');
    addField(0, 'Seller', 'Demo Seller B (fictional)', 'Page 1, parties', 'confirmed');
    addField(1, 'Area', '1.0 bigha', 'Sketch legend', 'unconfirmed');

    const fid = uid('fnd_');
    db.prepare(`INSERT INTO findings (id, property_id, check_id, title, explanation, severity, evidence, document_id, source, source_date,
      owner_id, next_step, status, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(fid, pid, checkIds['Area stated consistently across documents'], 'Plot area differs between records',
        'Two supplied documents state different areas for the same property. Confirm the correct area against the relevant authoritative records and obtain professional review before proceeding.',
        'high', 'Sale deed states 1.2 bigha. Survey sketch states 1.0 bigha.', docIds[1], 'Supplied documents (demonstration data)', '2025-01-10',
        userId, 'Confirm the area against the revenue record and ask the legal reviewer to advise.', 'open', userId, t, t);
    db.prepare(`INSERT INTO findings (id, property_id, title, explanation, severity, evidence, source, owner_id, next_step, status, created_by, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(uid('fnd_'), pid, 'Record of rights not yet supplied',
        'No Khatauni extract has been uploaded, so the current revenue record has not been compared with the claimed owner.',
        'medium', 'No document of this type in the file.', 'Document collection', userId, 'Request a recent Khatauni extract from the owner.', 'open', userId, t, t);

    db.prepare(`INSERT INTO reviews (id, property_id, kind, target_type, target_id, body, author_id, created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(uid('rev_'), pid, 'evidence_request', 'check', checkIds['Khatauni matches claimed owner'], 'Please upload a recent Khatauni extract.', userId, t);
    audit(orgId, pid, userId, 'property.created', 'Demonstration property loaded. All records are fictional.');
    return pid;
  });
}
