import { common_TechCardBomPurpose } from 'api/proto-http/admin';
import { sectionShort } from './bom-line-picker';

// НАЗНАЧЕНИЕ — what the garment uses a roll-goods line FOR (0265). A SECOND axis beside `section`,
// not a refinement of it: a карманка, a контраст and a сетка are all genuinely section=fabric —
// cloth sold by length, laid out on the same marker, grossed up by the same wastage — and they
// differ only in role. Several lines legitimately share one purpose; naming a SUBSET of the fabrics
// is the entire point of the field.
//
// The list is closed because the field exists to GROUP. A free-text role stops grouping the moment
// one operator writes «карманка» and the next writes «мешковина кармана», which is exactly what the
// free-text slot NAME already does today. OTHER carries its meaning in a separate note so the note
// can never quietly become a ninth purpose.

export const UNSET_PURPOSE = 'TECH_CARD_BOM_PURPOSE_UNSET' as const;

// Owner's order, and the order the BOM tab lists its groups in — the garment read outwards from the
// shell, not alphabetical.
export const bomPurposeOrder: common_TechCardBomPurpose[] = [
  'TECH_CARD_BOM_PURPOSE_MAIN',
  'TECH_CARD_BOM_PURPOSE_LINING',
  'TECH_CARD_BOM_PURPOSE_POCKETING',
  'TECH_CARD_BOM_PURPOSE_INTERFACING',
  'TECH_CARD_BOM_PURPOSE_INSULATION',
  'TECH_CARD_BOM_PURPOSE_CONTRAST',
  'TECH_CARD_BOM_PURPOSE_MESH',
  'TECH_CARD_BOM_PURPOSE_OTHER',
];

const PURPOSE_LABEL: Record<string, string> = {
  TECH_CARD_BOM_PURPOSE_MAIN: 'основной материал',
  TECH_CARD_BOM_PURPOSE_LINING: 'подкладка',
  TECH_CARD_BOM_PURPOSE_POCKETING: 'карманка',
  TECH_CARD_BOM_PURPOSE_INTERFACING: 'бортовка / прокладка',
  TECH_CARD_BOM_PURPOSE_INSULATION: 'утеплитель',
  TECH_CARD_BOM_PURPOSE_CONTRAST: 'контраст / отделочная',
  TECH_CARD_BOM_PURPOSE_MESH: 'сетка / второй слой',
  TECH_CARD_BOM_PURPOSE_OTHER: 'другое',
};

// The heading an UNSET roll-goods line collects under. Worded as an instruction, not as a value: a
// line lands here because nobody has sorted it yet, and every line that predates 0265 starts here
// deliberately — nothing guessed a purpose for them, because section=fabric is precisely where a
// карманка, a контраст and a сетка hide, and a guess would have labelled all three «основной
// материал» confidently and wrongly.
export const UNSET_PURPOSE_LABEL = 'назначение не задано';

export function bomPurposeLabel(purpose?: string): string {
  if (!purpose || purpose === UNSET_PURPOSE) return UNSET_PURPOSE_LABEL;
  return PURPOSE_LABEL[purpose] ?? purpose.replace('TECH_CARD_BOM_PURPOSE_', '').toLowerCase();
}

export const techCardBomPurposeOptions: Array<{
  value: common_TechCardBomPurpose;
  label: string;
}> = bomPurposeOrder.map((value) => ({ value, label: bomPurposeLabel(value) }));

// The EDITOR's list carries an explicit unset; the ADD modal's does not. Adding a fabric is the one
// moment the answer is in front of the operator, so the question is asked then and required. Editing
// is also where a WRONG sort has to be undoable — including back to «не знаю», which is a different
// and more honest answer than leaving «основной материал» standing.
export const purposeEditorOptions: Array<{ value: string; label: string }> = [
  { value: UNSET_PURPOSE, label: '— не задано —' },
  ...bomPurposeOrder.map((value) => ({ value: value as string, label: bomPurposeLabel(value) })),
];

export function isOtherPurpose(purpose?: string): boolean {
  return purpose === 'TECH_CARD_BOM_PURPOSE_OTHER';
}

