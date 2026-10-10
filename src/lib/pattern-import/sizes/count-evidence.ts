// sizes/ (A6) — how many sizes the sheet draws, from independent evidences.
//
// Asked only where the source does not state the count (pieces/grade/expected.ts: an encoded run,
// or a one-size file whose NAME carries its size, is 'source' and never comes here). Each evidence
// gives the counts it allows:
//   label     one size named in text — "SIZE 38", "SIZE: M", "Gr. 40", "р. 48" — on the sheet or
//             the instruction pages, and no size run there → 1 (and the label, for the size map);
//   text-run  a size run in text with the size keyword, or a legend of "Size X" items ("36–46"
//             allows 6 at step 2 and 11 at step 1 — every reading the run parser keeps);
//   nests     the nesting depth of the largest closed outlines (A2 faces: depth 1 = one line
//             around the seed point): the mode over the (up to) five largest, at least two of them
//             and two thirds agreeing. A sheet with a seam-line class draws two lines per size:
//             depth d allows d and d − 1;
//   files     several files, each naming a different size (file-per-size the reader did not
//             encode);
//   ai        A3's `sizes_drawn` off the sheet (hook; not given yet).
// D3: the count is inferred only when two or more evidences allow one n and NONE disallows it
// (a legend "36–46" beside one-line nests is a disagreement → the operator is asked, as before).
// The card's size run is never an evidence (H1c-4): it only breaks a tie between counts every
// evidence allows.
import type {
  CountEvidence,
  FaceJunk,
  IRText,
  SizeRun,
  SourceFileInfo,
} from 'lib/pattern-import/types';

import { fileSizeLabel } from './recover';
import { parseSizeToken, runsInText } from './tokens';

/** The part of an A2 face blob the nest evidence reads. */
export type NestBlob = {
  areaMm2: number;
  depth: number;
  junk: FaceJunk | null;
  aside?: boolean;
  inside?: number;
};

export type CountEvidenceInput = {
  /** Texts on the sheet (`Sheet.texts`). */
  sheetTexts: readonly Pick<IRText, 'text'>[];
  /** Texts of the instruction pages (worker `docTexts`). */
  docTexts?: readonly string[];
  /** A2 face blobs of the sheet (null = not computed). */
  blobs?: readonly NestBlob[] | null;
  /** The chain set has a seam-line class with lines (two lines per size around a piece). */
  seamLines?: boolean;
  files?: readonly Pick<SourceFileInfo, 'name'>[];
  /** A3 hook: the AI's count of sizes drawn on the sheet. */
  ai?: { sizesDrawn?: number | null } | null;
  /** The card's size count — a tie-break between counts every evidence allows, never an evidence. */
  cardCount?: number;
};

export type CountEvidenceResult = {
  /** The count two or more evidences agree on and none disallows; null = ask. */
  n: number | null;
  evidence: CountEvidence[];
  /** The one size the text names (with n = 1), for the size map. */
  label: string | null;
};

export const COUNT_EVIDENCE = {
  /** Largest outlines the nest evidence reads. */
  nestTop: 5,
  /** Outlines it needs at least. */
  nestMin: 2,
  /** Share of them that must sit at the mode depth. */
  nestShare: 2 / 3,
};

const SIZE_KW =
  '(?:size|sizes|größe|grösse|gr\\.|taille|talla|taglia|maat|rozmiar|размер|розмір|р\\.)';
// "SIZE 38", "SIZE: M", "Gr. 40" anywhere in a text item ("ID: 1 PRZÓD SIZE: M"); the token ends at
// a space / punctuation, not a dash or a slash (that is a run: "36-46", "36/38"), and a unit after
// it makes it a measure ("size 1 cm")
const LABEL_RE = new RegExp(
  `(?:^|[\\s,;(])${SIZE_KW}\\s*:?\\s*([A-Za-z0-9]{1,4})(?=$|[\\s,;.)])(?!\\s*(?:cm|mm|in|inch|"|”))`,
  'gi',
);

/** The size tokens named one at a time ("SIZE 38") in the texts. */
export function sizeLabelsIn(texts: readonly string[]): string[] {
  const out: string[] = [];
  for (const t of texts)
    for (const m of t.matchAll(LABEL_RE)) {
      const tok = parseSizeToken(m[1], true);
      if (!tok || (tok.kind === 'num' && tok.value < 2)) continue;
      if (!out.includes(tok.label)) out.push(tok.label);
    }
  return out;
}

