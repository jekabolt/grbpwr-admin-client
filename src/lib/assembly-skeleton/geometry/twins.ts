// A2 — twins and hands.
//
// MIRROR twins are the L/R copies of one piece: sewn to each other only along a straight centre
// edge, never along a curved one. IDENTICAL twins are layers of one shape in ONE cloth (upper and
// under collar, yoke and yoke facing): sewn to each other along one edge. The same shape in another
// cloth is not a twin at all — it is the lining's own piece (00-FEASIBILITY §G).

import type { PieceDTO } from 'lib/nesting/types';
import { isLiningToken, nameTokens } from '../names';
import type { Hand, PieceGeom } from '../types';

/** Area within ±1.5 % and perimeter within ±1 %: one shape (probe values). */
const TWIN_AREA_REL = 0.015;
const TWIN_PERIM_REL = 0.01;
/** Edge-length sequences agree within max(abs, rel·len). */
const SEQ_ABS_MM = 5;
const SEQ_REL = 0.02;

/** Optional import manifest (lands with pattern-import; read structurally until then). */
type PieceManifest = { pairHand?: 'L' | 'R' | null; pairOf?: string | null };
const manifestOf = (piece: PieceDTO | undefined): PieceManifest | undefined =>
  (piece as (PieceDTO & { manifest?: PieceManifest }) | undefined)?.manifest;

const HAND_WORD: Record<string, 'L' | 'R'> = {
  l: 'L',
  r: 'R',
  lh: 'L',
  rh: 'R',
  left: 'L',
  right: 'R',
  л: 'L',
  лев: 'L',
  левый: 'L',
  левая: 'L',
  левое: 'L',
  lewy: 'L',
  lewa: 'L',
  lewe: 'L',
  п: 'R',
  прав: 'R',
  правый: 'R',
  правая: 'R',
  правое: 'R',
  prawy: 'R',
  prawa: 'R',
  prawe: 'R',
};

function handTokenIndex(tokens: string[]): number {
  for (let i = tokens.length - 1; i >= 0; i--) if (HAND_WORD[tokens[i].toLowerCase()]) return i;
  return -1;
}

/** L / R from the manifest, else from a name token (`FP_L`, `pocket r`, `Sleeve left`). */
export function handOf(name: string, piece?: PieceDTO): Hand {
  const m = manifestOf(piece)?.pairHand;
  if (m === 'L' || m === 'R') return m;
  const tokens = name.split(/[\s_\-.]+/).filter(Boolean);
  const i = handTokenIndex(tokens);
  return i >= 0 ? HAND_WORD[tokens[i].toLowerCase()] : null;
}

/** Name with the hand token blanked: `FP_L` and `FP_R` share the stem `FP_*`. */
export function handStem(name: string): string | null {
  const tokens = name.split(/([\s_\-.]+)/);
  const words = tokens.filter((_, i) => i % 2 === 0);
  const i = handTokenIndex(words);
  if (i < 0) return null;
  words[i] = '*';
  return tokens
    .map((t, j) => (j % 2 === 0 ? words[j / 2] : t))
    .join('')
    .toLowerCase();
}

const relDiff = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b, 1e-9);

/**
 * How two pieces of one size relate as shapes, read from the cyclic sequence of edge lengths:
 * 'same' (congruent by rotation), 'mirror' (congruent only by reflection: the CCW walk runs the
 * sequence backwards), 'both' (symmetric shape), or null (sequences do not agree).
 */
export function shapeRelation(a: PieceGeom, b: PieceGeom): 'same' | 'mirror' | 'both' | null {
  const la = a.edges.map((e) => e.lenMm);
  const lb = b.edges.map((e) => e.lenMm);
  const n = la.length;
  if (n === 0 || n !== lb.length) return null;
  const ok = (x: number, y: number) => Math.abs(x - y) <= Math.max(SEQ_ABS_MM, SEQ_REL * x);
  const fits = (seq: number[]) => {
    for (let r = 0; r < n; r++) {
      let all = true;
      for (let i = 0; i < n && all; i++) all = ok(la[i], seq[(i + r) % n]);
      if (all) return true;
    }
    return false;
  };
  const same = fits(lb);
  const mirror = fits([...lb].reverse());
  return same && mirror ? 'both' : same ? 'same' : mirror ? 'mirror' : null;
}

