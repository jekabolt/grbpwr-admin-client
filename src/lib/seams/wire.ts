// Wire ↔ client: proto `common.TechCardSeam` as protojson carries it (enum names, `parts`, u / v
// samples, range 0/0 = the whole run) ↔ StoredSeam. Kept here, not on the generated types, so the
// resolver does not depend on the proto pin; the shapes are 1:1 with techcard.proto.

import type {
  EdgeAnchor,
  StoredSeam,
  StoredSeamDirection,
  StoredSeamKind,
  StoredSeamSource,
  StoredSeamStatus,
  TechCardSeamAnchorWire,
  TechCardSeamDirectionWire,
  TechCardSeamKindWire,
  TechCardSeamSourceWire,
  TechCardSeamStatusWire,
  TechCardSeamWire,
} from './types';

const STATUS: Record<StoredSeamStatus, TechCardSeamStatusWire> = {
  confirmed: 'TECH_CARD_SEAM_STATUS_CONFIRMED',
  rejected: 'TECH_CARD_SEAM_STATUS_REJECTED',
};
const KIND: Record<StoredSeamKind, TechCardSeamKindWire> = {
  edge: 'TECH_CARD_SEAM_KIND_EDGE',
  partial: 'TECH_CARD_SEAM_KIND_PARTIAL',
  composite: 'TECH_CARD_SEAM_KIND_COMPOSITE',
  surface: 'TECH_CARD_SEAM_KIND_SURFACE',
  closure: 'TECH_CARD_SEAM_KIND_CLOSURE',
};
const DIRECTION: Record<StoredSeamDirection, TechCardSeamDirectionWire> = {
  reversed: 'TECH_CARD_SEAM_DIRECTION_REVERSED',
  same: 'TECH_CARD_SEAM_DIRECTION_SAME',
  unknown: 'TECH_CARD_SEAM_DIRECTION_UNKNOWN',
};
const SOURCE: Record<StoredSeamSource, TechCardSeamSourceWire> = {
  graph: 'TECH_CARD_SEAM_SOURCE_GRAPH',
  doll: 'TECH_CARD_SEAM_SOURCE_DOLL',
  order: 'TECH_CARD_SEAM_SOURCE_ORDER',
  manual: 'TECH_CARD_SEAM_SOURCE_MANUAL',
  ai: 'TECH_CARD_SEAM_SOURCE_AI',
};
const invert = <K extends string, V extends string>(m: Record<K, V>) =>
  new Map(Object.entries(m).map(([k, v]) => [v as V, k as K]));
const STATUS_IN = invert(STATUS);
const KIND_IN = invert(KIND);
const DIRECTION_IN = invert(DIRECTION);
const SOURCE_IN = invert(SOURCE);

const anchorToWire = (a: EdgeAnchor): TechCardSeamAnchorWire => {
  const whole = a.range[0] <= 0 && a.range[1] >= 1;
  return {
    pieceLineKey: a.piece,
    samples: a.samples.map(([u, v]) => ({ u, v })),
    perimShare: a.perimShare,
    lenMm: a.lenMm,
    notches: a.notches,
    turnDeg: a.turnDeg,
    rangeFrom: whole ? 0 : a.range[0],
    rangeTo: whole ? 0 : a.range[1],
    edgeHint: a.edgeHint,
    contourSig: a.contourSig,
  };
};

const anchorFromWire = (w: TechCardSeamAnchorWire): EdgeAnchor => {
  const from = w.rangeFrom ?? 0;
  const to = w.rangeTo ?? 0;
  return {
    piece: w.pieceLineKey ?? '',
    samples: (w.samples ?? []).map((s) => [s.u ?? 0, s.v ?? 0]),
    perimShare: w.perimShare ?? 0,
    lenMm: w.lenMm ?? 0,
    notches: w.notches ?? 0,
    turnDeg: w.turnDeg ?? 0,
    // 0 / 0 is the whole run by rule (protojson cannot carry «absent» for doubles).
    range: from === 0 && to === 0 ? [0, 1] : [from, to],
    edgeHint: w.edgeHint ?? '',
    contourSig: w.contourSig ?? '',
  };
};

/** The row to send in UpsertTechCardSeams (output-only fields left out). */
export function toWire(s: StoredSeam): TechCardSeamWire {
  return {
    seamKey: s.seamKey,
    status: STATUS[s.status],
    kind: KIND[s.kind],
    direction: DIRECTION[s.direction],
    source: SOURCE[s.source],
    sideA: { parts: s.sideA.map(anchorToWire) },
    sideB: { parts: s.sideB.map(anchorToWire) },
    anchoredSize: s.anchoredSize,
    note: s.note,
  };
}

/**
 * A row as the card read returns it, or null when it cannot be read (an unknown status or kind —
 * a newer server; the caller lists it as unreadable rather than guessing).
 */
export function fromWire(w: TechCardSeamWire): StoredSeam | null {
  const status = w.status && STATUS_IN.get(w.status);
  const kind = w.kind && KIND_IN.get(w.kind);
  if (!status || !kind || !w.seamKey) return null;
  return {
    seamKey: w.seamKey,
    status,
    kind,
    direction: (w.direction && DIRECTION_IN.get(w.direction)) || 'unknown',
    source: (w.source && SOURCE_IN.get(w.source)) || 'manual',
    sideA: (w.sideA?.parts ?? []).map(anchorFromWire),
    sideB: (w.sideB?.parts ?? []).map(anchorFromWire),
    anchoredSize: w.anchoredSize ?? '',
    note: w.note ?? '',
    stale: !!w.stale,
    ...(w.createdBy ? { createdBy: w.createdBy } : {}),
    ...(w.createdAt ? { createdAt: w.createdAt } : {}),
    ...(w.updatedBy ? { updatedBy: w.updatedBy } : {}),
    ...(w.updatedAt ? { updatedAt: w.updatedAt } : {}),
  };
}

/** Signature of a stored list for a provider's memo key (`seamKey:status:updatedAt:stale`). */
export const seamsSig = (rows: readonly StoredSeam[]): string =>
  rows
    .map((s) => `${s.seamKey}:${s.status}:${s.updatedAt ?? ''}:${s.stale ? 1 : 0}`)
    .sort()
    .join(',');