function textEvidence(texts: readonly string[]): CountEvidence | null {
  const runs = runsInText([...texts]).filter((r) => r.keyword || r.kind === 'legend');
  if (runs.length) {
    const ns = [...new Set(runs.map((r) => r.labels.length))].sort((a, b) => a - b);
    return {
      kind: 'text-run',
      n: ns,
      detail: [...new Set(runs.map((r) => r.source))].slice(0, 3).join(' · '),
    };
  }
  const labels = sizeLabelsIn(texts);
  if (labels.length === 1)
    return { kind: 'label', n: [1], detail: `size ${labels[0]} named`, label: labels[0] };
  return null;
}

function nestEvidence(
  blobs: readonly NestBlob[] | null | undefined,
  seamLines: boolean,
): CountEvidence | null {
  if (!blobs) return null;
  const top = blobs
    .filter((b) => !b.junk && !b.aside && b.inside == null && b.depth >= 1)
    .sort((a, b) => b.areaMm2 - a.areaMm2)
    .slice(0, COUNT_EVIDENCE.nestTop);
  if (top.length < COUNT_EVIDENCE.nestMin) return null;
  const by = new Map<number, number>();
  for (const b of top) by.set(b.depth, (by.get(b.depth) ?? 0) + 1);
  const [depth, k] = [...by].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  if (k < COUNT_EVIDENCE.nestMin || k < COUNT_EVIDENCE.nestShare * top.length) return null;
  const n = seamLines && depth > 1 ? [depth - 1, depth] : [depth];
  return {
    kind: 'nests',
    n,
    detail: `depth ${depth} on ${k} of ${top.length} largest outlines${seamLines && depth > 1 ? ' (a seam line is drawn)' : ''}`,
  };
}

function fileEvidence(files: CountEvidenceInput['files']): CountEvidence | null {
  if (!files || files.length < 2) return null;
  const labels = files.map((f) => fileSizeLabel(f.name));
  if (labels.some((l) => !l) || new Set(labels).size !== labels.length) return null;
  return { kind: 'files', n: [files.length], detail: `${files.length} files: ${labels.join(' ')}` };
}

/** The independent evidences of the sheet's size count, and the count when they agree (D3). */
export function countEvidence(input: CountEvidenceInput): CountEvidenceResult {
  const texts = [...input.sheetTexts.map((t) => t.text), ...(input.docTexts ?? [])];
  const evidence = [
    textEvidence(texts),
    nestEvidence(input.blobs, !!input.seamLines),
    fileEvidence(input.files),
    input.ai?.sizesDrawn != null && input.ai.sizesDrawn >= 1
      ? ({
          kind: 'ai',
          n: [Math.round(input.ai.sizesDrawn)],
          detail: `the AI counts ${Math.round(input.ai.sizesDrawn)}`,
        } as CountEvidence)
      : null,
  ].filter((e): e is CountEvidence => !!e);
  const label = evidence.find((e) => e.kind === 'label')?.label ?? null;
  if (evidence.length < 2) return { n: null, evidence, label: null };
  // every evidence must allow it (one disagreeing evidence → ask)
  let common = evidence[0].n;
  for (const e of evidence.slice(1)) common = common.filter((n) => e.n.includes(n));
  let n: number | null = null;
  if (common.length === 1) n = common[0];
  else if (common.length > 1 && input.cardCount && common.includes(input.cardCount))
    n = input.cardCount;
  return { n, evidence, label: n === 1 ? label : null };
}

/** "label + nests" — the evidences an AUTO count stands on, for the pill. */
export const evidenceKinds = (ev: readonly CountEvidence[]) =>
  ev.map((e) => (e.kind === 'text-run' ? 'text' : e.kind)).join(' + ');

/**
 * The run with its one size labelled by the text ("SIZE 38") once the count is one — inferred or
 * the operator's answer — so the size map can match or suggest it. A run that already carries a
 * label (a file name) keeps it.
 */
export function labelSingleRun(run: SizeRun, label: string | null): SizeRun {
  if (!label || run.sizes.length !== 1 || run.sizes[0].label.trim()) return run;
  return {
    ...run,
    sizes: [{ ...run.sizes[0], label }],
    evidence: [...run.evidence, `size ${label} named on the sheet`],
  };
}
