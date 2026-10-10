// Shared state of B1/B3: what a piece is (role, family, hand, subtree), which seams count as
// evidence, and how a join is judged from them. Pure TS, no components/** imports.

import {
  SKELETON,
  type ClothState,
  type Edge,
  type Hand,
  type SeamCandidate,
  type SeamGraph,
  type SkeletonFacts,
  type SkeletonTree,
} from '../types';
import { isMirroredPair, pieceMultiplicity } from '../cut';
import { isLiningToken, liningByName, nameTokens } from '../names';
import { ROLE_BOOK, type RoleBook, type RoleDef, type SkeletonTemplate } from './template';

// ── names ───────────────────────────────────────────────────────────────────────────────────

export { nameTokens };

export type NameReading = {
  role: string | null;
  /** The first meaningful token as written (2clr stays apart from clr): pieces of one family. */
  family: string | null;
  hand: Hand;
};

/**
 * What a piece name says. The role is the first role in book order with a matching token (digits
 * at the ends of a token are dropped for the lookup only: 2CLR → clr); the hand is a whole L/R
 * token; the family is the first token that is neither a hand, nor noise, nor a number.
 */
export function readName(name: string, book: RoleBook = ROLE_BOOK): NameReading {
  const tokens = nameTokens(name);
  const handOf = (t: string): Hand =>
    book.hands.L.includes(t) ? 'L' : book.hands.R.includes(t) ? 'R' : null;
  let hand: Hand = null;
  let family: string | null = null;
  for (const t of tokens) {
    const h = handOf(t);
    if (h) {
      hand = hand ?? h;
      continue;
    }
    // «Lining» says which cloth, not which piece: LIN_FRONT and FRONT are one family per subtree.
    if (/^\d+$/.test(t) || book.ignoreTokens.includes(t) || isLiningToken(t)) continue;
    family = family ?? t;
  }
  const bare = new Set(tokens.map((t) => t.replace(/^\d+|\d+$/g, '')).filter(Boolean));
  const role = book.roles.find((r) => r.tokens.some((t) => bare.has(t)))?.id ?? null;
  return { role, family, hand };
}

export function roleDef(id: string | null, book: RoleBook = ROLE_BOOK): RoleDef | undefined {
  return id ? book.roles.find((r) => r.id === id) : undefined;
}

const HAND_WORD: Record<'L' | 'R', string> = { L: 'Left', R: 'Right' };

/** «Left front», «Collar», «Right sleeve». */
export function roleName(role: string | null, hand: Hand, book: RoleBook = ROLE_BOOK): string {
  const base = roleDef(role, book)?.name ?? (role ? role[0].toUpperCase() + role.slice(1) : 'Unit');
  return hand ? `${HAND_WORD[hand]} ${base.toLowerCase()}` : base;
}

export function handWord(hand: Hand): string {
  return hand ? `${HAND_WORD[hand]} ` : '';
}

export const ZONE_PREFIX = 'TECH_CARD_GARMENT_ZONE_';

/** Short zone token → enum value; '' stays ''. */
export function zoneEnum(short: string | undefined): string {
  if (!short) return '';
  return short.startsWith(ZONE_PREFIX) ? short : `${ZONE_PREFIX}${short}`;
}

// ── pieces as the skeleton sees them ────────────────────────────────────────────────────────

export type PieceFact = {
  key: string;
  name: string;
  role: string | null;
  family: string | null;
  hand: Hand;
  cloth: ClothState | null;
  tree: SkeletonTree;
  fused: boolean;
  areaMm2: number | null;
  /** Card order — the order every leaf list is kept in. */
  order: number;
  /** Physical pieces behind the key (×2 MIRRORED sleeve = 2; FOLD = 1). */
  mult: number;
};

/** A thing on the table: a piece, or a unit made by an earlier step. */
export type Entity = {
  key: string;
  name: string;
  unit: boolean;
  /** Own role first; units collect the roles of what they swallowed. */
  roles: string[];
  family: string | null;
  hand: Hand;
  tree: SkeletonTree;
  leaves: string[];
  /** Physical copies of the thing (a ×2 mirrored sleeve, a unit made only of such): «×2». */
  mult?: number;
};

