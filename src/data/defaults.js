// ─── Default dataset ────────────────────────────────────────────────────────

export const SCHEDULE_START = new Date('2026-11-02T08:00:00');

export const LINES = [
  { id: 'L1', name: 'Moulding' },
  { id: 'L2', name: 'Assembly' },
  { id: 'L3', name: 'Packing' },
];

export const FAMILIES = ['LATEX', 'NON_LATEX', 'STANDARD'];

// minutes to changeover FROM row family TO column family
export const CHANGEOVER_MATRIX = {
  LATEX:     { LATEX: 0,  NON_LATEX: 60, STANDARD: 60 },
  NON_LATEX: { LATEX: 20, NON_LATEX: 0,  STANDARD: 15 },
  STANDARD:  { LATEX: 20, NON_LATEX: 15, STANDARD: 0  },
};

export const PRODUCTS = [
  { id: 'P1', name: 'Latex seal',           family: 'LATEX',     eligibleLines: ['L1'],      minsPerUnit: 3 },
  { id: 'P2', name: 'Latex component',      family: 'LATEX',     eligibleLines: ['L1','L2'], minsPerUnit: 4 },
  { id: 'P3', name: 'Non-latex seal',       family: 'NON_LATEX', eligibleLines: ['L1'],      minsPerUnit: 3 },
  { id: 'P4', name: 'Non-latex kit',        family: 'NON_LATEX', eligibleLines: ['L2','L3'], minsPerUnit: 4 },
  { id: 'P5', name: 'Standard component',   family: 'STANDARD',  eligibleLines: ['L1','L2'], minsPerUnit: 2 },
  { id: 'P6', name: 'Standard kit',         family: 'STANDARD',  eligibleLines: ['L2','L3'], minsPerUnit: 3 },
  { id: 'P7', name: 'Standard carton',      family: 'STANDARD',  eligibleLines: ['L3'],      minsPerUnit: 2 },
];

export const DEFAULT_ORDERS = [
  { id: 'O01', productId: 'P1', quantity: 20,  dueISO: '2026-11-02T08:30:00' },
  { id: 'O02', productId: 'P4', quantity: 10,  dueISO: '2026-11-02T09:00:00' },
  { id: 'O03', productId: 'P7', quantity: 20,  dueISO: '2026-11-02T09:15:00' },
  { id: 'O04', productId: 'P3', quantity: 10,  dueISO: '2026-11-02T10:00:00' },
  { id: 'O05', productId: 'P2', quantity: 10,  dueISO: '2026-11-02T10:15:00' },
  { id: 'O06', productId: 'P5', quantity: 20,  dueISO: '2026-11-02T10:30:00' },
  { id: 'O07', productId: 'P6', quantity: 10,  dueISO: '2026-11-02T11:00:00' },
  { id: 'O08', productId: 'P1', quantity: 10,  dueISO: '2026-11-02T11:30:00' },
  { id: 'O09', productId: 'P4', quantity: 15,  dueISO: '2026-11-02T12:00:00' },
  { id: 'O10', productId: 'P7', quantity: 15,  dueISO: '2026-11-02T12:15:00' },
  { id: 'O11', productId: 'P3', quantity: 20,  dueISO: '2026-11-02T13:00:00' },
  { id: 'O12', productId: 'P2', quantity: 15,  dueISO: '2026-11-02T14:00:00' },
];

export const FAMILY_COLORS = {
  LATEX:     { bg: '#6366f1', light: '#e0e7ff', text: '#fff' },
  NON_LATEX: { bg: '#0d9488', light: '#ccfbf1', text: '#fff' },
  STANDARD:  { bg: '#7c3aed', light: '#ede9fe', text: '#fff' },
};

export const FAMILY_LABELS = {
  LATEX:     'Latex',
  NON_LATEX: 'Non-Latex',
  STANDARD:  'Standard',
};
