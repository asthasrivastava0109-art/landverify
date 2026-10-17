import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { db, now, uid, propertyId, audit, tx, UPLOAD_DIR, REPORT_DIR } from './db.js';
import { JURISDICTIONS, CATEGORIES, checkTemplate, jurisdictionFor } from './jurisdictions.js';
import { seedDemo } from './demo.js';
import { buildReport } from './report.js';
import registerLand from './land.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

/* ---------- helpers ---------- */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const ROLES = ['admin', 'reviewer', 'member', 'viewer'];
const WRITERS = ['admin', 'reviewer', 'member'];
const REVIEWERS = ['admin', 'reviewer'];

function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run(sha(token), userId, expires);
  res.cookie('lv_session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 * 14, path: '/' });
}

function auth(req, res, next) {
  const token = req.cookies?.lv_session;
  if (!token) return bad(res, 'Sign in to continue.', 401);
  const row = db.prepare(`SELECT u.id, u.org_id, u.email, u.name, u.role, u.title, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`).get(sha(token));
  if (!row || row.expires_at < now()) return bad(res, 'Your session has ended. Sign in again.', 401);
  req.user = row;
  next();
}
const need = (roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : bad(res, 'Your role does not allow this action.', 403);

function getProperty(req, res) {
  const p = db.prepare('SELECT * FROM properties WHERE id = ? AND org_id = ?').get(req.params.pid || req.params.id, req.user.org_id);
  if (!p) { bad(res, 'Property not found.', 404); return null; }
  return p;
}
const touch = (pid) => db.prepare('UPDATE properties SET updated_at = ? WHERE id = ?').run(now(), pid);
const parseProp = (p) => ({ ...p, identifiers: JSON.parse(p.identifiers || '{}'), is_demo: !!p.is_demo });

/* ---------- auth with simple login throttling ---------- */
const attempts = new Map();
function throttled(key) {
  const a = attempts.get(key) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 15 * 60 * 1000) { a.n = 0; a.t = Date.now(); }
  attempts.set(key, a);
  return a.n >= 8;
}
const fail = (key) => { const a = attempts.get(key); if (a) a.n++; };

app.post('/api/auth/signup', wrap((req, res) => {
  const email = str(req.body.email, 200).toLowerCase();
  const name = str(req.body.name, 120);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const orgName = str(req.body.orgName, 120) || `${name}'s workspace`;
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad(res, 'Enter your name and a valid email address.');
  if (password.length < 10) return bad(res, 'Use a password of at least 10 characters.');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return bad(res, 'An account with this email already exists. Sign in instead.', 409);
  const salt = crypto.randomBytes(16).toString('hex');
  const orgId = uid('org_'), userId = uid('usr_');
  tx(() => {
    db.prepare('INSERT INTO orgs (id, name, created_at) VALUES (?,?,?)').run(orgId, orgName, now());
    db.prepare('INSERT INTO users (id, org_id, email, name, role, title, salt, pass_hash, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(userId, orgId, email, name, 'admin', str(req.body.title, 80) || 'Workspace owner', salt, hash(password, salt), now());
    audit(orgId, null, userId, 'workspace.created', orgName);
  });
  startSession(res, userId);
  res.status(201).json({ ok: true });
}));

app.post('/api/auth/login', wrap((req, res) => {
  const email = str(req.body.email, 200).toLowerCase();
  const key = `${req.ip}|${email}`;
  if (throttled(key)) return bad(res, 'Too many attempts. Wait a few minutes and try again.', 429);
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const pw = typeof req.body.password === 'string' ? req.body.password : '';
  const ok = u && crypto.timingSafeEqual(Buffer.from(hash(pw, u.salt), 'hex'), Buffer.from(u.pass_hash, 'hex'));
  if (!ok) { fail(key); return bad(res, 'Email or password is not correct.', 401); }
  startSession(res, u.id);
  audit(u.org_id, null, u.id, 'auth.login', null);
  res.json({ ok: true });
}));

app.post('/api/auth/logout', wrap((req, res) => {
  const t = req.cookies?.lv_session;
  if (t) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(t));
  res.clearCookie('lv_session', { path: '/' });
  res.json({ ok: true });
}));

app.get('/api/me', auth, (req, res) => {
  const org = db.prepare('SELECT id, name FROM orgs WHERE id = ?').get(req.user.org_id);
  const { expires_at, ...user } = req.user;
  res.json({ user, org });
});

app.get('/api/config', auth, (req, res) => {
  res.json({ categories: CATEGORIES, jurisdictions: Object.values(JURISDICTIONS).map(({ checkOverrides, ...j }) => j) });
});

