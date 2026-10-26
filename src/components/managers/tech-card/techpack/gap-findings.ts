// PDF GAPS AS AUDIT ROWS (assembly-schema T12). Every red mark the tech pack prints (gaps.ts) is one
// client finding of the construction audit — same list, same order, so «red in the PDF ⇔ a row in
// the audit» holds by construction — and one door to where it is fixed (`gapNav`).
//
// Seen marks: the finding's key is card-polish's `findingKey(code, refs)` (finding-seen.ts), so a
// gap marked seen stays seen across reloads and is left out of the paper's open count.

import type { ClientFinding } from '../components/finding-seen';
import type { Gap, GapTarget } from './gaps';

/** The PDF's section names by number (document.tsx TOC). */
export const GAP_SECTION: Readonly<Record<string, string>> = {
  '00': 'cover',
  '01': 'materials',
  '02': 'cut pieces',
  '03': 'colourways',
  '04': 'patterns',
  '05': 'labels',
  '06': 'assembly',
  '08': 'measurements',
  '09': 'qc',
};
export const gapSection = (g: Pick<Gap, 'section'>) =>
  GAP_SECTION[g.section] ?? (g.section || 'pdf');

/** Client findings for the audit / the print count: one per gap, in the PDF's order. */
export function gapsToClientFindings(gaps: readonly Gap[]): ClientFinding[] {
  return gaps.map((g) => ({
    code: g.code,
    refs: [...g.refs],
    title: `${g.label} — ${gapSection(g)}`,
    severity: 'warning',
    category: 'pdf_gaps',
  }));
}

/** Where a gap is fixed: a card tab, its query params, and a field / block to bring into view. */
export type GapNav = {
  tab: string;
  extra?: Record<string, string>;
  /** `[data-field=…]` path for `revealField`. */
  reveal?: string;
  /** CSS selector scrolled into view after the tab opens. */
  scroll?: string;
};

/**
 * Construction fields fixed in the step's seam picker. Not «edge»: a bind step's edge is its zone,
 * a hand step's is its note — both on the step card itself.
 */
const PICK_FIELDS = new Set(['seam', 'inner target', 'seam length']);

/** A field that lives on another tab than the section that printed it (cover, QC). */
function byField(field: string): GapNav | null {
  switch (field) {
    case 'pieces':
    case 'patterns':
    case 'pattern':
    case 'marker':
      return { tab: 'patterns' };
    case 'operations':
      return { tab: 'construction' };
    case 'fabrics':
    case 'button qty':
    case 'interlining':
      return { tab: 'bom' };
    case 'colourways':
      return { tab: 'colorways' };
    case 'name':
      return { tab: 'studio', reveal: 'name' };
    case 'status':
      return { tab: 'studio' };
    case 'sample size':
    case 'measurements':
    case 'drawing':
      return { tab: 'sizes' };
    case 'front flat':
    case 'back flat':
      return { tab: 'artifacts' };
    case 'label placement':
    case 'composition':
      return { tab: 'labels', scroll: '[data-labels-tab]' };
    default:
      return null;
  }
}

export function gapNav(t: GapTarget): GapNav {
  const field = (t.field ?? '').trim();
  switch (t.tab) {
    case 'construction': {
      if (!t.op) return { tab: 'construction' };
      const extra: Record<string, string> = { op: String(t.op) };
      if (PICK_FIELDS.has(field)) extra.pick = String(t.op);
      return { tab: 'construction', extra };
    }
    case 'materials':
      if (field === 'front flat') return { tab: 'artifacts' };
      return t.bomLine ? { tab: 'bom', extra: { bom: t.bomLine } } : { tab: 'bom' };
    case 'labels':
      if (field === 'back flat') return { tab: 'artifacts' };
      if (field === 'name') return { tab: 'studio', reveal: 'name' };
      if (field === 'sample size') return { tab: 'sizes' };
      return { tab: 'labels', scroll: '[data-labels-tab]' };
    case 'colourways':
      return { tab: 'colorways' };
    case 'measurements':
      return { tab: 'sizes' };
    case 'patterns':
    case 'pieces':
      return { tab: 'patterns' };
    case 'cover':
      return byField(field) ?? { tab: 'studio' };
    case 'signoff':
      return byField(field) ?? { tab: 'signoff' };
    default:
      return { tab: 'construction' };
  }
}
