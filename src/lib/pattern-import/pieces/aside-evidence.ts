// D3 evidence for piece-sized outlines set aside by the face pass. This module only explains a
// set-aside; the autopilot policy decides whether to proceed and records the D5 assumption.
import type {
  BoxMm,
  PieceCandidate,
  PieceFamily,
  Seed,
  SeedId,
  SetAside,
  SetAsideEvidence,
  Sheet,
  SizeRun,
  VariantMark,
} from '../types';
import { PATIMPORT } from '../types';
import { pointInPoly } from './geom';
import type { FaceMap } from './faces';

type Closed = PieceCandidate & { outcome: 'closed' };
type Shell = {
  aside: SetAside;
  family: PieceFamily;
  sizes: Closed[];
  /** Two named model lines explain the one edge by which the shell may exceed the chosen model. */
  variantModels?: string[];
};

const closedOf = (f: PieceFamily): Closed[] =>
  f.candidates.filter((c): c is Closed => c.outcome === 'closed' && c.outer.length > 2);

const dims = (b: BoxMm) => [b.maxX - b.minX, b.maxY - b.minY] as const;
const nearDim = (a: number, b: number) => Math.abs(a - b) <= Math.max(6, 0.04 * Math.max(a, b));
const atFamily = (p: { x: number; y: number }, families: readonly PieceFamily[]) =>
  families.find((f) => closedOf(f).some((c) => pointInPoly(p, c.outer)));

/** An unlabelled face is the outer shell of a family already seeded in every drawn size. */
function familyShells(
  asides: readonly SetAside[],
  families: readonly PieceFamily[],
  marks: readonly VariantMark[],
): Shell[] {
  const out: Shell[] = [];
  for (const a of asides) {
    if (a.reason !== 'unlabelled') continue;
    for (const family of families) {
      const sizes = closedOf(family);
      if (sizes.length < 2 || !sizes.every((c) => pointInPoly(a.at, c.outer))) continue;
      const largest = sizes.reduce((x, y) => (x.areaMm2 >= y.areaMm2 ? x : y));
      const ratio = a.areaMm2 / Math.max(1, largest.areaMm2);
      const [aw, ah] = dims(a.box);
      const [fw, fh] = dims(largest.bbox);
      // Independent of containment: the face and largest filled outline have the same extent and
      // area. A small real piece nested inside another therefore cannot be called a shell.
      const exact = ratio >= 0.9 && ratio <= 1.12 && nearDim(aw, fw) && nearDim(ah, fh);
      const models = [
        ...new Set(
          marks
            .filter((m) => !m.uncertain && m.kind !== 'piece' && m.pieces.includes(family.seed))
            .map((m) => m.label),
        ),
      ];
      const edges = [
        Math.abs(a.box.minX - largest.bbox.minX),
        Math.abs(a.box.maxX - largest.bbox.maxX),
        Math.abs(a.box.minY - largest.bbox.minY),
        Math.abs(a.box.maxY - largest.bbox.maxY),
      ].filter((d) => d <= 8).length;
      // A multi-model piece's raw face can include the band beyond the chosen model. Three edges
      // still coincide; the two models' named cut lines explain the fourth independently.
      const variantExpanded = ratio >= 0.9 && ratio <= 1.5 && edges >= 3 && models.length >= 2;
      if (!exact && !variantExpanded) continue;
      out.push({ aside: a, family, sizes, ...(variantExpanded ? { variantModels: models } : {}) });
      break;
    }
  }
  return out;
}

const sameHost = (a: SetAside, b: SetAside) =>
  !!a.copy?.host &&
  !!b.copy?.host &&
  Math.hypot(a.copy.host.x - b.copy.host.x, a.copy.host.y - b.copy.host.y) <= 1;

const similarStrip = (a: SetAside, b: SetAside) => {
  const [aw, ah] = dims(a.box);
  const [bw, bh] = dims(b.box);
  const near = (x: number, y: number) => Math.abs(x - y) <= Math.max(2, 0.15 * Math.max(x, y));
  return near(aw, bw) && near(ah, bh) && near(a.areaMm2, b.areaMm2);
};

const seedAt = (a: SetAside, seeds: readonly Seed[]): SeedId | null => {
  const h = a.copy?.host;
  if (!h) return null;
  return seeds.find((s) => Math.hypot(s.at.x - h.x, s.at.y - h.y) <= 1)?.id ?? null;
};

