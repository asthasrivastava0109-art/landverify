// Jurisdiction configuration.
// Land administration differs by state. Terminology, identifiers, units and the
// default check template live here so a new state can be added as data,
// without changing the product. Nothing in this file implies a live integration.

export const CATEGORIES = [
  { key: 'title', label: 'Ownership and title history' },
  { key: 'revenue', label: 'Revenue records and mutation' },
  { key: 'encumbrance', label: 'Encumbrances and third-party interests' },
  { key: 'landuse', label: 'Land use and planning' },
  { key: 'litigation', label: 'Litigation and disputes' },
  { key: 'boundary', label: 'Boundaries and physical inspection' },
  { key: 'transaction', label: 'Transaction requirements' },
];

const GENERIC_CHECKS = {
  title: [
    ['Chain of title documents collected', 'Collect the sequence of deeds that connects the current claimant to an earlier recorded owner.'],
    ['Claimed owner matches title documents', 'Compare the claimed owner with names in the supplied deeds.'],
  ],
  revenue: [
    ['Record of rights matches claimed owner', 'Compare the claimed owner with the current revenue record.'],
    ['Mutation entries reviewed', 'Review mutation entries since the last registered transfer.'],
  ],
  encumbrance: [
    ['Encumbrance certificate obtained', 'Obtain an encumbrance certificate covering the relevant period.'],
    ['Mortgage, lease or charge enquiry', 'Confirm whether any mortgage, lease or other third-party interest is recorded.'],
  ],
  landuse: [
    ['Land-use classification confirmed', 'Confirm the recorded land-use category against the intended use.'],
    ['Applicable permissions identified', 'List permissions or conversions needed for the intended use.'],
  ],
  litigation: [
    ['Court and tribunal search', 'Search for disputes that name the property or the claimed owner.'],
    ['Disputes raised in revenue courts', 'Check for revenue-court proceedings relating to the property.'],
  ],
  boundary: [
    ['Area stated consistently across documents', 'Compare the area stated in each supplied document.'],
    ['Physical inspection recorded', 'Record who inspected the land, when, and what they observed.'],
  ],
  transaction: [
    ['Seller identity and authority confirmed', 'Confirm identity documents and authority to sell, including any power of attorney.'],
    ['Stamp duty and registration requirements listed', 'List the requirements that apply in this state. Not assessed by LandVerify.'],
  ],
};

export const JURISDICTIONS = {
  UP: {
    key: 'UP',
    name: 'Uttar Pradesh',
    identifierFields: [
      { key: 'khasra', label: 'Khasra / Gata number', hint: 'Plot number in the revenue record' },
      { key: 'khata', label: 'Khata / Khatauni number', hint: 'Holding number in the Khatauni' },
      { key: 'survey', label: 'Survey number (if any)', hint: '' },
      { key: 'district_code', label: 'District code (optional)', hint: 'The official number shown beside the district in the portal drop-down' },
      { key: 'tehsil_code', label: 'Tehsil code (optional)', hint: 'As shown in the portal drop-down' },
      { key: 'village_code', label: 'Village code (optional)', hint: 'As shown in the portal drop-down' },
    ],
    areaUnits: ['bigha', 'biswa', 'hectare', 'sq m', 'sq ft', 'acre'],
    recordTerms: { recordOfRights: 'Khatauni', plotNumber: 'Khasra / Gata', ownershipRegister: 'Khatauni (Record of Rights)' },
    integrations: [
      { name: 'UP Bhulekh (guided lookup and import; no automated retrieval)', status: 'not_configured' },
      { name: 'UP Bhunaksha (guided lookup and import; no automated retrieval)', status: 'not_configured' },
      { name: 'UP registration and stamps', status: 'not_configured' },
    ],
    notes: 'Bigha and biswa values differ across districts. LandVerify does not convert between them.',
    checkOverrides: {
      revenue: [
        ['Khatauni matches claimed owner', 'Compare the name in the Khatauni with the claimed owner.'],
        ['Khasra / Gata number matches map and deed', 'Confirm the plot number is the same across the deed, Khatauni and map.'],
        ['Mutation (dakhil-kharij) entries reviewed', 'Review mutation entries since the last registered transfer.'],
      ],
    },
  },
  RJ: {
    key: 'RJ',
    name: 'Rajasthan',
    identifierFields: [
      { key: 'khasra', label: 'Khasra number', hint: '' },
      { key: 'khata', label: 'Khatedari / Khata number', hint: '' },
      { key: 'survey', label: 'Survey number (if any)', hint: '' },
    ],
    areaUnits: ['bigha', 'biswa', 'hectare', 'sq m', 'sq ft', 'acre'],
    recordTerms: { recordOfRights: 'Jamabandi', plotNumber: 'Khasra', ownershipRegister: 'Jamabandi' },
    integrations: [],
    notes: 'Local area units vary. LandVerify does not convert between them.',
    checkOverrides: {
      revenue: [
        ['Jamabandi matches claimed owner', 'Compare the name in the Jamabandi with the claimed owner.'],
        ['Mutation entries reviewed', 'Review mutation entries since the last registered transfer.'],
      ],
    },
  },
  OTHER: {
    key: 'OTHER',
    name: 'Other state',
    identifierFields: [
      { key: 'khasra', label: 'Plot / Khasra / Gata number', hint: '' },
      { key: 'khata', label: 'Khata / record number', hint: '' },
      { key: 'survey', label: 'Survey number', hint: '' },
    ],
    areaUnits: ['hectare', 'acre', 'sq m', 'sq ft', 'bigha', 'guntha', 'cent'],
    recordTerms: { recordOfRights: 'Record of Rights', plotNumber: 'Survey / plot number', ownershipRegister: 'Record of Rights' },
    integrations: [],
    notes: 'Configure this state to add its own terminology and checks.',
    checkOverrides: {},
  },
};

export function jurisdictionFor(state) {
  const s = (state || '').toLowerCase();
  if (s.includes('uttar')) return JURISDICTIONS.UP;
  if (s.includes('rajasthan')) return JURISDICTIONS.RJ;
  return JURISDICTIONS.OTHER;
}

export function checkTemplate(state) {
  const j = jurisdictionFor(state);
  const out = [];
  for (const c of CATEGORIES) {
    const items = j.checkOverrides[c.key] || GENERIC_CHECKS[c.key];
    for (const [title, description] of items) out.push({ category: c.key, title, description });
  }
  return out;
}
