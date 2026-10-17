import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import { db } from './db.js';
import { CATEGORIES, jurisdictionFor } from './jurisdictions.js';

const INK = '#171717', MUTED = '#6b6b6b', BLUE = '#174EA6', RULE = '#dcdcd6';
const VERIFY = { supplied: 'Supplied by a user. Not checked', checked_source: 'Checked against a source recorded by a user', professionally_reviewed: 'Reviewed by a qualified professional (recorded by a reviewer)', discrepancy: 'Discrepancy flagged' };
const OUTCOME = { none: 'No result recorded', no_issue_found: 'No issue found in the evidence reviewed', issue_found: 'Issue found', inconclusive: 'Inconclusive' };
const STATUS = { not_started: 'Verification not completed', in_progress: 'In progress', needs_evidence: 'Waiting for evidence', completed: 'Completed' };
const SEV = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
const FSTATUS = { open: 'Open', in_review: 'In review', resolved: 'Resolved', accepted: 'Risk accepted by reviewer' };
const DEC = { proceed: 'Proceed', proceed_with_conditions: 'Proceed with conditions', hold: 'Hold', decline: 'Decline' };
const d = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : 'not recorded');

export function buildReport({ property: p, generatedBy, generatedAt, outPath, reportId }) {
  const checks = db.prepare('SELECT c.*, u.name reviewer_name FROM checks c LEFT JOIN users u ON u.id = c.reviewer_id WHERE property_id = ? ORDER BY sort').all(p.id);
  const docs = db.prepare(`SELECT d.*, (SELECT COUNT(*) FROM documents x WHERE x.group_id = d.group_id) versions FROM documents d WHERE property_id = ? AND version = (SELECT MAX(version) FROM documents WHERE group_id = d.group_id) ORDER BY created_at`).all(p.id);
  const fields = db.prepare('SELECT f.*, d.title doc_title FROM fields f JOIN documents d ON d.id = f.document_id WHERE d.property_id = ? ORDER BY d.title, f.key').all(p.id);
  const findings = db.prepare(`SELECT f.*, u.name owner_name FROM findings f LEFT JOIN users u ON u.id = f.owner_id WHERE property_id = ?
    ORDER BY CASE f.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`).all(p.id);
  const reviews = db.prepare(`SELECT r.*, u.name author_name, u.role author_role FROM reviews r JOIN users u ON u.id = r.author_id WHERE property_id = ? ORDER BY r.created_at`).all(p.id);
  const reviewer = p.reviewer_id ? db.prepare('SELECT name FROM users WHERE id = ?').get(p.reviewer_id)?.name : null;
  const j = jurisdictionFor(p.state);

  const doc = new PDFDocument({ size: 'A4', margins: { top: 64, bottom: 64, left: 56, right: 56 }, bufferPages: true, info: { Title: `Due diligence report: ${p.name}`, Author: 'LandVerify' } });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);
  const W = doc.page.width - 112;

  const room = (n) => { if (doc.y + n > doc.page.height - 70) doc.addPage(); };
  const h1 = (t) => { room(60); doc.moveDown(1.2).font('Helvetica-Bold').fontSize(14).fillColor(INK).text(t); doc.moveTo(56, doc.y + 3).lineTo(56 + W, doc.y + 3).strokeColor(RULE).lineWidth(0.6).stroke(); doc.moveDown(0.7); };
  const h2 = (t) => { room(40); doc.moveDown(0.5).font('Helvetica-Bold').fontSize(10.5).fillColor(INK).text(t); doc.moveDown(0.2); };
  const body = (t, o = {}) => { room(30); doc.font('Helvetica').fontSize(9.5).fillColor(o.color || INK).text(t, { lineGap: 2, ...o }); };
  const kv = (k, v) => { room(16); doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(k, 56, doc.y, { width: 150, continued: false }); const y = doc.y - 11; doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(v || 'Not recorded', 210, y, { width: W - 154 }); doc.x = 56; doc.moveDown(0.15); };

  // Header
  doc.font('Helvetica-Bold').fontSize(11).fillColor(BLUE).text('LandVerify');
  doc.moveDown(2.2).font('Helvetica-Bold').fontSize(24).fillColor(INK).text('Due diligence report', { lineGap: 2 });
  doc.font('Helvetica').fontSize(13).fillColor(INK).text(p.name);
  doc.moveDown(0.3).font('Courier').fontSize(9).fillColor(MUTED).text(`Property ID ${p.id}   Report ${reportId}`);
  doc.font('Helvetica').fontSize(9).text(`Generated ${d(generatedAt)} by ${generatedBy.name}`);
  doc.moveDown(1);

  if (p.is_demo) {
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#8a5a00').text('DEMONSTRATION DATA. This property and every record in it are fictional. Nothing here describes a real property or has been checked against any government record.');
    doc.moveDown(0.6);
  }

  // Read-first statement
  h1('How to read this report');
  body('This report records what was checked, what evidence was reviewed, and what remains uncertain. It is not a legal opinion, a certificate of title, a government approval or a registration. A completed checklist does not mean the title is clear.');
  doc.moveDown(0.3);
  const open = findings.filter((f) => ['open', 'in_review'].includes(f.status));
  const done = checks.filter((c) => c.status === 'completed').length;
  body(`Status at a glance: ${done} of ${checks.length} checks completed. ${open.length} unresolved finding${open.length === 1 ? '' : 's'}${open.length ? ` (${open.filter((f) => ['high', 'critical'].includes(f.severity)).length} high or critical)` : ''}. ${docs.length} document${docs.length === 1 ? '' : 's'} on file. Current workflow stage: ${p.stage}.`, { color: INK });

  // Property
  h1('1. Property identity (as supplied)');
  body('The details below were entered by a user. They have not been independently verified unless a check below says so.', { color: MUTED });
  doc.moveDown(0.3);
  kv('State', p.state); kv('District', p.district); kv('Tehsil', p.tehsil); kv('Village', p.village);
  for (const f of j.identifierFields) kv(f.label, p.identifiers?.[f.key]);
  kv('Claimed area', p.area_value != null ? `${p.area_value} ${p.area_unit || ''}`.trim() : null);
  kv('Property type', p.property_type); kv('Claimed owner', p.claimed_owner);
  kv('Boundary data', p.boundary_source === 'survey' ? 'Sourced from survey data' : 'Illustrative only. No boundary has been taken from an authoritative survey.');
  kv('Assigned reviewer', reviewer);

  // Scope
  h1('2. Scope of checks');
  body('Checks are grouped as below. Completion shows that work was recorded. The outcome shows what that work found. They are reported separately on purpose.', { color: MUTED });
  for (const c of CATEGORIES) {
    const list = checks.filter((x) => x.category === c.key);
    if (!list.length) continue;
    h2(c.label);
    for (const k of list) {
      room(58);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(k.title);
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(`${STATUS[k.status]}   |   ${OUTCOME[k.outcome]}`);
      if (k.source) doc.fillColor(INK).text(`Source: ${k.source}`);
      if (k.evidence) doc.fillColor(INK).text(`Evidence: ${k.evidence}`);
      if (k.reviewer_name) doc.fillColor(MUTED).text(`Recorded by: ${k.reviewer_name}`);
      if (k.next_action && k.status !== 'completed') doc.fillColor(BLUE).text(`Next step: ${k.next_action}`);
      doc.moveDown(0.4);
    }
  }

  // Evidence
  h1('3. Evidence reviewed');
  if (!docs.length) body('No documents have been added to this file.');
  for (const x of docs) {
    room(60);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(`${x.title}  (${x.doc_type})`);
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(`Document date: ${x.doc_date || 'not recorded'}   |   Version ${x.versions}   |   ${x.file_name ? 'File: ' + x.file_name : 'No file attached'}`);
    doc.fillColor(INK).text(`Verification: ${VERIFY[x.verification_status]}${x.verification_note ? '. ' + x.verification_note : ''}`);
    doc.fillColor(INK).text(`Extraction: ${x.extraction_status === 'completed' ? 'Entered fields reviewed by a person' : 'Fields entered or reviewed manually. Treat as preliminary'}`);
    doc.moveDown(0.4);
  }
  if (fields.length) {
    h2('Recorded fields (entered by users)');
    for (const f of fields) body(`${f.doc_title}: ${f.key} = ${f.value}${f.source_note ? '  [' + f.source_note + ']' : ''}  (${f.status})`, { color: INK });
  }

  // Findings
  h1('4. Findings');
  if (!findings.length) body('No findings have been recorded. This does not mean no issues exist. It means none have been entered.');
  for (const f of findings) {
    room(80);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(f.title);
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(`Severity: ${SEV[f.severity]}   |   Status: ${FSTATUS[f.status]}   |   Owner: ${f.owner_name || 'Unassigned'}`);
    doc.fillColor(INK).text(f.explanation || '');
    if (f.evidence) doc.fillColor(INK).text(`Evidence: ${f.evidence}`);
    if (f.source) doc.fillColor(MUTED).text(`Source: ${f.source}${f.source_date ? ', ' + f.source_date : ''}`);
    if (['open', 'in_review'].includes(f.status)) doc.fillColor(BLUE).text(`Next step: ${f.next_step}`);
    else doc.fillColor(INK).text(`Resolution: ${f.resolution_note || 'Not recorded'}`);
    doc.moveDown(0.5);
  }

  // Official-source records (UP Bhulekh / Bhunaksha), user-imported
  const landRecs = db.prepare(`SELECT r.*, u.name by_name, rv.name rv_name FROM land_records r LEFT JOIN users u ON u.id = r.imported_by LEFT JOIN users rv ON rv.id = r.reviewed_by WHERE r.property_id = ? ORDER BY r.portal, r.imported_at DESC`).all(p.id);
  const xrefs = db.prepare('SELECT * FROM crossrefs WHERE property_id = ? ORDER BY rowid').all(p.id);
  if (landRecs.length || xrefs.length) {
    h1('4b. Official-source records (user-imported)');
    body('UP Bhulekh and UP Bhunaksha were not queried by LandVerify. A person looked up each record on the official site and imported it. Everything below is user-imported material, pending validation. It is not live, certified or verified by a government service.', { color: MUTED });
    const PN = { bhulekh: 'UP Bhulekh (revenue record)', bhunaksha: 'UP Bhunaksha (cadastral map)' };
    for (const r of landRecs) {
      room(90);
      h2(`${PN[r.portal]}: ${r.status === 'imported' ? 'imported by a person' : r.status === 'not_found' ? 'record not found (reported by a person)' : 'portal unavailable (reported by a person)'}${r.currency === 'historical' && r.status === 'imported' ? ' [historical snapshot]' : ''}`);
      kv('Source', r.source_url);
      kv('Looked up on portal', r.retrieved_on_portal_at ? d(r.retrieved_on_portal_at) + ' (as stated by the importer)' : 'Date not stated');
      kv('Imported into LandVerify', `${d(r.imported_at)} by ${r.by_name || 'unknown'}`);
      kv('Changes made', r.transformation);
      if (r.reviewed_at) kv('Reviewed by a person', `${r.rv_name}, ${d(r.reviewed_at)}: ${r.review_note}`);
      if (r.note) kv('Note', r.note);
      for (const f of db.prepare('SELECT * FROM land_record_fields WHERE record_id = ? ORDER BY sort').all(r.id)) kv(f.label, `${f.value}${f.unit ? ' ' + f.unit : ''}${f.original_text ? '  [original: ' + f.original_text + ']' : ''}`);
    }
    if (xrefs.length) {
      h2('Comparison results');
      const CL = { match: 'Match', potential_discrepancy: 'Potential discrepancy', source_unavailable: 'Source unavailable', manual_review: 'Manual review required', not_matched: 'Record could not be matched', outdated: 'Outdated or cached data' };
      for (const x of xrefs) {
        room(60);
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(`${x.label}: ${CL[x.classification]}${x.reviewed_at ? ' (confirmed by a reviewer, not a legal conclusion)' : ''}`);
        doc.font('Helvetica').fontSize(9).fillColor(INK).text(x.summary || '');
        for (const v of JSON.parse(x.vals || '[]')) doc.fillColor(MUTED).text(`   ${v.label}: ${v.value}  [${v.source}]`);
        doc.moveDown(0.4);
      }
    }
  }

  // Reviews
  h1('5. Review history');
  body('Internal approvals record a team decision about its own workflow. They are not legal certification, government approval or registration.', { color: MUTED });
  doc.moveDown(0.3);
  if (!reviews.length) body('No review activity has been recorded.');
  for (const r of reviews) {
    const label = r.kind === 'decision' ? `Decision: ${DEC[r.decision] || r.decision}` : r.kind === 'stage_approval' ? `Internal stage approval: ${r.stage}` : r.kind.replace('_', ' ');
    body(`${d(r.created_at)}   ${r.author_name} (${r.author_role})   ${label}. ${r.body}`);
    doc.moveDown(0.15);
  }

  // Sources, limits, open questions
  h1('6. Sources consulted');
  const sources = new Set();
  checks.forEach((c) => c.source && sources.add(c.source));
  findings.forEach((f) => f.source && sources.add(f.source));
  if (sources.size) for (const s of sources) body(`- ${s}`); else body('No sources have been recorded.');
  doc.moveDown(0.3);
  const integ = j.integrations.length ? j.integrations.map((i) => `${i.name} (${i.status === 'not_configured' ? 'not configured' : i.status})`).join('; ') : 'None configured for this state';
  body(`Government data integrations: ${integ}. LandVerify has not queried any government system for this report. Any source check above was performed and recorded by a person.`);

  h1('7. Limitations');
  for (const t of [
    'Information in this report was supplied or entered by users. Document fields are entered manually and are preliminary until verified against an authoritative source.',
    'No automated extraction, government lookup or registration action was performed by LandVerify for this report. Official-source records, where present, were looked up and imported by a person and are pending validation.',
    'Cadastral maps may contain inaccuracies. A technical match between records is not a legal conclusion.',
    'Area units, record names and procedures differ across states and districts. No unit conversion has been applied.',
    'This report does not assess stamp duty, registration eligibility or the legal validity of any document.',
    'A legal professional should review the evidence before any transaction proceeds.',
  ]) body(`- ${t}`);

  h1('8. Unresolved questions');
  const q = [
    ...open.map((f) => `${f.title} (${SEV[f.severity]}). ${f.next_step}`),
    ...checks.filter((c) => c.status !== 'completed').map((c) => `${c.title}: ${STATUS[c.status].toLowerCase()}.`),
    ...checks.filter((c) => c.status === 'completed' && ['inconclusive', 'issue_found'].includes(c.outcome)).map((c) => `${c.title}: ${OUTCOME[c.outcome].toLowerCase()}.`),
  ];
  if (!q.length) body('None recorded. This does not replace professional review.'); else for (const t of q) body(`- ${t}`);

  // Footer on every page
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(8).fillColor(MUTED);
    doc.text(`LandVerify   ${p.id}   Not a legal opinion or certificate of title`, 56, doc.page.height - 44, { width: W - 60, lineBreak: false });
    doc.text(`${i + 1} / ${range.count}`, 56 + W - 50, doc.page.height - 44, { width: 50, align: 'right', lineBreak: false });
  }
  doc.end();
  return new Promise((resolve, reject) => { stream.on('finish', resolve); stream.on('error', reject); });
}