/* ---------- team ---------- */
app.get('/api/team', auth, (req, res) => {
  res.json(db.prepare('SELECT id, name, email, role, title, created_at FROM users WHERE org_id = ? ORDER BY created_at').all(req.user.org_id));
});
app.post('/api/team', auth, need(['admin']), wrap((req, res) => {
  const email = str(req.body.email, 200).toLowerCase(), name = str(req.body.name, 120);
  const role = ROLES.includes(req.body.role) ? req.body.role : 'viewer';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad(res, 'Enter a name and a valid email address.');
  if (password.length < 10) return bad(res, 'Set a temporary password of at least 10 characters and share it privately.');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return bad(res, 'That email already has an account.', 409);
  const salt = crypto.randomBytes(16).toString('hex'), id = uid('usr_');
  db.prepare('INSERT INTO users (id, org_id, email, name, role, title, salt, pass_hash, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, req.user.org_id, email, name, role, str(req.body.title, 80) || null, salt, hash(password, salt), now());
  audit(req.user.org_id, null, req.user.id, 'team.member_added', `${name} added as ${role}`);
  res.status(201).json({ id });
}));
app.patch('/api/team/:id', auth, need(['admin']), wrap((req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!u) return bad(res, 'Team member not found.', 404);
  if (!ROLES.includes(req.body.role)) return bad(res, 'Choose a valid role.');
  if (u.id === req.user.id && req.body.role !== 'admin') return bad(res, 'You cannot remove your own admin access.');
  db.prepare('UPDATE users SET role = ?, title = COALESCE(?, title) WHERE id = ?').run(req.body.role, str(req.body.title, 80) || null, u.id);
  audit(req.user.org_id, null, req.user.id, 'team.role_changed', `${u.name}: ${u.role} to ${req.body.role}`);
  res.json({ ok: true });
}));

/* ---------- properties ---------- */
function propertySummary(p) {
  const docs = db.prepare('SELECT COUNT(*) n FROM documents d WHERE property_id = ? AND version = (SELECT MAX(version) FROM documents WHERE group_id = d.group_id)').get(p.id).n;
  const checks = db.prepare(`SELECT COUNT(*) total, SUM(status='completed') done FROM checks WHERE property_id = ?`).get(p.id);
  const open = db.prepare(`SELECT SUM(status IN ('open','in_review')) open_n, SUM(status IN ('open','in_review') AND severity IN ('high','critical')) high_n FROM findings WHERE property_id = ?`).get(p.id);
  const reviewer = p.reviewer_id ? db.prepare('SELECT name FROM users WHERE id = ?').get(p.reviewer_id)?.name : null;
  return { documents: docs, checks_total: checks.total || 0, checks_done: checks.done || 0, open_findings: open.open_n || 0, high_findings: open.high_n || 0, reviewer_name: reviewer };
}

app.get('/api/properties', auth, (req, res) => {
  const q = `%${str(req.query.q, 100).toLowerCase()}%`;
  const rows = db.prepare(`SELECT * FROM properties WHERE org_id = ? AND (lower(name) LIKE ? OR lower(id) LIKE ? OR lower(village) LIKE ? OR lower(district) LIKE ? OR lower(claimed_owner) LIKE ?) ORDER BY updated_at DESC`)
    .all(req.user.org_id, q, q, q, q, q);
  const stage = str(req.query.stage, 40), state = str(req.query.state, 80), attention = req.query.attention === '1';
  let out = rows.map((p) => ({ ...parseProp(p), ...propertySummary(p) }));
  if (stage) out = out.filter((p) => p.stage === stage);
  if (state) out = out.filter((p) => p.state === state);
  if (attention) out = out.filter((p) => p.high_findings > 0);
  res.json(out);
});

