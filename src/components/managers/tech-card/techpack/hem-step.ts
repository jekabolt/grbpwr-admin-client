// What makes a step a hem on paper, and the words of its finish. `work`, `seam_kind` and
// `seam_class` disagree on real cards (`hem_turned` with `ss_plain`, a NULL kind on most old steps),
// so any of the three can name it; a kind that is set and says otherwise (`edge_overlock` carries the
// `ef_hem_raw` class) outranks the class it shares.

import { SEAM_KINDS } from '../op-icons/seam-kinds';

const HEM_WORKS = new Set(['hem_turned', 'moscow_hem']);
const HEM_KINDS = new Set([
  'hem_closed',
  'hem_raw',
  'hem_zigzag',
  'moscow_hem',
  'blind_hem',
  'cover_hem',
]);
const HEM_CLASS_WORDS: Readonly<Record<string, string>> = {
  TECH_CARD_SEAM_CLASS_EF_HEM_TURNED: 'Turned twice',
  TECH_CARD_SEAM_CLASS_EF_HEM_RAW: 'Raw edge',
};
/** `hem_closed` reads as the finish the owner writes; the other kinds keep their catalogue label. */
const KIND_WORDS: Readonly<Record<string, string>> = {
  hem_closed: 'Turned twice, closed edge',
};

export type HemStepFacts = {
  work?: string | null;
  seamKind?: string | null;
  seamClass?: string | null;
};

const clean = (value?: string | null) => (value ?? '').trim();

export const isHemClass = (seamClass?: string | null) => clean(seamClass) in HEM_CLASS_WORDS;

export function isHemStep({ work, seamKind, seamClass }: HemStepFacts): boolean {
  if (HEM_WORKS.has(clean(work))) return true;
  const kind = clean(seamKind);
  return kind ? HEM_KINDS.has(kind) : isHemClass(seamClass);
}

/** The finish in words, from the step's kind and then its class; empty when neither is a hem. */
export function hemFinishWords({ seamKind, seamClass }: HemStepFacts): string {
  const kind = clean(seamKind);
  if (HEM_KINDS.has(kind))
    return KIND_WORDS[kind] ?? SEAM_KINDS.find((entry) => entry.token === kind)?.label ?? '';
  return HEM_CLASS_WORDS[clean(seamClass)] ?? '';
}
