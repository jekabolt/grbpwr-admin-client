// Wire ↔ client: proto `common.TechCardPieceFold` ↔ StoredFold. Kept here, not on the generated types,
// so the resolver does not depend on the proto pin; the shapes are 1:1 with techcard.proto.

import type {
  FoldKind,
  FoldSource,
  StoredFold,
  TechCardPieceFoldKindWire,
  TechCardPieceFoldSampleWire,
  TechCardPieceFoldSourceWire,
  TechCardPieceFoldWire,
  UV,
} from './types';

const KIND: Record<FoldKind, TechCardPieceFoldKindWire> = {
  inward: 'TECH_CARD_PIECE_FOLD_KIND_INWARD',
  outward: 'TECH_CARD_PIECE_FOLD_KIND_OUTWARD',
  pleat: 'TECH_CARD_PIECE_FOLD_KIND_PLEAT',
  pleat_l: 'TECH_CARD_PIECE_FOLD_KIND_PLEAT_LEFT',
  pleat_r: 'TECH_CARD_PIECE_FOLD_KIND_PLEAT_RIGHT',
};
const SOURCE: Record<FoldSource, TechCardPieceFoldSourceWire> = {
  dxf: 'TECH_CARD_PIECE_FOLD_SOURCE_DXF',
  owner: 'TECH_CARD_PIECE_FOLD_SOURCE_OWNER',
  accepted_hint: 'TECH_CARD_PIECE_FOLD_SOURCE_ACCEPTED_HINT',
};
const invert = <K extends string, V extends string>(m: Record<K, V>) =>
  new Map(Object.entries(m).map(([k, v]) => [v as V, k as K]));
const KIND_IN = invert(KIND);
const SOURCE_IN = invert(SOURCE);

/** Three decimals in the unit square ≈ 0.5 mm on a 50 cm piece — what the seams send too. */
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const sampleOut = ([u, v]: UV): TechCardPieceFoldSampleWire => ({ u: r3(u), v: r3(v) });
const sampleIn = (s: TechCardPieceFoldSampleWire | undefined): UV => [s?.u ?? 0, s?.v ?? 0];

/** StoredFold → the upsert payload row (output-only fields left out). */
export function foldToWire(f: StoredFold): TechCardPieceFoldWire {
  return {
    foldKey: f.foldKey,
    pieceLineKey: f.pieceKey,
    seq: f.seq,
    kind: KIND[f.kind],
    line: f.line.map(sampleOut),
    flipAt: sampleOut(f.flipAt),
    edgeHint: f.edge?.hint ?? '',
    edgeSamples: f.edge ? f.edge.samples.map(sampleOut) : [],
    offsetMm: f.edge ? Math.round(f.edge.offsetMm * 100) / 100 : 0,
    contourSig: f.contourSig,
    source: SOURCE[f.source],
    anchoredSize: f.anchoredSize,
    note: f.note,
  };
}

/**
 * A wire row → StoredFold, or null when the row cannot be read (a kind this client does not know, a
 * malformed line). A row the client cannot read is never guessed at.
 */
export function foldFromWire(w: TechCardPieceFoldWire): StoredFold | null {
  const kind = w.kind ? KIND_IN.get(w.kind) : undefined;
  const source = w.source ? SOURCE_IN.get(w.source) : undefined;
  const line = w.line ?? [];
  if (!w.foldKey || !w.pieceLineKey || !kind || !source || line.length !== 2) return null;
  const samples = (w.edgeSamples ?? []).map(sampleIn);
  const offsetMm = w.offsetMm ?? 0;
  return {
    foldKey: w.foldKey,
    pieceKey: w.pieceLineKey,
    seq: w.seq ?? 1,
    kind,
    source,
    line: [sampleIn(line[0]), sampleIn(line[1])],
    flipAt: sampleIn(w.flipAt),
    edge:
      samples.length === 5 && offsetMm > 0 ? { hint: w.edgeHint ?? '', samples, offsetMm } : null,
    contourSig: w.contourSig ?? '',
    anchoredSize: w.anchoredSize ?? '',
    note: w.note ?? '',
    stale: !!w.stale,
    createdBy: w.createdBy,
    updatedBy: w.updatedBy,
    updatedAt: w.updatedAt,
  };
}

/** The card's list → StoredFolds; unreadable rows are dropped and counted. */
export function foldsFromWire(rows: readonly TechCardPieceFoldWire[] | undefined): {
  folds: StoredFold[];
  unreadable: number;
} {
  const folds: StoredFold[] = [];
  let unreadable = 0;
  for (const w of rows ?? []) {
    const f = foldFromWire(w);
    if (f) folds.push(f);
    else unreadable++;
  }
  return { folds, unreadable };
}