export function readPieces(graph: SeamGraph, facts: SkeletonFacts, book: RoleBook = ROLE_BOOK) {
  const geom = new Map(graph.pieces.map((p) => [p.pieceKey, p]));
  const pieces: PieceFact[] = [];
  const seen = new Set<string>();
  facts.pieces.forEach((p, order) => {
    if (!p.pieceKey || seen.has(p.pieceKey)) return;
    seen.add(p.pieceKey);
    const g = geom.get(p.pieceKey);
    const reading = readName(p.name, book);
    // No cloth on the card: a name that says «lining» puts the piece in the lining subtree.
    const cloth = p.cloth ?? g?.cloth ?? (liningByName(p.name) ? 'lining' : null);
    // A pocket bag of pocketing cloth is a pocket whatever it is called.
    const role = reading.role ?? (cloth === 'pocketing' ? 'pocket' : null);
    // A mirrored block cut twice is BOTH hands under one key: it has no hand of its own.
    const bothHands = isMirroredPair(p);
    pieces.push({
      key: p.pieceKey,
      name: p.name,
      role,
      family: reading.family,
      hand: bothHands ? null : g?.hand ?? reading.hand,
      cloth,
      tree: cloth === 'lining' ? 'lining' : 'shell',
      fused: p.fused,
      areaMm2: g?.areaMm2 ?? null,
      order,
      mult: pieceMultiplicity(p),
    });
  });
  return pieces;
}

// ── seams as evidence ───────────────────────────────────────────────────────────────────────

/** `${pieceKey}#${k}` (or `#k+k'` for a chain) → pieceKey. */
export function pieceOfEdge(id: string): string {
  const i = id.lastIndexOf('#');
  return i < 0 ? id : id.slice(0, i);
}

export class SeamIndex {
  private edges = new Map<string, Edge>();
  private names: Map<string, string>;
  private roleOf: Map<string, string | null>;
  private mergeHands: Set<string>;
  readonly usable: SeamCandidate[];

  constructor(graph: SeamGraph, pieces: PieceFact[], template: SkeletonTemplate) {
    for (const p of graph.pieces) for (const e of p.edges) this.edges.set(e.id, e);
    this.names = new Map(pieces.map((p) => [p.key, p.name]));
    this.roleOf = new Map(pieces.map((p) => [p.key, p.role]));
    this.mergeHands = new Set(template.mergeHands);
    this.usable = graph.chosen.filter((c) => this.isEvidence(c)).sort((a, b) => b.score - a.score);
  }

  /**
   * A seam counts as evidence that two pieces are sewn: not a closure (§G — a button front is
   * not a join), not a piece onto itself (pleats, darts — processing, not a join), and not a
   * left↔right twin pair unless the role really has a centre seam (back, collar): mirrored
   * sleeves or side panels «matching» each other is the probe's known false positive.
   */
  private isEvidence(c: SeamCandidate): boolean {
    if (c.kind === 'closure-not-seam') return false;
    const a = pieceOfEdge(c.a);
    const b = pieceOfEdge(c.b);
    if (a === b || c.evidence.self) return false;
    if (!this.names.has(a) || !this.names.has(b)) return false;
    if (c.evidence.twin === 'mirror' && c.evidence.hand === 'cross') {
      const ra = this.roleOf.get(a);
      const rb = this.roleOf.get(b);
      return !!ra && ra === rb && this.mergeHands.has(ra);
    }
    return true;
  }

  /** Seams with one end in `a` and the other in `b`, best first. */
  between(a: string[], b: string[]): SeamCandidate[] {
    const A = new Set(a);
    const B = new Set(b);
    return this.usable.filter((c) => {
      const x = pieceOfEdge(c.a);
      const y = pieceOfEdge(c.b);
      return (A.has(x) && B.has(y)) || (A.has(y) && B.has(x));
    });
  }

  /** Seams that cross between two different inputs of a join. */
  crossing(inputs: string[][]): SeamCandidate[] {
    const owner = new Map<string, number>();
    inputs.forEach((leaves, i) => leaves.forEach((k) => owner.set(k, i)));
    return this.usable.filter((c) => {
      const x = owner.get(pieceOfEdge(c.a));
      const y = owner.get(pieceOfEdge(c.b));
      return x !== undefined && y !== undefined && x !== y;
    });
  }

  /** Pieces with no usable seam at all. */
  touches(key: string): boolean {
    return this.usable.some((c) => pieceOfEdge(c.a) === key || pieceOfEdge(c.b) === key);
  }

  private edgeLen(id: string): number | null {
    const hash = id.lastIndexOf('#');
    if (hash < 0) return null;
    const piece = id.slice(0, hash);
    let total = 0;
    for (const k of id.slice(hash + 1).split('+')) {
      const e = this.edges.get(`${piece}#${k}`);
      if (!e) return null;
      total += e.lenMm;
    }
    return total;
  }

