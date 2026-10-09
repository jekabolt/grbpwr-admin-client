// buildPieceSpecs — piece families (F4 / DXF fast path) → PieceSpec[] the writer (F6) accepts,
// plus the blocked list the wizard shows (08-CONTRACT §4.2 step 6).
//
// Per family, in this order (every step can block the piece with a BlockReason; nothing is
// dropped silently):
//   1. sizes   — source rank → card size through the SizeMap; unmapped ranks are not exported,
//                no mapped rank → 'size-unmapped'; leak/merged/tiny fills block as such;
//   2. name    — override (operator/AI) > DXF block identity > printed text; G11 grammar with the
//                pair exemption; size tokens never in the identity; ungraded → `<ID>_UNI`;
//   3. fold    — a fold line (feature / "on fold" text + a straight hull edge) → unfold FIRST, so
//                the fold edge gets 0 allowance; fold line kept for layer 8;
//   4. lines   — seam meaning: cut = seam + allowance (clipper offset, report → G6); cut meaning:
//                seam = drawn seam, else cut − allowance; any offset failure BLOCKS (hull,
//                self-intersection, topology — Codex C4);
//   5. grain   — detected/declared, else the operator's two clicks, else 'no-grain';
//   6. pairs   — a drawn L/R twin keeps its hand; "cut 2" of an asymmetric piece / "pair" →
//                `_L` drawn + `_R` = its mirror across the grain (G12), ppg per hand;
//   7. growth  — cut area must grow with size (G8) → 'non-monotone' when > 2 sizes.

import { isMirrorSymmetric } from '../ai/geom';
import { parseQuantity, saysFold } from '../ai/evidence';
import { identitiesOf, sizeTokenTest } from '../manifest/identity';
import type {
  Affine,
  AllowanceDecision,
  BlockReason,
  BuildPieceSpecsFn,
  CardSize,
  DrillFeature,
  Feature,
  FoldFeature,
  GrainFeature,
  InternalFeature,
  IRText,
  NotchFeature,
  OffsetReport,
  PairHand,
  PieceCandidate,
  PieceFamily,
  PieceKey,
  PieceSizeSpec,
  PieceSpec,
  Progress,
  PtMm,
  SeedId,
  SemanticsInput,
  SemanticsOutput,
} from '../types';
import { PATIMPORT } from '../types';
import { featuresOf, innerSeamLines, measuredAllowance } from './allowance';
import { classifyFeatures } from './features';
import {
  FOLD_TOL_MM,
  type FoldLine,
  foldLineOnCut,
  mirrorOff,
  sideOf,
  straightFoldEdge,
  unfold,
} from './fold';
import {
  IDENTITY,
  SegIndex,
  applyAffine,
  areaOf,
  bboxOf,
  ccw,
  closestOnPolyline,
  compose,
  reflection,
} from './geom';
import { identityCheck, readName } from './names';
import { offsetContour } from './offset';
import { PAIR_WORDS, mirrorSizeAcrossGrain, planPair } from './pairs';

type DxfExtra = { dxf?: { identity?: string; outerIsSeam?: boolean; features?: Feature[] } };
type Blocked = SemanticsOutput['blocked'][number];

/** How a written size relates to its source candidate, for the walls the gate compares (G3/G4). */
type WallMap = { seed: SeedId; rank: number; fold: FoldLine | null; t: Affine };

export type SemanticsDetail = {
  output: SemanticsOutput;
  /**
   * Source walls per written identity × rank, in the identity's own (source) frame: unfolded
   * pieces get the mirrored half, a derived `_R` the mirrored walls, the fold edge is dropped.
   * The write stage passes this as `wallsOf` to `writeAndGate` (G3/G4).
   */
  wallsOf: (identity: string, rank: number) => PtMm[][] | undefined;
  /** Per piece: the offset reports and measured numbers the probe and the wizard show. */
  notes: Record<PieceKey, string[]>;
};

const blockOffset = (r: OffsetReport): BlockReason =>
  r.loops !== 1 ? 'offset-topology' : r.selfIntersects ? 'offset-self-intersection' : 'offset-hull';

