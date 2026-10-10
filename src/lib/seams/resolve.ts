// Resolution (03-SEAMS-DESIGN §2.2): stored anchors → today's runs, or «stale» in words.
//
// Per anchor: the piece is present (else the row is an ORPHAN) → FAST PATH when the piece's
// segmentation is unchanged (same contour signature, the hinted run still there with its length,
// notches and shape) → else SHAPE SEARCH over every edge and chain of ≤ 3 neighbours, in the frame
// the piece sits in today (as is, 180°, mirrored — chosen per piece by all its anchors together; a
// piece that cannot tell, being symmetric, takes the frame the rest of the file sits in). Accept the
// best run when its five samples fit within `fitMax`, its length is within `lenRatio` of the anchored
// one and its notches within `notchDiff`; a second run with no edge in common fitting within
// `tieMargin` is a TIE, broken by turn sign, perimeter share, then the partner's length — else
// stale. Per seam: both sides resolve, they do not overlap, and their length ratio has not drifted
// from the anchored one by more than `ratioDrift` (grading keeps it; one piece redrawn does not).
// A server-stale row is never applied, even when it still fits — it is offered for re-confirm.

import { edgeIdsOf } from 'lib/assembly-skeleton/geometry';
import {
  SKELETON,
  type Affine,
  type EdgeId,
  type ExcludedPair,
  type PieceGeom,
  type Pt2,
  type SeamCandidate,
  type SeamProvenance,
} from 'lib/assembly-skeleton/types';
import { pieceOfId } from './anchor';
import {
  FRAMES,
  contourSig,
  frameOf,
  inFrame,
  reverses,
  rmsFit,
  runSamples,
  runsOfPiece,
  type PieceFrame,
  type SeamRun,
} from './frame';
import {
  SEAMS,
  type AnchorHit,
  type AppliedRow,
  type EdgeAnchor,
  type Frame,
  type OrphanRow,
  type ResolveOptions,
  type Resolved,
  type StaleRow,
  type StoredSeam,
} from './types';

/** Mean fit charged to a frame for an anchor with no run of its length in that frame. */
const NO_FIT = 0.25;

type PieceCtx = {
  piece: PieceGeom;
  frame: PieceFrame;
  sig: string;
  runs: SeamRun[];
  uv: Map<EdgeId, Pt2[]>;
};

type Option = { run: SeamRun; fit: number };

/** An anchor's verdict before the seam-level checks. */
type AnchorVerdict =
  | { ok: true; hit: AnchorHit; alts?: AnchorHit[] }
  | { ok: false; why: string; tie?: boolean };

const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