// The four families cloth is measured by the metre and laid out on a marker. They are the only ones
// a purpose describes: a purpose on a thread or a button would be data no screen renders. Mirrors
// rollGoodsSectionList in the backend's internal/store/techcard — the same four the раскладка and
// the DXF binding already use, which is why the purpose axis can later carry those bindings.
const ROLL_GOODS_SECTIONS = new Set<string>([
  'TECH_CARD_BOM_SECTION_FABRIC',
  'TECH_CARD_BOM_SECTION_LINING',
  'TECH_CARD_BOM_SECTION_INTERLINING',
  'TECH_CARD_BOM_SECTION_INSULATION',
]);

export function isRollGoodsSection(section?: string): boolean {
  return !!section && ROLL_GOODS_SECTIONS.has(section);
}

// Non-roll-goods sections keep their own headings, in the order the section select offers them —
// purpose exists only where it means something, so thread, hardware, trim, labels and packaging are
// grouped exactly as they always were.
const SECTION_ORDER: string[] = [
  'TECH_CARD_BOM_SECTION_HARDWARE',
  'TECH_CARD_BOM_SECTION_THREAD',
  'TECH_CARD_BOM_SECTION_TRIM',
  'TECH_CARD_BOM_SECTION_DECORATION',
  'TECH_CARD_BOM_SECTION_LABEL',
  'TECH_CARD_BOM_SECTION_PACKAGING',
  'TECH_CARD_BOM_SECTION_OTHER',
];

export type BomGroup = {
  key: string;
  label: string;
  /** Positions in the RHF field array — NOT a re-sorted copy of the rows. */
  indices: number[];
  /** Roll goods with no purpose yet: the pile the operator is meant to work through. */
  unsorted?: boolean;
};

type GroupableLine = { section?: string; purpose?: string };

/**
 * Fold the BOM into the headings the tab renders, returning POSITIONS rather than rows: every tile,
 * editor and remove path addresses a line by its index in the RHF field array, so a grouping that
 * handed back reordered copies would silently repoint them at the wrong line.
 *
 * Roll goods group by purpose (one heading per purpose, several sections legitimately mixing inside
 * it — the tile still shows its own section pill). Everything else groups by section. Unsorted roll
 * goods get their own trailing heading instead of being folded into MAIN, so «not sorted yet» stays
 * visibly different from «sorted, and the answer is основной материал».
 */
export function groupBomLines(lines: GroupableLine[]): BomGroup[] {
  const byPurpose = new Map<string, number[]>();
  const unsorted: number[] = [];
  const bySection = new Map<string, number[]>();

  lines.forEach((line, index) => {
    if (isRollGoodsSection(line.section)) {
      const p = line.purpose && line.purpose !== UNSET_PURPOSE ? line.purpose : '';
      if (!p) {
        unsorted.push(index);
        return;
      }
      byPurpose.set(p, [...(byPurpose.get(p) ?? []), index]);
      return;
    }
    const s = line.section || 'TECH_CARD_BOM_SECTION_OTHER';
    bySection.set(s, [...(bySection.get(s) ?? []), index]);
  });

  const groups: BomGroup[] = [];
  bomPurposeOrder.forEach((p) => {
    const indices = byPurpose.get(p);
    if (indices?.length) groups.push({ key: p, label: bomPurposeLabel(p), indices });
  });
  // A purpose the current build does not know (a card saved by a newer client) must still render
  // its lines — under its raw value rather than vanishing from a tab that claims to list the BOM.
  [...byPurpose.keys()]
    .filter((p) => !bomPurposeOrder.includes(p as common_TechCardBomPurpose))
    .sort()
    .forEach((p) => groups.push({ key: p, label: bomPurposeLabel(p), indices: byPurpose.get(p)! }));
  if (unsorted.length) {
    groups.push({
      key: UNSET_PURPOSE,
      label: UNSET_PURPOSE_LABEL,
      indices: unsorted,
      unsorted: true,
    });
  }

  const seenSections = new Set<string>();
  [...SECTION_ORDER, ...[...bySection.keys()].sort()].forEach((s) => {
    if (seenSections.has(s)) return;
    seenSections.add(s);
    const indices = bySection.get(s);
    if (indices?.length) {
      groups.push({
        key: s,
        label: sectionShort(s) || s,
        indices,
      });
    }
  });
  return groups;
}
