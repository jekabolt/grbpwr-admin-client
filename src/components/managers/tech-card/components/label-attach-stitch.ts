// HOW A LABEL IS ATTACHED IS ASKED ONCE (J1, owner 13.11): «сделать в лейбле настройку пришива чтоб
// она подхватывала оттуда в операцию». The label row's ATTACHMENT is the fact; the «attach label» step
// (work `attach_label`) shows it and no longer asks. The step's stored `label_attach_stitch` stays —
// the server prices the step by it — and is filled from the linked label on every save.
//
// A step with no label linked keeps what it stored (old steps carry a stitch and no link; the value
// is not wiped). Two linked labels: the first sewn one in the step's link order decides the stored
// value; the screen shows each label's own fact.

import type { common_TechCardLabelAttachStitch } from 'api/proto-http/admin';

export const ATTACH_LABEL_WORK = 'attach_label';
export const LABEL_STITCH_UNKNOWN: common_TechCardLabelAttachStitch =
  'TECH_CARD_LABEL_ATTACH_STITCH_UNKNOWN';

/** Label attachments that are not a stitch at all: the step's stitch stays UNKNOWN. */
export const NOT_SEWN_ATTACHMENTS: ReadonlySet<string> = new Set([
  'heat press',
  'swift tack',
  'hung',
  'stuck on',
]);

const ATTACHMENT_TO_STITCH: Readonly<Record<string, common_TechCardLabelAttachStitch>> = {
  'sewn into the seam': 'TECH_CARD_LABEL_ATTACH_STITCH_CAUGHT_IN_SEAM',
  'sewn 4 sides': 'TECH_CARD_LABEL_ATTACH_STITCH_FOUR_SIDES',
  'sewn 1 edge': 'TECH_CARD_LABEL_ATTACH_STITCH_ONE_EDGE',
  'corner tacks': 'TECH_CARD_LABEL_ATTACH_STITCH_CORNERS_TACK',
  on_fabric_piece: 'TECH_CARD_LABEL_ATTACH_STITCH_OTHER',
};

/**
 * The step stitch a label attachment means. «sewn 2 sides» is told apart by the label's sewn side:
 * fold lines run along `foldAxis` from the sewn edges, so the height axis ('') means the top and
 * bottom edges are sewn, the width axis the left and right ones. A word of no known meaning that is
 * not «not sewn» is a stitch of another scheme; an empty attachment says nothing.
 */
export function stitchForAttachment(
  attachment: string | undefined,
  foldAxis?: string,
): common_TechCardLabelAttachStitch {
  const word = (attachment ?? '').trim();
  if (!word || NOT_SEWN_ATTACHMENTS.has(word)) return LABEL_STITCH_UNKNOWN;
  if (word === 'sewn 2 sides')
    return foldAxis === 'width'
      ? 'TECH_CARD_LABEL_ATTACH_STITCH_TWO_SIDES_LEFT_RIGHT'
      : 'TECH_CARD_LABEL_ATTACH_STITCH_TWO_SIDES_TOP_BOTTOM';
  return ATTACHMENT_TO_STITCH[word] ?? 'TECH_CARD_LABEL_ATTACH_STITCH_OTHER';
}

export type StitchLabel = { lineKey?: string; attachment?: string; foldAxis?: string };

/** The labels a step links (`labelKeys` = the labels' own line keys), in the step's link order. */
export function linkedLabels<L extends StitchLabel>(
  labelKeys: readonly string[] | undefined,
  labels: readonly L[] | undefined,
): L[] {
  const out: L[] = [];
  for (const raw of labelKeys ?? []) {
    const k = raw.trim();
    const hit = k ? (labels ?? []).find((l) => (l.lineKey ?? '').trim() === k) : undefined;
    if (hit && !out.includes(hit)) out.push(hit);
  }
  return out;
}

/**
 * What an «attach label» step stores as its stitch on save. Any other step keeps its own value
 * untouched; so does a label step that links no label, or only labels with no attachment yet.
 */
export function stepLabelStitch(
  step: { work?: string; labelAttachStitch?: string; labelKeys?: readonly string[] },
  labels: readonly StitchLabel[] | undefined,
): string {
  const stored = step.labelAttachStitch || LABEL_STITCH_UNKNOWN;
  if ((step.work ?? '').trim() !== ATTACH_LABEL_WORK) return stored;
  const linked = linkedLabels(step.labelKeys, labels);
  // A label that says nothing yet (blank attachment) is not a fact: the stored stitch stays.
  if (linked.every((l) => !(l.attachment ?? '').trim())) return stored;
  for (const l of linked) {
    const s = stitchForAttachment(l.attachment, l.foldAxis);
    if (s !== LABEL_STITCH_UNKNOWN) return s;
  }
  return LABEL_STITCH_UNKNOWN;
}

// ── ONE FACT, ONE WORDING (J1, owner 13.11: «одинаковый и в операции и в лейблс энд пекеджес …
// и потом геометрия показывалась в пдфе»). Every place that says how a label is attached — the
// step, the label row, the tech pack tables, the label picture — reads `labelAttachmentFact`.

/** Where the stitch runs, for the picture. */
export type LabelStitchScheme =
  | 'seam' // caught in a garment seam along the sewn edge
  | 'four' // all four sides
  | 'top_bottom' // two sides: top and bottom edges
  | 'left_right' // two sides: left and right edges
  | 'edge' // one edge, the sewn edge
  | 'corners' // tacked at the four corners
  | 'piece' // printed on a fabric piece, the piece is sewn
  | 'none'; // not sewn, or not said

export type LabelAttachmentFact = {
  /** «sewn 2 sides · left + right», «hung · not sewn», '' when the label says nothing. */
  words: string;
  scheme: LabelStitchScheme;
  stitch: common_TechCardLabelAttachStitch;
  notSewn: boolean;
};

const SCHEME_OF_STITCH: Readonly<Record<string, LabelStitchScheme>> = {
  TECH_CARD_LABEL_ATTACH_STITCH_CAUGHT_IN_SEAM: 'seam',
  TECH_CARD_LABEL_ATTACH_STITCH_FOUR_SIDES: 'four',
  TECH_CARD_LABEL_ATTACH_STITCH_TWO_SIDES_TOP_BOTTOM: 'top_bottom',
  TECH_CARD_LABEL_ATTACH_STITCH_TWO_SIDES_LEFT_RIGHT: 'left_right',
  TECH_CARD_LABEL_ATTACH_STITCH_ONE_EDGE: 'edge',
  TECH_CARD_LABEL_ATTACH_STITCH_CORNERS_TACK: 'corners',
};

/** The one wording of an attachment word on screen and paper. */
export const attachmentWord = (value?: string | null): string =>
  value === 'on_fabric_piece' ? 'on fabric piece' : (value ?? '').trim();

export function labelAttachmentFact(label: {
  attachment?: string | null;
  foldAxis?: string | null;
}): LabelAttachmentFact {
  const word = (label.attachment ?? '').trim();
  const stitch = stitchForAttachment(word, label.foldAxis ?? '');
  const notSewn = NOT_SEWN_ATTACHMENTS.has(word);
  const scheme: LabelStitchScheme =
    word === 'on_fabric_piece' ? 'piece' : SCHEME_OF_STITCH[stitch] ?? 'none';
  const sides =
    scheme === 'top_bottom' ? 'top + bottom' : scheme === 'left_right' ? 'left + right' : '';
  const words = [attachmentWord(word), sides, notSewn ? 'not sewn' : '']
    .filter(Boolean)
    .join(' · ');
  return { words, scheme, stitch, notSewn };
}
