// sizes/ (A6) — how many sizes the sheet draws, from independent evidences.
//
// Asked only where the source does not state the count (pieces/grade/expected.ts: an encoded run,
// or a one-size file whose NAME carries its size, is 'source' and never comes here). The caller
// passes only what feeds the SELECTED sheet: its own texts and the instruction texts of its files,
// its faces, its files. Each evidence gives the counts it allows, an independence group, and
// whether it counts toward AUTO or is only shown:
//   nests     (geometry) the rings around the closed outlines (A2 faces). It COUNTS only for one
//             size, proven: every seeded outline has one line around it (depth 1, no nested copy,
//             seam or inner contour of its shape inside), and no two of the largest outlines are
//             one shape at two scales (sizes drawn side by side). Deeper nests are a suggestion:
//             a ring may be a seam line, a lining, an inner contour — not proven to be a size.
//   label     (text) one size named in text — "SIZE 38", "SIZE: M", "Gr. 40", "р. 48". A sample
//             size title sits on graded sheets too, so it COUNTS only where the geometry proves one
//             size (the nests above); otherwise it only NAMES the run once one size is known.
//   text-run  (text) a size run in text with the size keyword, or a legend of "Size X" items
//             ("36–46" allows 6 at step 2 and 11 at step 1). A legend made of each file's own
//             printed size (one per file, or the size its name carries) is the file fact: group
//             'files', so it never counts twice with the file names.
//   files     (files) several files feeding the sheet, each naming a different size.
//   ai        (ai) A3's `sizes_drawn` off the sheet (hook; not given yet).
// D3: the count is inferred only when counting evidences of two or more groups allow one n and NO
// counting evidence disallows it (a legend "36–46" beside one-line outlines → asked, as before). A
// sheet with several models is never inferred (its texts and outlines are not split per model).
// The card's size run is never an evidence (H1c-4) and is not read here at all.
import type { CountEvidence, FaceJunk, FileId, SizeRun } from 'lib/pattern-import/types';

import { fileSizeLabel } from './recover';
import { parseSizeToken, runsInText } from './tokens';

/** The part of an A2 face blob the nest evidence reads. */
export type NestBlob = {
  id: number;
  areaMm2: number;
  depth: number;
  junk: FaceJunk | null;
  aside?: boolean;
  inside?: number;
};

/** A text with where it was printed (null = not known). */
export type TextObs = { text: string; file: FileId | null };

/** Scale-free shape of a blob (Hu invariants h1…h4 of its pixels, log10). */
export type BlobShape = { px: number; hu: number[] };

export type CountEvidenceInput = {
  /** The sheet's texts and the instruction texts of the files feeding it. */
  texts: readonly TextObs[];
  /** A2 face blobs of the sheet (null = not computed). */
  blobs?: readonly NestBlob[] | null;
  /** Shapes of the top-level blobs (`blobShapes`); absent = scaled copies cannot be ruled out. */
  shapes?: ReadonlyMap<number, BlobShape> | null;
  /** The files feeding the sheet. */
  files?: readonly { id: FileId; name: string }[];
  /** A3 hook: the AI's count of sizes drawn on the sheet. */
  ai?: { sizesDrawn?: number | null } | null;
  /** Models (variants) the sheet names: more than one → never inferred. */
  models?: number;
};

export type CountEvidenceResult = {
  /** The count counting evidences of two or more groups agree on, none disallowing; null = ask. */
  n: number | null;
  evidence: CountEvidence[];
  /** The one size the text names — names the run once one size is known (inferred or answered). */
  label: string | null;
  /** Why it is not inferred whatever the evidences say. */
  blocked?: string;
};

export const COUNT_EVIDENCE = {
  /** Outlines the nest evidence needs at least. */
  nestMin: 2,
  /** Largest outlines compared for one shape drawn at two scales. */
  dupTop: 12,
  /** Area ratio of two sizes of one piece side by side (adjacent sizes ≈ 1.05, extremes ≈ 2). */
  dupRatio: [1.015, 2.5] as const,
  /** Largest |Δ log10 h| over h1…h4 for "one shape". */
  dupShape: 0.12,
  /** Share of the outlines at the mode depth for a (non-counting) depth suggestion. */
  nestShare: 2 / 3,
};

const SIZE_KW =
  '(?:size|sizes|größe|grösse|gr\\.|taille|talla|taglia|maat|rozmiar|размер|розмір|р\\.)';
// "SIZE 38", "SIZE: M", "Gr. 40" anywhere in a text item ("ID: 1 PRZÓD SIZE: M"); the token ends at
// a space / punctuation, not a dash or a slash (that is a run: "36-46", "36/38"), and a unit after
// it makes it a measure ("size 4 cm")
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

const canon = (l: string) => parseSizeToken(l, true)?.label ?? l.toUpperCase();

/**
 * Each file's own printed size: the one label printed in it, or the label its name carries — the
 * same fact as the file evidence.
 */