/**
 * A complete N−1 ladder of congruent `lines` faces inside one N-size family is the space between
 * adjacent graded outlines, not N−1 more pieces. The face-pass account and complete ladder are
 * independent evidences; every strip must lie inside some but not all size outlines.
 */
function gradeStripEvidence(
  asides: readonly SetAside[],
  families: readonly PieceFamily[],
  seeds: readonly Seed[],
): SetAsideEvidence[] {
  const out: SetAsideEvidence[] = [];
  const eligible = asides.flatMap((a) => {
    if (a.reason !== 'size-copy' || a.copy?.how !== 'lines' || a.copy.ownLabel) return [];
    const seed = seedAt(a, seeds);
    const family = seed == null ? null : families.find((f) => f.seed === seed) ?? null;
    const sizes = family ? closedOf(family) : [];
    if (!family || sizes.length < 3) return [];
    const inside = sizes.filter((c) => pointInPoly(a.at, c.outer)).length;
    return inside > 0 && inside < sizes.length ? [{ aside: a, seed: seed!, sizes }] : [];
  });
  for (const { aside: a, seed, sizes } of eligible) {
    // `inside` above is the geometric price; peer grouping below is only scalar comparisons.
    const peers = eligible.filter(
      (x) =>
        x.seed === seed &&
        x.sizes.length === sizes.length &&
        sameHost(a, x.aside) &&
        similarStrip(a, x.aside),
    );
    if (peers.length !== sizes.length - 1) continue;
    out.push({
      id: a.id,
      verdict: 'not-piece',
      kind: 'grade-strip',
      seed,
      evidence: [
        `the face pass ties it to seed ${seed} across that family's size lines (no label of its own)`,
        `${peers.length} congruent adjacent strips account for an ${sizes.length}-size graded ladder`,
      ],
    });
  }
  return out;
}

/** Liang–Barsky: the actual segment enters the padded box (a broad curved line's bbox is not evidence). */
const segmentInBox = (
  a: { x: number; y: number },
  b: { x: number; y: number },
  box: BoxMm,
  pad: number,
) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let lo = 0;
  let hi = 1;
  for (const [p, q] of [
    [-dx, a.x - (box.minX - pad)],
    [dx, box.maxX + pad - a.x],
    [-dy, a.y - (box.minY - pad)],
    [dy, box.maxY + pad - a.y],
  ] as const) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) lo = Math.max(lo, r);
    else hi = Math.min(hi, r);
    if (lo > hi) return false;
  }
  return true;
};

const lineInBox = (pts: readonly { x: number; y: number }[], box: BoxMm, pad = 2) =>
  pts.some((p, i) => i > 0 && segmentInBox(pts[i - 1], p, box, pad));

/** Regions inside a proved family shell and crossed by two models' certain cut marks. */
function variantBandEvidence(
  asides: readonly SetAside[],
  map: FaceMap,
  marks: readonly VariantMark[],
  shells: readonly Shell[],
): SetAsideEvidence[] {
  const out: SetAsideEvidence[] = [];
  for (const a of asides) {
    if (a.reason !== 'joined' && a.reason !== 'size-copy') continue;
    const parent = map.blobs.find((b) => b.id === a.id)?.inside;
    const shell = parent == null ? null : shells.find((x) => x.aside.id === parent) ?? null;
    if (!shell) continue;
    const touching = marks.filter(
      (m) =>
        !m.uncertain &&
        m.kind !== 'piece' &&
        m.pieces.includes(shell.family.seed) &&
        m.cutLines.some((l) => lineInBox(l.poly, a.box)),
    );
    const models = [...new Set(touching.map((m) => m.label))];
    if (models.length < 2) continue;
    out.push({
      id: a.id,
      verdict: 'not-piece',
      kind: 'variant-band',
      seed: shell.family.seed,
      parent,
      evidence: [
        `it lies inside outline ${parent}, already matched to seeded family ${shell.family.seed}`,
        `certain cut marks for ${models.join(' and ')} cross the same region for that family`,
      ],
    });
  }
  return out;
}

