import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DATA_DIR = process.env.LANDVERIFY_DATA || process.env.BHUVERIFY_DATA || path.resolve('data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'private', 'uploads');
export const REPORT_DIR = path.join(DATA_DIR, 'private', 'reports');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(REPORT_DIR, { recursive: true });

// Brand migration: keep existing data by renaming the old database file in place.
const NEW_DB = path.join(DATA_DIR, 'landverify.db');
const OLD_DB = path.join(DATA_DIR, 'bhuverify.db');
if (!fs.existsSync(NEW_DB) && fs.existsSync(OLD_DB)) {
  for (const ext of ['', '-wal', '-shm']) if (fs.existsSync(OLD_DB + ext)) fs.renameSync(OLD_DB + ext, NEW_DB + ext);
}
export const db = new DatabaseSync(NEW_DB);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES orgs(id),
  email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','reviewer','member','viewer')),
  title TEXT, salt TEXT NOT NULL, pass_hash TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES orgs(id),
  name TEXT NOT NULL, state TEXT NOT NULL, district TEXT, tehsil TEXT, village TEXT,
  identifiers TEXT NOT NULL DEFAULT '{}',
  area_value REAL, area_unit TEXT, property_type TEXT, claimed_owner TEXT,
  boundary_source TEXT NOT NULL DEFAULT 'illustrative',
  stage TEXT NOT NULL DEFAULT 'collecting',
  reviewer_id TEXT REFERENCES users(id),
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL, property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  doc_type TEXT NOT NULL, title TEXT NOT NULL,
  file_name TEXT, stored_name TEXT, mime TEXT, size INTEGER,
  doc_date TEXT, parties TEXT, identifiers TEXT,
  extraction_status TEXT NOT NULL DEFAULT 'manual_review'
    CHECK (extraction_status IN ('processing','completed','failed','manual_review')),
  verification_status TEXT NOT NULL DEFAULT 'supplied'
    CHECK (verification_status IN ('supplied','checked_source','professionally_reviewed','discrepancy')),
  verification_note TEXT,
  uploaded_by TEXT REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fields (
  id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  key TEXT NOT NULL, value TEXT NOT NULL, source_note TEXT,
  origin TEXT NOT NULL DEFAULT 'entered_by_user',
  status TEXT NOT NULL DEFAULT 'unconfirmed' CHECK (status IN ('unconfirmed','confirmed','corrected')),
  updated_by TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS checks (
  id TEXT PRIMARY KEY, property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  category TEXT NOT NULL, title TEXT NOT NULL, description TEXT,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','in_progress','needs_evidence','completed')),
  outcome TEXT NOT NULL DEFAULT 'none'
    CHECK (outcome IN ('none','no_issue_found','issue_found','inconclusive')),
  source TEXT, evidence TEXT, reviewer_id TEXT REFERENCES users(id), next_action TEXT,
  sort INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY, property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  check_id TEXT REFERENCES checks(id) ON DELETE SET NULL,
  title TEXT NOT NULL, explanation TEXT, severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  evidence TEXT, document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  source TEXT, source_date TEXT,
  owner_id TEXT REFERENCES users(id), next_step TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','resolved','accepted')),
  resolution_note TEXT,
  created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY, property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('comment','evidence_request','decision','correction_request','stage_approval')),
  target_type TEXT, target_id TEXT, body TEXT NOT NULL, decision TEXT, stage TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  assignee_id TEXT REFERENCES users(id),
  author_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL, property_id TEXT, user_id TEXT,
  action TEXT NOT NULL, detail TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL, property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL, stored_name TEXT NOT NULL, generated_by TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_props_org ON properties(org_id);
CREATE INDEX IF NOT EXISTS idx_docs_prop ON documents(property_id);
CREATE INDEX IF NOT EXISTS idx_checks_prop ON checks(property_id);
CREATE INDEX IF NOT EXISTS idx_findings_prop ON findings(property_id);
CREATE INDEX IF NOT EXISTS idx_act_org ON activity(org_id, created_at);

-- The audit log is append-only at the database level.
CREATE TRIGGER IF NOT EXISTS activity_no_update BEFORE UPDATE ON activity
BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS activity_no_delete BEFORE DELETE ON activity
BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
`);

// ---- Official land-record sources (UP Bhulekh and UP Bhunaksha) ----
// Records are user-imported snapshots with full provenance. Nothing here is fetched from a government server.
db.exec(`
CREATE TABLE IF NOT EXISTS land_records (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL, property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  portal TEXT NOT NULL CHECK (portal IN ('bhulekh','bhunaksha')),
  method TEXT NOT NULL CHECK (method IN ('uploaded_import','manual_entry','user_reported','api')),
  status TEXT NOT NULL CHECK (status IN ('imported','not_found','unavailable')),
  currency TEXT NOT NULL DEFAULT 'current' CHECK (currency IN ('current','historical')),
  district TEXT, tehsil TEXT, village TEXT, gata TEXT, khata TEXT,
  district_code TEXT, tehsil_code TEXT, village_code TEXT,
  record_ref TEXT, source_url TEXT NOT NULL, data_format TEXT,
  retrieved_on_portal_at TEXT, imported_at TEXT NOT NULL,
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  transformation TEXT NOT NULL DEFAULT 'None. Values were typed by a person from the source.',
  note TEXT, imported_by TEXT REFERENCES users(id),
  reviewed_by TEXT REFERENCES users(id), reviewed_at TEXT, review_note TEXT
);
CREATE TABLE IF NOT EXISTS land_record_fields (
  id TEXT PRIMARY KEY, record_id TEXT NOT NULL REFERENCES land_records(id) ON DELETE CASCADE,
  key TEXT NOT NULL, label TEXT NOT NULL, value TEXT NOT NULL, unit TEXT, original_text TEXT, sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS crossrefs (
  id TEXT PRIMARY KEY, property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  key TEXT NOT NULL, label TEXT NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN ('match','potential_discrepancy','source_unavailable','manual_review','not_matched','outdated')),
  summary TEXT, vals TEXT NOT NULL DEFAULT '[]', values_hash TEXT,
  finding_id TEXT REFERENCES findings(id) ON DELETE SET NULL,
  reviewed_by TEXT REFERENCES users(id), reviewed_at TEXT, review_note TEXT,
  computed_at TEXT NOT NULL, UNIQUE (property_id, key)
);
CREATE INDEX IF NOT EXISTS idx_land_prop ON land_records(property_id, portal);
`);
if (!db.prepare('PRAGMA table_info(documents)').all().some((c) => c.name === 'origin')) {
  db.exec("ALTER TABLE documents ADD COLUMN origin TEXT NOT NULL DEFAULT 'uploaded'");
}

export const now = () => new Date().toISOString();
export const uid = (prefix = '') => prefix + crypto.randomBytes(8).toString('hex');
export const propertyId = () => {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (const b of crypto.randomBytes(6)) s += a[b % a.length];
  return `LV-${s.slice(0, 3)}${s.slice(3)}`;
};

export function audit(orgId, propertyId, userId, action, detail) {
  // Activity rows are written outside of triggers' reach (insert only).
  db.prepare('INSERT INTO activity (id, org_id, property_id, user_id, action, detail, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(uid('act_'), orgId, propertyId || null, userId || null, action, detail || null, now());
}

export function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