function textsOf(c: PieceCandidate, byId: Map<number, IRText>): string[] {
  const out: string[] = [];
  for (const id of c.textsInside) {
    const t = byId.get(id);
    if (t && !out.includes(t.text)) out.push(t.text);
  }
  return out;
}

/** Points of the fold edge removed from a wall polyline (they are interior once unfolded). */
function clipFold(line: PtMm[], fold: FoldLine): PtMm[][] {
  const out: PtMm[][] = [];
  let cur: PtMm[] = [];
  for (let i = 0; i < line.length; i++) {
    const p = line[i];
    const onP = Math.abs(sideOf(fold, p)) <= FOLD_TOL_MM;
    const prev = line[i - 1];
    const onPrev = prev ? Math.abs(sideOf(fold, prev)) <= FOLD_TOL_MM : false;
    if (onP && onPrev) {
      if (cur.length > 1) out.push(cur);
      cur = [p];
      continue;
    }
    cur.push(p);
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

export function buildPieceSpecsDetailed(
  input: SemanticsInput,
  progress?: Progress,
): SemanticsDetail {
  const { sheet, set, run, sizeMap, families, fileAllowance, pieceOverrides, operatorGrain } =
    input;
  const warnings: string[] = [];
  const blocked: Blocked[] = [];
  const notes: Record<PieceKey, string[]> = {};
  const textById = new Map(sheet.texts.map((t) => [t.id, t]));

  // ── sizes ───────────────────────────────────────────────────────────────────────────────
  const cardOfRank = new Map<number, CardSize | null>();
  for (const e of sizeMap.entries) cardOfRank.set(e.source.rank, e.card);
  const cardTokens = [
    ...sizeMap.entries.flatMap((e) => (e.card ? [e.card.token] : [])),
    ...sizeMap.unmapped.map((c) => c.token),
  ];
  const isSizeToken = sizeTokenTest(cardTokens);
  const multiSize = run.sizes.length > 1;

  // ── pass 1: names + candidates per family ───────────────────────────────────────────────
  type Prep = {
    fam: PieceFamily;
    seed: SeedId;
    cands: { c: PieceCandidate & DxfExtra; card: CardSize }[];
    texts: string[];
    name: NonNullable<ReturnType<typeof readName>>;
    ungraded: boolean;
  };
  const preps: Prep[] = [];
  const block = (seed: SeedId, reason: BlockReason, detail: string) => {
    blocked.push({ seed, reason, detail });
  };

  for (const fam of families) {
    const seed = fam.seed;
    const ov = pieceOverrides[seed] ?? {};
    const sorted = [...fam.candidates].sort((a, b) => a.rank - b.rank) as (PieceCandidate &
      DxfExtra)[];
    const mapped = sorted.flatMap((c) => {
      const card = cardOfRank.get(c.rank);
      return card ? [{ c, card }] : [];
    });
    if (!mapped.length) {
      block(
        seed,
        'size-unmapped',
        `none of the ${sorted.length} size(s) of this piece is mapped to a card size`,
      );
      continue;
    }
    const bad = mapped.find((m) => m.c.outcome !== 'closed');
    if (bad) {
      const r = bad.c.outcome as BlockReason;
      block(
        seed,
        r,
        r === 'leak'
          ? `outline of size ${bad.card.token} is not closed${bad.c.leakAt ? ` near (${bad.c.leakAt.x.toFixed(0)}, ${bad.c.leakAt.y.toFixed(0)}) mm` : ''}`
          : r === 'merged'
            ? 'two seeds share one region — split them'
            : `area ${(bad.c.areaMm2 / 100).toFixed(1)} cm² is below ${PATIMPORT.minPieceAreaMm2 / 100} cm²`,
      );
      continue;
    }
    const texts = textsOf(sorted[sorted.length - 1], textById);
    const name = readName({
      override: ov,
      dxfIdentity: sorted[0].dxf?.identity ?? null,
      texts,
      isSizeToken,
    });
    if (!name) {
      block(
        seed,
        'grammar',
        'no name: neither the operator, the AI, the DXF block nor the printed text gives a code',
      );
      continue;
    }
    // ungraded: declared UNI, one contour in a multi-size run, or the same contour in every size
    let ungraded = name.uni || (multiSize && sorted.length === 1);
    if (!ungraded && mapped.length >= 2) {
      const a0 = mapped[0].c.areaMm2;
      const b0 = mapped[0].c.bbox;
      ungraded = mapped.every(
        (m) =>
          Math.abs(m.c.areaMm2 - a0) <= a0 * 5e-4 &&
          Math.abs(m.c.bbox.maxX - m.c.bbox.minX - (b0.maxX - b0.minX)) <= 0.1 &&
          Math.abs(m.c.bbox.maxY - m.c.bbox.minY - (b0.maxY - b0.minY)) <= 0.1,
      );
      if (ungraded) name.notes.push('same outline in every size: ungraded');
    }
    preps.push({ fam, seed, cands: ungraded ? [mapped[0]] : mapped, texts, name, ungraded });
  }

  // drawn twins (FP_L next to FP_R): same code + mods, opposite hands, mirror-equal areas
  const twinOf = new Map<SeedId, SeedId>();
  for (const a of preps) {
    if (!a.name.hand || twinOf.has(a.seed)) continue;
    const b = preps.find(
      (x) =>
        x !== a &&
        !twinOf.has(x.seed) &&
        x.name.hand &&
        x.name.hand !== a.name.hand &&
        x.name.code === a.name.code &&
        x.name.mods.join('_') === a.name.mods.join('_'),
    );
    if (!b) continue;
    const ca = a.cands[0].c;
    const cb = b.cands.find((m) => m.c.rank === ca.rank)?.c ?? b.cands[0].c;
    const ok =
      Math.abs(ca.areaMm2 - cb.areaMm2) <= Math.max(ca.areaMm2, cb.areaMm2) * PATIMPORT.pairAreaTol;
    if (ok) {
      twinOf.set(a.seed, b.seed);
      twinOf.set(b.seed, a.seed);
    } else {
      warnings.push(
        `${a.name.code}_${a.name.hand} / _${b.name.hand}: named as a pair but the areas differ ${((Math.abs(ca.areaMm2 - cb.areaMm2) / Math.max(ca.areaMm2, cb.areaMm2)) * 100).toFixed(2)} % — not paired`,
      );
    }
  }

  // ── pass 2: geometry per family ─────────────────────────────────────────────────────────
  const pieces: PieceSpec[] = [];
  const walls = new Map<string, WallMap[]>(); // identity → per rank
  let done = 0;
  for (const p of preps) {
    progress?.(done++, preps.length, p.name.code);
    const { seed, name } = p;
    const ov = pieceOverrides[seed] ?? {};
    const pieceNotes: string[] = [...name.notes];
    const largest = p.cands[p.cands.length - 1].c;
    const symmetric = isMirrorSymmetric(largest.outer);

    // allowance decision for this piece
    const measured = !ov.allowance ? measuredAllowance(largest, set) : null;
    const dxfSeamOuter = !!largest.dxf?.outerIsSeam;
    let A: AllowanceDecision = ov.allowance ?? fileAllowance;
    if (!ov.allowance && dxfSeamOuter && A.meaning !== 'seam')
      A = {
        ...A,
        meaning: 'seam',
        evidence: [...A.evidence, 'the drawn outline is the graded seam line (DXF layer 14)'],
      };
    if (!ov.allowance && measured && !dxfSeamOuter) {
      A = {
        meaning: 'both',
        allowanceMm: Math.round(measured.mm * 10) / 10,
        origin: 'measured',
        evidence: [
          `seam line drawn ${measured.mm.toFixed(1)} mm inside (spread ${measured.spreadMm.toFixed(2)} mm)`,
        ],
      };
    }
    let allowMm = A.allowanceMm > 0 ? A.allowanceMm : PATIMPORT.defaultAllowanceMm;
    if (!(A.allowanceMm > 0))
      pieceNotes.push(`no allowance known: the other line is ${allowMm} mm (default)`);

    // fold
    const foldText = p.texts.some(saysFold);
    const wantFold = ov.unfoldedFold ?? null;

    // quantity / pair
    const qtyText = p.texts.map(parseQuantity).find((q) => q != null) ?? null;
    const saysPair = p.texts.some((t) => PAIR_WORDS.test(t) && parseQuantity(t) != null);

    const sizes: PieceSizeSpec[] = [];
    const wallMaps: WallMap[] = [];
    let blockedHere: { reason: BlockReason; detail: string } | null = null;
    let anyFold = false;
    let lastGrain: GrainFeature | null = null;
    const opGrain = operatorGrain[seed];

    for (const { c, card } of p.cands) {
      const feats = classifyFeatures(c, set, sheet);
      let outer = ccw(c.outer);
      // ── fold
      let fold: FoldLine | null = null;
      let foldFeat: FoldFeature | null = null;
      if (wantFold !== false) {
        foldFeat = (feats.find((f) => f.kind === 'fold') as FoldFeature | undefined) ?? null;
        if (foldFeat) fold = { a: foldFeat.a, b: foldFeat.b };
        else if (wantFold === true || (foldText && !symmetric)) fold = straightFoldEdge(outer);
        if ((foldFeat || wantFold === true) && !fold) {
          blockedHere = {
            reason: 'fold-unresolved',
            detail: 'declared on fold, but no straight fold edge was found',
          };
          break;
        }
      }
      let foldEdge: [PtMm, PtMm] | null = null;
      const seamFeat = featuresOf(c).find((f) => f.kind === 'seam') as
        | Extract<Feature, { kind: 'seam' }>
        | undefined;
      let drawnSeam: PtMm[] | null = dxfSeamOuter ? null : seamFeat ? ccw(seamFeat.pts) : null;
      if (!drawnSeam && !dxfSeamOuter && measured) {
        const lines = innerSeamLines(c, set).filter((l) => l.length >= 3);
        // a single closed inner loop is used as drawn; dashes are re-derived by offset
        const loop = lines.find(
          (l) =>
            l.length > 8 && Math.hypot(l[0].x - l[l.length - 1].x, l[0].y - l[l.length - 1].y) < 1,
        );
        if (loop) drawnSeam = ccw(loop);
      }
      let notches = feats.filter((f): f is NotchFeature => f.kind === 'notch');
      let drills = feats.filter((f): f is DrillFeature => f.kind === 'drill');
      let internal = feats.filter((f): f is InternalFeature => f.kind === 'internal');
      if (fold) {
        const u = unfold(outer, fold);
        if (!u) {
          if (foldFeat || wantFold === true) {
            blockedHere = {
              reason: 'fold-unresolved',
              detail: 'the fold line is not an edge of the outline — cannot unfold',
            };
            break;
          }
          fold = null; // text-only hint that does not fit: leave the piece as drawn
          pieceNotes.push('"on fold" in the text, but the outline has no fold edge — not unfolded');
        } else {
          outer = u.pts;
          foldEdge = u.edge;
          anyFold = true;
          if (drawnSeam) {
            const us = unfold(drawnSeam, fold);
            drawnSeam = us ? us.pts : null;
            if (!us)
              pieceNotes.push('seam line has no fold edge — re-derived from the unfolded cut');
          }
          const M = reflection(fold.a, fold.b);
          const onFold = (q: PtMm) => Math.abs(sideOf(fold!, q)) <= FOLD_TOL_MM;
          notches = [
            ...notches,
            ...notches
              .filter((n) => !onFold(n.at))
              .map((n) => ({
                ...n,
                at: applyAffine(M, n.at),
                seg: [applyAffine(M, n.seg[0]), applyAffine(M, n.seg[1])] as [PtMm, PtMm],
                origin: 'derived' as const,
              })),
          ];
          drills = [
            ...drills,
            ...drills
              .filter((d) => !onFold(d.at))
              .map((d) => ({ ...d, at: applyAffine(M, d.at), origin: 'derived' as const })),
          ];
          internal = [
            ...internal,
            ...internal
              .filter((f) => !f.pts.every(onFold))
              .map((f) => ({
                ...f,
                pts: f.pts.map((q) => applyAffine(M, q)),
                origin: 'derived' as const,
              })),
          ];
        }
      }

      // ── lines
      const meaning = dxfSeamOuter || A.meaning === 'seam' ? 'seam' : 'cut';
      let cut: PtMm[];
      let seam: PtMm[] | null;
      let offset: OffsetReport | null = null;
      if (meaning === 'seam') {
        seam = outer;
        const r = offsetContour(seam, allowMm);
        cut = r.pts;
        offset = r.report;
        pieceNotes.push(
          `${card.token}: cut = seam + ${allowMm} mm, deviation ${r.report.maxDeviationMm.toFixed(3)} mm, hull ${r.report.hullRatio.toFixed(4)} (source ${r.sourceHullRatio.toFixed(4)})`,
        );
        if (!r.report.ok) {
          blockedHere = {
            reason: blockOffset(r.report),
            detail: `${card.token}: ${r.report.reason}`,
          };
          break;
        }
      } else {
        cut = outer;
        if (drawnSeam) seam = drawnSeam;
        else {
          const r = offsetContour(cut, -allowMm);
          seam = r.pts;
          offset = r.report;
          pieceNotes.push(
            `${card.token}: seam = cut − ${allowMm} mm, deviation ${r.report.maxDeviationMm.toFixed(3)} mm`,
          );
          if (!r.report.ok) {
            blockedHere = {
              reason: blockOffset(r.report),
              detail: `${card.token}: ${r.report.reason}`,
            };
            break;
          }
        }
      }

      // ── notches must sit on the cut line (or the drawn line it was measured on)
      const lineIdx = new SegIndex(
        [{ pts: cut, closed: true }, ...(seam ? [{ pts: seam, closed: true }] : [])],
        5,
      );
      const kept = notches.filter((n) => lineIdx.nearest(n.at, 2) <= 1.5);
      if (kept.length !== notches.length)
        pieceNotes.push(
          `${card.token}: ${notches.length - kept.length} notch(es) on the fold edge dropped (interior once unfolded)`,
        );
      // dedupe notches that coincide (mirrored copies of a notch at the fold end)
      const notchesOut: NotchFeature[] = [];
      for (const n of kept)
        if (!notchesOut.some((m) => Math.hypot(m.at.x - n.at.x, m.at.y - n.at.y) < 0.5))
          notchesOut.push(n);

      // ── grain
      let grain = (feats.find((f) => f.kind === 'grain') as GrainFeature | undefined) ?? null;
      if (!grain && opGrain)
        grain = {
          kind: 'grain',
          a: opGrain.a,
          b: opGrain.b,
          angleDeg:
            (Math.atan2(opGrain.b.y - opGrain.a.y, opGrain.b.x - opGrain.a.x) * 180) / Math.PI,
          origin: 'operator',
          ranges: [],
          confidence: 1,
        };
      const borrowed = lastGrain as GrainFeature | null;
      if (!grain && borrowed)
        grain = { ...borrowed, origin: 'derived', confidence: borrowed.confidence * 0.9 };
      if (!grain) {
        blockedHere = {
          reason: 'no-grain',
          detail: `${card.token}: no grainline found — click two points on the piece`,
        };
        break;
      }
      lastGrain = grain;

      const fold2 = foldEdge
        ? ({
            kind: 'fold',
            a: foldLineOnCut(foldEdge, cut)[0],
            b: foldLineOnCut(foldEdge, cut)[1],
            label: foldFeat?.label ?? 'fold (unfolded)',
            origin: foldFeat ? foldFeat.origin : 'derived',
            ranges: foldFeat?.ranges ?? [],
            confidence: foldFeat ? foldFeat.confidence : 0.6,
          } satisfies FoldFeature)
        : null;
      sizes.push({
        // SOURCE rank (SizeRun.sizes[rank]): the write stage looks walls up by candidate rank
        rank: c.rank,
        sizeToken: card.token,
        sizeId: card.sizeId,
        cut,
        seam,
        grain,
        notches: notchesOut,
        drills,
        internal,
        fold: fold2,
        offset,
        walls: c.walls,
        bbox: bboxOf(cut),
        areaMm2: areaOf(cut),
      });
      wallMaps.push({ seed, rank: c.rank, fold: fold && foldEdge ? fold : null, t: IDENTITY });
    }
    if (blockedHere) {
      block(seed, blockedHere.reason, blockedHere.detail);
      continue;
    }
    // operator grain given after a size already borrowed nothing: fine. Monotone growth (G8).
    if (!p.ungraded && sizes.length > 1) {
      const grows = sizes.every((s, i) => i === 0 || s.areaMm2 > sizes[i - 1].areaMm2);
      if (!grows) {
        if (sizes.length > 2) {
          block(
            seed,
            'non-monotone',
            `cut area does not grow with size (${sizes.map((s) => `${s.sizeToken} ${(s.areaMm2 / 100).toFixed(1)}`).join(', ')} cm²)`,
          );
          continue;
        }
        warnings.push(`${name.code}: area does not grow between its two sizes`);
      }
    }
    // ── pair / quantity
    const twin = twinOf.get(seed);
    const twinPrep = twin != null ? preps.find((x) => x.seed === twin) : undefined;
    const pp = planPair({
      qty: qtyText,
      saysPair,
      symmetric,
      onFold: anyFold,
      namedHand: !!name.hand,
    });
    pieceNotes.push(`quantity: ${pp.why}`);
    // pairHand override: undefined = no answer, null = "not a pair", L/R = the DRAWN hand of a pair
    let hand: PairHand | null = name.hand;
    let mode: 'single' | 'drawn' | 'derived';
    if (ov.pairHand === null) mode = 'single';
    else if (ov.pairHand) {
      hand = ov.pairHand;
      mode = twinPrep ? 'drawn' : 'derived';
    } else if (name.hand) mode = twinPrep ? 'drawn' : 'single';
    else if (pp.pair) {
      hand = 'L';
      mode = 'derived';
    } else mode = 'single';

    const base = {
      code: name.code,
      displayName: name.displayName,
      nameOrigin: name.nameOrigin,
      ...(name.aiConfidence != null ? { aiConfidence: name.aiConfidence } : {}),
      seed,
      variant: null,
      unfoldedFold: anyFold,
      // per WRITTEN identity: both hands of a pair count for one hand each (contract §3)
      piecesPerGarment: ov.piecesPerGarment ?? pp.perIdentity,
      allowance: { ...A, allowanceMm: allowMm },
      // fabrics/ (F7) assigns the fabric purposes; semantics does not guess them
      fabrics: [] as string[],
      fused: ov.fused ?? false,
      ungraded: p.ungraded,
    };
    const out: PieceSpec[] = [];
    if (mode === 'derived') {
      const [L, R] = identitiesOf(name.code, name.mods, 'L');
      const drawn = hand === 'R' ? R : L;
      const other = hand === 'R' ? L : R;
      const mirrored: PieceSizeSpec[] = [];
      for (const s of sizes) {
        const m = mirrorSizeAcrossGrain(s);
        if (m) mirrored.push(m.size);
      }
      if (mirrored.length !== sizes.length) {
        block(seed, 'no-grain', 'no grain to mirror the other hand across');
        continue;
      }
      out.push({
        ...base,
        identity: drawn.identity,
        mods: drawn.mods,
        pairHand: drawn.pairHand,
        pairOf: drawn.pairOf,
        sizes,
      });
      out.push({
        ...base,
        identity: other.identity,
        mods: other.mods,
        pairHand: other.pairHand,
        pairOf: other.pairOf,
        sizes: mirrored,
      });
      walls.set(drawn.identity, wallMaps);
      walls.set(
        other.identity,
        wallMaps.map((w, i) => ({
          ...w,
          t: compose(reflection(sizes[i].grain!.a, sizes[i].grain!.b), w.t),
        })),
      );
    } else if (mode === 'drawn' && hand) {
      const [L, R] = identitiesOf(name.code, name.mods, 'L');
      const me = hand === 'L' ? L : R;
      out.push({
        ...base,
        identity: me.identity,
        mods: me.mods,
        pairHand: me.pairHand,
        pairOf: me.pairOf,
        sizes,
      });
      walls.set(me.identity, wallMaps);
    } else {
      if (name.hand && ov.pairHand === undefined)
        pieceNotes.push(
          `hand ${name.hand} in the name but no ${name.hand === 'L' ? 'R' : 'L'} twin on the sheet`,
        );
      const mods = [...(hand ? [hand] : []), ...name.mods];
      const [one] = identitiesOf(name.code, mods, null);
      out.push({
        ...base,
        identity: one.identity,
        mods: one.mods,
        pairHand: null,
        pairOf: null,
        sizes,
      });
      walls.set(one.identity, wallMaps);
    }
    // grammar (G11) with the pair exemption; size tokens never in the identity
    let gram: string | null = null;
    for (const s of out) {
      const why = identityCheck(
        s.identity,
        s.nameOrigin,
        { hand: s.pairHand, of: s.pairOf },
        isSizeToken,
      );
      if (why) gram = `${s.identity}: ${why}`;
    }
    if (gram) {
      block(seed, 'grammar', gram);
      for (const s of out) walls.delete(s.identity);
      continue;
    }
    for (const s of out) {
      notes[s.identity] = pieceNotes;
      pieces.push(s);
    }
  }
  progress?.(preps.length, preps.length);

  // ── unique identities (the card's alias index is case-insensitive) ─────────────────────
  const seen = new Map<string, SeedId>();
  const unique: PieceSpec[] = [];
  const dupSeeds = new Set<SeedId>();
  for (const s of pieces) {
    const k = s.identity.toLowerCase();
    const prev = seen.get(k);
    if (prev != null && prev !== s.seed) {
      dupSeeds.add(s.seed);
      block(
        s.seed,
        'duplicate-identity',
        `${s.identity} is already the name of another piece — rename one`,
      );
      continue;
    }
    seen.set(k, s.seed);
  }
  for (const s of pieces) if (!dupSeeds.has(s.seed)) unique.push(s);
  // a drawn hand whose twin was blocked must not be written alone (G12: sibling not in the file)
  for (let changed = true; changed; ) {
    changed = false;
    const ids = new Set(unique.map((s) => s.identity));
    for (let i = unique.length - 1; i >= 0; i--) {
      const s = unique[i];
      if (!s.pairOf || ids.has(s.pairOf)) continue;
      const why = blocked.find((b) => b.seed === twinOf.get(s.seed));
      block(
        s.seed,
        why?.reason ?? 'grammar',
        `its other hand ${s.pairOf} is blocked${why ? `: ${why.detail}` : ''}`,
      );
      unique.splice(i, 1);
      changed = true;
    }
  }

  // ── walls for the gate ──────────────────────────────────────────────────────────────────
  const famBySeed = new Map(families.map((f) => [f.seed, f]));
  const wallsOf = (identity: string, rank: number): PtMm[][] | undefined => {
    const maps = walls.get(identity);
    if (!maps) return undefined;
    const spec = unique.find((s) => s.identity === identity);
    if (!spec) return undefined;
    const w = maps.find((m) => m.rank === rank) ?? (spec.ungraded ? maps[0] : undefined);
    if (!w) return undefined;
    const cand = famBySeed.get(w.seed)?.candidates.find((c) => c.rank === w.rank);
    if (!cand) return undefined;
    // a closed chain's polyline does not repeat its first vertex: close it, or the gate's walls
    // (open polylines) miss the closing edge
    let lines = cand.walls
      .map((id) => set.chains[id])
      .filter((ch) => !!ch && ch.pts.length > 1)
      .map((ch) => (ch.closed ? [...ch.pts, ch.pts[0]] : ch.pts));
    if (!lines.length) return undefined;
    if (w.fold) {
      const M = reflection(w.fold.a, w.fold.b);
      const clipped = lines.flatMap((l) => clipFold(l, w.fold!));
      lines = [...clipped, ...clipped.map((l) => l.map((q) => applyAffine(M, q)))];
    }
    return lines.map((l) => l.map((q) => applyAffine(w.t, q)));
  };

  return {
    output: { pieces: unique, blocked, warnings },
    wallsOf,
    notes,
  };
}

export const buildPieceSpecs: BuildPieceSpecsFn = (input, progress) =>
  buildPieceSpecsDetailed(input, progress).output;

/** Closest point helper re-exported for the probe (notch-on-cut checks). */
export { closestOnPolyline };