export function resolveSeamDecisions(
  stored: readonly StoredSeam[],
  pieces: readonly PieceGeom[],
  opts: ResolveOptions = {},
): Resolved {
  const T = { ...SEAMS, ...opts.thresholds };
  const name = (k: string) => opts.nameOf?.(k) ?? k;
  const byKey = new Map(pieces.map((p) => [p.pieceKey, p]));
  const ctxCache = new Map<string, PieceCtx>();
  const ctxOf = (key: string): PieceCtx | undefined => {
    const piece = byKey.get(key);
    if (!piece) return undefined;
    let c = ctxCache.get(key);
    if (!c) {
      const frame = frameOf(piece, opts.grainDeg?.get(key) ?? 0);
      const runs = runsOfPiece(piece, T.maxChain);
      c = {
        piece,
        frame,
        sig: contourSig(piece, frame),
        runs,
        uv: new Map(runs.map((r) => [r.id, runSamples(frame, r)])),
      };
      ctxCache.set(key, c);
    }
    return c;
  };

  const applied: AppliedRow[] = [];
  const stale: StaleRow[] = [];
  const orphan: OrphanRow[] = [];
  const words: string[] = [];
  const forced: SeamCandidate[] = [];
  const closures: SeamCandidate[] = [];
  const excluded: ExcludedPair[] = [];

  const label = (s: StoredSeam) => {
    const side = (xs: EdgeAnchor[]) => [...new Set(xs.map((a) => name(a.piece)))].join(' + ');
    return `${s.kind === 'closure' ? 'closure' : 'seam'} ${side(s.sideA)} ↔ ${side(s.sideB)} (${s.status})${opts.size ? ` on ${opts.size}` : ''}`;
  };

  // ── 1. orphans ──
  const live: StoredSeam[] = [];
  for (const s of stored) {
    const missing = [...new Set([...s.sideA, ...s.sideB].map((a) => a.piece))].filter(
      (k) => !byKey.has(k) || (byKey.get(k)?.rs.length ?? 0) === 0,
    );
    if (s.sideA.length === 0 || s.sideB.length === 0) {
      const w = `${label(s)}: a side has no edge — remove it`;
      orphan.push({ seam: s, missing: [], words: w });
      words.push(w);
    } else if (missing.length) {
      const w = `${label(s)}: ${missing.map(name).join(', ')} ${missing.length > 1 ? 'are' : 'is'} no longer on the card (or has no contour) — remove it`;
      orphan.push({ seam: s, missing, words: w });
      words.push(w);
    } else live.push(s);
  }

  // ── 2. fast path candidates (trusted only where the piece sits as is — step 3) ──
  const lenOk = (len: number, anchored: number) =>
    Math.abs(len - anchored) <= Math.max(SKELETON.lenAbsMm, SKELETON.lenRel * len);
  const fastCand = new Map<EdgeAnchor, AnchorHit>();
  const anchorsOf = new Map<string, EdgeAnchor[]>();
  for (const s of live) {
    if (s.kind === 'surface') continue;
    for (const a of [...s.sideA, ...s.sideB]) {
      const c = ctxOf(a.piece);
      if (!c) continue;
      anchorsOf.set(a.piece, [...(anchorsOf.get(a.piece) ?? []), a]);
      if (c.sig !== a.contourSig) continue;
      const run = c.runs.find((r) => r.id === a.edgeHint);
      const uv = run && c.uv.get(run.id);
      if (!run || !uv || !lenOk(run.lenMm, a.lenMm) || run.notches !== a.notches) continue;
      const fit = rmsFit(uv, a.samples);
      if (fit <= T.fitMax) fastCand.set(a, hitOf(a, run, 'hint', 'asis', fit));
    }
  }

  // ── 3. the frame each piece sits in today, read from ALL its anchors together ──
  // A symmetric piece cannot tell as is from mirrored (and a mirrored export that starts on its
  // axis even keeps its signature): it takes the frame the pieces that CAN tell agree on.
  const optionsIn = (c: PieceCtx, a: EdgeAnchor, f: Frame): Option[] => {
    const out: Option[] = [];
    for (const run of c.runs) {
      const ratio = run.lenMm / Math.max(a.lenMm, 1e-6);
      if (ratio < T.lenRatio[0] || ratio > T.lenRatio[1]) continue;
      if (Math.abs(run.notches - a.notches) > T.notchDiff) continue;
      const uv = c.uv.get(run.id);
      if (!uv) continue;
      out.push({ run, fit: rmsFit(inFrame(uv, f), a.samples) });
    }
    return out.sort((x, y) => x.fit - y.fit || (x.run.id < y.run.id ? -1 : 1));
  };
  const frameOfPiece = new Map<string, Frame>();
  const undecided: { key: string; cost: Map<Frame, number> }[] = [];
  const byCost = (cost: Map<Frame, number>) =>
    [...FRAMES].sort((x, y) => (cost.get(x) ?? 1) - (cost.get(y) ?? 1));
  for (const [key, anchors] of anchorsOf) {
    const c = ctxOf(key);
    if (!c) continue;
    const cost = new Map<Frame, number>();
    for (const f of FRAMES) {
      const fits = anchors.map((a) => Math.min(NO_FIT, optionsIn(c, a, f)[0]?.fit ?? NO_FIT));
      cost.set(f, fits.reduce((x, y) => x + y, 0) / fits.length);
    }
    const ranked = byCost(cost);
    if ((cost.get(ranked[1]) ?? 1) - (cost.get(ranked[0]) ?? 1) >= T.frameMargin)
      frameOfPiece.set(key, ranked[0]);
    else undecided.push({ key, cost });
  }
  const votes = new Map<Frame, number>();
  for (const f of frameOfPiece.values()) votes.set(f, (votes.get(f) ?? 0) + 1);
  const fileFrame = [...FRAMES].sort((x, y) => (votes.get(y) ?? 0) - (votes.get(x) ?? 0))[0];
  for (const { key, cost } of undecided) {
    const best = Math.min(...cost.values());
    frameOfPiece.set(
      key,
      (cost.get(fileFrame) ?? 1) <= best + T.frameMargin ? fileFrame : byCost(cost)[0],
    );
  }
  const fast = new Map<EdgeAnchor, AnchorHit>();
  for (const [a, hit] of fastCand) if (frameOfPiece.get(a.piece) === 'asis') fast.set(a, hit);

  // ── 4. each searched anchor in its piece's frame ──
  const verdictOf = (a: EdgeAnchor): AnchorVerdict => {
    const carried = opts.preHit?.(a);
    if (carried) return { ok: true, hit: carried };
    const hitFast = fast.get(a);
    if (hitFast) return { ok: true, hit: hitFast };
    const c = ctxOf(a.piece);
    const f = frameOfPiece.get(a.piece) ?? 'asis';
    if (!c) return { ok: false, why: `${name(a.piece)} is not on the card` };
    const opts2 = optionsIn(c, a, f);
    const best = opts2[0];
    if (!best || best.fit > T.fitMax)
      return {
        ok: false,
        why: `the edge (anchored as ${a.edgeHint}, ${Math.round(a.lenMm)} mm) is not found on ${name(a.piece)}${best ? ` — nearest fits ${(best.fit * 100).toFixed(1)} % off` : ''}`,
      };
    const mine = new Set(best.run.edges.map((e) => e.id));
    const rivals = opts2.filter(
      (o) =>
        o !== best && o.fit - best.fit < T.tieMargin && o.run.edges.every((e) => !mine.has(e.id)),
    );
    if (rivals.length === 0) return { ok: true, hit: hitOf(a, best.run, 'shape', f, best.fit) };
    // Ties: turn sign, then perimeter share.
    const pool = [best, ...rivals].filter(
      (o) =>
        Math.abs(a.turnDeg) <= 10 ||
        Math.abs(o.run.turnDeg) <= 10 ||
        Math.sign(o.run.turnDeg) === Math.sign(a.turnDeg),
    );
    const shareOff = (o: Option) =>
      Math.abs(o.run.lenMm / (c.piece.perimMm || 1) / Math.max(a.perimShare, 1e-6) - 1);
    pool.sort((x, y) => shareOff(x) - shareOff(y));
    if (pool.length === 1 || (pool.length > 1 && shareOff(pool[1]) - shareOff(pool[0]) > 0.05))
      return { ok: true, hit: hitOf(a, pool[0].run, 'shape', f, pool[0].fit) };
    if (pool.length === 0)
      return { ok: false, why: `no run of ${name(a.piece)} turns the way the anchored edge did` };
    return {
      ok: true,
      hit: hitOf(a, pool[0].run, 'shape', f, pool[0].fit),
      // EVERY run still tied, not only the runner-up: the partner must single one out of all.
      alts: pool.slice(1).map((o) => hitOf(a, o.run, 'shape', f, o.fit)),
    };
  };

  // ── 5. per seam ──
  for (const s of live) {
    const by = s.updatedBy || s.createdBy || 'someone';
    const at = s.updatedAt || s.createdAt || '';
    const day = shortDate(at);
    const ruleWords =
      s.status === 'rejected'
        ? `rejected by ${by}${day ? ` · ${day}` : ''}${s.note ? `: ${s.note}` : ''}`
        : `${s.kind === 'closure' ? 'closure, ' : ''}confirmed by ${by}${day ? ` · ${day}` : ''}${s.note ? ` — ${s.note}` : ''}`;

    if (s.kind === 'surface') {
      // A surface join takes no edge: it stands on its two pieces (host, part), checked present.
      const host = s.sideA[0].piece;
      const part = s.sideB[0].piece;
      if (s.stale) {
        const w = `${label(s)}: stale · the pattern changed since it was decided · still on the card — re-confirm`;
        stale.push({ seam: s, reason: 'server', stillFits: true, words: w });
        words.push(w);
        continue;
      }
      if (s.status === 'rejected') {
        const x: ExcludedPair = { aIds: [], bIds: [], rule: ruleWords, surface: { host, part } };
        excluded.push(x);
        applied.push({ seam: s, a: [], b: [], excluded: x });
      } else {
        const cand: SeamCandidate = {
          a: `${host}#?`,
          b: `${part}#?`,
          score: 1,
          kind: 'surface',
          evidence: evidenceOf(0, 0, false, ruleWords),
          surface: { host, part, mark: '', T: IDENTITY, fit: 1 },
          provenance: provenanceOf(s, by, at, 'hint'),
        };
        forced.push(cand);
        applied.push({ seam: s, a: [], b: [], candidate: cand });
      }
      continue;
    }

    const va = s.sideA.map(verdictOf);
    const vb = s.sideB.map(verdictOf);
    const bad = [...va, ...vb].find((v): v is Extract<AnchorVerdict, { ok: false }> => !v.ok);
    const stillFits = !bad;
    if (bad) {
      const w = `${label(s)}: stale · ${bad.why} — ${s.status === 'rejected' ? 'decide again' : 'connect again or remove'}`;
      stale.push({ seam: s, reason: 'geometry', stillFits: false, words: w });
      words.push(w);
      continue;
    }
    let ha = va.map((v) => (v as Extract<AnchorVerdict, { ok: true }>).hit);
    let hb = vb.map((v) => (v as Extract<AnchorVerdict, { ok: true }>).hit);
    const altA = va.map((v) => (v as Extract<AnchorVerdict, { ok: true }>).alts ?? []);
    const altB = vb.map((v) => (v as Extract<AnchorVerdict, { ok: true }>).alts ?? []);

    // Ties left: the partner's length decides (one anchor a side), else stale.
    if (altA.some((x) => x.length) || altB.some((x) => x.length)) {
      const anchoredRatio = sum(s.sideA.map((a) => a.lenMm)) / sum(s.sideB.map((a) => a.lenMm));
      const drift = (A: AnchorHit[], B: AnchorHit[]) =>
        Math.abs(sum(A.map((h) => h.lenMm)) / sum(B.map((h) => h.lenMm)) / anchoredRatio - 1);
      const combos: [AnchorHit[], AnchorHit[]][] = [];
      const optsA = ha.length === 1 ? [ha[0], ...altA[0]].map((h) => [h]) : [ha];
      const optsB = hb.length === 1 ? [hb[0], ...altB[0]].map((h) => [h]) : [hb];
      for (const A of optsA) for (const B of optsB) combos.push([A, B]);
      const pass = combos.filter(([A, B]) => drift(A, B) <= T.ratioDrift);
      const stillTied =
        (ha.length > 1 && altA.some((x) => x.length)) ||
        (hb.length > 1 && altB.some((x) => x.length));
      if (pass.length !== 1 || stillTied) {
        const where = [...altA, ...altB].flat()[0];
        const w = `${label(s)}: stale · two edges of ${name(where.anchor.piece)} fit equally (${[
          ...ha,
          ...hb,
          ...altA.flat(),
          ...altB.flat(),
        ]
          .filter((h) => h && h.anchor === where.anchor)
          .map((h) => h!.run)
          .join(' / ')}) — re-confirm`;
        stale.push({ seam: s, reason: 'tie', stillFits: false, words: w });
        words.push(w);
        continue;
      }
      [ha, hb] = pass[0];
    }

    // A partial whose two sides turned differently (one piece mirrored, its partner not) has no
    // aligned end left to read: say so rather than glue it from the wrong corner.
    if (s.kind === 'partial' && new Set([...ha, ...hb].map((h) => reverses(h.frame))).size > 1) {
      const w = `${label(s)}: stale · one side is mirrored against the other since it was decided — re-confirm`;
      stale.push({ seam: s, reason: 'geometry', stillFits: false, words: w });
      words.push(w);
      continue;
    }

    // The two sides must not share an edge.
    const edgesA = new Set(ha.flatMap((h) => h.edges));
    if (hb.some((h) => h.edges.some((e) => edgesA.has(e)))) {
      const w = `${label(s)}: stale · both sides now land on the same edge — re-confirm`;
      stale.push({ seam: s, reason: 'tie', stillFits: false, words: w });
      words.push(w);
      continue;
    }

    // Length ratio of the two sides against the anchored one.
    const lenA = sum(ha.map((h) => h.lenMm));
    const lenB = sum(hb.map((h) => h.lenMm));
    const thenRatio = sum(s.sideA.map((a) => a.lenMm)) / sum(s.sideB.map((a) => a.lenMm));
    const moved = lenA / lenB / thenRatio - 1;
    // A partial sews its short side onto PART of a longer run, and on another size the two grade
    // apart (a pocket facing onto a front edge, measured 4–5 % on cards 6 / 7 / 8): there it holds
    // up to the eased band while the short side still fits on the long run. On the size it was
    // confirmed on the strict drift applies (a redrawn piece).
    const graded = !!opts.size && opts.size !== s.anchoredSize;
    const partialHolds =
      graded &&
      s.kind === 'partial' &&
      Math.abs(moved) <= SKELETON.lenRelEased &&
      Math.min(lenA, lenB) <= Math.max(lenA, lenB);
    if (Math.abs(moved) > T.ratioDrift && !partialHolds) {
      const longer = moved > 0 ? s.sideA : s.sideB;
      const w = `${label(s)}: stale · ${[...new Set(longer.map((a) => name(a.piece)))].join(' + ')} is now ${Math.abs(moved * 100).toFixed(1)} % longer against its partner than when ${s.status} — re-confirm`;
      stale.push({ seam: s, reason: 'drift', stillFits: false, words: w });
      words.push(w);
      continue;
    }

    if (s.stale) {
      const w = `${label(s)}: stale · the pattern changed since it was decided · ${stillFits ? 'still fits' : 'no longer fits'} — re-confirm`;
      stale.push({ seam: s, reason: 'server', stillFits, words: w });
      words.push(w);
      continue;
    }

    if (s.status === 'rejected') {
      const x: ExcludedPair = {
        aIds: ha.flatMap((h) => h.edges),
        bIds: hb.flatMap((h) => h.edges),
        rule: ruleWords,
      };
      excluded.push(x);
      applied.push({ seam: s, a: ha, b: hb, excluded: x });
      continue;
    }

    const hows = new Set([...ha, ...hb].map((h) => h.how));
    const how = hows.has('shape') ? 'shape' : hows.has('topology') ? 'topology' : 'hint';
    const cand = candidateOf(s, ha, hb, ruleWords, provenanceOf(s, by, at, how));
    if (s.kind === 'closure') closures.push(cand);
    else forced.push(cand);
    applied.push({ seam: s, a: ha, b: hb, candidate: cand });
  }

  return { forced, closures, excluded, words, applied, stale, orphan };
}