const textIn = (sheet: Sheet, a: SetAside) =>
  sheet.texts
    .filter(
      (t) =>
        t.anchor.x >= a.box.minX &&
        t.anchor.x <= a.box.maxX &&
        t.anchor.y >= a.box.minY &&
        t.anchor.y <= a.box.maxY,
    )
    .map((t) => t.text.trim())
    .filter(Boolean);

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
const DOCUMENT_HEADINGS = [
  /pattern complexity/,
  /recommended fabrics?/,
  /fabric requirements?/,
  /supplies/,
  /measurements?/,
  /select size/,
];

/** Size-key and instruction/overview panels, plus their non-family illustration outlines. */
function documentPanelEvidence(
  sheet: Sheet,
  map: FaceMap,
  asides: readonly SetAside[],
  families: readonly PieceFamily[],
  run: SizeRun,
): SetAsideEvidence[] {
  const out: SetAsideEvidence[] = [];
  const roots = new Set<number>();
  for (const a of asides) {
    if (a.reason !== 'unlabelled' || atFamily(a.at, families)) continue;
    const words = textIn(sheet, a);
    const all = norm(words.join(' '));
    const sourceSizes = new Set(run.sizes.map((z) => norm(z.label)).filter(Boolean));
    const shownSizes = new Set(words.map(norm).filter((x) => sourceSizes.has(x)));
    const sizeGuide =
      /\bsize guide\b/.test(all) && shownSizes.size >= Math.max(3, sourceSizes.size - 1);
    const headings = DOCUMENT_HEADINGS.filter((r) => r.test(all)).length;
    const children = asides.filter(
      (x) =>
        map.blobs.find((b) => b.id === x.id)?.inside === a.id &&
        x.areaMm2 >= PATIMPORT.minPieceAreaMm2,
    );
    const document = headings >= 3 && children.length >= 2;
    if (!sizeGuide && !document) continue;
    roots.add(a.id);
    out.push({
      id: a.id,
      verdict: 'not-piece',
      kind: 'document-panel',
      evidence: sizeGuide
        ? [
            'the enclosed heading says “Size Guide”',
            `${shownSizes.size}/${sourceSizes.size} source size labels are listed inside it`,
          ]
        : [
            `${headings} document-section headings are enclosed`,
            `${children.length} nested piece-sized illustration/table outlines are enclosed, none in a seeded family`,
          ],
    });
  }
  for (const a of asides) {
    const parent = map.blobs.find((b) => b.id === a.id)?.inside;
    if (parent == null || !roots.has(parent) || atFamily(a.at, families)) continue;
    out.push({
      id: a.id,
      verdict: 'not-piece',
      kind: 'document-panel',
      parent,
      evidence: [
        `it is nested inside proved document panel ${parent}`,
        'its point lies in no closed candidate of any seeded family',
      ],
    });
  }
  return out;
}

/**
 * Explain every set-aside for which the worker has two independent non-piece facts. Ambiguous ids
 * are deliberately absent and remain one operator question in the autopilot policy.
 */
export function setAsideEvidenceOf(
  sheet: Sheet,
  map: FaceMap,
  asides: readonly SetAside[],
  families: readonly PieceFamily[],
  seeds: readonly Seed[],
  marks: readonly VariantMark[],
  run: SizeRun,
): SetAsideEvidence[] {
  const shells = familyShells(asides, families, marks);
  const evidence: SetAsideEvidence[] = [
    ...shells.map(({ aside, family, sizes, variantModels }) => ({
      id: aside.id,
      verdict: 'not-piece' as const,
      kind: 'family-shell' as const,
      seed: family.seed,
      evidence: [
        `its point lies inside every one of seed ${family.seed}'s ${sizes.length} closed size outlines`,
        variantModels
          ? `three bounds match that family; the remaining edge is explained by ${variantModels.join(' / ')} cut marks`
          : 'its area and bounding box match that family’s largest outline',
      ],
    })),
    ...gradeStripEvidence(asides, families, seeds),
    ...variantBandEvidence(asides, map, marks, shells),
    ...documentPanelEvidence(sheet, map, asides, families, run),
  ];
  // One explanation per id. Every emitted verdict must uphold D3 by construction.
  const by = new Map<number, SetAsideEvidence>();
  for (const e of evidence) if (e.evidence.length >= 2 && !by.has(e.id)) by.set(e.id, e);
  return [...by.values()].sort((a, b) => a.id - b.id);
}