app.post('/api/properties', auth, need(WRITERS), wrap((req, res) => {
  const b = req.body;
  const name = str(b.name, 160), state = str(b.state, 80);
  if (!name) return bad(res, 'Give the property a name you will recognise.');
  if (!state) return bad(res, 'Choose the state. It decides which terminology and checks apply.');
  const area = b.area_value === '' || b.area_value == null ? null : Number(b.area_value);
  if (area !== null && (!Number.isFinite(area) || area < 0)) return bad(res, 'Enter the claimed area as a positive number.');
  const id = propertyId(), t = now();
  tx(() => {
    db.prepare(`INSERT INTO properties (id, org_id, name, state, district, tehsil, village, identifiers, area_value, area_unit, property_type, claimed_owner, reviewer_id, created_by, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, req.user.org_id, name, state, str(b.district, 100), str(b.tehsil, 100), str(b.village, 100),
      JSON.stringify(Object(b.identifiers) === b.identifiers ? Object.fromEntries(Object.entries(b.identifiers).map(([k, v]) => [k.slice(0, 40), str(String(v), 80)])) : {}),
      area, str(b.area_unit, 30), str(b.property_type, 60), str(b.claimed_owner, 200), null, req.user.id, t, t);
    checkTemplate(state).forEach((c, i) =>
      db.prepare('INSERT INTO checks (id, property_id, category, title, description, sort, updated_at) VALUES (?,?,?,?,?,?,?)').run(uid('chk_'), id, c.category, c.title, c.description, i, t));
    audit(req.user.org_id, id, req.user.id, 'property.created', name);
  });
  res.status(201).json({ id });
}));

app.post('/api/demo', auth, need(WRITERS), wrap((req, res) => res.status(201).json({ id: seedDemo(req.user.org_id, req.user.id) })));

app.get('/api/properties/:id', auth, (req, res) => {
  const p = getProperty(req, res); if (!p) return;
  res.json({ ...parseProp(p), ...propertySummary(p), jurisdiction: (({ checkOverrides, ...j }) => j)(jurisdictionFor(p.state)) });
});

app.patch('/api/properties/:id', auth, need(WRITERS), wrap((req, res) => {
  const p = getProperty(req, res); if (!p) return;
  const b = req.body, changes = [];
  const set = (col, val) => { db.prepare(`UPDATE properties SET ${col} = ? WHERE id = ?`).run(val, p.id); changes.push(col); };
  for (const col of ['name', 'district', 'tehsil', 'village', 'property_type', 'claimed_owner', 'area_unit']) if (col in b) set(col, str(b[col], 200));
  if ('area_value' in b) { const n = b.area_value === '' || b.area_value === null ? null : Number(b.area_value); if (n !== null && (!Number.isFinite(n) || n < 0)) return bad(res, 'Enter the claimed area as a positive number.'); set('area_value', n); }
  if ('identifiers' in b && Object(b.identifiers) === b.identifiers) set('identifiers', JSON.stringify(Object.fromEntries(Object.entries(b.identifiers).map(([k, v]) => [k.slice(0, 40), str(String(v), 80)]))));
  if ('reviewer_id' in b) {
    if (!REVIEWERS.includes(req.user.role)) return bad(res, 'Only a reviewer or admin can assign the reviewer.', 403);
    if (b.reviewer_id && !db.prepare('SELECT 1 FROM users WHERE id = ? AND org_id = ?').get(b.reviewer_id, req.user.org_id)) return bad(res, 'Choose someone from your team.');
    set('reviewer_id', b.reviewer_id || null);
  }
  touch(p.id);
  if (changes.length) audit(req.user.org_id, p.id, req.user.id, 'property.updated', `Changed: ${changes.join(', ')}`);
  res.json({ ok: true });
}));

app.delete('/api/properties/:id', auth, need(['admin']), wrap((req, res) => {
  const p = getProperty(req, res); if (!p) return;
  const files = db.prepare('SELECT stored_name FROM documents WHERE property_id = ? AND stored_name IS NOT NULL').all(p.id);
  const reps = db.prepare('SELECT stored_name FROM reports WHERE property_id = ?').all(p.id);
  tx(() => { db.prepare('DELETE FROM properties WHERE id = ?').run(p.id); audit(req.user.org_id, null, req.user.id, 'property.deleted', `${p.name} (${p.id})`); });
  for (const f of files) fs.rmSync(path.join(UPLOAD_DIR, f.stored_name), { force: true });
  for (const f of reps) fs.rmSync(path.join(REPORT_DIR, f.stored_name), { force: true });
  res.json({ ok: true });
}));

/* ---------- documents (private storage) ---------- */
const ALLOWED = { 'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/tiff': '.tif' };
const upload = multer({
  storage: multer.diskStorage({ destination: UPLOAD_DIR, filename: (r, f, cb) => cb(null, crypto.randomUUID()) }),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (r, f, cb) => (ALLOWED[f.mimetype] ? cb(null, true) : cb(new Error('Upload a PDF, PNG, JPG or TIFF file.'))),
});
const DOC_TYPES = ['Sale deed', 'Gift deed', 'Will', 'Power of attorney', 'Khatauni / Record of Rights', 'Jamabandi', 'Khasra / Gata extract', 'Mutation order', 'Survey sketch / map', 'Encumbrance certificate', 'Land-use certificate', 'Tax receipt', 'Court order', 'Identity document', 'Other'];

app.get('/api/properties/:pid/documents', auth, (req, res) => {
  const p = getProperty(req, res); if (!p) return;
  const rows = db.prepare(`SELECT d.*, u.name uploaded_by_name, (SELECT COUNT(*) FROM documents x WHERE x.group_id = d.group_id) versions
    FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by WHERE d.property_id = ? AND d.version = (SELECT MAX(version) FROM documents WHERE group_id = d.group_id) ORDER BY d.created_at DESC`).all(p.id);
  res.json(rows.map(({ stored_name, ...d }) => ({ ...d, has_file: !!stored_name })));
});

app.get('/api/documents', auth, (req, res) => {
  const rows = db.prepare(`SELECT d.id, d.title, d.doc_type, d.file_name, d.extraction_status, d.verification_status, d.created_at, d.property_id, p.name property_name
    FROM documents d JOIN properties p ON p.id = d.property_id WHERE d.org_id = ? AND d.version = (SELECT MAX(version) FROM documents WHERE group_id = d.group_id) ORDER BY d.created_at DESC LIMIT 200`).all(req.user.org_id);
  res.json(rows);
});

app.post('/api/properties/:pid/documents', auth, need(WRITERS), (req, res, next) => {
  upload.single('file')(req, res, (err) => (err ? bad(res, err.code === 'LIMIT_FILE_SIZE' ? 'That file is over 25 MB. Upload a smaller scan.' : err.message) : next()));
}, wrap((req, res) => {
  const p = getProperty(req, res);
  if (!p) { if (req.file) fs.rmSync(req.file.path, { force: true }); return; }
  if (!req.file) return bad(res, 'Choose a file to upload.');
  const type = DOC_TYPES.includes(req.body.doc_type) ? req.body.doc_type : 'Other';
  const id = uid('doc_'), t = now();
  const title = str(req.body.title, 160) || type;
  db.prepare(`INSERT INTO documents (id, org_id, property_id, group_id, version, doc_type, title, file_name, stored_name, mime, size, doc_date, parties, identifiers,
    extraction_status, verification_status, uploaded_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, req.user.org_id, p.id, id, 1, type, title, path.basename(req.file.originalname).slice(0, 200), path.basename(req.file.path), req.file.mimetype, req.file.size,
      str(req.body.doc_date, 20), str(req.body.parties, 300), str(req.body.identifiers, 200), 'manual_review', 'supplied', req.user.id, t);
  touch(p.id);
  audit(req.user.org_id, p.id, req.user.id, 'document.uploaded', `${title} (${req.file.originalname})`);
  res.status(201).json({ id });
}));

function getDoc(req, res) {
  const d = db.prepare('SELECT * FROM documents WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!d) { bad(res, 'Document not found.', 404); return null; }
  return d;
}

app.post('/api/documents/:id/versions', auth, need(WRITERS), (req, res, next) => {
  upload.single('file')(req, res, (err) => (err ? bad(res, err.message) : next()));
}, wrap((req, res) => {
  const d = getDoc(req, res);
  if (!d) { if (req.file) fs.rmSync(req.file.path, { force: true }); return; }
  if (!req.file) return bad(res, 'Choose a file to upload.');
  const latest = db.prepare('SELECT MAX(version) v FROM documents WHERE group_id = ?').get(d.group_id).v;
  const id = uid('doc_');
  db.prepare(`INSERT INTO documents (id, org_id, property_id, group_id, version, doc_type, title, file_name, stored_name, mime, size, doc_date, parties, identifiers,
    extraction_status, verification_status, uploaded_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, d.org_id, d.property_id, d.group_id, latest + 1, d.doc_type, d.title, path.basename(req.file.originalname).slice(0, 200), path.basename(req.file.path), req.file.mimetype, req.file.size,
      d.doc_date, d.parties, d.identifiers, 'manual_review', 'supplied', req.user.id, now());
  touch(d.property_id);
  audit(req.user.org_id, d.property_id, req.user.id, 'document.version_added', `${d.title}: version ${latest + 1}. Earlier versions are kept.`);
  res.status(201).json({ id });
}));

app.get('/api/documents/:id', auth, (req, res) => {
  const d = getDoc(req, res); if (!d) return;
  const { stored_name, ...doc } = d;
  const fields = db.prepare('SELECT f.*, u.name updated_by_name FROM fields f LEFT JOIN users u ON u.id = f.updated_by WHERE document_id = ? ORDER BY updated_at').all(d.id);
  const versions = db.prepare('SELECT id, version, file_name, created_at, uploaded_by FROM documents WHERE group_id = ? ORDER BY version DESC').all(d.group_id);
  // Plain-language cross-document comparison. A difference is flagged for review, never labelled as fraud.
  const flags = [];
  for (const f of fields) {
    const others = db.prepare(`SELECT f2.value, d2.title FROM fields f2 JOIN documents d2 ON d2.id = f2.document_id
      WHERE d2.property_id = ? AND d2.group_id != ? AND lower(f2.key) = lower(?) AND d2.version = (SELECT MAX(version) FROM documents WHERE group_id = d2.group_id)`).all(d.property_id, d.group_id, f.key);
    for (const o of others) if (o.value.trim().toLowerCase() !== f.value.trim().toLowerCase())
      flags.push({ key: f.key, this_value: f.value, other_value: o.value, other_title: o.title });
  }
  res.json({ ...doc, has_file: !!stored_name, fields, versions, flags });
});

app.get('/api/documents/:id/file', auth, (req, res) => {
  const d = getDoc(req, res); if (!d) return;
  if (!d.stored_name) return bad(res, 'This record has no file attached.', 404);
  const full = path.join(UPLOAD_DIR, path.basename(d.stored_name));
  if (!fs.existsSync(full)) return bad(res, 'The stored file could not be found.', 404);
  audit(req.user.org_id, d.property_id, req.user.id, 'document.viewed', d.title);
  res.setHeader('Content-Type', d.mime);
  res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(d.file_name || 'document')}`);
  if (d.mime !== 'application/pdf') res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Cache-Control', 'private, no-store');
  fs.createReadStream(full).pipe(res);
});

app.patch('/api/documents/:id', auth, need(WRITERS), wrap((req, res) => {
  const d = getDoc(req, res); if (!d) return;
  const b = req.body;
  for (const col of ['title', 'doc_date', 'parties', 'identifiers']) if (col in b) db.prepare(`UPDATE documents SET ${col} = ? WHERE id = ?`).run(str(b[col], 300), d.id);
  if (DOC_TYPES.includes(b.doc_type)) db.prepare('UPDATE documents SET doc_type = ? WHERE id = ?').run(b.doc_type, d.id);
  if (['processing', 'completed', 'failed', 'manual_review'].includes(b.extraction_status)) {
    // Extraction can only be marked completed by a person who has reviewed the entered fields.
    db.prepare('UPDATE documents SET extraction_status = ? WHERE id = ?').run(b.extraction_status, d.id);
    audit(req.user.org_id, d.property_id, req.user.id, 'document.extraction_status', `${d.title}: ${b.extraction_status}`);
  }
  if (b.verification_status) {
    if (!['supplied', 'checked_source', 'professionally_reviewed', 'discrepancy'].includes(b.verification_status)) return bad(res, 'Choose a valid verification status.');
    if (b.verification_status === 'professionally_reviewed' && !REVIEWERS.includes(req.user.role)) return bad(res, 'Only a reviewer or admin can record a professional review.', 403);
    const note = str(b.verification_note, 500);
    if (b.verification_status === 'checked_source' && !note) return bad(res, 'Record which source you checked against, and when.');
    db.prepare('UPDATE documents SET verification_status = ?, verification_note = ? WHERE id = ?').run(b.verification_status, note || null, d.id);
    audit(req.user.org_id, d.property_id, req.user.id, 'document.verification_changed', `${d.title}: ${d.verification_status} to ${b.verification_status}. ${note}`);
  }
  touch(d.property_id);
  res.json({ ok: true });
}));

app.post('/api/documents/:id/fields', auth, need(WRITERS), wrap((req, res) => {
  const d = getDoc(req, res); if (!d) return;
  const key = str(req.body.key, 80), value = str(req.body.value, 500);
  if (!key || !value) return bad(res, 'Enter both a field name and its value.');
  const id = uid('fld_');
  db.prepare('INSERT INTO fields (id, document_id, key, value, source_note, origin, status, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, d.id, key, value, str(req.body.source_note, 200), 'entered_by_user', 'unconfirmed', req.user.id, now());
  audit(req.user.org_id, d.property_id, req.user.id, 'field.added', `${d.title}: ${key}`);
  res.status(201).json({ id });
}));
app.patch('/api/fields/:id', auth, need(WRITERS), wrap((req, res) => {
  const f = db.prepare(`SELECT f.*, d.org_id, d.property_id, d.title FROM fields f JOIN documents d ON d.id = f.document_id WHERE f.id = ?`).get(req.params.id);
  if (!f || f.org_id !== req.user.org_id) return bad(res, 'Field not found.', 404);
  const value = 'value' in req.body ? str(req.body.value, 500) : f.value;
  const status = req.body.status === 'confirmed' ? 'confirmed' : ('value' in req.body && value !== f.value ? 'corrected' : f.status);
  db.prepare('UPDATE fields SET value = ?, source_note = ?, status = ?, updated_by = ?, updated_at = ? WHERE id = ?')
    .run(value, 'source_note' in req.body ? str(req.body.source_note, 200) : f.source_note, status, req.user.id, now(), f.id);
  audit(req.user.org_id, f.property_id, req.user.id, 'field.updated', `${f.title}: ${f.key} (${f.value} to ${value}, ${status})`);
  res.json({ ok: true });
}));
app.delete('/api/fields/:id', auth, need(WRITERS), wrap((req, res) => {
  const f = db.prepare(`SELECT f.*, d.org_id, d.property_id, d.title FROM fields f JOIN documents d ON d.id = f.document_id WHERE f.id = ?`).get(req.params.id);
  if (!f || f.org_id !== req.user.org_id) return bad(res, 'Field not found.', 404);
  db.prepare('DELETE FROM fields WHERE id = ?').run(f.id);
  audit(req.user.org_id, f.property_id, req.user.id, 'field.removed', `${f.title}: ${f.key}`);
  res.json({ ok: true });
}));

/* ---------- checks ---------- */
app.get('/api/properties/:pid/checks', auth, (req, res) => {
  const p = getProperty(req, res); if (!p) return;
  res.json(db.prepare(`SELECT c.*, u.name reviewer_name FROM checks c LEFT JOIN users u ON u.id = c.reviewer_id WHERE property_id = ? ORDER BY sort`).all(p.id));
});
app.post('/api/properties/:pid/checks', auth, need(WRITERS), wrap((req, res) => {
  const p = getProperty(req, res); if (!p) return;
  if (!CATEGORIES.some((c) => c.key === req.body.category)) return bad(res, 'Choose a check group.');
  const title = str(req.body.title, 200); if (!title) return bad(res, 'Describe the check.');
  const id = uid('chk_');
  db.prepare('INSERT INTO checks (id, property_id, category, title, description, sort, updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, p.id, req.body.category, title, str(req.body.description, 500), 1000 + Date.now() % 100000, now());
  audit(req.user.org_id, p.id, req.user.id, 'check.added', title);
  res.status(201).json({ id });
}));
app.patch('/api/checks/:id', auth, need(WRITERS), wrap((req, res) => {
  const c = db.prepare(`SELECT c.*, p.org_id FROM checks c JOIN properties p ON p.id = c.property_id WHERE c.id = ?`).get(req.params.id);
  if (!c || c.org_id !== req.user.org_id) return bad(res, 'Check not found.', 404);
  const b = req.body;
  const status = ['not_started', 'in_progress', 'needs_evidence', 'completed'].includes(b.status) ? b.status : c.status;
  const outcome = ['none', 'no_issue_found', 'issue_found', 'inconclusive'].includes(b.outcome) ? b.outcome : c.outcome;
  const source = 'source' in b ? str(b.source, 300) : c.source;
  const evidence = 'evidence' in b ? str(b.evidence, 1500) : c.evidence;
  if (status === 'completed' && (!source || !evidence)) return bad(res, 'Record the source and the evidence before marking a check completed.');
  if (status === 'completed' && outcome === 'none') return bad(res, 'Record what the check found: no issue found, issue found, or inconclusive.');
  let reviewer = 'reviewer_id' in b ? (b.reviewer_id || null) : c.reviewer_id;
  if (reviewer && !db.prepare('SELECT 1 FROM users WHERE id = ? AND org_id = ?').get(reviewer, req.user.org_id)) return bad(res, 'Choose someone from your team.');
  db.prepare('UPDATE checks SET status=?, outcome=?, source=?, evidence=?, next_action=?, reviewer_id=?, updated_at=? WHERE id=?')
    .run(status, outcome, source, evidence, 'next_action' in b ? str(b.next_action, 500) : c.next_action, reviewer, now(), c.id);
  touch(c.property_id);
  const why = [status !== c.status && `status ${c.status} to ${status}`, outcome !== c.outcome && `outcome ${c.outcome} to ${outcome}`, reviewer !== c.reviewer_id && 'reviewer changed'].filter(Boolean).join(', ');
  audit(req.user.org_id, c.property_id, req.user.id, 'check.updated', `${c.title}${why ? ': ' + why : ''}`);
  res.json({ ok: true });
}));

/* ---------- findings ---------- */
app.get('/api/properties/:pid/findings', auth, (req, res) => {
  const p = getProperty(req, res); if (!p) return;
  res.json(db.prepare(`SELECT f.*, u.name owner_name, d.title document_title, c.title check_title FROM findings f LEFT JOIN users u ON u.id = f.owner_id
    LEFT JOIN documents d ON d.id = f.document_id LEFT JOIN checks c ON c.id = f.check_id WHERE f.property_id = ?
    ORDER BY CASE f.status WHEN 'open' THEN 0 WHEN 'in_review' THEN 1 ELSE 2 END, CASE f.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, f.created_at DESC`).all(p.id));
});
app.post('/api/properties/:pid/findings', auth, need(WRITERS), wrap((req, res) => {
  const p = getProperty(req, res); if (!p) return;
  const b = req.body, title = str(b.title, 200);
  if (!title) return bad(res, 'Give the finding a short title.');
  if (!['low', 'medium', 'high', 'critical'].includes(b.severity)) return bad(res, 'Choose a severity.');
  if (!str(b.explanation, 2000)) return bad(res, 'Explain the issue in plain language.');
  if (!str(b.next_step, 500)) return bad(res, 'Say what should happen next.');
  const own = (table, id) => (id && db.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND ${table === 'documents' ? 'org_id' : 'property_id'} = ?`).get(id, table === 'documents' ? req.user.org_id : p.id)) ? id : null;
  const owner = b.owner_id && db.prepare('SELECT 1 FROM users WHERE id = ? AND org_id = ?').get(b.owner_id, req.user.org_id) ? b.owner_id : null;
  const id = uid('fnd_'), t = now();
  db.prepare(`INSERT INTO findings (id, property_id, check_id, title, explanation, severity, evidence, document_id, source, source_date, owner_id, next_step, status, created_by, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, p.id, own('checks', b.check_id), title, str(b.explanation, 2000), b.severity, str(b.evidence, 1500), own('documents', b.document_id),
    str(b.source, 300), str(b.source_date, 20), owner, str(b.next_step, 500), 'open', req.user.id, t, t);
  touch(p.id);
  audit(req.user.org_id, p.id, req.user.id, 'finding.created', `${title} (${b.severity})`);
  res.status(201).json({ id });
}));
app.patch('/api/findings/:id', auth, need(WRITERS), wrap((req, res) => {
  const f = db.prepare(`SELECT f.*, p.org_id FROM findings f JOIN properties p ON p.id = f.property_id WHERE f.id = ?`).get(req.params.id);
  if (!f || f.org_id !== req.user.org_id) return bad(res, 'Finding not found.', 404);
  const b = req.body;
  const status = ['open', 'in_review', 'resolved', 'accepted'].includes(b.status) ? b.status : f.status;
  const note = 'resolution_note' in b ? str(b.resolution_note, 1000) : f.resolution_note;
  if (['resolved', 'accepted'].includes(status) && status !== f.status) {
    if (!note) return bad(res, 'Record why this finding is resolved, so the reason is visible later.');
    if (status === 'accepted' && !REVIEWERS.includes(req.user.role)) return bad(res, 'Only a reviewer or admin can accept a risk.', 403);
  }
  const severity = ['low', 'medium', 'high', 'critical'].includes(b.severity) ? b.severity : f.severity;
  const owner = 'owner_id' in b ? (b.owner_id && db.prepare('SELECT 1 FROM users WHERE id = ? AND org_id = ?').get(b.owner_id, req.user.org_id) ? b.owner_id : null) : f.owner_id;
  db.prepare('UPDATE findings SET status=?, resolution_note=?, severity=?, owner_id=?, next_step=?, explanation=?, evidence=?, updated_at=? WHERE id=?')
    .run(status, note, severity, owner, 'next_step' in b ? str(b.next_step, 500) : f.next_step, 'explanation' in b ? str(b.explanation, 2000) : f.explanation, 'evidence' in b ? str(b.evidence, 1500) : f.evidence, now(), f.id);
  touch(f.property_id);
  const why = [status !== f.status && `status ${f.status} to ${status}`, severity !== f.severity && `severity ${f.severity} to ${severity}`, note && status !== f.status ? `Reason: ${note}` : ''].filter(Boolean).join('. ');
  audit(req.user.org_id, f.property_id, req.user.id, 'finding.updated', `${f.title}${why ? ': ' + why : ''}`);
  res.json({ ok: true });
}));

/* ---------- reviews ---------- */
const STAGES = ['Documents collected', 'Checks completed', 'Ready for legal review', 'Internal approval'];
app.get('/api/properties/:pid/reviews', auth, (req, res) => {
  const p = getProperty(req, res); if (!p) return;
  res.json(db.prepare(`SELECT r.*, u.name author_name, u.role author_role, a.name assignee_name FROM reviews r JOIN users u ON u.id = r.author_id LEFT JOIN users a ON a.id = r.assignee_id WHERE property_id = ? ORDER BY r.created_at DESC`).all(p.id));
});
app.post('/api/properties/:pid/reviews', auth, wrap((req, res) => {
  const p = getProperty(req, res); if (!p) return;
  const b = req.body, kind = b.kind, body = str(b.body, 2000);
  if (!['comment', 'evidence_request', 'decision', 'correction_request', 'stage_approval'].includes(kind)) return bad(res, 'Choose what you want to record.');
  if (req.user.role === 'viewer' && kind !== 'comment') return bad(res, 'Your role can comment but not record decisions.', 403);
  if (['decision', 'stage_approval'].includes(kind) && !REVIEWERS.includes(req.user.role)) return bad(res, 'Only a reviewer or admin can record decisions and approvals.', 403);
  if (!body) return bad(res, 'Write a short note so others can see the reason.');
  let decision = null, stage = null;
  if (kind === 'decision') { decision = ['proceed', 'proceed_with_conditions', 'hold', 'decline'].includes(b.decision) ? b.decision : null; if (!decision) return bad(res, 'Choose a decision.'); }
  if (kind === 'stage_approval') { stage = STAGES.includes(b.stage) ? b.stage : null; if (!stage) return bad(res, 'Choose a stage.'); }
  const assignee = b.assignee_id && db.prepare('SELECT 1 FROM users WHERE id = ? AND org_id = ?').get(b.assignee_id, req.user.org_id) ? b.assignee_id : null;
  const id = uid('rev_');
  tx(() => {
    db.prepare('INSERT INTO reviews (id, property_id, kind, target_type, target_id, body, decision, stage, assignee_id, author_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, p.id, kind, str(b.target_type, 20) || null, str(b.target_id, 40) || null, body, decision, stage, assignee, req.user.id, now());
    if (kind === 'stage_approval') db.prepare('UPDATE properties SET stage = ? WHERE id = ?').run(stage, p.id);
    touch(p.id);
    audit(req.user.org_id, p.id, req.user.id, `review.${kind}`, `${stage || decision || ''} ${body}`.trim());
  });
  res.status(201).json({ id });
}));
app.patch('/api/reviews/:id', auth, need(WRITERS), wrap((req, res) => {
  const r = db.prepare(`SELECT r.*, p.org_id FROM reviews r JOIN properties p ON p.id = r.property_id WHERE r.id = ?`).get(req.params.id);
  if (!r || r.org_id !== req.user.org_id) return bad(res, 'Request not found.', 404);
  db.prepare('UPDATE reviews SET status = ? WHERE id = ?').run(req.body.status === 'closed' ? 'closed' : 'open', r.id);
  audit(req.user.org_id, r.property_id, req.user.id, 'review.status', `${r.kind} ${req.body.status === 'closed' ? 'closed' : 'reopened'}`);
  res.json({ ok: true });
}));
app.get('/api/reviews/queue', auth, (req, res) => {
  res.json(db.prepare(`SELECT r.*, p.name property_name, u.name author_name FROM reviews r JOIN properties p ON p.id = r.property_id JOIN users u ON u.id = r.author_id
    WHERE p.org_id = ? AND r.status = 'open' AND r.kind IN ('evidence_request','correction_request') ORDER BY r.created_at DESC LIMIT 100`).all(req.user.org_id));
});

/* ---------- activity & dashboard ---------- */
app.get('/api/properties/:pid/activity', auth, (req, res) => {
  const p = getProperty(req, res); if (!p) return;
  res.json(db.prepare(`SELECT a.*, u.name user_name FROM activity a LEFT JOIN users u ON u.id = a.user_id WHERE property_id = ? ORDER BY a.created_at DESC, a.rowid DESC LIMIT 300`).all(p.id));
});
app.get('/api/activity', auth, (req, res) => {
  res.json(db.prepare(`SELECT a.*, u.name user_name, p.name property_name FROM activity a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN properties p ON p.id = a.property_id
    WHERE a.org_id = ? ORDER BY a.created_at DESC, a.rowid DESC LIMIT ?`).all(req.user.org_id, Math.min(Number(req.query.limit) || 15, 200)));
});
app.get('/api/dashboard', auth, (req, res) => {
  const org = req.user.org_id;
  const inProgress = db.prepare(`SELECT COUNT(*) n FROM properties WHERE org_id = ? AND stage != 'Internal approval'`).get(org).n;
  const docsAwaiting = db.prepare(`SELECT COUNT(*) n FROM documents d WHERE org_id = ? AND version = (SELECT MAX(version) FROM documents WHERE group_id = d.group_id) AND extraction_status = 'manual_review'`).get(org).n;
  const high = db.prepare(`SELECT COUNT(*) n FROM findings f JOIN properties p ON p.id = f.property_id WHERE p.org_id = ? AND f.status IN ('open','in_review') AND f.severity IN ('high','critical')`).get(org).n;
  const reviews = db.prepare(`SELECT COUNT(*) n FROM reviews r JOIN properties p ON p.id = r.property_id WHERE p.org_id = ? AND r.status = 'open' AND r.kind IN ('evidence_request','correction_request')`).get(org).n;
  const total = db.prepare('SELECT COUNT(*) n FROM properties WHERE org_id = ?').get(org).n;
  const next = db.prepare(`SELECT f.id, f.title, f.severity, f.next_step, f.property_id, p.name property_name FROM findings f JOIN properties p ON p.id = f.property_id
    WHERE p.org_id = ? AND f.status IN ('open','in_review') ORDER BY CASE f.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, f.created_at LIMIT 1`).get(org) || null;
  res.json({ total, inProgress, docsAwaiting, high, reviews, next });
});

/* ---------- reports ---------- */
app.get('/api/properties/:pid/reports', auth, (req, res) => {
  const p = getProperty(req, res); if (!p) return;
  res.json(db.prepare('SELECT r.id, r.file_name, r.created_at, u.name generated_by_name FROM reports r LEFT JOIN users u ON u.id = r.generated_by WHERE r.property_id = ? ORDER BY r.created_at DESC').all(p.id));
});
app.get('/api/reports', auth, (req, res) => {
  res.json(db.prepare(`SELECT r.id, r.file_name, r.created_at, r.property_id, p.name property_name, u.name generated_by_name FROM reports r JOIN properties p ON p.id = r.property_id
    LEFT JOIN users u ON u.id = r.generated_by WHERE r.org_id = ? ORDER BY r.created_at DESC LIMIT 100`).all(req.user.org_id));
});
app.post('/api/properties/:pid/reports', auth, need(WRITERS), wrap(async (req, res) => {
  const p = getProperty(req, res); if (!p) return;
  const id = uid('rpt_'), stored = crypto.randomUUID() + '.pdf';
  const safe = p.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'property';
  const fileName = `LandVerify-report-${safe}-${now().slice(0, 10)}.pdf`;
  await buildReport({ property: parseProp(p), generatedBy: req.user, generatedAt: now(), outPath: path.join(REPORT_DIR, stored), reportId: id });
  db.prepare('INSERT INTO reports (id, org_id, property_id, file_name, stored_name, generated_by, created_at) VALUES (?,?,?,?,?,?,?)').run(id, req.user.org_id, p.id, fileName, stored, req.user.id, now());
  audit(req.user.org_id, p.id, req.user.id, 'report.generated', fileName);
  res.status(201).json({ id });
}));
app.get('/api/reports/:id/file', auth, (req, res) => {
  const r = db.prepare('SELECT * FROM reports WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!r) return bad(res, 'Report not found.', 404);
  const full = path.join(REPORT_DIR, path.basename(r.stored_name));
  if (!fs.existsSync(full)) return bad(res, 'The stored report could not be found.', 404);
  audit(req.user.org_id, r.property_id, req.user.id, 'report.downloaded', r.file_name);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${r.file_name}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  fs.createReadStream(full).pipe(res);
});

/* ---------- UP land records (guided import, no portal calls) ---------- */
registerLand(app, { auth, need, wrap, bad, str, getProperty, touch, parseProp, WRITERS, REVIEWERS, upload });

/* ---------- static client + errors ---------- */
const dist = path.resolve('dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}
app.use('/api', (req, res) => bad(res, 'Not found.', 404));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Try again, and if it continues contact support.' });
});

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => console.log(`LandVerify API on http://localhost:${port}`));