// ── helpers ───────────────────────────────────────────────────────────────────────────────────

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export function hitOf(
  a: EdgeAnchor,
  run: SeamRun,
  how: AnchorHit['how'],
  frame: Frame,
  fit: number,
): AnchorHit {
  return {
    anchor: a,
    run: run.id,
    edges: run.edges.map((e) => e.id),
    edgeLens: run.edges.map((e) => e.lenMm),
    lenMm: run.lenMm,
    how,
    frame,
    fit: Math.round(fit * 10000) / 10000,
  };
}

function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}` : '';
}

function provenanceOf(
  s: StoredSeam,
  by: string,
  at: string,
  how: SeamProvenance['how'],
): SeamProvenance {
  return {
    seamKey: s.seamKey,
    status: s.status,
    source: s.source,
    direction: s.direction,
    by,
    at,
    how,
  };
}

function evidenceOf(
  aLen: number,
  bLen: number,
  self: boolean,
  rule: string,
): SeamCandidate['evidence'] {
  const d = Math.abs(aLen - bLen);
  return {
    dLenMm: Math.round(d * 10) / 10,
    relLen: Math.max(aLen, bLen) > 0 ? Math.round((d / Math.max(aLen, bLen)) * 1000) / 1000 : 0,
    notchScore: null,
    curvature: 'flat',
    hand: 'neutral',
    twin: 'none',
    self,
    rule,
    aLenMm: Math.round(aLen * 10) / 10,
    bLenMm: Math.round(bLen * 10) / 10,
  };
}

/** The resolved sides as the graph's SeamCandidate (kind, parts, partial range, provenance). */
function candidateOf(
  s: StoredSeam,
  haIn: AnchorHit[],
  hbIn: AnchorHit[],
  rule: string,
  provenance: SeamProvenance,
): SeamCandidate {
  let ha = haIn;
  let hb = hbIn;
  // Sewn range in today's walk: a mirrored piece walks the run the other way.
  const rangeOf = (h: AnchorHit): [number, number] => {
    const [f, t] = h.anchor.range;
    const [x, y] = reverses(h.frame) ? [1 - t, 1 - f] : [f, t];
    return [Math.round(x * h.lenMm * 10) / 10, Math.round(y * h.lenMm * 10) / 10];
  };
  // A partial keeps the engine's convention (a's START on b's END): when both sides walk the other
  // way today, the sides swap.
  if (
    s.kind === 'partial' &&
    ha.every((h) => reverses(h.frame)) &&
    hb.every((h) => reverses(h.frame))
  ) {
    [ha, hb] = [hb, ha];
  }
  const sideOf = (hs: AnchorHit[]) => {
    if (hs.length === 1 && s.kind !== 'composite') return { id: hs[0].run, parts: undefined };
    const parts = hs.flatMap((h) => h.edges);
    // The longest part names the side (the composite convention `unionPicture` hangs on).
    let longest = parts[0];
    let best = -1;
    for (const h of hs)
      h.edges.forEach((e, i) => {
        if (h.edgeLens[i] > best) {
          best = h.edgeLens[i];
          longest = e;
        }
      });
    return { id: longest, parts: parts.length > 1 ? parts : undefined };
  };
  const A = sideOf(ha);
  const B = sideOf(hb);
  const aLen = sum(ha.map((h) => h.lenMm));
  const bLen = sum(hb.map((h) => h.lenMm));
  const pieces = new Set([...ha, ...hb].map((h) => h.anchor.piece));
  const kind: SeamCandidate['kind'] = s.kind === 'closure' ? 'closure-not-seam' : s.kind;
  const partialRange =
    s.kind === 'partial' && ha.length === 1 && hb.length === 1
      ? { a: rangeOf(ha[0]), b: rangeOf(hb[0]) }
      : undefined;
  const isWhole = (r: [number, number], len: number) => r[0] <= 0.05 && r[1] >= len - 0.05;
  return {
    a: A.id,
    b: B.id,
    ...(A.parts ? { aParts: A.parts } : {}),
    ...(B.parts ? { bParts: B.parts } : {}),
    score: 1,
    kind,
    evidence: evidenceOf(aLen, bLen, pieces.size === 1, rule),
    ...(kind === 'closure-not-seam'
      ? { closure: { kind: 'unknown' as const, evidence: rule, open: 'full' as const } }
      : {}),
    ...(partialRange &&
    !(isWhole(partialRange.a, ha[0].lenMm) && isWhole(partialRange.b, hb[0].lenMm))
      ? { range: partialRange }
      : {}),
    provenance,
  };
}

/** Edge ids of a resolved seam side (for probes and the review sheet). */
export const sideEdges = (c: SeamCandidate, side: 'a' | 'b'): EdgeId[] =>
  side === 'a' ? c.aParts ?? edgeIdsOf(c.a) : c.bParts ?? edgeIdsOf(c.b);

export { pieceOfId };
