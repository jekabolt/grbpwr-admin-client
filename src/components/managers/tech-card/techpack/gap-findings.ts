// PDF GAPS AS AUDIT ROWS (assembly-schema T12). Every red mark the tech pack prints (gaps.ts) is one
// client finding of the construction audit — same list, same order, so «red in the PDF ⇔ a row in
// the audit» holds by construction — and one door to where it is fixed (`gapNav`).
//
// Seen marks: the finding's key is card-polish's `findingKey(code, refs)` (finding-seen.ts), so a
// gap marked seen stays seen across reloads and is left out of the paper's open count.

import type { common_TechCard } from 'api/proto-http/admin';
import type { ClientFinding } from '../components/finding-seen';
import { pieceCode } from './derive-pieces';
import { bomRefs, clean, pieceKey } from './derive-shared';
import type { Gap, GapTarget } from './gaps';
import { englishT, type PdfT } from './i18n';

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
const GAP_SECTION_KEY = {
  '00': 'gaps.sectionCover',
  '01': 'gaps.sectionMaterials',
  '02': 'gaps.sectionPieces',
  '03': 'gaps.sectionColourways',
  '04': 'gaps.sectionPatterns',
  '05': 'gaps.sectionLabels',
  '06': 'gaps.sectionAssembly',
  '08': 'gaps.sectionMeasurements',
  '09': 'gaps.sectionQc',
} as const;

export const gapSection = (g: Pick<Gap, 'section'>, t: PdfT = englishT) => {
  const key = GAP_SECTION_KEY[g.section as keyof typeof GAP_SECTION_KEY];
  return key ? t(key) : g.section || t('gaps.sectionPdf');
};

/**
 * What a gap row names after its label: the BOM line's name for a materials / patterns gap, the
 * piece code for a cut-pieces one. The PDF's own label stays as printed (parity with paper).
 */
export function gapSubjects(card?: common_TechCard): (g: Gap) => string {
  const bom = new Map(
    (card ? bomRefs(card) : []).map((r) => [r.key, clean(r.item.name) || r.key] as const),
  );
  // A piece by its printed code; a piece without one (the gap may be exactly that) by its name.
  const piece = new Map(
    (card?.techCard?.pieces ?? []).map(
      (p, i) => [pieceKey(p, i), pieceCode(p.lineKey) || clean(p.name) || pieceKey(p, i)] as const,
    ),
  );
  return (g) => {
    if (g.target.bomLine) return bom.get(g.target.bomLine) ?? g.target.bomLine;
    if (g.target.tab === 'pieces' && g.target.piece)
      return piece.get(g.target.piece) ?? g.target.piece;
    return '';
  };
}

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

/**
 * The PDF's door to the same place: the card URL with the tab and its query params. `reveal` /
 * `scroll` need the open page, so a link from paper lands on the tab (+ step / BOM line) only.
 */
export function gapHref(t: GapTarget, cardId: number, origin: string): string {
  const nav = gapNav(t);
  const params = new URLSearchParams({ tab: nav.tab, ...nav.extra });
  return `${origin}/tech-cards/${cardId}?${params.toString()}`;
}

/** The destination printed beside a PDF gap line: `construction · op 30`, `bom · SHELL`. */
export function gapWhere(target: GapTarget, translate: PdfT = englishT): string {
  const nav = gapNav(target);
  const tab =
    {
      construction: translate('gaps.tabConstruction'),
      bom: translate('gaps.tabBom'),
      patterns: translate('gaps.tabPatterns'),
      colorways: translate('gaps.tabColourways'),
      studio: translate('gaps.tabStudio'),
      sizes: translate('gaps.tabSizes'),
      artifacts: translate('gaps.tabArtifacts'),
      labels: translate('gaps.tabLabels'),
      signoff: translate('gaps.tabSignoff'),
    }[nav.tab] ?? nav.tab;
  const detail = nav.extra?.op ? `op ${nav.extra.op}` : nav.extra?.bom;
  return detail ? `${tab} · ${detail}` : tab;
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