/** The name's family: the first token that is neither a hand, nor a number, nor «lining». */
function familyStem(name: string): string | null {
  for (const t of nameTokens(name)) {
    if (HAND_WORD[t] || /^\d+$/.test(t) || isLiningToken(t)) continue;
    return t;
  }
  return null;
}

/**
 * May two pieces be LAYERS of one fabric? Equal KNOWN cloth — or, with no cloth on either, one name
 * family (CLR / CLR_1, 2CLR / 2CLR_1). An unknown cloth is not «the same cloth»: a shell front and
 * its lining front are one shape, and stacking them as layers would sew the lining into the shell.
 */
function oneFabric(a: PieceGeom, b: PieceGeom): boolean {
  if (a.cloth && b.cloth) return a.cloth === b.cloth;
  if (a.cloth || b.cloth) return false;
  const fa = familyStem(a.name);
  return !!fa && fa === familyStem(b.name);
}

/** Twin kind of two pieces, or null. Pure; `twins()` caches it on `twinOf`. */
export function twinKind(a: PieceGeom, b: PieceGeom): 'mirror' | 'identical' | null {
  if (a.pieceKey === b.pieceKey) return null;
  // A different cloth is never a twin, whatever the shape: lining is its own subtree.
  if (a.cloth && b.cloth && a.cloth !== b.cloth) return null;
  const sa = handStem(a.name) ?? handStem(a.pieceKey);
  const sb = handStem(b.name) ?? handStem(b.pieceKey);
  if (sa && sa === sb && a.hand && b.hand && a.hand !== b.hand) return 'mirror';
  const geomTwin =
    relDiff(a.areaMm2, b.areaMm2) < TWIN_AREA_REL && relDiff(a.perimMm, b.perimMm) < TWIN_PERIM_REL;
  if (!geomTwin) return null;
  // Area and perimeter only shortlist: the edge sequence must agree too, or it is not one shape.
  const rel = shapeRelation(a, b);
  if (rel === null) return null;
  if (a.hand && b.hand && a.hand !== b.hand) return 'mirror';
  if (!a.hand !== !b.hand) return 'mirror';
  // No hands (numbered blazer pieces), or one hand on both: the shape says which.
  if (rel === 'mirror') return a.hand ? null : 'mirror';
  return oneFabric(a, b) ? 'identical' : null;
}

/**
 * One shape, as far as the card can tell them apart: no two different KNOWN cloths, area and
 * perimeter alike, and edge sequences congruent (not only by reflection). Weaker than identical
 * twins — no claim that they are layers of one fabric; a seam alternative on such a piece is the
 * same answer to the pattern (shell or lining is the cloth's question).
 */
export function congruent(a: PieceGeom, b: PieceGeom): boolean {
  if (a.pieceKey === b.pieceKey) return false;
  if (a.cloth && b.cloth && a.cloth !== b.cloth) return false;
  if (
    relDiff(a.areaMm2, b.areaMm2) >= TWIN_AREA_REL ||
    relDiff(a.perimMm, b.perimMm) >= TWIN_PERIM_REL
  )
    return false;
  const rel = shapeRelation(a, b);
  return rel === 'same' || rel === 'both';
}

/**
 * Pairs of pieces of one shape that are NOT proven twins (no common name family, no cloth to tell):
 * a layer, the lining's own piece or a duplicated block — the pattern cannot say which. They are
 * never matched against each other as a seam (shape-to-shape every edge «fits»), and the screen
 * asks about them in words instead.
 */
export function unprovenCopies(pieces: readonly PieceGeom[]): [PieceGeom, PieceGeom][] {
  const out: [PieceGeom, PieceGeom][] = [];
  for (let i = 0; i < pieces.length; i++)
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i];
      const b = pieces[j];
      if (a.twinOf.some((t) => t.key === b.pieceKey)) continue;
      if (congruent(a, b)) out.push([a, b]);
    }
  return out;
}

/** A2: fill `twinOf` on every piece (returns new objects; input untouched). */
export function twins(pieces: readonly PieceGeom[]): PieceGeom[] {
  const out = pieces.map((p) => ({ ...p, twinOf: [] as PieceGeom['twinOf'] }));
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      const kind = twinKind(out[i], out[j]);
      if (!kind) continue;
      out[i].twinOf.push({ key: out[j].pieceKey, kind });
      out[j].twinOf.push({ key: out[i].pieceKey, kind });
    }
  }
  return out;
}