  /** «CLR ↔ CLR_1: 397 = 397 mm, notches match» — evidence in the technologist's words. */
  words(c: SeamCandidate): string {
    const name = (id: string) => this.names.get(pieceOfEdge(id)) ?? pieceOfEdge(id);
    const la = this.edgeLen(c.a);
    const lb = this.edgeLen(c.b);
    let len: string;
    if (la !== null && lb !== null) {
      const a = Math.round(la);
      const b = Math.round(lb);
      len = Math.abs(la - lb) <= SKELETON.lenAbsMm ? `${a} = ${b} mm` : `${a} vs ${b} mm (eased)`;
    } else {
      len =
        c.evidence.dLenMm <= SKELETON.lenAbsMm
          ? 'lengths match'
          : `lengths differ by ${Math.round(c.evidence.dLenMm)} mm`;
    }
    const n = c.evidence.notchScore;
    const notch =
      n === null
        ? 'no notches'
        : n === 1
          ? 'notches match'
          : n === 0.7
            ? 'notches close'
            : 'notches differ';
    const kind =
      c.kind === 'composite' ? ' (composite edge)' : c.kind === 'partial' ? ' (partial)' : '';
    return `${name(c.a)} ↔ ${name(c.b)}: ${len}, ${notch}${kind}`;
  }
}

// ── judging a join ──────────────────────────────────────────────────────────────────────────

export type Judgement = {
  seams: SeamCandidate[];
  confidence: number;
  source: 'geometry' | 'template';
  reason: string;
};

/**
 * Is the join backed by geometry? Inputs are linked by the seams that cross between them; when
 * every input is reached the join is «geometry» and its confidence is the mean of the linking
 * seams' scores; otherwise it rests on the template/names and says which inputs no seam reaches.
 */
export function judge(inputs: Entity[], seams: SeamIndex, why: string): Judgement {
  const crossing = seams.crossing(inputs.map((e) => e.leaves));
  const owner = new Map<string, number>();
  inputs.forEach((e, i) => e.leaves.forEach((k) => owner.set(k, i)));
  const parent = inputs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const links: SeamCandidate[] = [];
  for (const c of crossing) {
    const x = find(owner.get(pieceOfEdge(c.a)) ?? -1);
    const y = find(owner.get(pieceOfEdge(c.b)) ?? -1);
    if (x < 0 || y < 0 || x === y) continue;
    parent[x] = y;
    links.push(c);
  }
  const groups = new Set(inputs.map((_, i) => find(i))).size;
  const evidence = links
    .slice(0, 2)
    .map((c) => seams.words(c))
    .join('; ');
  if (groups === 1 && links.length > 0) {
    const confidence = links.reduce((s, c) => s + c.score, 0) / links.length;
    return {
      seams: crossing,
      confidence: round2(confidence),
      source: 'geometry',
      reason: `${why}. ${evidence}`,
    };
  }
  // Which inputs no seam reaches — named, so the gap is honest rather than a low number.
  const root = find(0);
  const loose = inputs.filter((_, i) => find(i) !== root).map((e) => e.name);
  const linked = (inputs.length - groups) / Math.max(1, inputs.length - 1);
  const gap =
    loose.length > 0
      ? `no seam found to ${loose.join(', ')} — joined by ${links.length ? 'names and partly by seams' : 'names'}, check`
      : 'no seam found — joined by names, check';
  return {
    seams: crossing,
    confidence: round2(0.25 + 0.25 * linked),
    source: 'template',
    reason: evidence ? `${why}. ${evidence}; ${gap}` : `${why}; ${gap}`,
  };
}

export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Leaf union in card order. */
export function mergeLeaves(entities: Entity[], order: Map<string, number>): string[] {
  const out = [...new Set(entities.flatMap((e) => e.leaves))];
  return out.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

/** Copies of a joined thing: the fewest of its inputs (sleeve ×2 + body = one body). */
export function commonMult(entities: Entity[]): number {
  return entities.length ? Math.min(...entities.map((e) => e.mult ?? 1)) : 1;
}

/** «Set sleeves ×2» — the copy count in words, or nothing for one. */
export function multWord(mult: number | undefined): string {
  return (mult ?? 1) >= 2 ? ` ×${mult}` : '';
}

export function commonHand(entities: Entity[]): Hand {
  const hands = new Set(entities.map((e) => e.hand));
  if (hands.size === 1) return [...hands][0];
  hands.delete(null);
  return hands.size === 1 ? [...hands][0] : null;
}

/** Roles in first-seen order, own role first. */
export function mergeRoles(...lists: string[][]): string[] {
  return [...new Set(lists.flat())];
}