function ownLabels(
  texts: readonly TextObs[],
  files: CountEvidenceInput['files'],
): Map<string, FileId> {
  const own = new Map<string, FileId>();
  for (const f of files ?? []) {
    const named = fileSizeLabel(f.name);
    const printed = sizeLabelsIn(texts.filter((t) => t.file === f.id).map((t) => t.text));
    for (const l of printed)
      if (printed.length === 1 || (named && canon(named) === canon(l))) own.set(canon(l), f.id);
  }
  return own;
}

function textEvidence(input: CountEvidenceInput): {
  run: CountEvidence | null;
  label: CountEvidence | null;
} {
  const texts = input.texts.map((t) => t.text);
  const runs = runsInText(texts).filter((r) => r.keyword || r.kind === 'legend');
  if (runs.length) {
    const own = ownLabels(input.texts, input.files);
    // a legend whose every size is a different file's own printed size = the file names again
    const fileFact = runs.every(
      (r) =>
        r.kind === 'legend' &&
        r.labels.every((l) => own.has(canon(l))) &&
        new Set(r.labels.map((l) => own.get(canon(l)))).size === r.labels.length,
    );
    const ns = [...new Set(runs.map((r) => r.labels.length))].sort((a, b) => a - b);
    return {
      run: {
        kind: 'text-run',
        n: ns,
        group: fileFact ? 'files' : 'text',
        counts: true,
        detail: [...new Set(runs.map((r) => r.source))].slice(0, 3).join(' · '),
      },
      label: null,
    };
  }
  const labels = sizeLabelsIn(texts);
  if (labels.length !== 1) return { run: null, label: null };
  return {
    run: null,
    label: {
      kind: 'label',
      n: [1],
      group: 'text',
      counts: false,
      detail: `size ${labels[0]} named`,
      label: labels[0],
    },
  };
}

/** Two of the largest outlines that are one shape at two scales (sizes side by side), if any. */
export function scaledCopy(
  top: readonly NestBlob[],
  shapes: ReadonlyMap<number, BlobShape>,
): [NestBlob, NestBlob] | null {
  const [lo, hi] = COUNT_EVIDENCE.dupRatio;
  const xs = top.slice(0, COUNT_EVIDENCE.dupTop);
  for (let i = 0; i < xs.length; i++)
    for (let j = i + 1; j < xs.length; j++) {
      const a = shapes.get(xs[i].id);
      const b = shapes.get(xs[j].id);
      if (!a || !b) continue;
      const r = Math.max(a.px, b.px) / Math.max(1, Math.min(a.px, b.px));
      if (r < lo || r > hi) continue;
      const d = Math.max(...a.hu.map((h, k) => Math.abs(h - b.hu[k])));
      if (d <= COUNT_EVIDENCE.dupShape) return [xs[i], xs[j]];
    }
  return null;
}

const RING: ReadonlySet<FaceJunk> = new Set<FaceJunk>(['seam-line', 'size-copy']);

function nestEvidence(input: CountEvidenceInput): CountEvidence | null {
  const blobs = input.blobs;
  if (!blobs) return null;
  const top = blobs
    .filter((b) => !b.junk && !b.aside && b.inside == null && b.depth >= 1)
    .sort((a, b) => b.areaMm2 - a.areaMm2);
  if (top.length < COUNT_EVIDENCE.nestMin) return null;
  const ids = new Set(top.map((b) => b.id));
  // a ring = an outline of the host's own shape inside it (A2's per-outline judgement: another
  // size of it, or its seam / lining line). A label box, a mark (other pen), a yoke split (inner
  // line) or a piece drawn inside is not a ring — it draws no second size of the host
  const ringed = new Set(
    blobs
      .filter((b) => b.inside != null && ids.has(b.inside) && b.junk != null && RING.has(b.junk))
      .map((b) => b.inside),
  );
  const one = top.every((b) => b.depth === 1 && !ringed.has(b.id));
  if (one) {
    const dup = input.shapes ? scaledCopy(top, input.shapes) : null;
    if (input.shapes && !dup)
      return {
        kind: 'nests',
        n: [1],
        group: 'geometry',
        counts: true,
        detail: `one line around each of ${top.length} outlines, no outline drawn at two scales`,
      };
    return {
      kind: 'nests',
      n: [],
      group: 'geometry',
      counts: false,
      detail: dup
        ? `outlines of ${Math.round(dup[0].areaMm2 / 100)} and ${Math.round(dup[1].areaMm2 / 100)} cm² are one shape at two scales — sizes side by side?`
        : 'one line around each outline, scaled copies not checked',
    };
  }
  const by = new Map<number, number>();
  for (const b of top.slice(0, 5)) by.set(b.depth, (by.get(b.depth) ?? 0) + 1);
  const [depth, k] = [...by].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  const share =
    k >= COUNT_EVIDENCE.nestMin && k >= COUNT_EVIDENCE.nestShare * Math.min(5, top.length);
  return {
    kind: 'nests',
    n: share ? [depth] : [],
    group: 'geometry',
    counts: false,
    detail: share
      ? `depth ${depth} on ${k} of the largest outlines — rings not proven to be sizes (seam, lining, inner lines)`
      : 'outlines nested to different depths',
  };
}

