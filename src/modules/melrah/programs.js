export const PROGRAMS = {
  CANNABIS_PACKAGING: {
    key: 'CANNABIS_PACKAGING',
    label: 'Cannabis Packaging',
    shortLabel: 'CANNABIS',
    streams: ['FLEXIBLE_POUCH','RIGID_PLASTIC','GLASS_METAL','PAPER_FIBER','OTHER'],
    qrPlaceholder: 'MEL-ALB-003-FP-01',
    requiresPackageCount: true,
    requiresBatchId: true,
  },
  ORGANICS_COFFEE: {
    key: 'ORGANICS_COFFEE',
    label: 'Coffee Grounds',
    shortLabel: 'ORGANICS',
    streams: ['COFFEE_GROUNDS','COFFEE_GROUNDS_FILTERS'],
    qrPlaceholder: 'MEL-SCH-CAF001-CG-01',
    requiresPackageCount: false,
    requiresBatchId: false,
  },
}

export function programFor(row) {
  return PROGRAMS[row?.program_key] || PROGRAMS.CANNABIS_PACKAGING
}

export function isCoffee(row) {
  return programFor(row).key === 'ORGANICS_COFFEE'
}
