export const STATES = ['Uttar Pradesh', 'Rajasthan', 'Andhra Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Odisha', 'Punjab', 'Tamil Nadu', 'Telangana', 'Uttarakhand', 'West Bengal', 'Other state or union territory'];
export const PROPERTY_TYPES = ['Agricultural', 'Residential plot', 'Commercial plot', 'Industrial', 'Farmhouse', 'Mixed use', 'Other'];

export function pickJurisdiction(jurisdictions, state) {
  const s = (state || '').toLowerCase();
  const key = s.includes('uttar pradesh') ? 'UP' : s.includes('rajasthan') ? 'RJ' : 'OTHER';
  return jurisdictions.find((j) => j.key === key) || jurisdictions[jurisdictions.length - 1];
}

export const STAGES = ['Documents collected', 'Checks completed', 'Ready for legal review', 'Internal approval'];
export const DOC_TYPES = ['Sale deed', 'Gift deed', 'Will', 'Power of attorney', 'Khatauni / Record of Rights', 'Jamabandi', 'Khasra / Gata extract', 'Mutation order', 'Survey sketch / map', 'Encumbrance certificate', 'Land-use certificate', 'Tax receipt', 'Court order', 'Identity document', 'Other'];

export const ACTION_LABEL = {
  'property.created': 'created the property', 'property.updated': 'updated property details', 'property.deleted': 'deleted a property',
  'document.uploaded': 'uploaded a document', 'document.viewed': 'opened a document', 'document.version_added': 'added a new version', 'document.extraction_status': 'changed a review state',
  'document.verification_changed': 'changed a verification status', 'field.added': 'recorded a field', 'field.updated': 'updated a field', 'field.removed': 'removed a field',
  'check.added': 'added a check', 'check.updated': 'updated a check', 'finding.created': 'raised a finding', 'finding.updated': 'updated a finding',
  'review.comment': 'commented', 'review.evidence_request': 'requested evidence', 'review.decision': 'recorded a decision', 'review.correction_request': 'requested a correction',
  'review.stage_approval': 'recorded an internal approval', 'review.status': 'updated a request', 'report.generated': 'generated a report', 'report.downloaded': 'opened a report',
  'land.imported': 'imported an official-source record', 'land.outcome': 'reported a portal outcome', 'land.reviewed': 'reviewed an imported record', 'land.compared': 'compared official-source records', 'land.confirmed': 'confirmed a comparison',
  'team.member_added': 'added a team member', 'team.role_changed': 'changed a role', 'auth.login': 'signed in', 'workspace.created': 'created the workspace',
};

// A deterministic, clearly illustrative outline. It is not derived from any survey.
export function illustrativeOutline(seed) {
  let h = 2166136261;
  for (const c of seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  const r = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000) / 1000; };
  const cx = 200, cy = 130, n = 6;
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + r() * 0.35;
    const rad = 84 + r() * 36;
    return [cx + Math.cos(a) * rad * 1.35, cy + Math.sin(a) * rad * 0.9];
  });
}