function fileEvidence(files: CountEvidenceInput['files']): CountEvidence | null {
  if (!files || files.length < 2) return null;
  const labels = files.map((f) => fileSizeLabel(f.name));
  if (labels.some((l) => !l) || new Set(labels.map((l) => canon(l!))).size !== labels.length)
    return null;
  return {
    kind: 'files',
    n: [files.length],
    group: 'files',
    counts: true,
    detail: `${files.length} files: ${labels.join(' ')}`,
  };
}

/** The evidences of the sheet's size count, and the count when they agree (D3). */
export function countEvidence(input: CountEvidenceInput): CountEvidenceResult {
  const nests = nestEvidence(input);
  const { run, label } = textEvidence(input);
  // a named size counts only where the geometry proves one size on its own
  if (label && nests?.counts && nests.n.length === 1 && nests.n[0] === 1) label.counts = true;
  const ai = input.ai?.sizesDrawn;
  const evidence = [
    label,
    run,
    nests,
    fileEvidence(input.files),
    ai != null && ai >= 1
      ? ({
          kind: 'ai',
          n: [Math.round(ai)],
          group: 'ai',
          counts: true,
          detail: `the AI counts ${Math.round(ai)}`,
        } as CountEvidence)
      : null,
  ].filter((e): e is CountEvidence => !!e);
  const named = label?.label ?? null;
  if ((input.models ?? 0) > 1)
    return { n: null, evidence, label: named, blocked: `${input.models} models on this sheet` };
  const counting = evidence.filter((e) => e.counts);
  if (new Set(counting.map((e) => e.group)).size < 2) return { n: null, evidence, label: named };
  // every counting evidence must allow it (one disagreeing → ask)
  let common = counting[0].n;
  for (const e of counting.slice(1)) common = common.filter((n) => e.n.includes(n));
  return { n: common.length === 1 ? common[0] : null, evidence, label: named };
}

/**
 * What feeds the selected sheet (A6 counts nothing else): the files it is assembled from, its own
 * texts and the instruction texts printed in those files.
 */
export function sheetFeed<F extends { id: FileId }>(
  sheet: {
    poses: readonly { file: FileId }[];
    texts: readonly { text: string; src?: { file: FileId } }[];
  },
  files: readonly F[],
  docTexts: readonly { file: FileId; text: string }[],
): { files: F[]; texts: TextObs[] } {
  const feeding = new Set(sheet.poses.map((p) => p.file));
  return {
    files: files.filter((f) => feeding.has(f.id)),
    texts: [
      ...sheet.texts.map((t) => ({ text: t.text, file: t.src?.file ?? null })),
      ...docTexts.filter((t) => feeding.has(t.file)),
    ],
  };
}

/** "label + nests" — the evidences an AUTO count stands on, for the pill. */
export const evidenceKinds = (ev: readonly CountEvidence[]) =>
  ev
    .filter((e) => e.counts)
    .map((e) => (e.kind === 'text-run' ? 'text' : e.kind))
    .join(' + ');

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

/**
 * Scale-free shapes of the given blobs off the face raster: Hu's invariants h1…h4 (log10) of each
 * blob's pixels (its walls included) — the same piece drawn at another size has the same shape.
 */
export function blobShapes(
  map: { g: { W: number; H: number }; blobAt: Int32Array },
  ids: ReadonlySet<number>,
): Map<number, BlobShape> {
  const { W } = map.g;
  const acc = new Map<number, number[]>();
  for (const id of ids) acc.set(id, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const at = map.blobAt;
  for (let k = 0; k < at.length; k++) {
    const a = acc.get(at[k]);
    if (!a) continue;
    a[0]++;
    a[1] += k % W;
    a[2] += Math.floor(k / W);
  }
  for (const a of acc.values()) if (a[0]) (a[1] /= a[0]), (a[2] /= a[0]);
  // central moments: 3 mu20, 4 mu11, 5 mu02, 6 mu30, 7 mu21, 8 mu12, 9 mu03
  for (let k = 0; k < at.length; k++) {
    const a = acc.get(at[k]);
    if (!a) continue;
    const x = (k % W) - a[1];
    const y = Math.floor(k / W) - a[2];
    a[3] += x * x;
    a[4] += x * y;
    a[5] += y * y;
    a[6] += x * x * x;
    a[7] += x * x * y;
    a[8] += x * y * y;
    a[9] += y * y * y;
  }
  const out = new Map<number, BlobShape>();
  for (const [id, a] of acc) {
    const m = a[0];
    if (m < 50) continue;
    const e2 = m ** 2;
    const e3 = m ** 2.5;
    const n20 = a[3] / e2;
    const n11 = a[4] / e2;
    const n02 = a[5] / e2;
    const n30 = a[6] / e3;
    const n21 = a[7] / e3;
    const n12 = a[8] / e3;
    const n03 = a[9] / e3;
    const h = [
      n20 + n02,
      (n20 - n02) ** 2 + 4 * n11 ** 2,
      (n30 - 3 * n12) ** 2 + (3 * n21 - n03) ** 2,
      (n30 + n12) ** 2 + (n21 + n03) ** 2,
    ];
    out.set(id, { px: m, hu: h.map((v) => Math.log10(Math.max(v, 1e-12))) });
  }
  return out;
}
