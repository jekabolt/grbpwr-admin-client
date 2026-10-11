// solveDoll — the paper doll end to end (design §3): groups → meshes → flat charts → wrap onto the
// pattern-derived proxy → phase 1 (body alone) → free loops → proposed inter-group joins + placing
// sleeves / collar / cuffs / bands on those loops → phase 2 (everything) → release seams that can only
// close by tearing the paper → report in words.

import { edgeIdsOf } from 'lib/assembly-skeleton/geometry';
import { readSeamGraph } from 'lib/assembly-skeleton/pipeline';
import type { Edge, EdgeId, PieceGeom, Pt2, SeamCandidate } from 'lib/assembly-skeleton/types';
import { grainDegOf } from 'lib/seams/frame';
import { resolveAcrossSizes, type SizeResolved } from 'lib/seams/transfer';

import { buildChart, toChart, type Chart, type ChartSeam } from './chart';
import {
  baseCurve,
  closedNeckPath,
  findNeckPath,
  makeMap,
  neckFromRun,
  restPath,
  runMarks,
  smoothest,
  symmetricPair,
  type CollarCtx,
  type NeckPath,
} from './collar';
import { groupPieces, type GroupedPiece, type GroupedSeam } from './groups';
import { instanceMirrored } from './instance';
import { completeFromJoins } from './joins';
import { liningByName } from 'lib/assembly-skeleton/names';
import { findLoops, loopPath, type RawLoop } from './loops';
import { meshPiece, pointInPolygon, type PieceMesh } from './mesh';
import {
  anchoredRows,
  pass,
  rowGaps,
  seamRows,
  strains,
  type Path,
  type Proxy,
  type SeamRows,
  type SolverSeam,
  type SolverState,
  type Tie,
  tieGap,
} from './solve';
import type {
  DollCollarReport,
  DollClosureReport,
  DollCollarUnit,
  DollGroupId,
  DollInput,
  DollLoop,
  DollProxy,
  DollReport,
  DollSeamReport,
  DollSeamState,
  Vec3,
} from './types';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const pk = (id: string) => id.slice(0, id.lastIndexOf('#'));
const TAU = Math.PI * 2;
const CLEAR = 0; // the proxy is already EPS_WRAP smaller than the cloth: no extra gap (a gap stretches small tubes)
const EPS_WRAP = 0.04; // paper needs slack to wrap (design §3.3)
const ASPECT = 1.3; // chest wider than deep
const ARM_DEG = 42; // A-pose: arms 42° off vertical
const PROXY_K = 0.93; // proxies push to 93 % of the cloth's own girth: a guide, never a stretcher
// One-piece collar (no separate stand): where it rolls over, as a share of its depth from the
// neck edge. The pattern carries no roll-line mark; a shirt collar stands ~40 % and falls ~60 %.
const ROLL_FRAC = 0.4;

type Panel = GroupedPiece & {
  idx: number;
  mesh: PieceMesh;
  offset: number;
  count: number;
  nb: number;
  ringPos: Map<number, number>;
  mirrored: boolean;
};

type Work = {
  id: string;
  a: EdgeId[];
  b: EdgeId[];
  kind: DollSeamReport['kind'];
  origin: DollSeamReport['origin'];
  A: Path;
  B: Path;
  same: boolean;
  aRange: [number, number];
  bRange: [number, number];
  rows: SeamRows;
  solver: SolverSeam;
  target: number;
  born: number;
  ramp: number;
  note: string;
  released?: boolean;
  closure?: boolean;
  /** Not solved: free edges facing each other, welded only for the loop topology, drawn open. */
  virtual?: boolean;
  /** Found from the technologist's order (a declared join the graph had no seam for). */
  fromOrder?: boolean;
  /** L4: a seam a person confirmed (stored row) — never released; open at the end = contradiction. */
  confirmed?: boolean;
  /** L4: a doll proposal on a pair a person rejected — not sewn, not reported as a seam. */
  rejectedByPerson?: boolean;
  /** L4: a closure drawn overlapped (the buttoned centre fronts). */
  overlap?: DollClosureReport;
};

const HONESTY =
  'paper doll — shape approximate, no fabric, no body · seams pulled shut along the pattern · measures come from the pattern laid flat, never from this shape';

export function solveDoll(input: DollInput): DollReport {
  const t0 = now();
  const opt = input.options ?? {};
  const warnings: string[] = [];
  // L4: stored seams. The graph is re-read with them resolved for this size (confirmed seams taken
  // first, rejected pairs dropped, closures blocking their edges). No rows → exactly as before.
  const l4 = !!opt.seams?.rows.length;
  let resolvedRows: SizeResolved | undefined;
  let graphIn = input.graph;
  if (l4) {
    const S = opt.seams!;
    const grain = grainDegOf(input.facts);
    graphIn = readSeamGraph(input.facts, undefined, undefined, (pieces) => {
      const r = resolveAcrossSizes(S.rows, [
        { size: S.size, pieces, grainDeg: grain },
        ...(S.sizes ?? []).filter((x) => x.size !== S.size),
      ]).get(S.size)!;
      resolvedRows = r;
      return r;
    });
  }
  const isConf = (c: SeamCandidate) => l4 && c.provenance?.status === 'confirmed';
  const excludedPairs = (resolvedRows?.excluded ?? []).filter((x) => !x.surface);
  /** A pair of runs a person rejected (any edge of a on one side, any of b on the other). */
  const isExcluded = (a: readonly EdgeId[], b: readonly EdgeId[]) => {
    if (!excludedPairs.length) return false;
    const ea = a.flatMap((x) => edgeIdsOf(x));
    const eb = b.flatMap((x) => edgeIdsOf(x));
    return excludedPairs.some((x) => {
      const A = new Set(x.aIds);
      const B = new Set(x.bIds);
      return (
        (ea.some((e) => A.has(e)) && eb.some((e) => B.has(e))) ||
        (ea.some((e) => B.has(e)) && eb.some((e) => A.has(e)))
      );
    });
  };
  // Mirrored ×2 blocks become two panels (the block and its mirror).
  const inst = instanceMirrored(graphIn, input.facts);
  warnings.push(...inst.notes);
  const facts = inst.facts;
  // Suspect graph seams: joins that make the wrap topology impossible are not sewn as drawn.
  //  · the two fronts of a top sewn along their centre-front edges: that is the opening — a
  //    closure (buttons), drawn closed like one;
  //  · the left leg sewn to the right leg along more than a rise: legs meet only at the crotch.
  const suspectsIn = (Gx: ReturnType<typeof groupPieces>) => {
    const gp = new Map(Gx.pieces.map((p) => [p.key, p]));
    const handOf = (k: string) => gp.get(k)?.geom.hand ?? null;
    const edgeLen = (id: string) =>
      edgeIdsOf(id).reduce(
        (t, one) => t + (gp.get(pk(one))?.geom.edges.find((e) => e.id === one)?.lenMm ?? 0),
        0,
      );
    const lenOf = (s: GroupedSeam) => Math.max(edgeLen(s.seam.a), edgeLen(s.seam.b));
    const out = new Map<string, { kind: 'closure' | 'drop'; note: string }>();
    for (const s of Gx.seams) {
      const a = gp.get(pk(s.a[0]));
      const b = gp.get(pk(s.b[0]));
      if (!a || !b || a.key === b.key) continue;
      // A seam a person confirmed is never suspect.
      if (isConf(s.seam)) continue;
      const id = `${s.seam.a}~${s.seam.b}`;
      const hands = new Set([handOf(a.key), handOf(b.key)]);
      const lr = hands.has('L') && hands.has('R');
      // Centre-front: two fronts, or — when the back already has its own left/right centre seam —
      // any other long left/right seam of the body (fronts whose names carry no role).
      const isBack = (p: GroupedPiece) => p.role === 'back' || p.role === 'yoke';
      const cfByRole = a.role === 'front' && b.role === 'front';
      const cfByCb =
        !isBack(a) &&
        !isBack(b) &&
        Gx.seams.some((o) => {
          const oa = gp.get(pk(o.a[0]));
          const ob = gp.get(pk(o.b[0]));
          if (!oa || !ob || o === s || !isBack(oa) || !isBack(ob)) return false;
          const oh = new Set([handOf(oa.key), handOf(ob.key)]);
          return oh.has('L') && oh.has('R') && lenOf(o) > 300;
        });
      if (a.group === 'BODY' && b.group === 'BODY' && (cfByRole || cfByCb) && lr && lenOf(s) > 300)
        out.set(id, {
          kind: 'closure',
          note: `suspect — the graph sews the left front to the right front along ${lenOf(s).toFixed(0)} mm: that is the front opening (a closure), drawn closed, not a seam`,
        });
      const legs = new Set([a.group, b.group]);
      if (legs.has('LEG_L') && legs.has('LEG_R') && lenOf(s) > 450)
        out.set(id, {
          kind: 'drop',
          note: `suspect — the graph sews the left leg to the right leg along ${lenOf(s).toFixed(0)} mm; legs meet only at the rise (crotch) — not sewn`,
        });
    }
    // One front opening at most: the longest; any other long left/right seam across the body is
    // not sewn (side panels sewn to each other across the doll?).
    const cfs = [...out].filter(([, v]) => v.kind === 'closure');
    if (cfs.length > 1) {
      const lenId = (id: string) => {
        const s = Gx.seams.find((x) => `${x.seam.a}~${x.seam.b}` === id);
        return s ? lenOf(s) : 0;
      };
      cfs.sort((x, y) => lenId(y[0]) - lenId(x[0]));
      for (const [id] of cfs.slice(1))
        out.set(id, {
          kind: 'drop',
          note: `suspect — a second long left/right seam across the body (${lenId(id).toFixed(0)} mm) besides the centre back and the front opening: the two sides would be sewn to each other — not sewn`,
        });
    }
    return out;
  };
  const suspect0 = suspectsIn(
    groupPieces(inst.graph, facts, { lining: opt.lining, dropSeams: opt.dropSeams }),
  );
  // Declared joins (the technologist's order) complete the graph where it has no seam.
  let graph = inst.graph;
  const orderNote = new Map<string, string>();
  const orderJoins: DollReport['orderJoins'] = [];
  const orderSurface: DollReport['orderSurface'] = [];
  if (opt.joins?.length) {
    const notShell = new Set(
      facts.pieces
        .filter((p) => {
          const cloth = p.cloth ?? (liningByName(p.name) ? 'lining' : null);
          return cloth === 'interfacing' || (cloth === 'lining' && !opt.lining);
        })
        .flatMap((p) => [p.pieceKey, p.name]),
    );
    const r = completeFromJoins(
      graph,
      opt.joins,
      notShell,
      new Set([...suspect0].filter(([, v]) => v.kind === 'drop').map(([k]) => k)),
      facts.category === 'trousers' || facts.category === 'jumpsuit',
    );
    if (l4)
      r.added = r.added.filter((x) => {
        const no = isExcluded(x.seam.aParts ?? [x.seam.a], x.seam.bParts ?? [x.seam.b]);
        if (no)
          warnings.push(
            `technologist's order «${x.join}»: ${x.seam.a} ↔ ${x.seam.b} not proposed — a person rejected this pair`,
          );
        return !no;
      });
    graph = { ...graph, chosen: [...graph.chosen, ...r.added.map((x) => x.seam)] };
    for (const x of r.added) {
      orderNote.set(`${x.seam.a}~${x.seam.b}`, x.note);
      orderJoins.push({ join: x.join, seam: `${x.seam.a}~${x.seam.b}`, note: x.note });
    }
    for (const l of r.left) warnings.push(`technologist's order — not found: ${l}`);
    if (opt.debug)
      warnings.push(
        `debug: order joins ${opt.joins.length} · added ${r.added.map((x) => `${x.seam.a}~${x.seam.b}`).join(' ')} · by loops ${r.byLoops.map((x) => x.part.join('+')).join(' | ')} · ignored ${[...suspect0.keys()].join(' ')}`,
      );
    orderSurface.push(...r.surface);
    for (const x of r.surface)
      warnings.push(
        `technologist's order «${x.join}»: ${x.part.join('+')} is sewn onto a panel's face (a flap / welt / patch), not edge to edge — not drawn as a seam`,
      );
  }
  const G = groupPieces(graph, facts, { lining: opt.lining, dropSeams: opt.dropSeams });
  warnings.push(...G.warnings);

  const suspectNote = new Map<string, string>();
  const suspects: { s: GroupedSeam; note: string }[] = [];
  {
    const sus = suspectsIn(G);
    const keep: GroupedSeam[] = [];
    for (const s of G.seams) {
      const id = `${s.seam.a}~${s.seam.b}`;
      const v = sus.get(id);
      if (!v || orderNote.has(id)) {
        keep.push(s);
        continue;
      }
      warnings.push(`${id}: ${v.note}`);
      if (v.kind === 'closure') {
        suspectNote.set(id, v.note);
        G.closures.push(s);
      } else suspects.push({ s, note: v.note });
    }
    G.seams.splice(0, G.seams.length, ...keep);
  }

  // L4 — groups by CONFIRMED seams, not by names, where they disagree.
  if (l4) {
    const gp = new Map(G.pieces.map((p) => [p.key, p]));
    const confSeams = G.seams.filter((s) => isConf(s.seam));
    // The waistband by EDGE ROLE: a long strip whose long edge a confirmed seam sews onto two or
    // more pieces of the body / legs (the top path), whatever its name says.
    const bodyish = new Set<DollGroupId>(['BODY', 'LEG_L', 'LEG_R']);
    const legsCat =
      facts.category === 'trousers' ||
      facts.category === 'jumpsuit' ||
      facts.category === 'skirt' ||
      facts.category === 'bottom';
    for (const P of G.pieces) {
      if (P.group === 'WAISTBAND' || !legsCat) continue;
      // A strip: mean width (2·area / perimeter) small against its length (half the perimeter).
      const long = P.geom.perimMm / 2;
      const short = (2 * Math.abs(P.geom.areaMm2)) / Math.max(1, P.geom.perimMm);
      if (long < 250 || short > 0.15 * long) continue;
      const onTop = confSeams.some((s) => {
        const A = s.a.map(pk);
        const B = s.b.map(pk);
        const other = A.every((k) => k === P.key) ? B : B.every((k) => k === P.key) ? A : null;
        if (!other) return false;
        const ks = new Set(other.filter((k) => bodyish.has(gp.get(k)?.group as DollGroupId)));
        return ks.size >= 2;
      });
      if (!onTop) continue;
      warnings.push(
        `${P.key}: a strip ${long.toFixed(0)} × ${short.toFixed(0)} mm whose long edge a confirmed seam sews onto the top of the legs — drawn as the waistband ring (by its edge, not its name)`,
      );
      P.group = 'WAISTBAND';
    }
    // A leg piece whose name says one hand but whose confirmed seams sew it into the other leg
    // (a back yoke named «…_R» sewn to the left back): the seams win. A vote counts a seam whose
    // other side is ONE leg piece (an inseam, an outseam, a yoke seam); seams onto several pieces
    // (the waistband, a rise through the yoke) say nothing about the hand. Two rounds.
    for (let round = 0; round < 2; round++)
      for (const P of G.pieces) {
        // A handless back / yoke piece of trousers lands in BODY by its name: its seams say which leg.
        const handless = legsCat && P.group === 'BODY';
        if (P.group !== 'LEG_L' && P.group !== 'LEG_R' && !handless) continue;
        const votes: Record<string, number> = { LEG_L: 0, LEG_R: 0, BODY: 0 };
        for (const s of confSeams) {
          const A = [...new Set(s.a.map(pk))];
          const B = [...new Set(s.b.map(pk))];
          const other = A.includes(P.key) ? B : B.includes(P.key) ? A : null;
          if (!other || other.length !== 1 || other[0] === P.key) continue;
          const g = gp.get(other[0])?.group;
          if (g !== 'LEG_L' && g !== 'LEG_R') continue;
          votes[g] += Math.max(s.seam.evidence.aLenMm ?? 0, s.seam.evidence.bLenMm ?? 0, 50);
        }
        if (handless) {
          const best = votes.LEG_L >= votes.LEG_R ? 'LEG_L' : 'LEG_R';
          if (votes[best] > 0 && votes[best] > 1.5 * Math.min(votes.LEG_L, votes.LEG_R)) {
            warnings.push(
              `${P.key}: no hand in its name — its confirmed seams sew it into the ${best === 'LEG_L' ? 'left' : 'right'} leg`,
            );
            P.group = best;
          }
          continue;
        }
        const cur = P.group as 'LEG_L' | 'LEG_R';
        const alt = cur === 'LEG_L' ? 'LEG_R' : 'LEG_L';
        if (votes[alt] > 1.5 * votes[cur] && votes[alt] > 0) {
          warnings.push(
            `${P.key}: its name reads ${cur === 'LEG_L' ? 'left' : 'right'}, its confirmed seams sew it into the ${alt === 'LEG_L' ? 'left' : 'right'} leg — placed there`,
          );
          P.group = alt;
        }
      }
  }

  // L4: confirmed rows that cannot be what they say, before solving (lengths, an edge sewn twice).
  const preContradictions: string[] = [];
  if (l4) {
    const lenOfEdge = new Map<string, number>();
    for (const P of G.pieces) for (const e of P.geom.edges) lenOfEdge.set(e.id, e.lenMm);
    const sideLen = (g: GroupedSeam, side: 'a' | 'b') => {
      const ids = side === 'a' ? g.a : g.b;
      const pr = g.seam.partRange ?? {};
      const rg = g.seam.range && ids.length === 1 ? g.seam.range[side] : null;
      if (rg) return rg[1] - rg[0];
      return ids.reduce((t, id) => {
        const r = pr[id];
        return t + (r ? r[1] - r[0] : lenOfEdge.get(id) ?? 0);
      }, 0);
    };
    const usedBy = new Map<string, string[]>();
    for (const g of [...G.seams, ...G.closures]) {
      if (!isConf(g.seam)) continue;
      const id = `${g.seam.a}~${g.seam.b}`;
      const la = sideLen(g, 'a');
      const lb = sideLen(g, 'b');
      const diff = 1 - Math.min(la, lb) / Math.max(la, lb, 1e-9);
      if (diff > 0.35)
        preContradictions.push(
          `${id}: confirmed by a person, but its sides are ${la.toFixed(0)} and ${lb.toFixed(0)} mm — ${(diff * 100).toFixed(0)} % apart, more than any ease: not one seam`,
        );
      // The stretch of each edge this seam takes (mm): partial ranges and composite part ranges.
      const span = (e: string, side: 'a' | 'b'): [number, number] => {
        const ids = side === 'a' ? g.a : g.b;
        const r =
          g.seam.partRange?.[e] ?? (g.seam.range && ids.length === 1 ? g.seam.range[side] : null);
        return r ?? [0, lenOfEdge.get(e) ?? 0];
      };
      for (const side of ['a', 'b'] as const)
        for (const e of side === 'a' ? g.a : g.b)
          usedBy.set(e, [...(usedBy.get(e) ?? []), `${id}|${span(e, side).join(',')}`]);
    }
    const ringish = new Set<DollGroupId>(['COLLAR', 'STAND']);
    const groupOfKey = new Map(G.pieces.map((P) => [P.key, P.group]));
    for (const [e, list] of usedBy) {
      // Collar plies / stacked collars sandwich one edge between two layers: not a contradiction.
      if (ringish.has(groupOfKey.get(pk(e)) as DollGroupId)) continue;
      const items = list.map((x) => {
        const [id, r] = x.split('|');
        const [r0, r1] = r.split(',').map(Number);
        return { id, r0, r1 };
      });
      const clash = new Set<string>();
      for (let i = 0; i < items.length; i++)
        for (let j = i + 1; j < items.length; j++) {
          const A = items[i];
          const B = items[j];
          if (A.id === B.id) continue;
          // Two seams on one edge are fine when they take different stretches of it.
          if (Math.min(A.r1, B.r1) - Math.max(A.r0, B.r0) > 5) clash.add(A.id).add(B.id);
        }
      if (clash.size)
        preContradictions.push(
          `${e} is sewn by ${clash.size} confirmed seams over the same stretch (${[...clash].join(', ')}) — an edge takes one seam`,
        );
    }
    for (const w of preContradictions) warnings.push(`contradiction: ${w}`);
  }

  // ── meshes ───────────────────────────────────────────────────────────────────────────────
  const area = G.pieces.reduce((s, p) => s + Math.abs(p.geom.areaMm2), 0);
  const h =
    opt.gridMm ??
    Math.min(
      40,
      Math.max(9, Math.sqrt((2 * area) / (Math.sqrt(3) * (opt.targetVertices ?? 2200)))),
    );
  const panels: Panel[] = [];
  let N = 0;
  for (const p of G.pieces) {
    const g = p.geom;
    const keep = [...g.edges.flatMap((e) => [e.s, e.e]), ...g.notchIdx, ...g.corners];
    const mesh = meshPiece(g.rs, keep, h);
    const ringPos = new Map<number, number>();
    mesh.bRs.forEach((r, i) => ringPos.set(r, i));
    panels.push({
      ...p,
      idx: panels.length,
      mesh,
      offset: N,
      count: mesh.pts.length,
      nb: mesh.bRs.length,
      ringPos,
      mirrored: false,
    });
    N += mesh.pts.length;
  }
  const msMesh = now() - t0;
  opt.onMesh?.({
    vertices: N,
    panels: panels.map((P) => ({
      pieceKey: P.key,
      group: P.group,
      offset: P.offset,
      count: P.count,
      tris: Uint32Array.from(P.mesh.tris),
    })),
  });
  const pos = new Float64Array(3 * N);
  const uv = new Float64Array(2 * N);
  const cuv = new Float64Array(2 * N); // chart coords
  const panelOf = new Int32Array(N).fill(-1);
  const ringOf = new Int32Array(N).fill(-1);
  const groupOfV: DollGroupId[] = new Array(N);
  for (const P of panels) {
    for (let i = 0; i < P.count; i++) {
      const v = P.offset + i;
      uv[2 * v] = P.mesh.pts[i][0];
      uv[2 * v + 1] = P.mesh.pts[i][1];
      panelOf[v] = P.idx;
      ringOf[v] = i < P.nb ? i : -1;
      groupOfV[v] = P.group;
    }
  }
  const panelByKey = new Map(panels.map((P) => [P.key, P]));
  const edgeById = new Map<string, Edge>();
  for (const P of panels) for (const e of P.geom.edges) edgeById.set(e.id, e);

  /** Boundary path of a run of edges (chains / composite parts concatenated). */
  const pathOf = (ids: EdgeId[]): Path | null => {
    const v: number[] = [];
    const s: number[] = [];
    for (const id0 of ids)
      for (const id of edgeIdsOf(id0)) {
        const P = panelByKey.get(pk(id));
        const e = edgeById.get(id);
        if (!P || !e) return null;
        const n = P.geom.rs.length;
        const ps = P.ringPos.get(((e.s % n) + n) % n);
        const pe = P.ringPos.get(((e.e % n) + n) % n);
        if (ps === undefined || pe === undefined) return null;
        let q = ps;
        for (let guard = 0; guard <= P.nb; guard++) {
          const gv = P.offset + q;
          if (v.length && v[v.length - 1] === gv) {
            // shared vertex of a chain
          } else {
            const prev = v.length ? v[v.length - 1] : -1;
            const d =
              prev >= 0 && panelOf[prev] === P.idx
                ? Math.hypot(uv[2 * gv] - uv[2 * prev], uv[2 * gv + 1] - uv[2 * prev + 1])
                : 0;
            v.push(gv);
            s.push((s.length ? s[s.length - 1] : 0) + d);
          }
          if (q === pe) break;
          q = (q + 1) % P.nb;
        }
      }
    if (v.length < 2) return null;
    return { v: Int32Array.from(v), s: Float64Array.from(s), len: s[s.length - 1] };
  };

  /** A path cut to the stretch [r0, r1] mm of its rest arc (a part sewn over part of its edge). */
  const cropPath = (P: Path, r: [number, number]): Path => {
    const keep: number[] = [];
    for (let k = 0; k < P.v.length; k++) if (P.s[k] >= r[0] - 1 && P.s[k] <= r[1] + 1) keep.push(k);
    if (keep.length < 2) {
      let k0 = 0;
      for (let k = 0; k < P.v.length; k++)
        if (Math.abs(P.s[k] - (r[0] + r[1]) / 2) < Math.abs(P.s[k0] - (r[0] + r[1]) / 2)) k0 = k;
      keep.splice(0, keep.length, Math.max(0, k0 - 1), Math.min(P.v.length - 1, Math.max(1, k0)));
    }
    const s0 = P.s[keep[0]];
    return {
      v: Int32Array.from(keep.map((k) => P.v[k])),
      s: Float64Array.from(keep.map((k) => P.s[k] - s0)),
      len: P.s[keep[keep.length - 1]] - s0,
    };
  };
  const revPath = (P: Path): Path => ({
    v: Int32Array.from([...P.v].reverse()),
    s: Float64Array.from([...P.s].reverse().map((x) => P.len - x)),
    len: P.len,
  });
  /**
   * L4: a CONFIRMED side as one path — its parts in the stored walk order, each oriented to meet the
   * previous one where they lie now (parts on different pieces meet through other seams), each cut
   * to its sewn stretch when the row says so. One-piece contiguous sides keep `pathOf`.
   */
  const sidePath = (g: GroupedSeam, side: 'a' | 'b'): Path | null => {
    const ids = side === 'a' ? g.a : g.b;
    const orig = (
      side === 'a' ? g.seam.aParts ?? edgeIdsOf(g.seam.a) : g.seam.bParts ?? edgeIdsOf(g.seam.b)
    ).flatMap((x) => edgeIdsOf(x));
    const pr = g.seam.partRange ?? {};
    const multi = new Set(ids.map(pk)).size > 1 || Object.keys(pr).length > 0;
    if (!multi) return pathOf(ids);
    const parts: Path[] = [];
    for (let i = 0; i < ids.length; i++) {
      const P = pathOf([ids[i]]);
      if (!P) return null;
      const r = pr[orig[i]] ?? pr[ids[i]];
      parts.push(r ? cropPath(P, r) : P);
    }
    const d3 = (a: number, b: number) =>
      Math.hypot(
        pos[3 * a] - pos[3 * b],
        pos[3 * a + 1] - pos[3 * b + 1],
        pos[3 * a + 2] - pos[3 * b + 2],
      );
    const first = (P: Path) => P.v[0];
    const last = (P: Path) => P.v[P.v.length - 1];
    // Each part's direction: the one set of directions whose consecutive parts meet best where
    // they lie now (the sum of the joins), ties to the stored walk. Greedy, part by part, fails on
    // an armhole: the bottom of the back armhole can lie nearer the front princess point than the
    // shoulder does before the body is closed.
    const n = parts.length;
    let bestMask = 0;
    if (n <= 12) {
      let bestCost = Infinity;
      let bestRev = Infinity;
      for (let mask = 0; mask < 1 << n; mask++) {
        let cost = 0;
        let rev = 0;
        for (let i = 0; i < n; i++) {
          const r = (mask >> i) & 1;
          rev += r;
          if (i === 0) continue;
          const rp = (mask >> (i - 1)) & 1;
          const endPrev = rp ? first(parts[i - 1]) : last(parts[i - 1]);
          const startCur = r ? last(parts[i]) : first(parts[i]);
          cost += d3(endPrev, startCur);
        }
        if (cost < bestCost - 2 || (Math.abs(cost - bestCost) <= 2 && rev < bestRev))
          [bestCost, bestRev, bestMask] = [cost, rev, mask];
      }
    }
    const out: Path[] = parts.map((P, i) => ((bestMask >> i) & 1 ? revPath(P) : P));
    const v: number[] = [];
    const sv: number[] = [];
    let base = 0;
    for (const P of out) {
      for (let k = 0; k < P.v.length; k++) {
        if (k === 0 && v.length && v[v.length - 1] === P.v[0]) continue;
        v.push(P.v[k]);
        sv.push(base + P.s[k]);
      }
      base += P.len;
    }
    return { v: Int32Array.from(v), s: Float64Array.from(sv), len: base };
  };

  // ── charts ───────────────────────────────────────────────────────────────────────────────
  const groups = new Map<DollGroupId, Panel[]>();
  for (const P of panels) {
    if (!groups.has(P.group)) groups.set(P.group, []);
    groups.get(P.group)!.push(P);
  }
  const charts = new Map<DollGroupId, Chart>();
  const chartSeamOf = (s: GroupedSeam): ChartSeam | null => {
    const a = s.a.map((id) => edgeById.get(id)).filter((e): e is Edge => !!e);
    const b = s.b.map((id) => edgeById.get(id)).filter((e): e is Edge => !!e);
    if (!a.length || !b.length || a.length !== s.a.length || b.length !== s.b.length) return null;
    if (new Set(a.map((e) => e.pieceKey)).size > 1 || new Set(b.map((e) => e.pieceKey)).size > 1)
      return null;
    return { id: `${s.seam.a}~${s.seam.b}`, a, b, partial: s.seam.kind === 'partial' };
  };
  for (const [gid, list] of groups) {
    const keys = new Set(list.map((P) => P.key));
    const cs = G.seams
      .filter((s) => keys.has(pk(s.a[0])) && keys.has(pk(s.b[0])))
      .map(chartSeamOf)
      .filter((x): x is ChartSeam => !!x);
    // L4: a confirmed composite (one edge ↔ parts on two or more pieces of this group) lays each
    // part along its stretch of the single edge. Which end of the edge the stored walk starts at is
    // not in the row: each composite is laid both ways and keeps the one whose parts land on their
    // stretches in the chart (one fixed way twisted card6's placket or opened card11's left leg).
    const comps: { parts: ChartSeam[]; flip: ChartSeam[]; fixed: boolean | null }[] = [];
    if (l4)
      for (const g of G.seams) {
        if (!isConf(g.seam)) continue;
        for (const [one, many, oneIsA] of [
          [g.a, g.b, true],
          [g.b, g.a, false],
        ] as const) {
          if (one.length !== 1 || new Set(many.map(pk)).size < 2) continue;
          if (![...one, ...many].every((id) => keys.has(pk(id)))) continue;
          const e1 = edgeById.get(one[0]);
          const parts = many.map((id) => edgeById.get(id));
          if (!e1 || parts.some((e) => !e)) continue;
          const pr = g.seam.partRange ?? {};
          const lens = many.map((id, i) => {
            const r = pr[id];
            return r ? r[1] - r[0] : parts[i]!.lenMm;
          });
          const L = lens.reduce((t, x) => t + x, 0) || 1;
          const mk = (against: boolean) => {
            let c = 0;
            return many.map((id, i): ChartSeam => {
              const r = pr[id];
              const e = parts[i]!;
              const f0 = against ? 1 - (c + lens[i]) / L : c / L;
              const f1 = against ? 1 - c / L : (c + lens[i]) / L;
              c += lens[i];
              const own: [number, number] = r ? [r[0] / e.lenMm, r[1] / e.lenMm] : [0, 1];
              return {
                id: `${g.seam.a}~${g.seam.b}@${i}`,
                a: oneIsA ? [e1] : [e],
                b: oneIsA ? [e] : [e1],
                partial: true,
                ranges: oneIsA ? { a: [f0, f1], b: own } : { a: own, b: [f0, f1] },
              };
            });
          };
          // Pieces lie upright in the chart, so height says which part comes first along a
          // vertical edge: the first part sits above the second when the seam joining their pieces
          // lies below it on its own piece. Along a level edge the chart's fit decides.
          let fixed: boolean | null = null;
          const k0 = pk(many[0]);
          const k1 = pk(many[1]);
          const join = G.seams.find(
            (sm) =>
              (sm.a.some((id) => pk(id) === k0) && sm.b.some((id) => pk(id) === k1)) ||
              (sm.a.some((id) => pk(id) === k1) && sm.b.some((id) => pk(id) === k0)),
          );
          const my = (pts: readonly Pt2[]) =>
            pts.reduce((t, q) => t + q[1], 0) / Math.max(1, pts.length);
          if (join) {
            const jIds = [...join.a, ...join.b].filter((id) => pk(id) === k0);
            const jy = my(jIds.flatMap((id) => edgeById.get(id)?.pts ?? []));
            const py = my(parts[0]!.pts);
            const ey = e1.pts[e1.pts.length - 1][1] - e1.pts[0][1];
            if (Math.abs(jy - py) > 20 && Math.abs(ey) > 0.5 * e1.lenMm) {
              const firstOnTop = jy < py;
              const e1Down = ey < 0;
              fixed = firstOnTop !== e1Down; // along when the edge starts at the first part's end
            }
          }
          comps.push({ parts: mk(false), flip: mk(true), fixed });
        }
      }
    const sampleOn = (pts: readonly Pt2[], f0: number, f1: number, K: number): Pt2[] => {
      const cum = [0];
      for (let i = 1; i < pts.length; i++)
        cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const T = cum[cum.length - 1] || 1;
      const out: Pt2[] = [];
      for (let k = 0; k <= K; k++) {
        const t = (f0 + ((f1 - f0) * k) / K) * T;
        let i = 1;
        while (i < pts.length - 1 && cum[i] < t) i++;
        const u = (t - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
        out.push([
          pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u,
          pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u,
        ]);
      }
      return out;
    };
    /** How far the composites' parts land from their stretches in a chart (mean mm). */
    const compMiss = (ch: Chart, sel: ChartSeam[][]) => {
      let t = 0;
      let n = 0;
      for (const list2 of sel)
        for (const cs2 of list2) {
          const pa = ch.place.get(cs2.a[0].pieceKey);
          const pb = ch.place.get(cs2.b[0].pieceKey);
          if (!pa || !pb || !cs2.ranges) continue;
          const A = sampleOn(cs2.a[0].pts, ...cs2.ranges.a, 8).map((q) => toChart(pa, q));
          const B = sampleOn(cs2.b[0].pts, ...cs2.ranges.b, 8).map((q) => toChart(pb, q));
          let fw = 0;
          let bw = 0;
          for (let k = 0; k <= 8; k++) {
            fw += Math.hypot(A[k][0] - B[k][0], A[k][1] - B[k][1]);
            bw += Math.hypot(A[k][0] - B[8 - k][0], A[k][1] - B[8 - k][1]);
          }
          t += Math.min(fw, bw) / 9;
          n++;
        }
      return n ? t / n : 0;
    };
    const flips = comps.map(() => false);
    const csWith = () => [...cs, ...comps.flatMap((c, k) => (flips[k] ? c.flip : c.parts))];
    const byArea = [...list].sort(
      (x, y) => Math.abs(y.geom.areaMm2) - Math.abs(x.geom.areaMm2) || x.key.localeCompare(y.key),
    );
    let root = byArea[0].key;
    if (gid === 'BODY') {
      root = (
        byArea.find((P) => P.role === 'back' && !P.geom.hand) ??
        byArea.find((P) => P.role === 'back') ??
        byArea[0]
      ).key;
    } else if (gid === 'LEG_L' || gid === 'LEG_R') {
      root = (byArea.find((P) => P.role === 'front') ?? byArea[0]).key;
    }
    if (comps.length) {
      const sel = () => comps.map((c, k) => (flips[k] ? c.flip : c.parts));
      let best = compMiss(
        buildChart(
          list.map((P) => P.geom),
          csWith(),
          root,
        ),
        sel(),
      );
      comps.forEach((c, k) => {
        if (c.fixed !== null) flips[k] = c.fixed;
      });
      best = compMiss(
        buildChart(
          list.map((P) => P.geom),
          csWith(),
          root,
        ),
        sel(),
      );
      for (let k = 0; k < comps.length; k++) {
        if (comps[k].fixed !== null) continue;
        flips[k] = true;
        const m = compMiss(
          buildChart(
            list.map((P) => P.geom),
            csWith(),
            root,
          ),
          sel(),
        );
        if (m < best - 1) best = m;
        else flips[k] = false;
      }
      if (opt.debug)
        warnings.push(
          `debug: chart ${gid}: composites laid ${comps.map((c, k) => `${c.parts[0].id.split('@')[0]} ${flips[k] ? 'against' : 'along'}${c.fixed === null ? ' (chart fit)' : ' (by height)'}`).join(' · ')} (miss ${best.toFixed(0)} mm)`,
        );
      cs.splice(0, cs.length, ...csWith());
    }
    let chart = buildChart(
      list.map((P) => P.geom),
      cs,
      root,
    );
    if (gid === 'BODY') {
      // Which way round does the strip run? Seen from outside, a back's drawing-left is the doll's
      // left. Some CAD exports draw backs as seen from the front (mirrored). Decide by the seams
      // first — the reading in which fewer over-the-top seams (shoulders) cross from the doll's left
      // to its right — and by the hands of the names only when the seams cannot tell.
      const rootP = list.find((P) => P.key === root)!;
      const rootIsFront = rootP.role === 'front';
      const judge = (ch: Chart) => {
        const comp = new Set(ch.components[0].keys);
        const ucOf = (k: string) => {
          const g = list.find((P) => P.key === k)!.geom;
          const pl = ch.place.get(k)!;
          const xs = g.rs.filter((_, i) => i % 10 === 0).map((q) => toChart(pl, q)[0]);
          return xs.reduce((a, b) => a + b, 0) / xs.length;
        };
        let u0 = Infinity;
        let u1 = -Infinity;
        for (const k of comp) {
          const g = list.find((P) => P.key === k)!.geom;
          const pl = ch.place.get(k)!;
          for (const q of g.rs.filter((_, i) => i % 10 === 0)) {
            const x = toChart(pl, q)[0];
            u0 = Math.min(u0, x);
            u1 = Math.max(u1, x);
          }
        }
        const W = Math.max(1, u1 - u0);
        const uR = ucOf(root);
        const th0 = rootIsFront ? 0 : Math.PI;
        const side = (u: number) => Math.sign(Math.sin(th0 + (TAU * (u - uR)) / W));
        const edgeU = (id: string) => {
          const e = edgeById.get(id);
          const pl = ch.place.get(pk(id));
          if (!e || !pl) return null;
          return toChart(pl, e.pts[Math.floor(e.pts.length / 2)])[0];
        };
        let crossings = 0;
        for (const sm of cs) {
          if (ch.used.has(sm.id)) continue;
          const ka = sm.a[0].pieceKey;
          const kb = sm.b[0].pieceKey;
          if (!comp.has(ka) || !comp.has(kb)) continue;
          const ua = edgeU(sm.a[0].id);
          const ub = edgeU(sm.b[0].id);
          if (ua === null || ub === null) continue;
          const sa = side(ua);
          const sb = side(ub);
          if (sa && sb && sa !== sb && Math.abs(ua - uR) > 0.05 * W && Math.abs(ub - uR) > 0.05 * W)
            crossings++;
        }
        let hands = 0;
        for (const P of list) {
          const hd = P.geom.hand;
          if (!hd || !comp.has(P.key)) continue;
          hands += (hd === 'L' ? 1 : -1) * Math.sign(ucOf(P.key) - uR) * (rootIsFront ? -1 : 1);
        }
        return { crossings, hands };
      };
      const a0 = judge(chart);
      const alt = buildChart(
        list.map((P) => P.geom),
        cs,
        root,
        true,
      );
      const a1 = judge(alt);
      // Names first (a reading that puts every left piece on the left makes the strip as drawn);
      // only pieces without hands fall back on the seams. A crossing that survives is reported.
      const pickAlt =
        (a0.hands > 0 && a1.hands < a0.hands) || (a0.hands === 0 && a1.crossings < a0.crossings);
      if (opt.debug)
        warnings.push(
          `debug: strip reading: as drawn ${a0.crossings} crossing / hands ${a0.hands}; mirrored ${a1.crossings} / ${a1.hands} → ${pickAlt ? 'mirrored' : 'as drawn'}`,
        );
      if (pickAlt) {
        chart = alt;
        warnings.push(
          a0.hands === 0
            ? `no hands in the names — the body is laid the way its shoulder seams do not cross`
            : `the pieces are drawn face down relative to their names (backs drawn as seen from the front?) — the body is laid mirrored so left stays left`,
        );
      }
    }
    if (l4)
      for (const id of [...chart.used])
        if (id.includes('@')) chart.used.add(id.slice(0, id.lastIndexOf('@')));
    charts.set(gid, chart);
    for (const P of list) {
      const pl = chart.place.get(P.key)!;
      P.mirrored = pl.mirror;
      for (let i = 0; i < P.count; i++) {
        const v = P.offset + i;
        const c = toChart(pl, [uv[2 * v], uv[2 * v + 1]]);
        cuv[2 * v] = c[0];
        cuv[2 * v + 1] = c[1];
      }
    }
  }
  if (opt.debug)
    for (const [gid, ch] of charts)
      warnings.push(
        `debug: chart ${gid}: ${ch.components.map((c) => `[${c.keys.map((k) => `${k}${ch.place.get(k)!.mirror ? '(m)' : ''}@${ch.place.get(k)!.dx.toFixed(0)},${ch.place.get(k)!.dy.toFixed(0)}`).join(' ')}]`).join(' ')}${ch.rejected.length ? ` · refused: ${ch.rejected.join('; ')}` : ''}`,
      );
  const compOfKey = new Map<string, number>();
  for (const ch of charts.values())
    ch.components.forEach((c, i) => c.keys.forEach((k) => compOfKey.set(k, i)));

  // Chart helpers: horizontal crossings of a set of panels at level v (chart coords).
  const boundaryChart = (P: Panel) => {
    const out: [number, number][] = [];
    for (let r = 0; r < P.nb; r++) out.push([cuv[2 * (P.offset + r)], cuv[2 * (P.offset + r) + 1]]);
    return out;
  };
  const crossings = (list: Panel[], v: number) => {
    const iv: [number, number][] = [];
    for (const P of list) {
      const ring = boundaryChart(P);
      const xs: number[] = [];
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        if (a[1] > v !== b[1] > v) xs.push(a[0] + ((v - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((x, y) => x - y);
      for (let k = 0; k + 1 < xs.length; k += 2) iv.push([xs[k], xs[k + 1]]);
    }
    iv.sort((x, y) => x[0] - y[0]);
    return iv;
  };
  const extent = (iv: [number, number][]) =>
    iv.length ? [Math.min(...iv.map((x) => x[0])), Math.max(...iv.map((x) => x[1]))] : null;
  const coverage = (iv: [number, number][]) => {
    const e = extent(iv);
    if (!e) return 0;
    let cov = 0;
    let end = -Infinity;
    for (const [a, b] of iv) {
      if (b <= end) continue;
      cov += b - Math.max(a, end);
      end = b;
    }
    return cov / Math.max(1, e[1] - e[0]);
  };
  /** Chart extent per level, cached on a 5 mm grid (proxies call it per vertex per pass). */
  const widthTable = (list: Panel[], lo: number, hi: number, fallback: number) => {
    const step = 5;
    const n = Math.max(2, Math.ceil((hi - lo) / step) + 1);
    const t = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const v = Math.max(lo + 2, Math.min(lo + k * step, hi - 2));
      const e = extent(crossings(list, v));
      t[k] = e ? e[1] - e[0] : NaN;
    }
    for (let k = 1; k < n; k++) if (Number.isNaN(t[k])) t[k] = t[k - 1];
    for (let k = n - 2; k >= 0; k--) if (Number.isNaN(t[k])) t[k] = t[k + 1];
    for (let k = 0; k < n; k++) if (Number.isNaN(t[k])) t[k] = fallback;
    return (v: number) => {
      const f = (v - lo) / step;
      const i = Math.max(0, Math.min(n - 2, Math.floor(f)));
      const w = Math.max(0, Math.min(1, f - i));
      return t[i] * (1 - w) + t[i + 1] * w;
    };
  };
  const vRange = (list: Panel[]) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const P of list)
      for (let r = 0; r < P.nb; r++) {
        const y = cuv[2 * (P.offset + r) + 1];
        if (y < lo) lo = y;
        if (y > hi) hi = y;
      }
    return [lo, hi];
  };
  const setPos = (v: number, p: Vec3) => {
    pos[3 * v] = p[0];
    pos[3 * v + 1] = p[1];
    pos[3 * v + 2] = p[2];
  };
  const getPos = (v: number): Vec3 => [pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]];

  const proxies: Proxy[] = [];
  const proxyOf = new Int32Array(N).fill(-1);
  const proxyReport: DollProxy[] = [];
  const placed = new Uint8Array(N);

  // ── seams as work items ──────────────────────────────────────────────────────────────────
  const works: Work[] = [];
  const meanDist = (
    A: Path,
    B: Path,
    same: boolean,
    aR: [number, number],
    bR: [number, number],
  ) => {
    const r = seamRows(A, B, same, aR, bR);
    const g = rowGaps(pos, r);
    return g.reduce((x, y) => x + y, 0) / Math.max(1, g.length);
  };
  /** Build a work item; direction (and partial anchor) by the smaller initial gap. */
  const addWork = (
    w: Omit<Work, 'rows' | 'solver' | 'same' | 'aRange' | 'bRange' | 'born' | 'ramp'> & {
      partial?: boolean;
      gap?: number;
      forceSame?: boolean;
      /** L4: the sewn stretch of each side, shares of its path (a stored partial). */
      ranges?: { aR: [number, number]; bR: [number, number] };
    },
    passNow: number,
    ramp: number,
  ) => {
    const options: { same: boolean; aR: [number, number]; bR: [number, number] }[] = [];
    if (w.ranges)
      for (const same of w.forceSame === undefined ? [false, true] : [w.forceSame])
        options.push({ same, aR: w.ranges.aR, bR: w.ranges.bR });
    const ratio = Math.min(w.A.len, w.B.len) / Math.max(w.A.len, w.B.len, 1e-9);
    const sames = w.forceSame === undefined ? [false, true] : [w.forceSame];
    // (graph seams pass forceSame: face-up pieces are sewn with their edges running opposite ways)
    for (const same of w.ranges ? [] : sames) {
      if (w.partial && ratio < 0.97) {
        const aShort = w.A.len < w.B.len;
        for (const anchor of [0, 1]) {
          const sub: [number, number] = anchor === 0 ? [0, ratio] : [1 - ratio, 1];
          options.push(aShort ? { same, aR: [0, 1], bR: sub } : { same, aR: sub, bR: [0, 1] });
        }
      } else options.push({ same, aR: [0, 1], bR: [0, 1] });
    }
    let best = options[0];
    let bd = Infinity;
    for (const o of options) {
      const d = meanDist(w.A, w.B, o.same, o.aR, o.bR);
      if (d < bd - 1e-6) [best, bd] = [o, d];
    }
    const rows = seamRows(w.A, w.B, best.same, best.aR, best.bR);
    const solver: SolverSeam = { rows, k: 0, active: true, gap: w.gap ?? 0 };
    const item: Work = {
      ...w,
      same: best.same,
      aRange: best.aR,
      bRange: best.bR,
      rows,
      solver,
      born: passNow,
      ramp,
    };
    works.push(item);
    // L4: the doll never proposes a pair a person rejected (kept out of the solve and the report).
    if (
      l4 &&
      item.origin === 'doll-proposed' &&
      item.kind !== 'facing-free' &&
      isExcluded(item.a, item.b)
    ) {
      item.rejectedByPerson = true;
      item.released = true;
      item.solver.active = false;
      warnings.push(`${item.id}: not proposed — a person rejected this pair`);
    }
    return item;
  };

  // ── BODY / LEGS placement ───────────────────────────────────────────────────────────────
  const body = groups.get('BODY') ?? [];
  const bodyChart = charts.get('BODY');
  let vArm = 0;
  let vSh = 0;
  let vLo = 0;
  const torso: { y: number; a: number; b: number; tab: Float64Array }[] = [];
  const ellPerimFactor = (() => {
    const b = 1 / ASPECT;
    return Math.PI * (3 * (1 + b) - Math.sqrt((3 + b) * (1 + 3 * b)));
  })();
  const arcTable = (a: number, b: number) => {
    const K = 96;
    const t = new Float64Array(K + 1);
    let px = 0;
    let pz = b;
    for (let k = 1; k <= K; k++) {
      const ph = (TAU * k) / K;
      const x = a * Math.sin(ph);
      const z = b * Math.cos(ph);
      t[k] = t[k - 1] + Math.hypot(x - px, z - pz);
      px = x;
      pz = z;
    }
    return t;
  };
  const torsoAt = (y: number) => {
    if (!torso.length) return null;
    const step = torso.length > 1 ? torso[1].y - torso[0].y : 10;
    const f = (y - torso[0].y) / step;
    const i = Math.max(0, Math.min(torso.length - 1, Math.floor(f)));
    return torso[i];
  };
  /** Point on the torso at azimuth θ (0 = front, π = back, + toward the doll's right at the back). */
  const torsoPoint = (theta: number, y: number, off: number): Vec3 => {
    const L = torsoAt(y)!;
    const tab = L.tab;
    const K = tab.length - 1;
    let fr = (((theta % TAU) + TAU) % TAU) / TAU;
    const target = fr * tab[K];
    let lo = 0;
    let hi = K;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (tab[m] <= target) lo = m;
      else hi = m;
    }
    fr = (lo + (target - tab[lo]) / Math.max(1e-9, tab[hi] - tab[lo])) / K;
    const ph = fr * TAU;
    const x = L.a * Math.sin(ph);
    const z = L.b * Math.cos(ph);
    const nx = x / (L.a * L.a);
    const nz = z / (L.b * L.b);
    const nl = Math.hypot(nx, nz) || 1;
    return [x + (nx / nl) * off, y, z + (nz / nl) * off];
  };

  // The two far ends of the body ring when girth components continue the main strip.
  const ringEnds: { left: Panel[] | null; right: Panel[] | null } = { left: null, right: null };
  if (body.length && bodyChart) {
    const comps = bodyChart.components.map((c) => c.keys.map((k) => panelByKey.get(k)!));
    // Later components: height from their seams to what is already aligned.
    const aligned = new Set(comps[0].map((P) => P.key));
    for (let ci = 1; ci < comps.length; ci++) {
      const own = new Set(comps[ci].map((P) => P.key));
      let sum = 0;
      let n = 0;
      for (const s of G.seams) {
        const ka = pk(s.a[0]);
        const kb = pk(s.b[0]);
        const [mine, theirs] =
          own.has(ka) && aligned.has(kb)
            ? [s.a, s.b]
            : own.has(kb) && aligned.has(ka)
              ? [s.b, s.a]
              : [null, null];
        if (!mine || !theirs) continue;
        const pm = pathOf(mine);
        const pt = pathOf(theirs);
        if (!pm || !pt) continue;
        const mv = [...pm.v].reduce((t, v) => t + cuv[2 * v + 1], 0) / pm.v.length;
        const tv = [...pt.v].reduce((t, v) => t + cuv[2 * v + 1], 0) / pt.v.length;
        sum += tv - mv;
        n++;
      }
      if (n) {
        const dy = sum / n;
        for (const P of comps[ci])
          for (let i = 0; i < P.count; i++) cuv[2 * (P.offset + i) + 1] += dy;
        for (const P of comps[ci]) aligned.add(P.key);
      }
    }
    const main = comps[0];
    const [lo, hi] = vRange(body.filter((P) => aligned.has(P.key)));
    const [mlo] = vRange(main);
    vLo = mlo;
    const H = hi - lo;
    // Armhole level: the lowest level (above 40 % of the height) where the main strip has holes.
    vArm = hi - 0.27 * H;
    for (let v = mlo + 0.4 * H; v < hi; v += 10) {
      if (
        coverage(crossings(main, v)) < 0.86 &&
        coverage(crossings(main, v + 10)) < 0.86 &&
        coverage(crossings(main, v + 20)) < 0.86
      ) {
        vArm = v;
        break;
      }
    }
    // Shoulder line: the seams that go over the top (body seams not used by the chart, high up).
    const over: number[] = [];
    for (const s of G.seams) {
      if (!aligned.has(pk(s.a[0])) || !aligned.has(pk(s.b[0]))) continue;
      if (bodyChart.used.has(`${s.seam.a}~${s.seam.b}`)) continue;
      const pa = pathOf(s.a);
      if (!pa) continue;
      const mv = [...pa.v].reduce((t, v) => t + cuv[2 * v + 1], 0) / pa.v.length;
      if (mv > vArm) over.push(mv);
    }
    vSh = over.length ? over.reduce((x, y) => x + y, 0) / over.length : hi - 0.03 * H;
    vSh = Math.max(vSh, vArm + 60);
    // Girth per level: every aligned component's extent; above the armhole the armhole girth.
    const levels: number[] = [];
    for (let v = mlo - 30; v <= vSh + 20; v += 10) levels.push(v);
    const girth = levels.map((v) => {
      const vv = Math.min(v, vArm);
      let w = 0;
      for (const c of comps) {
        if (!c.every((P) => aligned.has(P.key))) continue;
        const e = extent(crossings(c, Math.max(vv, mlo + 2)));
        if (e) w += e[1] - e[0];
      }
      return w;
    });
    // Below the level where the strip is whole (curved hems, short side panels), keep that girth.
    {
      const band = levels
        .map((v, i) => [v, girth[i]] as const)
        .filter(([v]) => v >= mlo + 0.1 * H && v <= vArm)
        .map(([, w]) => w)
        .sort((x, y) => x - y);
      const med = band.length ? band[Math.floor(band.length / 2)] : 0;
      const i10 = girth.findIndex((w, i) => levels[i] >= mlo && w >= 0.85 * med);
      if (i10 > 0) for (let i = 0; i < i10; i++) girth[i] = girth[i10];
    }
    // Fill and smooth.
    for (let i = 1; i < girth.length; i++) if (girth[i] <= 0) girth[i] = girth[i - 1];
    for (let i = girth.length - 2; i >= 0; i--) if (girth[i] <= 0) girth[i] = girth[i + 1];
    const sm = girth.map((_, i) => {
      let s = 0;
      let n = 0;
      for (let k = -3; k <= 3; k++) {
        const j = i + k;
        if (j < 0 || j >= girth.length) continue;
        s += girth[j];
        n++;
      }
      return s / n;
    });
    const iArm = Math.max(
      0,
      levels.findIndex((v) => v >= vArm),
    );
    const aArm = (sm[iArm] * (1 - EPS_WRAP)) / ellPerimFactor;
    levels.forEach((v, i) => {
      let a = (sm[i] * (1 - EPS_WRAP)) / ellPerimFactor;
      let b = a / ASPECT;
      if (v > vArm) {
        // Above the armhole the paper is not forced onto a dome (a doubly curved surface crumples
        // paper): the cylinder goes on, the shoulder seams tilt the panels in like a roof.
        a = aArm;
        b = aArm / ASPECT;
      }
      torso.push({ y: v, a, b, tab: arcTable(a, b) });
    });
    proxyReport.push({
      group: 'BODY',
      kind: 'torso',
      profile: torso.map((L) => [L.y - vLo, L.a, L.b]),
    });

    // The torso proxy.
    // Neck: a short cylinder on top of the dome keeps the shoulders' paper from folding inward.
    const rNeck = Math.max(45, 0.42 * aArm);
    const tProxy: Proxy = {
      push(p, i) {
        const y = p[3 * i + 1];
        if (y > vSh - 40 && y < vSh + 220) {
          const x = p[3 * i];
          const z = p[3 * i + 2];
          const d = Math.hypot(x, z);
          const R = rNeck + CLEAR - 1;
          if (d < R && d > 1e-6) {
            p[3 * i] = (x / d) * R;
            p[3 * i + 2] = (z / d) * R;
          }
        }
        if (y < torso[0].y || y > vArm + 0.35 * (vSh - vArm)) return;
        const L = torsoAt(y)!;
        const a = L.a * PROXY_K;
        const b = L.b * PROXY_K;
        const x = p[3 * i];
        const z = p[3 * i + 2];
        const q = (x / a) ** 2 + (z / b) ** 2;
        if (q >= 1 || q < 1e-9) return;
        const f = 1 / Math.sqrt(q);
        p[3 * i] = x * f;
        p[3 * i + 2] = z * f;
      },
      pull(p, i, k) {
        const y = p[3 * i + 1];
        if (y < torso[0].y || y > vArm) return;
        const L = torsoAt(y)!;
        const a = L.a + CLEAR;
        const b = L.b + CLEAR;
        const x = p[3 * i];
        const z = p[3 * i + 2];
        const q = (x / a) ** 2 + (z / b) ** 2;
        if (q <= 1) return;
        const f = 1 / Math.sqrt(q);
        p[3 * i] += (x * f - x) * k;
        p[3 * i + 2] += (z * f - z) * k;
      },
    };
    const tIdx = proxies.push(tProxy) - 1;

    // Wrap: main strip centred on its root at the back; other components where their seams want.
    const totalW = (v: number) => (torsoAt(Math.min(v, vArm))!.a * ellPerimFactor) / (1 - EPS_WRAP);
    const rootP = panelByKey.get(bodyChart.components[0].root)!;
    let uRef = 0;
    {
      let x0 = Infinity;
      let x1 = -Infinity;
      for (let r = 0; r < rootP.nb; r++) {
        const x = cuv[2 * (rootP.offset + r)];
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
      }
      uRef = (x0 + x1) / 2;
    }
    const thetaBack = rootP.role === 'front' ? 0 : Math.PI;
    if (!body.some((P) => P.role === 'back' || P.role === 'front'))
      warnings.push(
        'front unknown — no piece is named front or back; the biggest piece is put at the back',
      );
    const wrapComp = (list: Panel[], theta0: number, uC: number, layer: number) => {
      for (const P of list) {
        // Above the armhole each piece keeps its own width (arc length) around its centre: the dome
        // is smaller than the strip there, the armholes absorb the difference, the paper does not.
        let ux0 = Infinity;
        let ux1 = -Infinity;
        for (let r = 0; r < P.nb; r++) {
          ux0 = Math.min(ux0, cuv[2 * (P.offset + r)]);
          ux1 = Math.max(ux1, cuv[2 * (P.offset + r)]);
        }
        const uP = (ux0 + ux1) / 2;
        const thP = theta0 + (TAU * (uP - uC)) / totalW(vArm);
        for (let i = 0; i < P.count; i++) {
          const v = P.offset + i;
          const u = cuv[2 * v];
          const y = cuv[2 * v + 1];
          const yy = Math.max(torso[0].y, Math.min(y, vSh + 200));
          let th: number;
          if (y <= vArm) th = theta0 + (TAU * (u - uC)) / totalW(y);
          else {
            const per = torsoAt(yy)!.tab[torsoAt(yy)!.tab.length - 1];
            th = thP + (TAU * (u - uP) * (1 - EPS_WRAP)) / per;
          }
          setPos(v, torsoPoint(th, yy, CLEAR + layer + (P.role === 'placket' ? 2 : 0)));
          if (y > vSh + 10) pos[3 * v + 1] = y; // above the shoulder line: keep the height
          proxyOf[v] = tIdx;
          placed[v] = 1;
        }
      }
    };
    wrapComp(main, thetaBack, uRef, 0);
    // Later components. Girth pieces (a front chain the side seam does not join) continue the main
    // strip at the end their hand says; the rest (a yoke) go where their seams want them, on the side
    // their role says (back / front).
    const [mlo2, mhi2] = vRange(main);
    const mainU = (() => {
      const e = extent(crossings(main, mlo2 + 0.45 * (Math.min(vArm, mhi2) - mlo2)));
      return e ?? [uRef - 100, uRef + 100];
    })();
    const vMid = mlo2 + 0.45 * (Math.min(vArm, mhi2) - mlo2);
    const thMain = (u: number) => thetaBack + (TAU * (u - uRef)) / totalW(vMid);
    let endL = Math.min(thMain(mainU[0]), thMain(mainU[1]));
    let endR = Math.max(thMain(mainU[0]), thMain(mainU[1]));
    let flip = 0;
    for (let ci = 1; ci < comps.length; ci++) {
      const list = comps[ci];
      if (!list.every((P) => aligned.has(P.key))) continue;
      let x0 = Infinity;
      let x1 = -Infinity;
      for (const P of list)
        for (let r = 0; r < P.nb; r++) {
          x0 = Math.min(x0, cuv[2 * (P.offset + r)]);
          x1 = Math.max(x1, cuv[2 * (P.offset + r)]);
        }
      const uC = (x0 + x1) / 2;
      const [clo, chi] = vRange(list);
      const below = Math.max(0, Math.min(chi, vArm) - Math.max(clo, mlo2));
      const W = totalW(vMid);
      if (below > 0.4 * (chi - clo)) {
        let hand = 0;
        for (const P of list) hand += P.geom.hand === 'L' ? 1 : P.geom.hand === 'R' ? -1 : 0;
        const goLeft = hand > 0 || (hand === 0 && flip++ % 2 === 1);
        const gap = (TAU * 15) / W;
        const span = (TAU * (x1 - x0)) / W;
        // Face-up at the back: +u runs toward the doll's right (θ grows), so a left chain ends at endL.
        if (goLeft) {
          wrapComp(list, endL - gap - span / 2, uC, 0);
          endL -= gap + span;
          ringEnds.left = list;
        } else {
          wrapComp(list, endR + gap + span / 2, uC, 0);
          endR += gap + span;
          ringEnds.right = list;
        }
        continue;
      }
      const keys = new Set(list.map((P) => P.key));
      const links = G.seams.filter((s) => keys.has(pk(s.a[0])) !== keys.has(pk(s.b[0])));
      const roleBack = list.some((P) => P.role === 'back' || P.role === 'yoke');
      const roleFront = list.some((P) => P.role === 'front' || P.role === 'placket');
      const centre = roleBack ? thetaBack : roleFront ? thetaBack + Math.PI : null;
      // The component may be drawn the other way round from the main strip: try it mirrored too.
      const remirror = () => {
        for (const P of list) {
          P.mirrored = !P.mirrored;
          for (let i = 0; i < P.count; i++)
            cuv[2 * (P.offset + i)] = 2 * uC - cuv[2 * (P.offset + i)];
        }
      };
      let best = centre ?? 0;
      let bestMir = false;
      let bd = Infinity;
      const trials = [false, true];
      for (const mir of trials) {
        if (mir) remirror();
        for (let k = 0; k < (centre === null ? 24 : 1); k++) {
          void 0;
          // A back / yoke piece sits at the centre back, a front piece at the centre front: its
          // seams then say whether it is sewn the right way round (crossing seams are reported).
          const th = centre === null ? (TAU * k) / 24 : centre;
          wrapComp(list, th, uC, 3);
          let d = 0;
          for (const s of links) {
            const A = pathOf(s.a);
            const B = pathOf(s.b);
            if (!A || !B) continue;
            const same =
              (panelByKey.get(pk(s.a[0]))?.mirrored ?? false) !==
              (panelByKey.get(pk(s.b[0]))?.mirrored ?? false);
            d += meanDist(A, B, same, [0, 1], [0, 1]);
          }
          if (d < bd - 1e-6) [best, bestMir, bd] = [th, mir, d];
        }
      }
      if (trials.length === 2 && !bestMir) remirror();
      wrapComp(list, best, uC, 3);
      if (opt.debug) {
        const vs = list.flatMap((P) => Array.from({ length: P.count }, (_, i) => P.offset + i));
        const c = [0, 1, 2].map((q) => vs.reduce((t, v) => t + pos[3 * v + q], 0) / vs.length);
        warnings.push(
          `debug: secondary ${list.map((P) => P.key).join('+')} at θ ${((best * 180) / Math.PI).toFixed(0)}° centroid ${c.map((x) => x.toFixed(0)).join(',')} chart v ${clo.toFixed(0)}..${chi.toFixed(0)}`,
        );
      }
    }
    for (const P of body) {
      if (placed[P.offset]) continue;
      warnings.push(`${P.key} is in the body group but not sewn to it — placed apart`);
      P.group = 'FLOAT';
      for (let i = 0; i < P.count; i++) groupOfV[P.offset + i] = 'FLOAT';
    }
  }

  // Legs: two tubes under the hip, inseam inward.
  const legInfo: { gid: DollGroupId; s: number; x: number; R: number }[] = [];
  for (const gid of ['LEG_L', 'LEG_R'] as DollGroupId[]) {
    const list = groups.get(gid);
    const ch = charts.get(gid);
    if (!list || !ch) continue;
    const s = gid === 'LEG_L' ? 1 : -1;
    const main = ch.components[0].keys.map((k) => panelByKey.get(k)!);
    const [lo, hi] = vRange(main);
    const H = hi - lo;
    const vCr = hi - 0.27 * H;
    const W = widthTable(main, lo, hi, 300);
    const Rcr = (W(vCr - 40) * (1 - EPS_WRAP)) / TAU;
    const xAxis = s * (Rcr + 12);
    // Inseam: the chart seam between the first two pieces.
    let uRef = 0;
    const used = [...ch.used][0];
    const us = used ? G.seams.find((x) => `${x.seam.a}~${x.seam.b}` === used) : undefined;
    const up = us ? pathOf(us.a) : null;
    const eEnds = extent(crossings(main, vCr - 40));
    let endsInside = false;
    if (up) uRef = [...up.v].reduce((t, v) => t + cuv[2 * v], 0) / up.v.length;
    else uRef = eEnds ? eEnds[0] : 0;
    // The inseam is the side the rise seams (left leg ↔ right leg) start from: when they sit at the
    // strip's ends rather than at the chart seam, the strip's ends meet on the inside.
    {
      const keys = new Set(main.map((P) => P.key));
      const riseU: number[] = [];
      for (const sm of G.seams) {
        const ga = panelByKey.get(pk(sm.a[0]))?.group;
        const gb = panelByKey.get(pk(sm.b[0]))?.group;
        if (!((ga === 'LEG_L' && gb === 'LEG_R') || (ga === 'LEG_R' && gb === 'LEG_L'))) continue;
        for (const side of [sm.a, sm.b])
          if (keys.has(pk(side[0]))) {
            const P0 = pathOf(side);
            if (P0) {
              // The rise's crotch end (its lowest point) is where the inseam starts.
              let low = P0.v[0];
              for (const v of P0.v) if (cuv[2 * v + 1] < cuv[2 * low + 1]) low = v;
              riseU.push(cuv[2 * low]);
            }
          }
      }
      if (riseU.length && eEnds) {
        let vote = 0;
        for (const ru of riseU)
          vote +=
            Math.min(Math.abs(ru - eEnds[0]), Math.abs(ru - eEnds[1])) < Math.abs(ru - uRef)
              ? 1
              : -1;
        if (vote > 0) {
          uRef = eEnds[0];
          endsInside = true;
        }
      }
      if (opt.debug)
        warnings.push(
          `debug: ${gid} inseam uRef ${uRef.toFixed(0)} ends ${eEnds?.map((x) => x.toFixed(0)).join('..')} rise u ${riseU.map((x) => x.toFixed(0)).join(',')} chart seam ${used ?? '-'}`,
        );
    }
    // Pelvis: above the crotch both legs wrap ONE elliptic body (the rise seams meet at x = 0 front
    // and back); below it each leg is its own capsule.
    const pelvis = (y: number) => {
      const half = (W(Math.min(y + lo, hi)) * (1 - EPS_WRAP)) / 2; // this leg's arc = half the pelvis
      // Half-perimeter of an ellipse a = 1.25 b ≈ π/2 (3(a+b) − √((3a+b)(a+3b))).
      const k = (Math.PI / 2) * (3 * 2.25 - Math.sqrt((3 * 1.25 + 1) * (1.25 + 3)));
      const b = (2 * half) / (2 * k);
      return { a: 1.25 * b, b };
    };
    const legProxy: Proxy = {
      push(p, i) {
        const y = p[3 * i + 1] - lo;
        if (y > vCr - lo + 30 && y <= H + 10) {
          // Own half of the pelvis: never past the mid-plane, never inside the ellipse.
          if (p[3 * i] * s < 0) p[3 * i] = 0;
          const { a, b } = pelvis(y);
          const x = p[3 * i];
          const z = p[3 * i + 2];
          const q = (x / (a * 0.8)) ** 2 + (z / (b * 0.8)) ** 2; // darts take in the waist: a looser guide
          if (q >= 1 || q < 1e-9) return;
          const f = 1 / Math.sqrt(q);
          p[3 * i] = x * f;
          p[3 * i + 2] = z * f;
          return;
        }
        const dx = p[3 * i] - xAxis;
        const dz = p[3 * i + 2];
        const d = Math.hypot(dx, dz);
        const R = (y < vCr - lo ? (W(y + lo) * (1 - EPS_WRAP)) / TAU : Rcr) * PROXY_K;
        if (y > H + 10 || d >= R || d < 1e-9) return;
        p[3 * i] = xAxis + (dx / d) * R;
        p[3 * i + 2] = (dz / d) * R;
      },
      pull(p, i, k) {
        const y = p[3 * i + 1] - lo;
        if (y > vCr - lo) return;
        const dx = p[3 * i] - xAxis;
        const dz = p[3 * i + 2];
        const d = Math.hypot(dx, dz);
        const R = (W(y + lo) * (1 - EPS_WRAP)) / TAU + CLEAR;
        if (d <= R) return;
        p[3 * i] -= (dx / d) * (d - R) * k;
        p[3 * i + 2] -= (dz / d) * (d - R) * k;
      },
    };
    const pi = proxies.push(legProxy) - 1;
    proxyReport.push({
      group: gid,
      kind: 'capsule',
      profile: [[0, Rcr, Rcr]],
      origin: [xAxis, 0, 0],
      axis: [0, 1, 0],
    });
    const extCache = new Map<number, [number, number] | null>();
    const extAt = (y: number) => {
      const k = Math.round(Math.max(lo + 2, Math.min(hi - 2, y)) / 5);
      if (!extCache.has(k))
        extCache.set(k, extent(crossings(main, k * 5)) as [number, number] | null);
      return extCache.get(k) ?? null;
    };
    for (const P of list) {
      const inMain = main.includes(P);
      for (let i = 0; i < P.count; i++) {
        const v = P.offset + i;
        const u = cuv[2 * v];
        const y = cuv[2 * v + 1];
        const Wv = W(y);
        const R = (Wv * (1 - EPS_WRAP)) / TAU + CLEAR + (inMain ? 0 : 3);
        // When the strip's ends meet on the inside, each height wraps its own extent end to end
        // (the rise runs beyond the crotch-level ends).
        const ext = endsInside && inMain ? extAt(y) : null;
        const th = ext
          ? (TAU * (u - ext[0])) / Math.max(1, ext[1] - ext[0])
          : (TAU * (u - uRef)) / Wv;
        const leg: Vec3 = [xAxis - s * R * Math.cos(th), y - lo, s * R * Math.sin(th)];
        // Above the crotch: the leg's arc becomes this side's half of the pelvis — the inseam end
        // splits into the front rise (x = 0, z > 0) and the back rise; blended over 60 mm.
        const yy = y - lo;
        const t = Math.max(0, Math.min(1, (yy - (vCr - lo)) / 60));
        if (t > 0) {
          const { a, b } = pelvis(yy);
          const thn = ((th % TAU) + TAU) % TAU;
          const phi = Math.PI / 2 - thn / 2;
          const pel: Vec3 = [s * a * Math.cos(phi), yy, s * b * Math.sin(phi)];
          setPos(v, [leg[0] + (pel[0] - leg[0]) * t, yy, leg[2] + (pel[2] - leg[2]) * t]);
        } else setPos(v, leg);
        proxyOf[v] = pi;
        placed[v] = 1;
      }
    }
    legInfo.push({ gid, s, x: xAxis, R: Rcr });
    vLo = 0;
  }
  if (opt.debug && legInfo.length === 2)
    for (const sm of G.seams) {
      const ga = panelByKey.get(pk(sm.a[0]))?.group;
      const gb = panelByKey.get(pk(sm.b[0]))?.group;
      if (!((ga === 'LEG_L' && gb === 'LEG_R') || (ga === 'LEG_R' && gb === 'LEG_L'))) continue;
      const c = (ids: EdgeId[]) => {
        const P0 = pathOf(ids);
        if (!P0) return '-';
        const q = [0, 1, 2].map(
          (k) => [...P0.v].reduce((t, v) => t + pos[3 * v + k], 0) / P0.v.length,
        );
        return q.map((x) => x.toFixed(0)).join(',');
      };
      warnings.push(`debug: rise ${sm.seam.a}~${sm.seam.b} placed at ${c(sm.a)} / ${c(sm.b)}`);
    }

  // ── constraints (distances) ─────────────────────────────────────────────────────────────
  const di: number[] = [];
  const dj: number[] = [];
  const dr: number[] = [];
  const dk: number[] = [];
  const bi: number[] = [];
  const bj: number[] = [];
  const br: number[] = [];
  const bk: number[] = [];
  const built = new Set<number>();
  const li: number[] = [];
  const lj: number[] = [];
  const lr: number[] = [];
  const buildPanel = (P: Panel) => {
    if (built.has(P.idx)) return;
    built.add(P.idx);
    const T = P.mesh.tris;
    const edgeOpp = new Map<number, number>();
    const seen = new Set<number>();
    const key = (a: number, b: number) => (a < b ? a * 1e6 + b : b * 1e6 + a);
    const addD = (a: number, b: number) => {
      const k = key(a, b);
      if (seen.has(k)) return;
      seen.add(k);
      const A = P.offset + a;
      const B = P.offset + b;
      di.push(A);
      dj.push(B);
      dr.push(Math.hypot(uv[2 * B] - uv[2 * A], uv[2 * B + 1] - uv[2 * A + 1]));
      dk.push(1);
    };
    for (let t = 0; t < T.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = T[t + e];
        const b = T[t + ((e + 1) % 3)];
        const c = T[t + ((e + 2) % 3)];
        addD(a, b);
        const k = key(a, b);
        const o = edgeOpp.get(k);
        if (o === undefined) edgeOpp.set(k, c);
        else {
          const A = P.offset + o;
          const B = P.offset + c;
          bi.push(A);
          bj.push(B);
          br.push(Math.hypot(uv[2 * B] - uv[2 * A], uv[2 * B + 1] - uv[2 * A + 1]));
          bk.push(0.03);
        }
      }
    }
    for (let r = 0; r < P.nb; r++) addD(r, (r + 1) % P.nb);
    // Long-range limits: each other vertex to the vertex ~4 h away in three directions, when the
    // straight line between them stays inside the piece.
    const cell = h;
    const grid = new Map<string, number[]>();
    for (let i = 0; i < P.count; i++) {
      const k = `${Math.floor(P.mesh.pts[i][0] / cell)},${Math.floor(P.mesh.pts[i][1] / cell)}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k)!.push(i);
    }
    const ring = P.mesh.pts.slice(0, P.nb);
    const near = (x: number, y: number) => {
      let best = -1;
      let bd = (0.7 * h) ** 2;
      const gx = Math.floor(x / cell);
      const gy = Math.floor(y / cell);
      for (let a = gx - 1; a <= gx + 1; a++)
        for (let b = gy - 1; b <= gy + 1; b++)
          for (const j of grid.get(`${a},${b}`) ?? []) {
            const d = (P.mesh.pts[j][0] - x) ** 2 + (P.mesh.pts[j][1] - y) ** 2;
            if (d < bd) [best, bd] = [j, d];
          }
      return best;
    };
    for (let i = 0; i < P.count; i += 2) {
      const [x, y] = P.mesh.pts[i];
      for (const deg of [0, 60, 120]) {
        const r = (deg * Math.PI) / 180;
        const D = 5 * h;
        const j = near(x + D * Math.cos(r), y + D * Math.sin(r));
        if (j < 0 || j === i) continue;
        const ok = [0.25, 0.5, 0.75].every((t) =>
          pointInPolygon([x + (P.mesh.pts[j][0] - x) * t, y + (P.mesh.pts[j][1] - y) * t], ring),
        );
        if (!ok) continue;
        li.push(P.offset + i);
        lj.push(P.offset + j);
        lr.push(Math.hypot(P.mesh.pts[j][0] - x, P.mesh.pts[j][1] - y));
      }
    }
  };

  let state: SolverState | null = null;
  const contacts: NonNullable<SolverState['contacts']> = [];
  const ties: Tie[] = [];
  const anchor = new Float64Array(3 * N);
  const anchorK = new Float32Array(N);
  const moving = new Uint8Array(N);
  const makeState = () => {
    const nS = di.length;
    state = {
      pos,
      di: Int32Array.from([...di, ...bi]),
      dj: Int32Array.from([...dj, ...bj]),
      rest: Float64Array.from([...dr, ...br]),
      dk: Float64Array.from([...dk, ...bk]),
      nStretch: nS,
      omega: 1.0,
      li: Int32Array.from(li),
      lj: Int32Array.from(lj),
      lrest: Float64Array.from(lr),
      seams: works.map((w) => w.solver),
      proxyOf,
      proxies,
      moving,
      pullK: 0,
      anchor,
      anchorK,
      contacts,
      ...(ties.length ? { ties } : {}),
    };
    return state;
  };

  let passes = 0;
  const maxPasses = opt.maxPasses ?? 1800;
  // The settle loop may run past maxPasses (up to settlePasses more).
  let passCap = maxPasses;
  const run = (n: number) => {
    const S = makeState();
    for (let k = 0; k < n && passes < passCap; k++) {
      for (const w of works) {
        if (w.released || w.virtual) {
          w.solver.active = false;
          continue;
        }
        const r = Math.min(1, (passes - w.born + 1) / Math.max(1, w.ramp));
        w.solver.k = w.target * (0.05 + 0.95 * r);
      }
      pass(S, 1);
      passes++;
      if (opt.onFrame && passes % 20 === 0) opt.onFrame(Float32Array.from(pos), passes);
    }
  };

  // ── release seams that could only close by tearing the paper ────────────────────────────
  const seamStretch = (w: Work, st: Float64Array, S0: SolverState) => {
    const nbr = new Map<number, number[]>();
    // The seam's own run, without its last 12 % at each end (corners belong to the next seam).
    const inner = (P: Path) =>
      [...P.v].filter((_, k) => P.len <= 0 || (P.s[k] >= 0.12 * P.len && P.s[k] <= 0.88 * P.len));
    const vs = new Set<number>([...inner(w.A), ...inner(w.B)]);
    for (let c = 0; c < S0.nStretch; c++) {
      for (const x of [S0.di[c], S0.dj[c]]) {
        if (!vs.has(x)) continue;
        if (!nbr.has(x)) nbr.set(x, []);
        nbr.get(x)!.push(c);
      }
    }
    const vals: number[] = [];
    for (const list of nbr.values()) for (const c of list) vals.push(st[c]);
    vals.sort((x, y) => x - y);
    return vals.length ? vals[Math.floor(0.9 * (vals.length - 1))] : 0;
  };
  const measure = (w: Work) => {
    const g = rowGaps(pos, w.rows);
    const mean = g.reduce((x, y) => x + y, 0) / Math.max(1, g.length);
    const max = g.length ? Math.max(...g) : 0;
    const srt = [...g].sort((x, y) => x - y);
    const p95 = srt.length ? srt[Math.floor(0.95 * (srt.length - 1))] : 0;
    return {
      mean: Math.max(0, mean - w.solver.gap),
      max: Math.max(0, max - w.solver.gap),
      p95: Math.max(0, p95 - w.solver.gap),
    };
  };
  const releaseRounds = (rounds: number, settle: number, gapMax: number, strainMax: number) => {
    for (let round = 0; round < rounds; round++) {
      const S0 = makeState();
      const st = strains(S0);
      let worst: Work | null = null;
      let ws = 0;
      let worstSp = 0;
      for (const w of works) {
        if (w.released || w.origin !== 'graph' || w.closure || !w.solver.active || w.confirmed)
          continue;
        if (!w.A.v.every((v) => moving[v]) && !w.B.v.every((v) => moving[v])) continue;
        const m = measure(w);
        // Strain beyond the seam's own ease (paper cannot gather a sleeve cap or a pleat).
        const ease =
          w.aRange[1] - w.aRange[0] < 0.999 || w.bRange[1] - w.bRange[0] < 0.999
            ? 0
            : 1 - Math.min(w.A.len, w.B.len) / Math.max(w.A.len, w.B.len, 1e-9);
        const sp = Math.max(0, seamStretch(w, st, S0) * 100 - ease * 100);
        if (m.max < gapMax && sp < strainMax) continue;
        const score = m.mean + 3 * sp;
        if (score > ws) [worst, ws, worstSp] = [w, score, sp];
      }
      if (!worst || passes >= passCap) break;
      const m = measure(worst);
      worst.released = true;
      worst.note = `would close only by tearing the paper (gap ${m.max.toFixed(0)} mm, strain ${worstSp.toFixed(0)} %) — released so the rest can settle; a wrong pairing?`;
      run(Math.min(settle, passCap - passes));
    }
  };

  // ── phase 1: body (+ legs) with its own seams and the CF closure ────────────────────────
  const bodyLike = new Set<DollGroupId>(['BODY', 'LEG_L', 'LEG_R']);
  const inGroups = (ids: EdgeId[], set: Set<DollGroupId>) =>
    ids.every((id) => {
      const P = panelByKey.get(pk(id));
      return !!P && set.has(P.group);
    });
  const edgeUsed = (id: EdgeId) =>
    works.some((w) => !w.released && (w.a.includes(id) || w.b.includes(id)));
  const graphWork = (s: GroupedSeam, born: number, closure = false) => {
    const conf = isConf(s.seam);
    const A = conf ? sidePath(s, 'a') : pathOf(s.a);
    const B = conf ? sidePath(s, 'b') : pathOf(s.b);
    if (!A || !B) return null;
    const lenA = A.len;
    const lenB = B.len;
    // A stored partial carries its sewn stretch (mm along each run): no guessing the aligned end.
    const rg = conf && s.seam.range && s.a.length === 1 && s.b.length === 1 ? s.seam.range : null;
    const ranges = rg
      ? {
          aR: [rg.a[0] / Math.max(1e-9, lenA), rg.a[1] / Math.max(1e-9, lenA)].map((x) =>
            Math.max(0, Math.min(1, x)),
          ) as [number, number],
          bR: [rg.b[0] / Math.max(1e-9, lenB), rg.b[1] / Math.max(1e-9, lenB)].map((x) =>
            Math.max(0, Math.min(1, x)),
          ) as [number, number],
        }
      : undefined;
    const multi = conf && (s.a.length > 1 || s.b.length > 1);
    const w0 = addWork(
      {
        id: `${s.seam.a}~${s.seam.b}`,
        a: s.a,
        b: s.b,
        kind: s.seam.kind,
        origin: 'graph',
        A,
        B,
        target: closure ? 0.5 : 1,
        note: closure
          ? suspectNote.get(`${s.seam.a}~${s.seam.b}`) ??
            'closure (buttons / zip) — drawn closed with a small gap'
          : orderNote.get(`${s.seam.a}~${s.seam.b}`) ?? '',
        fromOrder: orderNote.has(`${s.seam.a}~${s.seam.b}`),
        closure,
        // A confirmed seam is sewn as stored (whole, or its stored stretch) — never re-guessed.
        partial: conf
          ? false
          : s.seam.kind === 'partial' || Math.min(lenA, lenB) / Math.max(lenA, lenB) < 0.9,
        gap: closure ? 4 : 0,
        // A composite side spans pieces laid either way round: its direction by the smaller gap.
        forceSame: multi
          ? undefined
          : (panelByKey.get(pk(s.a[0]))?.mirrored ?? false) !==
            (panelByKey.get(pk(s.b[0]))?.mirrored ?? false),
        ...(ranges ? { ranges } : {}),
      },
      born,
      closure
        ? 60
        : charts.get(panelByKey.get(pk(s.a[0]))!.group)?.used.has(`${s.seam.a}~${s.seam.b}`)
          ? 40
          : 380,
    );
    if (conf) w0.confirmed = true;
    if (conf && multi && opt.debug)
      for (const [side, P] of [
        ['A', A],
        ['B', B],
      ] as const) {
        const jumps: string[] = [];
        for (let k = 1; k < P.v.length; k++)
          if (panelOf[P.v[k]] !== panelOf[P.v[k - 1]]) {
            const a = P.v[k - 1];
            const b = P.v[k];
            jumps.push(
              `${panels[panelOf[a]].key}→${panels[panelOf[b]].key} ${Math.hypot(pos[3 * a] - pos[3 * b], pos[3 * a + 1] - pos[3 * b + 1], pos[3 * a + 2] - pos[3 * b + 2]).toFixed(0)} mm`,
            );
          }
        warnings.push(
          `debug: ${w0.id} side ${side} ${P.len.toFixed(0)} mm, part joins at placement: ${jumps.join(' · ') || '—'}`,
        );
      }
    if (conf && multi && opt.debug) {
      const md = (same: boolean) => meanDist(A, B, same, [0, 1], [0, 1]).toFixed(0);
      // where the A-side part joins land on B (arc mm), under the chosen direction
      const lands: string[] = [];
      for (let k = 1; k < A.v.length; k++)
        if (panelOf[A.v[k]] !== panelOf[A.v[k - 1]]) {
          const t = A.s[k] / A.len;
          lands.push(
            `${panels[panelOf[A.v[k - 1]]].key}|${panels[panelOf[A.v[k]]].key} at ${(t * A.len).toFixed(0)} → B ${((w0.same ? t : 1 - t) * B.len).toFixed(0)}`,
          );
        }
      const low = (P: Path) => {
        let b = 0;
        for (let k = 0; k < P.v.length; k++) if (pos[3 * P.v[k] + 1] < pos[3 * P.v[b] + 1]) b = k;
        return P.s[b];
      };
      const la = low(A) / A.len;
      lands.push(
        `lowest A ${low(A).toFixed(0)} → B ${((w0.same ? la : 1 - la) * B.len).toFixed(0)} vs lowest B ${low(B).toFixed(0)}`,
      );
      warnings.push(
        `debug: ${w0.id} same=${w0.same} meanDist same ${md(true)} / opp ${md(false)} mm · ${lands.join(' · ')}`,
      );
    }
    return w0;
  };
  // ── L4 front closure: the two centre-front lines on top of each other (buttoned) ──────────
  const DEFAULT_CF_MM = 15;
  const segDist = (p: [number, number], a: [number, number], b: [number, number]) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  const edgePts = (ids: EdgeId[]) =>
    ids.flatMap((id) => edgeIdsOf(id)).flatMap((id) => edgeById.get(id)?.pts ?? []);
  const distToEdge = (q: [number, number], pts: [number, number][]) => {
    let d = Infinity;
    for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(q, pts[i - 1], pts[i]));
    return d;
  };
  /** The button line of a closure side: the nearest column of drill / buttonhole marks, mm in. */
  const buttonLine = (P: Panel, ids: EdgeId[]): number | null => {
    const pts = edgePts(ids);
    if (pts.length < 2) return null;
    const ds: number[] = [];
    for (const m of P.geom.marks ?? []) {
      if (m.kind !== 'drill' && m.kind !== 'buttonhole') continue;
      const d = distToEdge([m.bbox.cx, m.bbox.cy], pts);
      if (d <= 90 && d >= 3) ds.push(d);
    }
    if (!ds.length) return null;
    ds.sort((x, y) => x - y);
    const col = ds.filter((d) => d <= ds[0] + 6);
    return col[Math.floor(col.length / 2)];
  };
  /** Barycentric location of a pattern point in a panel's mesh (nearest triangle when outside). */
  const locate = (P: Panel, q: [number, number]) => {
    const T = P.mesh.tris;
    const X = P.mesh.pts;
    let best: { i: number[]; w: number[] } | null = null;
    let bd = Infinity;
    for (let t = 0; t < T.length; t += 3) {
      const a = X[T[t]];
      const b = X[T[t + 1]];
      const c = X[T[t + 2]];
      const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(den) < 1e-9) continue;
      const l1 = ((b[1] - c[1]) * (q[0] - c[0]) + (c[0] - b[0]) * (q[1] - c[1])) / den;
      const l2 = ((c[1] - a[1]) * (q[0] - c[0]) + (a[0] - c[0]) * (q[1] - c[1])) / den;
      const l3 = 1 - l1 - l2;
      const out = Math.max(0, -l1, -l2, -l3);
      if (out < bd) {
        bd = out;
        const cl = [Math.max(0, l1), Math.max(0, l2), Math.max(0, l3)];
        const sum = cl[0] + cl[1] + cl[2] || 1;
        best = {
          i: [P.offset + T[t], P.offset + T[t + 1], P.offset + T[t + 2]],
          w: cl.map((x) => x / sum),
        };
        if (out === 0) break;
      }
    }
    return best;
  };
  /** Point and inward normal (pattern) at arc s of a one-panel path. */
  const atArc = (A: Path, s0: number) => {
    const sArc = Math.max(0, Math.min(A.len, s0));
    let k = 1;
    while (k < A.v.length - 1 && A.s[k] < sArc) k++;
    const a = A.v[k - 1];
    const b = A.v[k];
    const t = A.s[k] > A.s[k - 1] ? (sArc - A.s[k - 1]) / (A.s[k] - A.s[k - 1]) : 0;
    const x = uv[2 * a] + (uv[2 * b] - uv[2 * a]) * t;
    const y = uv[2 * a + 1] + (uv[2 * b + 1] - uv[2 * a + 1]) * t;
    let dx = uv[2 * b] - uv[2 * a];
    let dy = uv[2 * b + 1] - uv[2 * a + 1];
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl;
    dy /= dl;
    // The contour runs CCW: the inside is on the left of the walk.
    return { p: [x, y] as [number, number], n: [-dy, dx] as [number, number] };
  };
  const overlapClosure = (s: GroupedSeam, w: Work) => {
    const PA = panelByKey.get(pk(s.a[0]));
    const PB = panelByKey.get(pk(s.b[0]));
    if (!PA || !PB || PA === PB || w.A.v.length < 2 || w.B.v.length < 2) return;
    if (new Set(s.a.map(pk)).size > 1 || new Set(s.b.map(pk)).size > 1) return;
    const meanX = (P: Panel) => {
      let t = 0;
      for (let i = 0; i < P.count; i++) t += pos[3 * (P.offset + i)];
      return t / Math.max(1, P.count);
    };
    // Men: the wearer's left front (the doll's left, +x) on top; women: the right.
    const women = opt.gender === 'FEMALE';
    const aTop = women ? meanX(PA) < meanX(PB) : meanX(PA) > meanX(PB);
    const [Pt, Pu, At, Au, idsT, idsU] = aTop
      ? [PA, PB, w.A, w.B, s.a, s.b]
      : [PB, PA, w.B, w.A, s.b, s.a];
    const mT = buttonLine(Pt, idsT);
    const mU = buttonLine(Pu, idsU);
    const offT = mT ?? mU ?? DEFAULT_CF_MM;
    const offU = mU ?? mT ?? DEFAULT_CF_MM;
    const how =
      mT !== null && mU !== null
        ? 'both sides by their button / buttonhole marks'
        : mT !== null || mU !== null
          ? `by the marks of ${mT !== null ? Pt.key : Pu.key} (the other side has none)`
          : `no marks — ${DEFAULT_CF_MM} mm assumed each side`;
    // Ends meet ends: the pairing whose ends lie nearer now.
    const d3 = (a: number, b: number) =>
      Math.hypot(
        pos[3 * a] - pos[3 * b],
        pos[3 * a + 1] - pos[3 * b + 1],
        pos[3 * a + 2] - pos[3 * b + 2],
      );
    const t0 = At.v[0];
    const t1 = At.v[At.v.length - 1];
    const u0 = Au.v[0];
    const u1 = Au.v[Au.v.length - 1];
    const same = d3(t0, u0) + d3(t1, u1) <= d3(t0, u1) + d3(t1, u0);
    const N = 24;
    const ia: number[] = [];
    const wa: number[] = [];
    const ib: number[] = [];
    const wb: number[] = [];
    for (let k = 0; k < N; k++) {
      const f = 0.03 + (0.94 * k) / (N - 1);
      const qt = atArc(At, f * At.len);
      const qu = atArc(Au, (same ? f : 1 - f) * Au.len);
      const lt = locate(Pt, [qt.p[0] + qt.n[0] * offT, qt.p[1] + qt.n[1] * offT]);
      const lu = locate(Pu, [qu.p[0] + qu.n[0] * offU, qu.p[1] + qu.n[1] * offU]);
      if (!lt || !lu) continue;
      ia.push(...lt.i);
      wa.push(...lt.w);
      ib.push(...lu.i);
      wb.push(...lu.w);
    }
    if (!ia.length) return;
    ties.push({
      ia: Int32Array.from(ia),
      wa: Float64Array.from(wa),
      ib: Int32Array.from(ib),
      wb: Float64Array.from(wb),
      k: 0.5,
      lift: 2.5,
      ax: 0,
      az: 0,
      active: true,
    });
    // The top's extension lies over the under piece: one-sided contacts, pattern-paired.
    const zone = offT + offU + 6;
    const ptsT = edgePts(idsT);
    const ptsU = edgePts(idsU);
    const ci: number[] = [];
    const cj: number[] = [];
    for (let i = 0; i < Pt.count; i++) {
      const v = Pt.offset + i;
      const q: [number, number] = [uv[2 * v], uv[2 * v + 1]];
      const d = distToEdge(q, ptsT);
      if (d > zone) continue;
      // Where along the edge, and the under point at the mirrored depth.
      let bestS = 0;
      let bd = Infinity;
      for (let k = 0; k < At.v.length; k++) {
        const a = At.v[k];
        const dd = Math.hypot(uv[2 * a] - q[0], uv[2 * a + 1] - q[1]);
        if (dd < bd) [bd, bestS] = [dd, At.s[k]];
      }
      const f = bestS / Math.max(1, At.len);
      const qu = atArc(Au, (same ? f : 1 - f) * Au.len);
      const depth = Math.max(0, offT + offU - d);
      const target: [number, number] = [qu.p[0] + qu.n[0] * depth, qu.p[1] + qu.n[1] * depth];
      let j = -1;
      let bj = Infinity;
      for (let m = 0; m < Pu.count; m++) {
        const u = Pu.offset + m;
        const dd = Math.hypot(uv[2 * u] - target[0], uv[2 * u + 1] - target[1]);
        if (dd < bj) [bj, j] = [dd, u];
      }
      if (j >= 0 && bj < 2 * h && distToEdge([uv[2 * j], uv[2 * j + 1]], ptsU) <= zone) {
        ci.push(v);
        cj.push(j);
      }
    }
    if (ci.length)
      contacts.push({ i: Int32Array.from(ci), j: Int32Array.from(cj), gap: 2, ax: 0, az: 0 });
    w.virtual = true;
    w.solver.active = false;
    w.overlap = {
      id: w.id,
      top: Pt.key,
      under: Pu.key,
      offTopMm: offT,
      offUnderMm: offU,
      how: `${women ? 'right over left (women)' : 'left over right (men' + (opt.gender ? ')' : ', the default)')} · centre-front lines ${offT.toFixed(0)} / ${offU.toFixed(0)} mm in — ${how}`,
      cfGapP95Mm: NaN,
      overlapMm: NaN,
      outsidePct: NaN,
      ok: false,
    };
    (w as Work & { contactIdx?: number; tieIdx?: number }).tieIdx = ties.length - 1;
    (w as Work & { contactIdx?: number }).contactIdx = ci.length ? contacts.length - 1 : -1;
  };

  for (const P of panels) if (bodyLike.has(P.group)) buildPanel(P);
  const crossing: { s: GroupedSeam; xa: number; xb: number }[] = [];
  for (const s of G.seams) {
    if (!inGroups(s.a, bodyLike) || !inGroups(s.b, bodyLike)) continue;
    const w = graphWork(s, 0);
    if (!w || !groups.has('BODY')) continue;
    // A confirmed seam is sewn as a person said, however it lies now (an open end = contradiction).
    if (w.confirmed) continue;
    // A seam that crosses the doll from its left to its right (the back's left shoulder onto the
    // right front) cannot close without tearing paper: released, and the mirror reading proposed.
    const cx = (P: Path) => [...P.v].reduce((t, v) => t + pos[3 * v], 0) / P.v.length;
    const xa = cx(w.A);
    const xb = cx(w.B);
    const lim = 0.3 * (torsoAt(vArm)?.a ?? 150);
    if (!(Math.sign(xa) !== Math.sign(xb) && Math.abs(xa) > lim && Math.abs(xb) > lim)) continue;
    w.released = true;
    w.solver.active = false;
    const side = (x: number) => (x > 0 ? "the doll's left" : "the doll's right");
    w.note = `wrong reading (direction) — proposed mirror reading: as drawn ${s.a[0]} sits on ${side(xa)} and ${s.b[0]} on ${side(xb)}, the seam would cross the doll (a cross-back by design?) — not sewn as drawn`;
    crossing.push({ s, xa, xb });
  }
  for (const { s, xa, xb } of crossing) {
    // Mirror reading: on the side without a hand, the edge mirrored across the piece's centre.
    for (const [mine, other, xm] of [
      [s.a, s.b, xa],
      [s.b, s.a, xb],
    ] as const) {
      const P = panelByKey.get(pk(mine[0]));
      const e = mine.length === 1 ? edgeById.get(mine[0]) : undefined;
      if (!P || !e || P.geom.hand) continue;
      let gx0 = Infinity;
      let gx1 = -Infinity;
      for (const q of P.geom.rs) {
        gx0 = Math.min(gx0, q[0]);
        gx1 = Math.max(gx1, q[0]);
      }
      const c = (gx0 + gx1) / 2;
      const mid = (ed: typeof e) => ed.pts[Math.floor(ed.pts.length / 2)];
      const twin = P.geom.edges.find(
        (x) =>
          x.id !== e.id &&
          Math.abs(x.lenMm - e.lenMm) < 4 &&
          Math.abs(mid(x)[0] + mid(e)[0] - 2 * c) < 20 &&
          Math.abs(mid(x)[1] - mid(e)[1]) < 20,
      );
      if (!twin || edgeUsed(twin.id)) continue;
      const A2 = pathOf([twin.id]);
      const B2 = pathOf([...other]);
      if (!A2 || !B2) continue;
      void xm;
      addWork(
        {
          id: `${twin.id}~${other[0]}`,
          a: [twin.id],
          b: [...other],
          kind: 'proposed-composite',
          origin: 'doll-proposed',
          A: A2,
          B: B2,
          target: 1,
          note: `mirror reading of ${s.seam.a} ↔ ${s.seam.b}: ${twin.id} ↔ ${other[0]} (${twin.lenMm.toFixed(0)} ≈ ${B2.len.toFixed(0)} mm) — if the shoulders are not crossed`,
          forceSame: false,
        },
        0,
        380,
      );
      break;
    }
  }
  for (const s of G.closures)
    if (inGroups(s.a, bodyLike) && inGroups(s.b, bodyLike)) {
      const w = graphWork(s, 0, true);
      if (w && l4) overlapClosure(s, w);
    }

  const freeEdges = (P: Panel) => P.geom.edges.filter((e) => !edgeUsed(e.id));
  // Proposed closures of open strips (CF of the body, underarm of a one-piece sleeve, outseam of a leg).
  const proposeStripClosure = (
    gid: DollGroupId,
    label: string,
    kind: Work['kind'],
    born: number,
  ) => {
    const ch = charts.get(gid);
    const list = groups.get(gid);
    if (!ch || !list) return;
    const main = ch.components[0].keys.map((k) => panelByKey.get(k)!);
    if (G.closures.some((s) => list.some((P) => P.key === pk(s.a[0])))) return;
    // The ring's ends: the main strip's, or the far ends of the girth chains that continue it.
    const Llist = gid === 'BODY' && ringEnds.left ? ringEnds.left : main;
    const Rlist = gid === 'BODY' && ringEnds.right ? ringEnds.right : main;
    const endOf = (lst: Panel[], side: 0 | 1) => {
      const [lo, hi] = vRange(lst);
      const vm = lo + 0.45 * (hi - lo);
      const e = extent(crossings(lst, vm));
      return e ? endEdge(lst, e[side], vm) : null;
    };
    const endEdge = (lst: Panel[], u: number, vm: number) => {
      let best: { P: Panel; e: Edge; d: number } | null = null;
      for (const P of lst)
        for (const ed of freeEdges(P)) {
          const pl = ch.place.get(P.key)!;
          const pts = ed.pts.map((q) => toChart(pl, q));
          const dy = Math.abs(pts[pts.length - 1][1] - pts[0][1]);
          const dx = Math.abs(pts[pts.length - 1][0] - pts[0][0]);
          if (dy < 1.5 * dx || ed.lenMm < 100) continue;
          let d = Infinity;
          for (const q of pts) if (Math.abs(q[1] - vm) < 30) d = Math.min(d, Math.abs(q[0] - u));
          if (!Number.isFinite(d)) {
            const y0 = Math.min(pts[0][1], pts[pts.length - 1][1]);
            const y1 = Math.max(pts[0][1], pts[pts.length - 1][1]);
            if (vm < y0 || vm > y1) continue;
            d = Math.min(...pts.map((q) => Math.abs(q[0] - u)));
          }
          if (d < 25 && (!best || d < best.d)) best = { P, e: ed, d };
        }
      return best;
    };
    const L = endOf(Llist, 0);
    const R = endOf(Rlist, 1);
    if (!L || !R || L.e.id === R.e.id) return;
    const ratio = Math.min(L.e.lenMm, R.e.lenMm) / Math.max(L.e.lenMm, R.e.lenMm);
    if (ratio < 0.85) {
      warnings.push(
        `${label}: the strip's two ends ${L.e.id} (${L.e.lenMm.toFixed(0)} mm) and ${R.e.id} (${R.e.lenMm.toFixed(0)} mm) differ ${((1 - ratio) * 100).toFixed(0)} % — not closed`,
      );
      return;
    }
    const A = pathOf([L.e.id]);
    const B = pathOf([R.e.id]);
    if (!A || !B) return;
    addWork(
      {
        id: `${L.e.id}~${R.e.id}`,
        a: [L.e.id],
        b: [R.e.id],
        kind,
        origin: 'doll-proposed',
        A,
        B,
        target: kind === 'proposed-closure' ? 0.5 : 0.7,
        note: `${label} · ${L.e.lenMm.toFixed(0)} ≈ ${R.e.lenMm.toFixed(0)} mm · not in the pattern`,
        closure: kind === 'proposed-closure',
        partial: ratio < 0.97,
        gap: kind === 'proposed-closure' ? 4 : 0,
        // The strip's two ends run opposite ways round the contour: top meets top.
        forceSame: L.P.mirrored !== R.P.mirrored,
      },
      born,
      80,
    );
  };
  if (groups.has('BODY'))
    proposeStripClosure(
      'BODY',
      'front opening drawn closed (buttons / zip are not seams)',
      'proposed-closure',
      0,
    );
  for (const gid of ['LEG_L', 'LEG_R'] as DollGroupId[])
    if (groups.has(gid))
      proposeStripClosure(
        gid,
        'side seam of the leg proposed (closes the tube)',
        'proposed-composite',
        0,
      );

  // Free edges facing each other at placement (the yoke the pattern does not sew to the back, a
  // dropped side seam): reported OPEN and drawn red, never solved — but welded for the loops, so the
  // armholes are still found and the sleeves can be proposed onto them.
  const facingPairs = (gids: Set<DollGroupId>, maxGap: number, maxEase: number) => {
    const cand = panels
      .filter((P) => gids.has(P.group))
      .flatMap((P) =>
        freeEdges(P)
          .filter((e) => e.lenMm >= 60)
          .map((e) => ({ P, e })),
      );
    const out: {
      x: (typeof cand)[number];
      y: (typeof cand)[number];
      gap: number;
      same: boolean;
    }[] = [];
    for (let i = 0; i < cand.length; i++)
      for (let j = i + 1; j < cand.length; j++) {
        const x = cand[i];
        const y = cand[j];
        if (x.P === y.P) continue;
        if (Math.abs(x.e.lenMm - y.e.lenMm) / Math.max(x.e.lenMm, y.e.lenMm) > maxEase) continue;
        const A = pathOf([x.e.id]);
        const B = pathOf([y.e.id]);
        if (!A || !B) continue;
        const d0 = meanDist(A, B, false, [0, 1], [0, 1]);
        const d1 = meanDist(A, B, true, [0, 1], [0, 1]);
        const gap = Math.min(d0, d1);
        // Running alongside each other, not merely near (two parts of one armhole are near too).
        const g = rowGaps(pos, seamRows(A, B, d1 < d0));
        const gmax = g.length ? Math.max(...g) : Infinity;
        const gmin = g.length ? Math.min(...g) : 0;
        const len = Math.max(A.len, B.len);
        // Parallel (a slit, a gap): the gap is about even. Two arms of one opening (the front and
        // back halves of an armhole) touch at one end and part at the other.
        const even = gap < 8 || gmin >= 0.35 * gap;
        if (opt.debug && gap <= 2 * maxGap)
          warnings.push(
            `debug: facing? ${x.e.id}~${y.e.id} mean ${gap.toFixed(0)} min ${gmin.toFixed(0)} max ${gmax.toFixed(0)} len ${len.toFixed(0)}`,
          );
        if (gap <= maxGap && even && gmax <= Math.max(40, 0.25 * len))
          out.push({ x, y, gap, same: d1 < d0 });
      }
    out.sort((p, q) => p.gap - q.gap);
    const taken = new Set<string>();
    return out.filter((o) => {
      if (taken.has(o.x.e.id) || taken.has(o.y.e.id)) return false;
      taken.add(o.x.e.id);
      taken.add(o.y.e.id);
      return true;
    });
  };
  // Declared joins still without any seam between their two sides: when two free edges of those
  // pieces face each other once placed, that IS the declared seam (the order says these pieces are
  // sewn; the placement says along which edges).
  const declaredOpen = new Map<string, string>();
  {
    const linkedP = new Set<string>();
    for (const sc of graph.chosen)
      for (const a of (sc.aParts ?? [sc.a]).map(pk))
        for (const b of (sc.bParts ?? [sc.b]).map(pk)) linkedP.add(`${a}|${b}`).add(`${b}|${a}`);
    for (const J of opt.joins ?? [])
      J.parts.forEach((X, i) =>
        J.parts.forEach((Y, j) => {
          if (j <= i) return;
          if (X.some((a) => Y.some((b) => linkedP.has(`${a}|${b}`)))) return;
          for (const a of X)
            for (const b of Y) declaredOpen.set(`${a}|${b}`, J.label).set(`${b}|${a}`, J.label);
        }),
      );
  }
  for (const f of facingPairs(new Set(['BODY']), 100, 0.15)) {
    const A = pathOf([f.x.e.id])!;
    const B = pathOf([f.y.e.id])!;
    const declared = declaredOpen.get(`${pk(f.x.e.id)}|${pk(f.y.e.id)}`);
    const Px = panelByKey.get(pk(f.x.e.id));
    const Py = panelByKey.get(pk(f.y.e.id));
    // Two fronts facing each other: the front opening, never a declared seam.
    const frontPair =
      !!Px &&
      !!Py &&
      Px.role !== 'back' &&
      Py.role !== 'back' &&
      Px.geom.hand !== null &&
      Py.geom.hand !== null &&
      Px.geom.hand !== Py.geom.hand;
    if (declared && !frontPair) {
      addWork(
        {
          id: `${f.x.e.id}~${f.y.e.id}`,
          a: [f.x.e.id],
          b: [f.y.e.id],
          kind: 'proposed-composite',
          origin: 'doll-proposed',
          A,
          B,
          target: 0.8,
          note: `proposed (from the technologist's order «${declared}») · ${f.x.e.id} (${f.x.e.lenMm.toFixed(0)} mm) and ${f.y.e.id} (${f.y.e.lenMm.toFixed(0)} mm) face each other ${f.gap.toFixed(0)} mm apart once placed`,
          forceSame: f.same,
        },
        passes,
        200,
      );
      orderJoins.push({
        join: declared,
        seam: `${f.x.e.id}~${f.y.e.id}`,
        note: 'free edges facing each other once placed',
      });
      continue;
    }
    const w = addWork(
      {
        id: `${f.x.e.id}~${f.y.e.id}`,
        a: [f.x.e.id],
        b: [f.y.e.id],
        kind: 'facing-free',
        origin: 'doll-proposed',
        A,
        B,
        target: 0,
        note: `open — ${f.x.e.id} (${f.x.e.lenMm.toFixed(0)} mm) and ${f.y.e.id} (${f.y.e.lenMm.toFixed(0)} mm) face each other ${f.gap.toFixed(0)} mm apart, both free: a seam the pattern has not got (not sewn by the doll)`,
        forceSame: f.same,
      },
      passes,
      1,
    );
    w.virtual = true;
    w.solver.active = false;
  }

  for (let v = 0; v < N; v++) moving[v] = bodyLike.has(groupOfV[v]) && placed[v] ? 1 : 0;
  run(Math.min(450, maxPasses));
  releaseRounds(3, 100, 30, 15);

  // ── loops of the body after phase 1 ─────────────────────────────────────────────────────
  const activeSeams = () =>
    works
      .filter((w) => !w.released)
      .map((w) => ({ A: w.A, B: w.B, same: w.same, aRange: w.aRange, bRange: w.bRange }));
  const loopsOf = (gids: Set<DollGroupId>) => {
    const set = new Set(panels.filter((P) => gids.has(P.group)).map((P) => P.idx));
    return findLoops({ panels, panelOf, ringOf, uv, seams: activeSeams() }, set);
  };
  const centroid = (vs: number[]): Vec3 => {
    const c: Vec3 = [0, 0, 0];
    for (const v of vs) {
      c[0] += pos[3 * v];
      c[1] += pos[3 * v + 1];
      c[2] += pos[3 * v + 2];
    }
    return [c[0] / vs.length, c[1] / vs.length, c[2] / vs.length];
  };
  const bodyLoops = loopsOf(new Set(['BODY']));
  let neckLoop: RawLoop | null = null;
  let hemLoop: RawLoop | null = null;
  const armLoop: Record<'L' | 'R', RawLoop | null> = { L: null, R: null };
  const aArmNow = torso.length ? torsoAt(vArm)!.a : 200;
  {
    const big = bodyLoops.filter((l) => l.len > 150);
    const cs = big.map((l) => ({ l, c: centroid(l.verts) }));
    const byY = [...cs].sort((x, y) => x.c[1] - y.c[1]);
    if (byY.length) hemLoop = byY[0].l;
    for (const s of ['L', 'R'] as const) {
      const cand = cs.filter(
        (x) => x.l !== hemLoop && (s === 'L' ? x.c[0] > 0.45 * aArmNow : x.c[0] < -0.45 * aArmNow),
      );
      cand.sort((x, y) => y.l.len - x.l.len);
      armLoop[s] = cand[0]?.l ?? null;
    }
    const necks = cs.filter(
      (x) =>
        x.l !== hemLoop &&
        x.l !== armLoop.L &&
        x.l !== armLoop.R &&
        Math.abs(x.c[0]) < 0.45 * aArmNow,
    );
    necks.sort((x, y) => y.c[1] - x.c[1]);
    neckLoop = necks[0]?.l ?? null;
  }

  if (opt.debug) {
    warnings.push(
      `debug: vArm ${vArm.toFixed(0)} vSh ${vSh.toFixed(0)} vLo ${vLo.toFixed(0)} torso a@arm ${aArmNow.toFixed(0)}`,
    );
    for (const l of bodyLoops) {
      const c = centroid(l.verts);
      warnings.push(
        `debug: body loop ${l.len.toFixed(0)} mm closed ${l.closed} c=${c.map((x) => x.toFixed(0)).join(',')} pieces ${[...l.panels].map((i) => panels[i].key).join(',')}`,
      );
    }
  }
  // ── place the rest on those loops ───────────────────────────────────────────────────────
  type Frame = { c: Vec3; up: Vec3; e0: Vec3; e90: Vec3 };
  const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [
    a[0] + b[0] * k,
    a[1] + b[1] * k,
    a[2] + b[2] * k,
  ];
  const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const inFrame = (F: Frame, p: Vec3) => {
    const d = sub(p, F.c);
    const hh = dot(d, F.up);
    const x0 = dot(d, F.e0);
    const x9 = dot(d, F.e90);
    return { h: hh, th: Math.atan2(x9, x0), r: Math.hypot(x0, x9) };
  };
  const fromFrame = (F: Frame, th: number, hh: number, r: number): Vec3 =>
    add(add(add(F.c, F.up, hh), F.e0, r * Math.cos(th)), F.e90, r * Math.sin(th));

  /** Base curve (a loop / run in 3D) sampled by azimuth around a frame: radius and height. */
  const baseOf = (F: Frame, verts: number[]) => {
    const B = 72;
    const r = new Array<number>(B).fill(NaN);
    const hh = new Array<number>(B).fill(NaN);
    for (const v of verts) {
      const q = inFrame(F, getPos(v));
      const k = Math.round(((((q.th % TAU) + TAU) % TAU) / TAU) * B) % B;
      r[k] = Number.isNaN(r[k]) ? q.r : (r[k] + q.r) / 2;
      hh[k] = Number.isNaN(hh[k]) ? q.h : (hh[k] + q.h) / 2;
    }
    for (const arr of [r, hh]) {
      const known = arr.map((x, i) => [x, i] as const).filter(([x]) => !Number.isNaN(x));
      if (!known.length) arr.fill(0);
      for (let i = 0; i < B; i++) {
        if (!Number.isNaN(arr[i])) continue;
        let best = known[0];
        let bd = Infinity;
        for (const kk of known) {
          const d = Math.min(Math.abs(kk[1] - i), B - Math.abs(kk[1] - i));
          if (d < bd) [best, bd] = [kk, d];
        }
        arr[i] = best[0];
      }
    }
    const at = (arr: number[], th: number) => {
      const f = ((((th % TAU) + TAU) % TAU) / TAU) * B;
      const i = Math.floor(f) % B;
      const w = f - Math.floor(f);
      return arr[i] * (1 - w) + arr[(i + 1) % B] * w;
    };
    return { r: (th: number) => at(r, th), h: (th: number) => at(hh, th) };
  };

  /** Split a strip's whole contour into its bottom and top runs (between the two u-extremes). */
  const stripRuns = (list: Panel[]) => {
    const loops = loopsOf(new Set([list[0].group]));
    const L = [...loops].sort((x, y) => y.len - x.len)[0];
    if (!L) return null;
    const vs = L.verts;
    let iMin = 0;
    let iMax = 0;
    for (let k = 0; k < vs.length; k++) {
      if (cuv[2 * vs[k]] < cuv[2 * vs[iMin]]) iMin = k;
      if (cuv[2 * vs[k]] > cuv[2 * vs[iMax]]) iMax = k;
    }
    const arc = (from: number, to: number) => {
      const out: number[] = [];
      for (let k = from; ; k = (k + 1) % vs.length) {
        out.push(vs[k]);
        if (k === to) break;
      }
      return out;
    };
    const r1 = arc(iMin, iMax);
    const r2 = arc(iMax, iMin);
    const mv = (r: number[]) => r.reduce((t, v) => t + cuv[2 * v + 1], 0) / r.length;
    return mv(r1) < mv(r2)
      ? { bottom: r1, top: r2, closed: L.closed }
      : { bottom: r2, top: r1, closed: L.closed };
  };

  /** Wrap a ring group (stand, collar, cuff, band) onto a base curve. */
  const placeRing = (
    gid: DollGroupId,
    F: Frame,
    base: number[] | null,
    rFallback: number,
    attach: 'bottom' | 'top',
    th0: number,
    layer: number,
    /** L4: the strip is laid turned 180° (its attach run is the chart's top; the rest goes up). */
    flip = false,
  ) => {
    const list = groups.get(gid);
    const ch = charts.get(gid);
    if (!list || !ch) return null;
    const runs = stripRuns(list);
    const bot = attach === 'bottom' ? runs?.bottom : runs?.top;
    // u → v of the attached run (chart), for the height above it.
    const runPts = (bot ?? [])
      .map((v) => [cuv[2 * v], cuv[2 * v + 1]] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    const runV = (u: number) => {
      if (!runPts.length) return 0;
      if (u <= runPts[0][0]) return runPts[0][1];
      for (let k = 1; k < runPts.length; k++)
        if (runPts[k][0] >= u) {
          const a = runPts[k - 1];
          const b = runPts[k];
          const w = b[0] > a[0] ? (u - a[0]) / (b[0] - a[0]) : 0;
          return a[1] + (b[1] - a[1]) * w;
        }
      return runPts[runPts.length - 1][1];
    };
    let x0 = Infinity;
    let x1 = -Infinity;
    for (const P of list)
      for (let r = 0; r < P.nb; r++) {
        x0 = Math.min(x0, cuv[2 * (P.offset + r)]);
        x1 = Math.max(x1, cuv[2 * (P.offset + r)]);
      }
    const uC = (x0 + x1) / 2;
    const B = base && base.length ? baseOf(F, base) : null;
    const rad = (th: number) => (B ? B.r(th) : rFallback) + layer;
    // Arc length along the base by azimuth, so the ring keeps its own width (paper).
    const KA = 360;
    const arc = new Float64Array(KA + 1);
    for (let k = 1; k <= KA; k++) arc[k] = arc[k - 1] + (rad((TAU * (k - 0.5)) / KA) * TAU) / KA;
    const arcAt = (th: number) => {
      const f = ((((th % TAU) + TAU) % TAU) / TAU) * KA;
      const i = Math.floor(f);
      return arc[i] + (arc[Math.min(KA, i + 1)] - arc[i]) * (f - i);
    };
    const thAt = (s: number) => {
      const tot = arc[KA];
      const q = ((s % tot) + tot) % tot;
      let lo = 0;
      let hi = KA;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (arc[m] <= q) lo = m;
        else hi = m;
      }
      return (TAU * (lo + (q - arc[lo]) / Math.max(1e-9, arc[hi] - arc[lo]))) / KA;
    };
    const s0 = arcAt(th0);
    const ringProxy: Proxy = {
      push(p, i) {
        const q = inFrame(F, [p[3 * i], p[3 * i + 1], p[3 * i + 2]]);
        const R = rad(q.th) * PROXY_K;
        if (q.r >= R || q.r < 1e-6) return;
        const np = fromFrame(F, q.th, q.h, R);
        p[3 * i] = np[0];
        p[3 * i + 1] = np[1];
        p[3 * i + 2] = np[2];
      },
      pull() {},
    };
    const pi = proxies.push(ringProxy) - 1;
    for (const P of list) {
      buildPanelLater.push(P);
      for (let i = 0; i < P.count; i++) {
        const v = P.offset + i;
        const u = cuv[2 * v];
        const vv = cuv[2 * v + 1];
        const th = thAt(s0 + (flip ? uC - u : u - uC));
        const above = flip ? runV(u) - vv : attach === 'bottom' ? vv - runV(u) : vv - runV(u);
        const hh = (B ? B.h(th) : 0) + above;
        setPos(v, fromFrame(F, th, hh, rad(th)));
        proxyOf[v] = pi;
        placed[v] = 1;
      }
    }
    proxyReport.push({
      group: gid,
      kind: 'ring',
      profile: [[0, rFallback, rFallback]],
      origin: F.c,
      axis: F.up,
    });
    return runs;
  };
  const buildPanelLater: Panel[] = [];

  /** Pattern edges a vertex path runs along (for the report's sides). */
  const edgesOn = (P: Path) => {
    const out = new Set<string>();
    for (const v of P.v) {
      const Pn = panels[panelOf[v]];
      const r = ringOf[v];
      if (r < 0) continue;
      const rsI = Pn.mesh.bRs[r];
      const n = Pn.geom.rs.length;
      for (const e of Pn.geom.edges) {
        const span = (((e.e - e.s) % n) + n) % n;
        const off = (((rsI - e.s) % n) + n) % n;
        if (off > 0 && off < span) out.add(e.id);
      }
    }
    return [...out];
  };
  const proposals: { gid: DollGroupId; label: string; ok: boolean; note: string }[] = [];
  /** Propose a join between two vertex runs / loops (cut closed loops at their lowest / front point). */
  const ringInfo = { ringOf, nbOf: (p: number) => panels[p].nb };
  const propose = (
    label: string,
    A0: { verts: number[]; closed: boolean },
    B0: { verts: number[]; closed: boolean },
    cutAt: 'lowest' | 'front' | 'nearest',
    gid: DollGroupId,
    maxEase = 0.25,
  ) => {
    const cutIdx = (L: { verts: number[] }, ref?: Vec3) => {
      let best = 0;
      for (let k = 0; k < L.verts.length; k++) {
        const p = getPos(L.verts[k]);
        const q = getPos(L.verts[best]);
        if (cutAt === 'lowest' && p[1] < q[1]) best = k;
        if (cutAt === 'front' && p[2] > q[2]) best = k;
        if (cutAt === 'nearest' && ref && Math.hypot(...sub(p, ref)) < Math.hypot(...sub(q, ref)))
          best = k;
      }
      return best;
    };
    let A: Path;
    let B: Path;
    if (A0.closed && B0.closed) {
      A = loopPath(A0.verts, uv, panelOf, cutIdx(A0), true, ringInfo);
      B = loopPath(B0.verts, uv, panelOf, cutIdx(B0), true, ringInfo);
    } else if (!A0.closed && B0.closed) {
      A = loopPath(A0.verts, uv, panelOf, 0, false, ringInfo);
      const mid = getPos(A0.verts[0]);
      const end = getPos(A0.verts[A0.verts.length - 1]);
      const ref: Vec3 = [(mid[0] + end[0]) / 2, (mid[1] + end[1]) / 2, (mid[2] + end[2]) / 2];
      B = loopPath(
        B0.verts,
        uv,
        panelOf,
        cutAt === 'nearest' ? cutIdx(B0, ref) : cutIdx(B0),
        true,
        ringInfo,
      );
    } else {
      A = loopPath(A0.verts, uv, panelOf, 0, false, ringInfo);
      B = loopPath(B0.verts, uv, panelOf, 0, false, ringInfo);
    }
    const ratio = Math.min(A.len, B.len) / Math.max(A.len, B.len, 1e-9);
    const ease = 1 - ratio;
    const words = `${A.len.toFixed(0)} ≈ ${B.len.toFixed(0)} mm, ${ease < 0.015 ? 'equal' : `eased ${(ease * 100).toFixed(0)} %`}`;
    if (ease > maxEase) {
      proposals.push({
        gid,
        label,
        ok: false,
        note: `${label} not proposed — lengths ${A.len.toFixed(0)} vs ${B.len.toFixed(0)} mm differ ${(ease * 100).toFixed(0)} %`,
      });
      warnings.push(
        `${label}: not proposed — lengths ${A.len.toFixed(0)} vs ${B.len.toFixed(0)} mm differ ${(ease * 100).toFixed(0)} %`,
      );
      return null;
    }
    const w = addWork(
      {
        id: label,
        a: edgesOn(A),
        b: edgesOn(B),
        kind: 'proposed-composite',
        origin: 'doll-proposed',
        A,
        B,
        target: 0.7,
        note: `proposed by the doll · ${label} · ${words} · not in the pattern`,
      },
      passes,
      120,
    );
    proposals.push({ gid, label, ok: true, note: w.note });
    return w;
  };

  // Graph seams between the body and another group (rare: the graph found a composite).
  const graphTouches = (g1: DollGroupId, g2: Set<DollGroupId>) =>
    G.seams.some((s) => {
      const ga = panelByKey.get(pk(s.a[0]))?.group;
      const gb = panelByKey.get(pk(s.b[0]))?.group;
      return (ga === g1 && gb && g2.has(gb)) || (gb === g1 && ga && g2.has(ga));
    });

  // A graph seam between a placed group and the body counts only when its two sides are near
  // each other once placed; one that spans the doll (a sleeve's underarm onto the yoke) is a wrong
  // pairing and is released at once instead of crumpling the sleeve on its way across.
  const FAR = 150;
  const gapNow = (sm: GroupedSeam) => {
    const A = pathOf(sm.a);
    const B = pathOf(sm.b);
    if (!A || !B) return Infinity;
    return Math.min(meanDist(A, B, true, [0, 1], [0, 1]), meanDist(A, B, false, [0, 1], [0, 1]));
  };
  const sewnNear = (g1: DollGroupId, g2: DollGroupId) =>
    G.seams.some((sm) => {
      const ga = panelByKey.get(pk(sm.a[0]))?.group;
      const gb = panelByKey.get(pk(sm.b[0]))?.group;
      return ((ga === g1 && gb === g2) || (gb === g1 && ga === g2)) && gapNow(sm) < FAR;
    });
  const a = (Math.PI / 180) * ARM_DEG;
  const sleeveFrames: Partial<Record<'L' | 'R', Frame>> = {};
  // Which armhole a sleeve goes to: its hand, unless the graph sews it to body edges that sit on
  // the other side of the doll (sleeve hands swapped, or a back drawn as seen from the front) —
  // then the seams win and the swap is reported.
  const armSide: Record<'L' | 'R', 'L' | 'R'> = { L: 'L', R: 'R' };
  {
    const vote: Record<'L' | 'R', number> = { L: 0, R: 0 };
    for (const s of ['L', 'R'] as const) {
      const gid: DollGroupId = s === 'L' ? 'SLEEVE_L' : 'SLEEVE_R';
      for (const sm of G.seams) {
        const ga = panelByKey.get(pk(sm.a[0]))?.group;
        const gb = panelByKey.get(pk(sm.b[0]))?.group;
        const bodySide =
          ga === gid && gb === 'BODY' ? sm.b : gb === gid && ga === 'BODY' ? sm.a : null;
        if (!bodySide) continue;
        const B = pathOf(bodySide);
        if (!B) continue;
        const x = [...B.v].reduce((t, v) => t + pos[3 * v], 0) / B.v.length;
        vote[s] += Math.sign(x) * B.len;
      }
    }
    if (vote.L < 0 && vote.R > 0) {
      armSide.L = 'R';
      armSide.R = 'L';
      warnings.push(
        "the graph sews the left sleeve to the doll's right armhole and the right sleeve to the left — sleeve hands swapped, or the back is drawn as seen from the front; the sleeves are put where the seams say",
      );
    }
  }
  for (const s of ['L', 'R'] as const) {
    const gid: DollGroupId = s === 'L' ? 'SLEEVE_L' : 'SLEEVE_R';
    const list = groups.get(gid);
    const ch = charts.get(gid);
    if (!list || !ch) continue;
    const side = armSide[s];
    const sg = side === 'L' ? 1 : -1;
    const main = ch.components[0].keys.map((k) => panelByKey.get(k)!);
    const [lo, hi] = vRange(main);
    const Wv = widthTable(main, lo, hi, 250);
    let vW = lo;
    let wMax = 0;
    for (let v = lo + 5; v < hi - 5; v += 5) {
      const w = Wv(v);
      if (w > wMax) [vW, wMax] = [v, w];
    }
    const capH = Math.max(40, hi - vW);
    // Cap apex: the top-most chart point.
    let uApex = 0;
    let best = -Infinity;
    for (const P of main)
      for (let r = 0; r < P.nb; r++) {
        const v = P.offset + r;
        if (cuv[2 * v + 1] > best) [best, uApex] = [cuv[2 * v + 1], cuv[2 * v]];
      }
    const J: Vec3 = armLoop[side]
      ? centroid(armLoop[side]!.verts)
      : [sg * aArmNow * 0.95, vArm + 0.5 * (vSh - vArm), 0];
    const d: Vec3 = [sg * Math.sin(a), -Math.cos(a), 0];
    const up: Vec3 = [-d[0], -d[1], -d[2]];
    const e0: Vec3 = [sg * Math.cos(a), Math.sin(a), 0];
    const e90 = cross(up, e0);
    const Rw = (wMax * (1 - EPS_WRAP)) / TAU;
    const F: Frame = { c: add(add(J, up, capH / 2), [sg, 0, 0], 25), up, e0, e90 };
    sleeveFrames[s] = F;
    const R = (v: number) => (Wv(Math.min(v, vW)) * (1 - EPS_WRAP)) / TAU;
    const armProxy: Proxy = {
      push(p, i) {
        const q = inFrame(F, [p[3 * i], p[3 * i + 1], p[3 * i + 2]]);
        const t = -q.h;
        if (t < 0.8 * capH || t > hi - lo + 20) return;
        const Rr = R(hi + q.h) * PROXY_K;
        if (q.r >= Rr || q.r < 1e-6) return;
        const np = fromFrame(F, q.th, q.h, Rr);
        p[3 * i] = np[0];
        p[3 * i + 1] = np[1];
        p[3 * i + 2] = np[2];
      },
      pull(p, i, k) {
        const q = inFrame(F, [p[3 * i], p[3 * i + 1], p[3 * i + 2]]);
        const t = -q.h;
        if (t < capH * 1.2) return;
        const Rr = R(hi + q.h) + CLEAR;
        if (q.r <= Rr) return;
        const np = fromFrame(F, q.th, q.h, q.r - (q.r - Rr) * k);
        p[3 * i] = np[0];
        p[3 * i + 1] = np[1];
        p[3 * i + 2] = np[2];
      },
    };
    const pi = proxies.push(armProxy) - 1;
    proxyReport.push({ group: gid, kind: 'capsule', profile: [[0, Rw, Rw]], origin: F.c, axis: d });
    for (const P of list) {
      buildPanelLater.push(P);
      const inMain = main.includes(P);
      for (let i = 0; i < P.count; i++) {
        const v = P.offset + i;
        const u = cuv[2 * v];
        const vv = cuv[2 * v + 1];
        const th = (TAU * (u - uApex)) / Wv(Math.min(vv, vW));
        setPos(v, fromFrame(F, th, vv - hi, R(vv) + CLEAR + (inMain ? 0 : 3)));
        proxyOf[v] = pi;
        placed[v] = 1;
      }
    }
  }
  // Sleeve tube closures, then cap ↔ armhole.
  for (const s of ['L', 'R'] as const) {
    const gid: DollGroupId = s === 'L' ? 'SLEEVE_L' : 'SLEEVE_R';
    if (!groups.has(gid)) continue;
    for (const P of groups.get(gid)!) buildPanel(P);
    for (const sm of G.seams)
      if (inGroups(sm.a, new Set([gid])) && inGroups(sm.b, new Set([gid]))) graphWork(sm, passes);
    proposeStripClosure(
      gid,
      'underarm seam proposed (closes the sleeve)',
      'proposed-composite',
      passes,
    );
    if (sewnNear(gid, 'BODY') || opt.proposeComposite === false) continue;
    // L4: a sleeve a person sewed to the body by a confirmed seam is not proposed again.
    if (
      l4 &&
      G.seams.some(
        (sm) =>
          isConf(sm.seam) &&
          ((inGroups(sm.a, new Set([gid])) && inGroups(sm.b, new Set(['BODY']))) ||
            (inGroups(sm.b, new Set([gid])) && inGroups(sm.a, new Set(['BODY'])))),
      )
    )
      continue;
    const loops = loopsOf(new Set([gid]));
    const F = sleeveFrames[s]!;
    const capTop = fromFrame(F, 0, 0, 0);
    const big = loops.filter((l) => l.len > 150).map((l) => ({ l, c: centroid(l.verts) }));
    big.sort((x, y) => Math.hypot(...sub(x.c, capTop)) - Math.hypot(...sub(y.c, capTop)));
    const cap = big[0]?.l;
    if (opt.debug)
      warnings.push(
        `debug: ${gid} loops ${loops.map((l) => `${l.len.toFixed(0)}${l.closed ? '' : '(open)'}`).join(' ')}`,
      );
    if (!cap) continue;
    if (!armLoop[armSide[s]]) {
      warnings.push(
        `${s === 'L' ? 'left' : 'right'} sleeve: the body has no ${armSide[s] === 'L' ? 'left' : 'right'} armhole loop — not attached`,
      );
      continue;
    }
    propose(
      `${s === 'L' ? 'left' : 'right'} sleeve cap ↔ armhole`,
      cap,
      armLoop[armSide[s]]!,
      'lowest',
      gid,
      0.3,
    );
  }

  // ── collar (04-COLLAR.md): neck path (K1) · stand on it by landmarks (K2) · fall on the stand
  //    top, turned down (K3) · collar units joined by the order stacked on one base (K4) ─────────
  const notchRs = new Map<number, Set<number>>();
  for (const P of panels) {
    const n = P.geom.rs.length;
    notchRs.set(P.idx, new Set(P.geom.notchIdx.map((i) => ((i % n) + n) % n)));
  }
  const cctx: CollarCtx = {
    pos,
    uv,
    cuv,
    panelOf,
    ringOf,
    nbOf: (p) => panels[p].nb,
    isNotch: (v) => {
      const r = ringOf[v];
      if (r < 0) return false;
      const P = panels[panelOf[v]];
      return notchRs.get(P.idx)!.has(P.mesh.bRs[r]);
    },
  };
  const collarRep: DollCollarReport = { neck: null, units: [], notes: [] };
  type CollarPlan = {
    rep: DollCollarUnit;
    work: Work | null;
    unit: Panel[];
    /** Fall: the stand top run it hangs from and the anchored range on it; its own outer run. */
    standTop?: number[];
    topRange?: [number, number];
    outer?: number[];
    stand?: Panel[];
    /** The unit's sewn edge (fall: its neck edge on the stand top). */
    attach?: number[];
    /** One-piece collar rolled over: its standing part, its turned-down part, the roll line. */
    fold?: { stand: number[]; fall: number[]; line: number[] };
  };
  const collarPlans: CollarPlan[] = [];
  /** Panels drawn with their face on the other side (a one-piece collar rolled over). */
  const faceFlip = new Set<number>();
  const chestMm = torso.length
    ? (Math.max(...torso.map((L) => L.a)) * ellPerimFactor) / (1 - EPS_WRAP)
    : 0;
  let neck: NeckPath | null = null;
  const neckGroups = (['STAND', 'COLLAR'] as DollGroupId[]).filter((g) => groups.has(g));
  // L4: a CONFIRMED seam between a collar unit and the body says where the neckline is: its body
  // side IS the neck path (no walk along free loops).
  const handled = new Set<GroupedSeam>();
  let confNeck: { g: GroupedSeam; unit: 'a' | 'b'; N0: NeckPath; N1: NeckPath } | null = null;
  if (l4 && neckGroups.length && groups.has('BODY')) {
    const grp = (ids: EdgeId[]) => new Set(ids.map((id) => panelByKey.get(pk(id))?.group));
    for (const g of G.seams) {
      if (!isConf(g.seam)) continue;
      const ga = grp(g.a);
      const gb = grp(g.b);
      const ringA = [...ga].every((x) => x === 'STAND' || x === 'COLLAR');
      const ringB = [...gb].every((x) => x === 'STAND' || x === 'COLLAR');
      const unit =
        ringA && gb.size === 1 && gb.has('BODY')
          ? 'a'
          : ringB && ga.size === 1 && ga.has('BODY')
            ? 'b'
            : null;
      if (!unit) continue;
      // The stand sits on the neckline; a fall on a stand is K3's.
      const bp = sidePath(g, unit === 'a' ? 'b' : 'a');
      if (!bp || bp.v.length < 4) continue;
      const how = `the body side of the confirmed seam ${g.seam.a} ↔ ${g.seam.b}`;
      const N0 = neckFromRun(cctx, [...bp.v], vArm, false, how);
      const N1 = neckFromRun(cctx, [...bp.v], vArm, true, how);
      confNeck = { g, unit, N0, N1 };
      break;
    }
    if (confNeck) {
      neck = confNeck.N0;
      collarRep.neck = {
        lenMm: neck.path.len,
        closed: false,
        chestMm,
        ratio: chestMm > 0 ? neck.path.len / chestMm : NaN,
        extMm: [0, 0],
        ok: true,
        how: `${neck.how} (confirmed by a person)`,
      };
    }
  }
  if (!confNeck && neckGroups.length && groups.has('BODY') && opt.proposeComposite !== false) {
    const r = findNeckPath(cctx, neckLoop ? [neckLoop] : bodyLoops, vArm);
    if (opt.debug) warnings.push(`debug: neck walk ${r.debug}`);
    const ratioOf = (x: NeckPath) => (chestMm > 0 ? x.path.len / chestMm : NaN);
    let ok = false;
    if (r.neck && ratioOf(r.neck) >= 0.3 && ratioOf(r.neck) <= 0.55) {
      neck = r.neck;
      ok = true;
    } else {
      warnings.push(
        r.neck
          ? `neck path ${r.neck.path.len.toFixed(0)} mm is ${(ratioOf(r.neck) * 100).toFixed(0)} % of the girth ${chestMm.toFixed(0)} mm (a neckline is 30–55 %) — ${r.note}; the closed neck loop is used instead`
          : `neck path not found (${r.note}) — the closed neck loop is used instead`,
      );
      if (neckLoop)
        neck = closedNeckPath(cctx, neckLoop.verts, vArm, 'closed neck loop (fallback)');
    }
    if (neck)
      collarRep.neck = {
        lenMm: neck.path.len,
        closed: neck.closed,
        chestMm,
        ratio: ratioOf(neck),
        extMm: neck.ext,
        ok,
        how: neck.how,
      };
    else warnings.push('the body has no neck path — the stand / collar is not attached');
    if (opt.debug && neck)
      warnings.push(
        `debug: neck path ${neck.path.len.toFixed(0)} mm ${neck.closed ? 'closed' : 'open'} · cb ${neck.cb.toFixed(0)} · snp ${neck.snp?.map((x) => x.toFixed(0)).join('/') ?? '-'} · ${neck.how}`,
      );
  }
  // The neck axis: vertical, through the middle of the neck path.
  const F: Frame = (() => {
    const vs = neck ? [...neck.path.v] : neckLoop ? neckLoop.verts : [];
    if (!vs.length) return { c: [0, vSh, 0], up: [0, 1, 0], e0: [0, 0, 1], e90: [1, 0, 0] };
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    let ys = 0;
    for (const v of vs) {
      const p = getPos(v);
      x0 = Math.min(x0, p[0]);
      x1 = Math.max(x1, p[0]);
      z0 = Math.min(z0, p[2]);
      z1 = Math.max(z1, p[2]);
      ys += p[1];
    }
    return {
      c: [(x0 + x1) / 2, ys / vs.length, (z0 + z1) / 2],
      up: [0, 1, 0],
      e0: [0, 0, 1],
      e90: [1, 0, 0],
    };
  })();
  const outward = (p: Vec3): Vec3 => {
    const dx = p[0] - F.c[0];
    const dz = p[2] - F.c[2];
    const l = Math.hypot(dx, dz) || 1;
    return [dx / l, 0, dz / l];
  };
  type Unit = {
    gid: DollGroupId;
    list: Panel[];
    keys: Set<string>;
    /** The edge sewn to the base (u ascending) and the opposite edge (the outer / top edge). */
    attach: number[];
    other: number[];
    /** +1: the piece lies above its attach run in the chart. */
    sign: 1 | -1;
    area: number;
  };
  const uAsc = (vs: number[]) =>
    vs.length > 1 && cuv[2 * vs[0]] > cuv[2 * vs[vs.length - 1]] ? [...vs].reverse() : vs;
  const runsOfPanels = (list: Panel[]) => {
    const set = new Set(list.map((P) => P.idx));
    const loops = findLoops({ panels, panelOf, ringOf, uv, seams: activeSeams() }, set);
    const L = [...loops].sort((x, y) => y.len - x.len)[0];
    if (!L) return null;
    const vs = L.verts;
    let iMin = 0;
    let iMax = 0;
    for (let k = 0; k < vs.length; k++) {
      if (cuv[2 * vs[k]] < cuv[2 * vs[iMin]]) iMin = k;
      if (cuv[2 * vs[k]] > cuv[2 * vs[iMax]]) iMax = k;
    }
    const arcOf = (from: number, to: number) => {
      const out: number[] = [];
      for (let k = from; ; k = (k + 1) % vs.length) {
        out.push(vs[k]);
        if (k === to) break;
      }
      return out;
    };
    const r1 = arcOf(iMin, iMax);
    const r2 = arcOf(iMax, iMin);
    const mv = (r: number[]) => r.reduce((t, v) => t + cuv[2 * v + 1], 0) / r.length;
    return mv(r1) < mv(r2) ? { bottom: r1, top: r2 } : { bottom: r2, top: r1 };
  };
  const unitsOf = (gid: DollGroupId): Unit[] => {
    const ch = charts.get(gid);
    if (!ch) return [];
    const out: Unit[] = [];
    for (const comp of ch.components) {
      const list = comp.keys.map((k) => panelByKey.get(k)!).filter((P) => P && P.group === gid);
      if (!list.length) continue;
      const runs = runsOfPanels(list);
      if (!runs) continue;
      const bot = uAsc(runs.bottom);
      const top = uAsc(runs.top);
      // The neck edge is the bottom run unless the top carries the landmark notches.
      const nb = bot.filter(cctx.isNotch).length;
      const nt = top.filter(cctx.isNotch).length;
      const useTop = nt >= nb + 2;
      out.push({
        gid,
        list,
        keys: new Set(list.flatMap((P) => [P.key, ...P.layers])),
        attach: smoothest(cctx, useTop ? top : bot),
        other: smoothest(cctx, useTop ? bot : top),
        sign: useTop ? -1 : 1,
        area: list.reduce((t, P) => t + Math.abs(P.geom.areaMm2), 0),
      });
    }
    return out;
  };
  /** Lay a unit along its base: attach run → base by the anchored map, the rest up (stand) or turned
   *  down and out (fall); extensions beyond the sewn marks overlap (left over right). */
  const placeUnit = (
    U: Unit,
    base: ReturnType<typeof baseCurve>,
    map: (s: number) => number,
    sewn: [number, number],
    mode: 'up' | 'down',
    layer: number,
    alpha: number,
    proxyIdx: number,
    /** One-piece collar: fold at this fraction of the local depth, the part above turned down. */
    roll?: { frac: number; alpha: number },
  ) => {
    const A = restPath(cctx, U.attach);
    // Local depth (attach run → opposite run, chart v) by u, for the roll line.
    const otab = U.other
      .map((v) => [cuv[2 * v], cuv[2 * v + 1]] as const)
      .sort((x, y) => x[0] - y[0]);
    const vOther = (u: number) => {
      if (!otab.length) return 0;
      if (u <= otab[0][0]) return otab[0][1];
      for (let k = 1; k < otab.length; k++)
        if (otab[k][0] >= u) {
          const w = (u - otab[k - 1][0]) / Math.max(1e-9, otab[k][0] - otab[k - 1][0]);
          return otab[k - 1][1] + (otab[k][1] - otab[k - 1][1]) * w;
        }
      return otab[otab.length - 1][1];
    };
    const fold = { stand: [] as number[], fall: [] as number[], line: [] as number[] };
    const tab = U.attach
      .map((v, k) => [cuv[2 * v], A.s[k], cuv[2 * v + 1]] as const)
      .sort((x, y) => x[0] - y[0]);
    // s runs with u, or against it (a fall is laid rotated 180°: its attach run reversed).
    const dir = tab[tab.length - 1][1] >= tab[0][1] ? 1 : -1;
    const look = (u: number) => {
      const n = tab.length;
      if (u <= tab[0][0]) return { s: tab[0][1] - dir * (tab[0][0] - u), v: tab[0][2] };
      if (u >= tab[n - 1][0])
        return { s: tab[n - 1][1] + dir * (u - tab[n - 1][0]), v: tab[n - 1][2] };
      let lo = 0;
      let hi = n - 1;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (tab[m][0] <= u) lo = m;
        else hi = m;
      }
      const w = tab[hi][0] > tab[lo][0] ? (u - tab[lo][0]) / (tab[hi][0] - tab[lo][0]) : 0;
      return {
        s: tab[lo][1] + (tab[hi][1] - tab[lo][1]) * w,
        v: tab[lo][2] + (tab[hi][2] - tab[lo][2]) * w,
      };
    };
    const lean = (8 * Math.PI) / 180;
    // The sewn edge itself by its own arc (u need not run monotonically along a curved edge).
    const onEdge = new Map<number, number>(U.attach.map((v, k) => [v, A.s[k]]));
    for (const P of U.list) {
      buildPanelLater.push(P);
      for (let i = 0; i < P.count; i++) {
        const v = P.offset + i;
        const q = look(cuv[2 * v]);
        const se = onEdge.get(v);
        if (se !== undefined) {
          q.s = se;
          q.v = cuv[2 * v + 1];
        }
        const h = U.sign * (cuv[2 * v + 1] - q.v);
        const B = base.at(map(q.s));
        const n = outward(B);
        const extra = q.s < sewn[0] - 1 ? 4 : q.s > sewn[1] + 1 ? 2 : 0;
        const hr = roll ? roll.frac * Math.abs(vOther(cuv[2 * v]) - q.v) : Infinity;
        let p: Vec3;
        if (mode === 'up' && h > hr) {
          // Above the roll line: turned down and out over the standing part.
          const R = add(
            add(add(B, F.up, hr * Math.cos(lean)), n, -hr * Math.sin(lean)),
            n,
            layer + extra,
          );
          const d = h - hr;
          p = add(add(R, n, 3 + d * Math.sin(roll!.alpha)), F.up, -d * Math.cos(roll!.alpha));
        } else
          p =
            mode === 'up'
              ? add(add(add(B, F.up, h * Math.cos(lean)), n, -h * Math.sin(lean)), n, layer + extra)
              : add(
                  add(B, n, 3 + layer + extra + Math.max(0, h) * Math.sin(alpha)),
                  F.up,
                  -h * Math.cos(alpha),
                );
        if (roll) {
          if (Math.abs(h - hr) < 5) fold.line.push(v);
          if (h > hr + 4) fold.fall.push(v);
          else if (h < hr - 4) fold.stand.push(v);
        }
        setPos(v, p);
        proxyOf[v] = proxyIdx;
        placed[v] = 1;
      }
    }
    return fold;
  };
  /** One-sided contact: each vertex of `outer` stays outside its nearest `inner` vertex (dynamic). */
  const contactOf = (outerV: number[], innerV: number[], gap: number) => {
    const ci: number[] = [];
    const cj: number[] = [];
    for (const v of outerV) {
      const p = getPos(v);
      let best = -1;
      let bd = Infinity;
      for (const w of innerV) {
        const d =
          (pos[3 * w] - p[0]) ** 2 + (pos[3 * w + 1] - p[1]) ** 2 + (pos[3 * w + 2] - p[2]) ** 2;
        if (d < bd) [best, bd] = [w, d];
      }
      if (best >= 0 && bd < 60 * 60) {
        ci.push(v);
        cj.push(best);
      }
    }
    if (ci.length)
      contacts.push({
        i: Int32Array.from(ci),
        j: Int32Array.from(cj),
        gap,
        ax: F.c[0],
        az: F.c[2],
      });
  };
  /** Share of `outerV` outside the surface of `innerV` (nearest inner vertex, outward normal). */
  const outsideShare = (outerV: number[], innerV: number[]) => {
    let out = 0;
    for (const v of outerV) {
      const p = getPos(v);
      let best = innerV[0];
      let bd = Infinity;
      for (const w of innerV) {
        const d =
          (pos[3 * w] - p[0]) ** 2 + (pos[3 * w + 1] - p[1]) ** 2 + (pos[3 * w + 2] - p[2]) ** 2;
        if (d < bd) [best, bd] = [w, d];
      }
      const q = getPos(best);
      if (dot(sub(p, q), outward(q)) >= -1) out++;
    }
    return outerV.length ? (100 * out) / outerV.length : 0;
  };
  /** A seam by anchored arc length (K2): only A between its first and last anchor is sewn. */
  const anchoredWork = (
    label: string,
    A: Path,
    B: Path,
    anchors: [number, number][],
    note: string,
    target: number,
  ) => {
    const rows = anchoredRows(A, B, anchors);
    const solver: SolverSeam = { rows, k: 0, active: true, gap: 0 };
    const a0 = anchors[0][0];
    const a1 = anchors[anchors.length - 1][0];
    const b0 = anchors[0][1];
    const b1 = anchors[anchors.length - 1][1];
    const item: Work = {
      id: label,
      a: edgesOn(A),
      b: edgesOn(B),
      kind: 'proposed-composite',
      origin: 'doll-proposed',
      A,
      B,
      same: true,
      aRange: [a0 / Math.max(1e-9, A.len), a1 / Math.max(1e-9, A.len)],
      bRange: [b0 / Math.max(1e-9, B.len), b1 / Math.max(1e-9, B.len)],
      rows,
      solver,
      target,
      born: passes,
      ramp: 120,
      note,
    };
    works.push(item);
    return item;
  };
  const increasing = (an: [number, number][]) =>
    an.every((x, i) => i === 0 || (x[0] > an[i - 1][0] + 1 && x[1] > an[i - 1][1] + 1));
  /** K2: a unit's attach run onto the neck path by landmarks. */
  const neckAnchors = (U: Unit, N: NeckPath) => {
    const m = runMarks(cctx, U.attach);
    const Lb = N.path.len;
    const cf = symmetricPair(m, Lb, 0.8, 1.25);
    const lo = cf ? cf[0] : 0;
    const hi = cf ? cf[1] : m.path.len;
    let snp = N.snp ? symmetricPair(m, N.snp[1] - N.snp[0], 0.75, 1.3, cf) : null;
    if (snp && (snp[0] <= lo + 5 || snp[1] >= hi - 5)) snp = null;
    const with_ = (useSnp: boolean): [number, number][] => [
      [lo, 0],
      ...(useSnp && snp && N.snp ? [[snp[0], N.snp[0]] as [number, number]] : []),
      [m.cb, N.cb],
      ...(useSnp && snp && N.snp ? [[snp[1], N.snp[1]] as [number, number]] : []),
      [hi, Lb],
    ];
    let anchors = with_(true);
    if (!increasing(anchors)) {
      snp = null;
      anchors = with_(false);
    }
    if (!increasing(anchors))
      anchors = [
        [lo, 0],
        [hi, Lb],
      ];
    const words = `CB ${m.cbByNotch ? 'notch' : 'middle'} ↔ CB · SNP ${snp ? 'notches ↔ shoulder points' : 'proportional'} · CF ${cf ? 'notches' : 'run ends'} ↔ ${N.closed ? 'the centre front' : 'the CF marks'}`;
    return { m, anchors, sewn: [lo, hi] as [number, number], words };
  };
  /** K3: a fall's neck edge onto the stand top (the notch pair that matches, centred at CB). */
  const topAnchors = (U: Unit, top: number[]) => {
    const mf = runMarks(cctx, U.attach);
    const mt = runMarks(cctx, top);
    const Lf = mf.path.len;
    const Lt = mt.path.len;
    const pair = symmetricPair(mt, Lf, 0.85, 1.15);
    const tA = pair ? pair[0] : Math.max(0, mt.cb - mf.cb);
    const tB = pair ? pair[1] : Math.min(Lt, mt.cb + (Lf - mf.cb));
    let anchors: [number, number][] = [
      [0, tA],
      [mf.cb, mt.cb],
      [Lf, tB],
    ];
    if (!increasing(anchors))
      anchors = [
        [0, tA],
        [Lf, tB],
      ];
    const words = `CB ${mf.cbByNotch ? 'notch' : 'middle'} ↔ stand CB · ends ↔ ${pair ? 'the stand-top notches' : 'centred on the stand top'}`;
    return { mf, mt, anchors, range: [tA, tB] as [number, number], words };
  };
  const joinedUnits = (a: Unit, b: Unit) =>
    G.seams.some(
      (sm) =>
        (a.keys.has(pk(sm.a[0])) && b.keys.has(pk(sm.b[0]))) ||
        (b.keys.has(pk(sm.a[0])) && a.keys.has(pk(sm.b[0]))),
    ) ||
    (opt.joins ?? []).some((J) =>
      J.parts.some(
        (X, i) =>
          X.some((k) => a.keys.has(k)) &&
          J.parts.some((Y, j) => j !== i && Y.some((k) => b.keys.has(k))),
      ),
    );
  // Ring proxy of units standing on the neck path: never inside the neck path's radius.
  const neckBase = neck ? baseOf(F, [...neck.path.v]) : null;
  const ringProxyAt = (layer: number) =>
    proxies.push({
      push(p, i) {
        if (!neckBase) return;
        const q = inFrame(F, [p[3 * i], p[3 * i + 1], p[3 * i + 2]]);
        const R = (neckBase.r(q.th) + layer) * PROXY_K;
        if (q.r >= R || q.r < 1e-6) return;
        const np = fromFrame(F, q.th, q.h, R);
        p[3 * i] = np[0];
        p[3 * i + 1] = np[1];
        p[3 * i + 2] = np[2];
      },
      pull() {},
    }) - 1;
  let standTop: number[] | null = null;
  let standList: Panel[] | null = null;
  /** Edge of the panel's geometry a boundary segment (two ring vertices) lies on. */
  const edgeOfSeg = (a: number, b: number): Edge | null => {
    if (panelOf[a] !== panelOf[b] || ringOf[a] < 0 || ringOf[b] < 0) return null;
    const P = panels[panelOf[a]];
    const n = P.geom.rs.length;
    const ia = P.mesh.bRs[ringOf[a]];
    const ib = P.mesh.bRs[ringOf[b]];
    const inE = (e: Edge, i: number) => (((i - e.s) % n) + n) % n <= (((e.e - e.s) % n) + n) % n;
    return P.geom.edges.find((e) => inE(e, ia) && inE(e, ib)) ?? null;
  };
  /**
   * L4 (04-COLLAR K2 + intake): tucks and pleats ON the neck path folded closed before the unit is
   * mapped — notch pairs 15–80 mm apart on one piece, and runs of short edges (< 35 mm, two or more:
   * a stepped tuck drawn in the outline). Which folds, whether the path is cut at its CF notches and
   * which notch pair of the unit is sewn: the reading whose length ratio is nearest 1 within
   * 0.90–1.15. None → the mismatch is reported, never crammed.
   */
  const foldedPlan = (U: Unit, cn: NonNullable<typeof confNeck>) => {
    const m = runMarks(cctx, U.attach);
    const foldsOf = (N: NeckPath) => {
      const P = N.path;
      const notchK: number[] = [];
      for (let k = 0; k < P.v.length; k++)
        if (cctx.isNotch(P.v[k]) && (!notchK.length || P.s[k] - P.s[notchK[notchK.length - 1]] > 2))
          notchK.push(k);
      const pairs: [number, number][] = [];
      for (let i = 0; i + 1 < notchK.length; i++) {
        const a = notchK[i];
        const b = notchK[i + 1];
        const d = P.s[b] - P.s[a];
        if (d >= 15 && d <= 80 && panelOf[P.v[a]] === panelOf[P.v[b]]) {
          pairs.push([P.s[a], P.s[b]]);
          i++;
        }
      }
      const stairs: [number, number][] = [];
      let run: { s0: number; s1: number; edges: Set<string> } | null = null;
      const flush = () => {
        if (run && run.edges.size >= 2 && run.s1 - run.s0 <= 130) stairs.push([run.s0, run.s1]);
        run = null;
      };
      for (let k = 1; k < P.v.length; k++) {
        const e = edgeOfSeg(P.v[k - 1], P.v[k]);
        if (e && e.lenMm < 35) {
          if (!run) run = { s0: P.s[k - 1], s1: P.s[k], edges: new Set([e.id]) };
          else {
            run.s1 = P.s[k];
            run.edges.add(e.id);
          }
        } else flush();
      }
      flush();
      return { pairs, stairs };
    };
    type Opt = {
      N: NeckPath;
      folds: [number, number][];
      lo: number;
      hi: number;
      Le: number;
      score: number;
      cut: boolean;
    };
    let best: Opt | null = null;
    const tried: string[] = [];
    for (const [N, cut] of [
      [cn.N0, false],
      [cn.N1, true],
    ] as const) {
      const f = foldsOf(N);
      const sets: [number, number][][] = [[], f.pairs, f.stairs, [...f.pairs, ...f.stairs]];
      sets.forEach((F, si) => {
        if (si > 0 && !F.length) return;
        if (si === 3 && (!f.pairs.length || !f.stairs.length)) return;
        const Fs = [...F].sort((x, y) => x[0] - y[0]);
        const Le = N.path.len - Fs.reduce((t, x) => t + x[1] - x[0], 0);
        const spans: [number, number][] = [[0, m.path.len]];
        for (const a of m.notches)
          for (const b of m.notches)
            if (
              a < m.cb - 5 &&
              b > m.cb + 5 &&
              Math.abs((a + b) / 2 - m.cb) <= Math.max(4, 0.015 * m.path.len)
            )
              spans.push([a, b]);
        for (const [lo, hi] of spans) {
          const r = (hi - lo) / Math.max(1, Le);
          const score = Math.abs(Math.log(r)) + (cut ? 0.01 : 0) + 0.003 * si;
          if (r < 0.9 || r > 1.15) continue;
          if (!best || score < best.score) best = { N, folds: Fs, lo, hi, Le, score, cut };
        }
        tried.push(
          `${cut ? 'cut at CF notches' : 'whole'} ${N.path.len.toFixed(0)} − ${(N.path.len - Le).toFixed(0)} folded = ${Le.toFixed(0)}`,
        );
      });
    }
    if (!best) return { m, tried, ok: false as const };
    const B = best as Opt;
    const eff = (sv: number) => {
      let out = sv;
      for (const [f0, f1] of B.folds) {
        if (sv >= f1) out -= f1 - f0;
        else if (sv > f0) out -= sv - f0;
      }
      return out;
    };
    const real = (e: number) => {
      let sv = e;
      for (const [f0, f1] of B.folds) if (sv >= f0) sv += f1 - f0;
      return sv;
    };
    // The unit's [lo, hi] onto the folded path [0, Le], its CB onto the path's CB.
    const effA: [number, number][] = [[B.lo, 0]];
    const cbE = eff(B.N.cb);
    if (m.cb > B.lo + 5 && m.cb < B.hi - 5 && cbE > 5 && cbE < B.Le - 5) effA.push([m.cb, cbE]);
    effA.push([B.hi, B.Le]);
    const xOfE = makeMap(effA.map(([x, e]) => [e, x] as [number, number]));
    let an: [number, number][] = effA.map(([x, e]) => [x, real(e)]);
    for (const [f0, f1] of B.folds) {
      const xf = xOfE(eff(f0));
      an = an.filter(([x]) => Math.abs(x - xf) > 1);
      an.push([xf - 0.3, f0], [xf + 0.3, f1]);
    }
    an.sort((x, y) => x[0] - y[0]);
    const anchors: [number, number][] = [];
    for (const a of an)
      if (
        !anchors.length ||
        (a[0] > anchors[anchors.length - 1][0] + 0.1 && a[1] > anchors[anchors.length - 1][1] + 0.1)
      )
        anchors.push(a);
    const words = `${B.cut ? 'cut at its CF notches' : 'whole'} (${B.N.path.len.toFixed(0)} mm)${B.folds.length ? ` · ${B.folds.length} tuck${B.folds.length > 1 ? 's' : ''} / pleat${B.folds.length > 1 ? 's' : ''} folded closed (${B.folds.map((f) => (f[1] - f[0]).toFixed(0)).join(' + ')} mm) → ${B.Le.toFixed(0)} mm` : ''} · the unit sewn ${B.lo.toFixed(0)}–${B.hi.toFixed(0)} of its ${m.path.len.toFixed(0)} mm (${B.lo > 1 || B.hi < m.path.len - 1 ? 'between its CF notches' : 'whole'}) · CB ${m.cbByNotch ? 'notch' : 'middle'} ↔ CB`;
    return {
      ok: true as const,
      m,
      N: B.N,
      anchors,
      sewn: [B.lo, B.hi] as [number, number],
      Le: B.Le,
      folds: B.folds.map((f) => Math.round(f[1] - f[0])),
      words,
      tried,
    };
  };
  const placeOnNeck = (units: Unit[], role: 'stand' | 'collar', label: string) => {
    if (!neck) return;
    const N0n = neck;
    const ordered = [...units].sort((x, y) => y.area - x.area);
    ordered.forEach((U, idx) => {
      const layer = 3 * (ordered.length - 1 - idx);
      // L4: the unit the confirmed neck seam names is mapped by the folded plan on ITS base.
      const cn =
        confNeck && U.keys.has(pk((confNeck.unit === 'a' ? confNeck.g.a : confNeck.g.b)[0]))
          ? confNeck
          : null;
      const fp = cn ? foldedPlan(U, cn) : null;
      const N = fp && fp.ok ? fp.N : N0n;
      const base = baseCurve(cctx, N.path);
      const plan =
        fp && fp.ok
          ? { m: fp.m, anchors: fp.anchors, sewn: fp.sewn, words: fp.words }
          : neckAnchors(U, N);
      const pi = ringProxyAt(layer);
      const sewnMm = plan.sewn[1] - plan.sewn[0];
      const ext = plan.m.path.len - sewnMm;
      // A base far off the unit's length (a neck path that is not a neckline): placed at its own
      // length centred on the CB, not sewn — never crammed.
      const off = fp ? !fp.ok : sewnMm / N.path.len < 0.6 || sewnMm / N.path.len > 1.4;
      if (fp && !fp.ok) {
        const wds = `${cn!.g.seam.a}~${cn!.g.seam.b}: confirmed by a person, but the unit (${fp.m.path.len.toFixed(0)} mm) does not fit its neck path with any reading of the tucks / CF notches (${fp.tried.join('; ')}) — the intake is not identified: placed at its own length, not crammed`;
        preContradictions.push(wds);
        warnings.push(`contradiction: ${wds}`);
      } else if (off)
        warnings.push(
          `${label}: not proposed — ${sewnMm.toFixed(0)} mm between the marks vs a neck path of ${N.path.len.toFixed(0)} mm (${((100 * sewnMm) / N.path.len).toFixed(0)} %); placed at its own length, centred at the CB`,
        );
      // A one-piece collar (no stand) rolls over: ROLL_FRAC of its depth stands, the rest turns
      // down and out, leaning out enough for its longer outer edge (no roll-line mark in the
      // pattern — a stated prior).
      let roll: { frac: number; alpha: number } | undefined;
      if (role === 'collar') {
        const La = plan.m.path.len;
        const Lo = restPath(cctx, U.other).len;
        let rN = 0;
        for (const v of N.path.v) rN += inFrame(F, getPos(v)).r;
        rN /= Math.max(1, N.path.v.length);
        const mid = U.attach[Math.floor(U.attach.length / 2)];
        const depth = Math.max(
          20,
          Math.min(
            ...U.other.map((v) =>
              Math.hypot(cuv[2 * v] - cuv[2 * mid], cuv[2 * v + 1] - cuv[2 * mid + 1]),
            ),
          ),
        );
        const H = (1 - ROLL_FRAC) * depth;
        const dR = rN * Math.max(0, Lo / Math.max(1, La) - 1) + 3 + layer;
        roll = {
          frac: ROLL_FRAC,
          alpha: Math.max(
            (20 * Math.PI) / 180,
            Math.min((70 * Math.PI) / 180, Math.asin(Math.min(1, dR / H))),
          ),
        };
      }
      const fold = placeUnit(
        U,
        base,
        off
          ? makeMap([
              [plan.m.cb, N.cb],
              [plan.m.cb + 1, N.cb + 1],
            ])
          : makeMap(plan.anchors),
        plan.sewn,
        'up',
        layer,
        0,
        pi,
        roll,
      );
      for (const P of U.list) buildPanel(P);
      if (roll) {
        contactOf(fold.fall, fold.stand, 1.5);
        // Rolled over, the drawn face shows on the turned-down part (the standing part, hidden
        // under it, shows its back).
        for (const P of U.list) faceFlip.add(P.idx);
      }
      const graphSewn = graphTouches(U.gid, new Set(['BODY']));
      const id = idx === 0 ? label : `${label} (layer ${idx + 1})`;
      let confWork: Work | null = null;
      if (cn) {
        handled.add(cn.g);
        if (fp && fp.ok) {
          confWork = anchoredWork(
            `${cn.g.seam.a}~${cn.g.seam.b}`,
            plan.m.path,
            N.path,
            plan.anchors,
            `${label} · ${sewnMm.toFixed(0)} mm of the unit onto the neck path ${fp.Le.toFixed(0)} mm (ease ${(sewnMm / fp.Le).toFixed(3)}) · ${plan.words}`,
            0.8,
          );
          confWork.origin = 'graph';
          confWork.confirmed = true;
        }
      }
      const work = cn
        ? confWork
        : graphSewn || off
          ? null
          : anchoredWork(
              id,
              plan.m.path,
              N.path,
              plan.anchors,
              `proposed by the doll · ${label} · ${sewnMm.toFixed(0)} mm between the marks onto the ${N.closed ? 'closed' : 'open'} neck path ${N.path.len.toFixed(0)} mm (${sewnMm / N.path.len < 0.985 || sewnMm / N.path.len > 1.015 ? `eased ${(Math.abs(1 - sewnMm / N.path.len) * 100).toFixed(0)} %` : 'equal'})${ext > 2 ? ` · ${ext.toFixed(0)} mm beyond the CF marks left free (extensions, overlapping)` : ''} · ${plan.words} · not in the pattern`,
              0.8,
            );
      collarPlans.push({
        rep: {
          keys: U.list.map((P) => P.key),
          role,
          base: 'neck path',
          seam: work?.id ?? null,
          attached: cn
            ? work
              ? 'confirmed'
              : 'not sewn'
            : work
              ? 'proposed'
              : graphSewn
                ? 'graph'
                : 'not sewn',
          sewnMm,
          baseMm: fp && fp.ok ? fp.Le : N.path.len,
          ease: sewnMm / (fp && fp.ok ? fp.Le : N.path.len),
          ...(fp && fp.ok ? { folds: fp.folds } : {}),
          extMm: ext,
          anchors: plan.words,
          layer,
        },
        work,
        unit: U.list,
        ...(roll ? { fold, outer: U.other } : {}),
      });
      if (idx === 0) {
        standTop = U.other;
        standList = U.list;
      }
    });
  };
  if (groups.has('STAND')) {
    const units = unitsOf('STAND');
    placeOnNeck(units, 'stand', 'collar stand ↔ neckline');
    for (const sm of G.seams)
      if (inGroups(sm.a, new Set(['STAND'])) && inGroups(sm.b, new Set(['STAND'])))
        graphWork(sm, passes);
  }
  if (groups.has('COLLAR')) {
    const units = unitsOf('COLLAR');
    const ordered = [...units].sort((x, y) => y.area - x.area);
    for (let i = 1; i < ordered.length; i++)
      if (!joinedUnits(ordered[i], ordered[0]))
        warnings.push(
          `${ordered[i].list.map((P) => P.key).join('+')}: a second collar unit not joined to ${ordered[0].list.map((P) => P.key).join('+')} by a seam or the order — stacked on the same base anyway`,
        );
    // A later unit sewn by the graph onto an earlier unit's attach edge attaches by that edge.
    const stackOn = new Map<Unit, { V: Unit; pair: Map<number, number> }>();
    for (let i = 1; i < ordered.length; i++) {
      const U = ordered[i];
      for (const sm of G.seams) {
        const mineA = U.keys.has(pk(sm.a[0]));
        const mineB = U.keys.has(pk(sm.b[0]));
        if (mineA === mineB) continue;
        const [mine, theirs] = mineA ? [sm.a, sm.b] : [sm.b, sm.a];
        const V = ordered.slice(0, i).find((W) => W.keys.has(pk(theirs[0])));
        const Pm = pathOf(mine);
        const Pt = pathOf(theirs);
        if (!V || !Pm || !Pt) continue;
        const on = new Set(V.attach);
        if ([...Pt.v].filter((v) => on.has(v)).length < 0.5 * Pt.v.length) continue;
        // The sewn edge is the unit's other run (the chart drew it the other way up): swap.
        const onOther = new Set(U.other);
        if ([...Pm.v].filter((v) => onOther.has(v)).length >= 0.5 * Pm.v.length) {
          U.other = U.attach;
          U.sign = U.sign === 1 ? -1 : 1;
        }
        U.attach = uAsc([...Pm.v]);
        // Sewn edge to edge: it lies where its partner's stretch of edge lies (K4), end to end the
        // way the graph pairs them (layers sewn face to face run against each other's contour).
        const same =
          (panelByKey.get(pk(mine[0]))?.mirrored ?? false) !==
          (panelByKey.get(pk(theirs[0]))?.mirrored ?? false);
        const m0 = Pm.v[0];
        const m1 = Pm.v[Pm.v.length - 1];
        const t0 = Pt.v[0];
        const t1 = Pt.v[Pt.v.length - 1];
        stackOn.set(U, {
          V,
          pair: new Map([
            [m0, same ? t0 : t1],
            [m1, same ? t1 : t0],
          ]),
        });
        break;
      }
    }
    if (standTop && standList) {
      // K3: falls on the stand top, turned down and out; stacked outward in area order (K4).
      const top = standTop as number[];
      const stand = standList as Panel[];
      const base = baseCurve(cctx, restPath(cctx, top));
      const standV: number[] = [];
      for (const P of stand) for (let i = 0; i < P.count; i++) standV.push(P.offset + i);
      const planOf = new Map<Unit, ReturnType<typeof topAnchors>>();
      ordered.forEach((U0, idx) => {
        const layer = 3 * (ordered.length - 1 - idx);
        // Turned down = the drawn piece rotated 180° (u and v both reversed): its face shows.
        const U: Unit = { ...U0, attach: [...U0.attach].reverse(), other: [...U0.other].reverse() };
        const plan = topAnchors(U, top);
        // A unit sewn edge to edge onto an earlier one takes that unit's map (scaled to its own
        // length), so the seam between the layers starts closed instead of fighting two maps.
        const st = stackOn.get(U0);
        const pp = st ? planOf.get(st.V) : undefined;
        const pv = pp ? [...pp.mf.path.v] : [];
        const kA = pp ? pv.indexOf(st!.pair.get(U.attach[0]) ?? -1) : -1;
        const kB = pp ? pv.indexOf(st!.pair.get(U.attach[U.attach.length - 1]) ?? -1) : -1;
        if (pp && kA >= 0 && kB >= 0 && kA !== kB) {
          // The partner's stretch sA → sB of its neck edge (this unit's start → end, as the graph
          // pairs them — possibly running backwards: the layer then lies mirrored, face to face),
          // through the partner's map onto the stand top.
          const sA = pp.mf.path.s[kA];
          const sB = pp.mf.path.s[kB];
          const mapP = makeMap(pp.anchors);
          const Lm = plan.mf.path.len;
          const an: [number, number][] = [[0, mapP(sA)]];
          for (const [sp] of pp.anchors) {
            const x = ((sp - sA) / (sB - sA)) * Lm;
            if (x > 5 && x < Lm - 5) an.push([x, mapP(sp)]);
          }
          an.push([Lm, mapP(sB)]);
          an.sort((x, y) => x[0] - y[0]);
          plan.anchors = an;
          plan.range = [Math.min(mapP(sA), mapP(sB)), Math.max(mapP(sA), mapP(sB))];
          plan.words = `stacked on ${st!.V.list.map((P) => P.key).join('+')} (${Math.round(sB - sA)} of its ${Math.round(pp.mf.path.len)} mm neck edge): placed by its marks on the stand top`;
        }
        planOf.set(U0, plan);
        // Turned down: the outer edge sits on a larger circle than the neck edge — lean the fall
        // out so its outer edge needs no stretch.
        const outer = restPath(cctx, U.other);
        let rTop = 0;
        for (const p of base.pts) rTop += inFrame(F, p).r;
        rTop /= Math.max(1, base.pts.length);
        const hs = U.other.map((v) => {
          const q = U.attach.length ? cuv[2 * v + 1] : 0;
          return Math.abs(q - cuv[2 * U.attach[Math.floor(U.attach.length / 2)] + 1]);
        });
        const H = hs.length ? hs.sort((x, y) => x - y)[Math.floor(hs.length / 2)] : 50;
        const dR = rTop * Math.max(0, outer.len / Math.max(1, plan.mf.path.len) - 1) + layer + 3;
        const alpha = Math.max(
          (15 * Math.PI) / 180,
          Math.min((75 * Math.PI) / 180, Math.asin(Math.min(1, dR / Math.max(1, H)))),
        );
        // No proxy push of its own: the contact below keeps it outside the stand (the torso's neck
        // cylinder, wider than a collar, would hold it off the stand top).
        const pi = proxies.push({ push() {}, pull() {} }) - 1;
        placeUnit(U, base, makeMap(plan.anchors), [0, plan.mf.path.len], 'down', layer, alpha, pi);
        for (const P of U.list) buildPanel(P);
        // One-sided contact: every vertex of the fall but its sewn neck edge stays outside the
        // stand point nearest to it at placement (dynamic — it follows the stand as both move).
        {
          const edge = new Set(U.attach);
          const fv: number[] = [];
          for (const P of U.list)
            for (let i = 0; i < P.count; i++) if (!edge.has(P.offset + i)) fv.push(P.offset + i);
          contactOf(fv, standV, 1.5 + layer);
        }
        const graphSewn =
          graphTouches(U.gid, new Set(['STAND'])) ||
          ordered.slice(0, idx).some((W) =>
            G.seams.some((sm) => {
              const ka = pk(sm.a[0]);
              const kb = pk(sm.b[0]);
              return (U.keys.has(ka) && W.keys.has(kb)) || (U.keys.has(kb) && W.keys.has(ka));
            }),
          );
        const sewnMm = plan.mf.path.len;
        const baseMm = plan.range[1] - plan.range[0];
        const label = idx === 0 ? 'collar ↔ stand top' : `collar ↔ stand top (layer ${idx + 1})`;
        // L4: a confirmed seam of this unit onto the stand — sewn by the K3 map, as the person's seam.
        const confFall = l4
          ? G.seams.find(
              (sm) =>
                isConf(sm.seam) &&
                !handled.has(sm) &&
                ((U.keys.has(pk(sm.a[0])) && stand.some((P) => P.key === pk(sm.b[0]))) ||
                  (U.keys.has(pk(sm.b[0])) && stand.some((P) => P.key === pk(sm.a[0])))),
            )
          : undefined;
        let confW: Work | null = null;
        if (confFall) {
          handled.add(confFall);
          confW = anchoredWork(
            `${confFall.seam.a}~${confFall.seam.b}`,
            plan.mf.path,
            plan.mt.path,
            plan.anchors,
            `collar ↔ stand top · ${plan.mf.path.len.toFixed(0)} ≈ ${(plan.range[1] - plan.range[0]).toFixed(0)} mm of the stand top · turned down over the stand · ${plan.words}`,
            0.7,
          );
          confW.origin = 'graph';
          confW.confirmed = true;
        }
        const work = confFall
          ? confW
          : graphSewn
            ? null
            : anchoredWork(
                label,
                plan.mf.path,
                plan.mt.path,
                plan.anchors,
                `proposed by the doll · collar ↔ stand top · ${sewnMm.toFixed(0)} ≈ ${baseMm.toFixed(0)} mm of the stand top (${Math.abs(1 - sewnMm / Math.max(1, baseMm)) < 0.015 ? 'equal' : `eased ${(Math.abs(1 - sewnMm / Math.max(1, baseMm)) * 100).toFixed(0)} %`}) · turned down over the stand · ${plan.words} · not in the pattern`,
                0.7,
              );
        collarPlans.push({
          rep: {
            keys: U.list.map((P) => P.key),
            role: 'fall',
            base: 'stand top',
            seam: work?.id ?? null,
            attached: confFall
              ? 'confirmed'
              : work
                ? 'proposed'
                : graphTouches(U.gid, new Set(['STAND']))
                  ? 'graph'
                  : 'stacked',
            sewnMm,
            baseMm,
            ease: sewnMm / Math.max(1, baseMm),
            extMm: 0,
            anchors: plan.words,
            layer,
          },
          work,
          unit: U.list,
          standTop: top,
          topRange: plan.range,
          outer: U.other,
          stand,
          attach: U.attach,
        });
      });
    } else if (neck) {
      // No separate stand: a one-piece collar on the neck path, standing (roll line not modelled).
      placeOnNeck(ordered, 'collar', 'collar ↔ neckline');
      collarRep.notes.push(
        `one-piece collar (no separate stand): rolled over at ${Math.round(ROLL_FRAC * 100)} % of its depth — the pattern has no roll-line mark, so where it turns down is a prior, not read from the pattern`,
      );
    }
    // Seams inside the group (between stacked units too: placed above by the graph's own pairing).
    for (const sm of G.seams)
      if (inGroups(sm.a, new Set(['COLLAR'])) && inGroups(sm.b, new Set(['COLLAR'])))
        graphWork(sm, passes);
  }
  const ringLen = (gid: DollGroupId) => {
    const runs = groups.has(gid) ? stripRuns(groups.get(gid)!) : null;
    return runs ? loopPath(runs.bottom, uv, panelOf, 0, false, ringInfo).len : 400;
  };
  // Cuffs at the wrists.
  for (const s of ['L', 'R'] as const) {
    const gid: DollGroupId = s === 'L' ? 'CUFF_L' : 'CUFF_R';
    const sl: DollGroupId = s === 'L' ? 'SLEEVE_L' : 'SLEEVE_R';
    if (!groups.has(gid)) continue;
    const F0 = sleeveFrames[s];
    const loops = groups.has(sl) ? loopsOf(new Set([sl])) : [];
    const capTop = F0 ? fromFrame(F0, 0, 0, 0) : ([0, 0, 0] as Vec3);
    const big = loops.filter((l) => l.len > 100).map((l) => ({ l, c: centroid(l.verts) }));
    big.sort((x, y) => Math.hypot(...sub(y.c, capTop)) - Math.hypot(...sub(x.c, capTop)));
    const wrist = big[0]?.l ?? null;
    const F: Frame =
      F0 && wrist
        ? { ...F0, c: centroid(wrist.verts) }
        : { c: [s === 'L' ? 400 : -400, 0, 0], up: [0, 1, 0], e0: [0, 0, 1], e90: [1, 0, 0] };
    const runs = placeRing(gid, F, wrist?.verts ?? null, ringLen(gid) / TAU, 'top', 0, 2);
    for (const P of groups.get(gid)!) buildPanel(P);
    for (const sm of G.seams)
      if (inGroups(sm.a, new Set([gid])) && inGroups(sm.b, new Set([gid]))) graphWork(sm, passes);
    if (runs && wrist && !graphTouches(gid, new Set([sl])) && opt.proposeComposite !== false)
      propose(
        `${s === 'L' ? 'left' : 'right'} cuff ↔ wrist`,
        { verts: runs.top, closed: false },
        { verts: wrist.verts, closed: wrist.closed },
        'nearest',
        gid,
        0.3,
      );
  }
  // Waistband / hem band.
  for (const gid of ['WAISTBAND', 'HEMBAND'] as DollGroupId[]) {
    if (!groups.has(gid)) continue;
    // L4: a band a confirmed seam sews onto the body / legs sits on THAT path (the body side of the
    // seam), attached by the run the seam names.
    if (l4) {
      const band = new Set([gid]);
      const conf = G.seams
        .filter((sm) => isConf(sm.seam))
        .map((sm) =>
          inGroups(sm.a, band) && inGroups(sm.b, bodyLike)
            ? { sm, bandSide: 'a' as const }
            : inGroups(sm.b, band) && inGroups(sm.a, bodyLike)
              ? { sm, bandSide: 'b' as const }
              : null,
        )
        .filter((x): x is NonNullable<typeof x> => !!x);
      const runs0 = conf.length ? stripRuns(groups.get(gid)!) : null;
      if (conf.length && runs0) {
        const baseV: number[] = [];
        const bandV = new Set<number>();
        for (const { sm, bandSide } of conf) {
          const bp = sidePath(sm, bandSide === 'a' ? 'b' : 'a');
          const up = sidePath(sm, bandSide);
          if (bp) baseV.push(...bp.v);
          if (up) for (const v of up.v) bandV.add(v);
        }
        const onTop =
          runs0.top.filter((v) => bandV.has(v)).length >
          runs0.bottom.filter((v) => bandV.has(v)).length;
        const F: Frame = {
          c: baseV.length ? centroid(baseV) : [0, 0, 0],
          up: [0, 1, 0],
          e0: [0, 0, 1],
          e90: [1, 0, 0],
        };
        placeRing(gid, F, baseV, ringLen(gid) / TAU, onTop ? 'top' : 'bottom', Math.PI, 2, onTop);
        for (const P of groups.get(gid)!) buildPanel(P);
        for (const sm of G.seams)
          if (inGroups(sm.a, band) && inGroups(sm.b, band)) graphWork(sm, passes);
        warnings.push(
          `${gid === 'WAISTBAND' ? 'waistband' : 'hem band'}: on the path its confirmed seam${conf.length > 1 ? 's' : ''} name${conf.length > 1 ? '' : 's'} (${conf.map((x) => `${x.sm.seam.a}~${x.sm.seam.b}`).join(', ')}), by its ${onTop ? 'top' : 'bottom'} run`,
        );
        continue;
      }
    }
    const host = loopsOf(bodyLike)
      .filter((l) => l.len > 200)
      .map((l) => ({ l, c: centroid(l.verts) }));
    host.sort((x, y) => (gid === 'WAISTBAND' ? y.c[1] - x.c[1] : x.c[1] - y.c[1]));
    const target = gid === 'WAISTBAND' ? host[0]?.l : hemLoop ?? host[0]?.l;
    const c = target ? centroid(target.verts) : ([0, 0, 0] as Vec3);
    const F: Frame = { c, up: [0, 1, 0], e0: [0, 0, 1], e90: [1, 0, 0] };
    const runs = placeRing(
      gid,
      F,
      target?.verts ?? null,
      ringLen(gid) / TAU,
      gid === 'WAISTBAND' ? 'bottom' : 'top',
      Math.PI,
      2,
    );
    for (const P of groups.get(gid)!) buildPanel(P);
    for (const sm of G.seams)
      if (inGroups(sm.a, new Set([gid])) && inGroups(sm.b, new Set([gid]))) graphWork(sm, passes);
    if (runs && target && opt.proposeComposite !== false)
      propose(
        gid === 'WAISTBAND' ? 'waistband ↔ top of the body' : 'hem band ↔ hem',
        { verts: gid === 'WAISTBAND' ? runs.bottom : runs.top, closed: false },
        { verts: target.verts, closed: target.closed },
        'front',
        gid,
        0.25,
      );
  }
  // Graph seams between groups (whatever the graph found across them).
  for (const sm of G.seams) {
    if (handled.has(sm)) continue;
    const ga = panelByKey.get(pk(sm.a[0]))?.group;
    const gb = panelByKey.get(pk(sm.b[0]))?.group;
    if (!ga || !gb || ga === gb || ga === 'FLOAT' || gb === 'FLOAT') continue;
    if (bodyLike.has(ga) && bodyLike.has(gb)) continue;
    const far = gapNow(sm);
    const w = graphWork(sm, passes);
    if (w && far >= FAR && !w.confirmed) {
      w.released = true;
      w.solver.active = false;
      w.note = `its two edges are ${far.toFixed(0)} mm apart once the pieces are placed (${ga} ↔ ${gb}) — a wrong pairing? not sewn`;
    }
  }
  // A ply pair drawn as one panel (a double yoke: the plies are sewn to each other) that nothing
  // else holds: said as the pair, and what the order wants it sewn to — never «no seam found».
  const plyWords = (P: { key: string; layers: string[] }): string | null => {
    if (!P.layers.length) return null;
    const keys = new Set([P.key, ...P.layers]);
    const want = new Set<string>();
    for (const J of opt.joins ?? [])
      if (J.parts.some((X) => X.some((k) => keys.has(k))))
        for (const X of J.parts) for (const k of X) if (!keys.has(k)) want.add(k);
    const others = [...want].slice(0, 4);
    return `layer pair ${[P.key, ...P.layers].join(' + ')} — the plies are sewn to each other, but the pair is not attached to the rest yet (${others.length ? `no seam to ${others.join(', ')}${want.size > others.length ? ', …' : ''}` : 'no seam to any other piece'}) — drawn apart`;
  };

  // Floating pieces stand beside the doll, flat, facing front.
  let xMax = 0;
  for (let v = 0; v < N; v++) if (placed[v]) xMax = Math.max(xMax, pos[3 * v]);
  let xCursor = xMax + 200;
  const floating: DollReport['floating'] = [];
  for (const P of panels) {
    if (P.group !== 'FLOAT' && placed[P.offset]) continue;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    for (let i = 0; i < P.count; i++) {
      x0 = Math.min(x0, uv[2 * (P.offset + i)]);
      x1 = Math.max(x1, uv[2 * (P.offset + i)]);
      y0 = Math.min(y0, uv[2 * (P.offset + i) + 1]);
    }
    for (let i = 0; i < P.count; i++) {
      const v = P.offset + i;
      setPos(v, [xCursor + uv[2 * v] - x0, vLo + 200 + uv[2 * v + 1] - y0, 0]);
      placed[v] = 1;
    }
    xCursor += x1 - x0 + 60;
    const has = G.seams.some((s) => pk(s.a[0]) === P.key || pk(s.b[0]) === P.key);
    floating.push({
      pieceKey: P.key,
      reason:
        plyWords(P) ??
        (has
          ? 'sewn only to pieces outside any wrap group — drawn apart'
          : 'no seam found for any of its edges — drawn apart'),
    });
  }

  // ── phase 2: everything ─────────────────────────────────────────────────────────────────
  for (let v = 0; v < N; v++) {
    anchor[3 * v] = pos[3 * v];
    anchor[3 * v + 1] = pos[3 * v + 1];
    anchor[3 * v + 2] = pos[3 * v + 2];
    anchorK[v] = bodyLike.has(groupOfV[v]) || groupOfV[v] === 'FLOAT' ? 0 : 0.002;
  }
  for (const P of buildPanelLater) buildPanel(P);
  for (let v = 0; v < N; v++) moving[v] = groupOfV[v] !== 'FLOAT' && proxyOf[v] >= 0 ? 1 : 0;
  const tSolve = now();
  // Probe switch: the pose as placed, before phase 2 (debugging placement priors).
  const frozen = !!(globalThis as { __DOLL_PLACED_ONLY?: boolean }).__DOLL_PLACED_ONLY;
  if (frozen) passCap = passes;
  const p2 = Math.max(300, maxPasses - passes - 400);
  run(p2);
  // Releases get their own budget past maxPasses (the settle loop follows).
  passCap = Math.max(passCap, passes + 3 * 120);
  releaseRounds(3, 120, 20, 12);

  // Settled? Max vertex travel over 20 passes; keep relaxing until it is below 1.5 mm, within a
  // fixed pass budget (no clock: the result must not depend on the machine).
  let travel = Infinity;
  let travelV = 0;
  let travelP99 = 0;
  const settleCap = frozen ? passes : passes + (opt.settlePasses ?? 2400);
  passCap = settleCap;
  while (passes < settleCap) {
    run(60);
    const snap = Float64Array.from(pos);
    const before = passes;
    run(20);
    if (passes === before) break;
    travel = 0;
    const ds: number[] = [];
    for (let i = 0; i < pos.length; i += 3) {
      const d = Math.hypot(pos[i] - snap[i], pos[i + 1] - snap[i + 1], pos[i + 2] - snap[i + 2]);
      ds.push(d);
      if (d > travel) [travel, travelV] = [d, i / 3];
    }
    ds.sort((x, y) => x - y);
    travelP99 = ds.length ? ds[Math.floor(0.99 * (ds.length - 1))] : 0;
    if (travel < 1.5) break;
  }
  if (!Number.isFinite(travel)) travel = 0;
  if (opt.debug)
    warnings.push(
      `debug: travel p99 ${travelP99.toFixed(2)} mm · max ${travel.toFixed(1)} mm at ${panels[panelOf[travelV]]?.key ?? '-'} (ring ${ringOf[travelV]})`,
    );
  // Settled: 99 % of the points move ≤ 1 mm per 20 passes (the max is reported too).
  const converged = travelP99 <= 1.0;
  if (!converged)
    warnings.push(
      `the doll did not settle — 1 % of the points still move more than ${travelP99.toFixed(1)} mm per 20 passes (max ${travel.toFixed(1)} mm); the shape shown is the last frame`,
    );
  const msSolve = now() - tSolve;

  // ── report ──────────────────────────────────────────────────────────────────────────────
  const SF = makeState();
  const st = strains(SF);
  const sorted = [...st].sort((x, y) => x - y);
  if (opt.debug) {
    const per = new Map<string, number[]>();
    for (let c = 0; c < SF.nStretch; c++) {
      const k = panels[panelOf[SF.di[c]]].key;
      if (!per.has(k)) per.set(k, []);
      per.get(k)!.push(st[c]);
    }
    const rows = [...per].map(([k, v]) => {
      v.sort((x, y) => x - y);
      return [k, v[Math.floor(0.9 * (v.length - 1))], v[v.length - 1]] as const;
    });
    rows.sort((x, y) => y[1] - x[1]);
    const worstK = rows[0]?.[0];
    let shown = 0;
    for (let c = 0; c < SF.nStretch && shown < 4; c++) {
      if (panels[panelOf[SF.di[c]]].key !== worstK || st[c] < 0.4) continue;
      shown++;
      const [i, j] = [SF.di[c], SF.dj[c]];
      warnings.push(
        `debug: ${worstK} edge ${i}-${j} rest ${SF.rest[c].toFixed(1)} uv ${uv[2 * i].toFixed(0)},${uv[2 * i + 1].toFixed(0)}→${uv[2 * j].toFixed(0)},${uv[2 * j + 1].toFixed(0)} chart ${cuv[2 * i].toFixed(0)},${cuv[2 * i + 1].toFixed(0)}→${cuv[2 * j].toFixed(0)},${cuv[2 * j + 1].toFixed(0)} pos ${getPos(i).map((x) => x.toFixed(0))}→${getPos(j).map((x) => x.toFixed(0))} ring ${ringOf[i]},${ringOf[j]}`,
      );
    }
    warnings.push(
      `debug: strain p90/max by panel: ${rows
        .slice(0, 10)
        .map(([k, a, b]) => `${k} ${(a * 100).toFixed(0)}/${(b * 100).toFixed(0)}`)
        .join(' · ')}`,
    );
  }
  const p99 = sorted.length ? sorted[Math.floor(0.99 * (sorted.length - 1))] : 0;
  const smax = sorted.length ? sorted[sorted.length - 1] : 0;
  let nan = 0;
  for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) nan++;

  /** Length mismatch the seam must absorb (a partial seam's short side lies on part of the long one). */
  const easeOf = (w: Work) => {
    const a = w.A.len * (w.aRange[1] - w.aRange[0]);
    const b = w.B.len * (w.bRange[1] - w.bRange[0]);
    return Math.abs(a - b) / Math.max(a, b, 1e-9);
  };
  const seams: DollSeamReport[] = [];
  const contradictions: string[] = [];
  const closureReps: DollClosureReport[] = [];
  // L4 closures drawn overlapped: how close the centre-front lines are, how far the edges cross.
  for (const w of works) {
    const ov = w.overlap;
    if (!ov) continue;
    const ti = (w as Work & { tieIdx?: number }).tieIdx ?? -1;
    const T = ties[ti];
    const gaps: number[] = [];
    if (T) for (let q = 0; q < T.ia.length / 3; q++) gaps.push(Math.hypot(...tieGap(pos, T, q)));
    gaps.sort((x, y) => x - y);
    ov.cfGapP95Mm = gaps.length ? gaps[Math.floor(0.95 * (gaps.length - 1))] : NaN;
    // The two closure edges: mean distance between paired points (≈ offTop + offUnder).
    const At = ov.top === pk(w.a[0]) ? w.A : w.B;
    const Au = At === w.A ? w.B : w.A;
    const dd: number[] = [];
    const d3 = (a: number, b: number) =>
      Math.hypot(
        pos[3 * a] - pos[3 * b],
        pos[3 * a + 1] - pos[3 * b + 1],
        pos[3 * a + 2] - pos[3 * b + 2],
      );
    const same =
      d3(At.v[0], Au.v[0]) + d3(At.v[At.v.length - 1], Au.v[Au.v.length - 1]) <=
      d3(At.v[0], Au.v[Au.v.length - 1]) + d3(At.v[At.v.length - 1], Au.v[0]);
    for (let k = 2; k <= 18; k++) {
      const f = k / 20;
      const ia = At.v[Math.min(At.v.length - 1, Math.round(f * (At.v.length - 1)))];
      const ib =
        Au.v[Math.min(Au.v.length - 1, Math.round((same ? f : 1 - f) * (Au.v.length - 1)))];
      dd.push(d3(ia, ib));
    }
    ov.overlapMm = dd.length ? dd.reduce((x, y) => x + y, 0) / dd.length : NaN;
    const ci = (w as Work & { contactIdx?: number }).contactIdx ?? -1;
    const C = ci >= 0 ? contacts[ci] : undefined;
    if (C) {
      let out = 0;
      for (let q = 0; q < C.i.length; q++) {
        const i = C.i[q];
        const j = C.j[q];
        let nx = pos[3 * j];
        let nz = pos[3 * j + 2];
        const nl = Math.hypot(nx, nz) || 1;
        nx /= nl;
        nz /= nl;
        if ((pos[3 * i] - pos[3 * j]) * nx + (pos[3 * i + 2] - pos[3 * j + 2]) * nz >= -1) out++;
      }
      ov.outsidePct = (100 * out) / Math.max(1, C.i.length);
    }
    const expect = ov.offTopMm + ov.offUnderMm;
    ov.ok =
      ov.cfGapP95Mm <= 4 &&
      Math.abs(ov.overlapMm - expect) <= Math.max(8, 0.35 * expect) &&
      (Number.isNaN(ov.outsidePct) || ov.outsidePct >= 90);
    closureReps.push(ov);
  }
  for (const w of works) {
    if (w.rejectedByPerson) continue;
    const m = measure(w);
    const sp = seamStretch(w, st, SF) * 100;
    // Twist: the other direction would fit the solved shape much better.
    const alt = seamRows(w.A, w.B, !w.same, w.aRange, w.bRange);
    const ag = rowGaps(pos, alt);
    const altMean = ag.reduce((x, y) => x + y, 0) / Math.max(1, ag.length);
    const twisted = w.origin === 'graph' && !w.closure && m.mean > 5 && altMean < 0.5 * m.mean;
    const lenA = w.A.len;
    const lenB = w.B.len;
    let state: DollSeamState;
    if (w.overlap) state = w.overlap.ok ? 'closed' : 'open';
    else if (w.released || w.virtual) state = 'open';
    else if (w.origin === 'doll-proposed' || w.fromOrder) state = 'proposed';
    else if (twisted) state = 'twisted';
    // Open = a stretch of the seam stays apart (p95), not one corner point that lags.
    else if (m.p95 > 4 || m.max > 15) state = 'open';
    else if (sp > 3 && !(easeOf(w) > 0.03 && sp <= easeOf(w) * 100 + 2)) state = 'stretched';
    else if (easeOf(w) > 0.015) state = 'eased';
    else state = 'closed';
    let note = w.note;
    if (!note) {
      if (state === 'closed')
        note =
          w.kind === 'partial' || Math.abs(lenA - lenB) > 0.03 * Math.max(lenA, lenB)
            ? `closed · partial: ${Math.min(lenA, lenB).toFixed(0)} mm onto ${Math.max(lenA, lenB).toFixed(0)} mm`
            : `closed · ${lenA.toFixed(0)} = ${lenB.toFixed(0)} mm`;
      else if (state === 'eased')
        note = `closed, eased ${(easeOf(w) * 100).toFixed(0)} % · ${lenA.toFixed(0)} vs ${lenB.toFixed(0)} mm${sp > 3 ? ' — paper cannot gather, so the ease shows as stretch' : ''}`;
      else if (state === 'stretched')
        note = `closes only if the paper stretches ${sp.toFixed(0)} % — a wrong edge or missing ease`;
      else if (state === 'open')
        note = `left open ${m.max.toFixed(0)} mm · lengths ${lenA.toFixed(0)} vs ${lenB.toFixed(0)} mm`;
      else note = `twisted — ends crossed; sewn the other way round?`;
      if (w.kind === 'partial' && state !== 'closed')
        note += ` · partial (${Math.min(lenA, lenB).toFixed(0)} onto ${Math.max(lenA, lenB).toFixed(0)} mm)`;
    } else if (w.origin === 'doll-proposed' || w.fromOrder)
      note += ` · gap after solving ${m.max.toFixed(0)} mm`;
    if (w.overlap) {
      const o = w.overlap;
      note = `closure, buttoned: ${o.top} over ${o.under} · ${o.how} · centre-front lines meet within ${o.cfGapP95Mm.toFixed(1)} mm (p95) · the edges cross ${o.overlapMm.toFixed(0)} mm (expected ${(o.offTopMm + o.offUnderMm).toFixed(0)}) · ${Number.isNaN(o.outsidePct) ? 'no overlap zone' : `${o.outsidePct.toFixed(0)} % of the top's overlap outside`}`;
    }
    // L4: a confirmed seam that does not close is a contradiction — said, never dropped.
    if (w.confirmed && !w.overlap) {
      if (state === 'open' || state === 'twisted') {
        const words = `${w.id}: confirmed by a person but it does not close — ${state}, gap p95 ${m.p95.toFixed(0)} / max ${m.max.toFixed(0)} mm, strain ${sp.toFixed(0)} %, lengths ${lenA.toFixed(0)} vs ${lenB.toFixed(0)} mm: the row contradicts the pattern (or the rest of the rows)`;
        contradictions.push(words);
        note = `CONTRADICTION — ${words}`;
      } else note = `confirmed by a person · ${note}`;
    } else if (w.confirmed && w.overlap) note = `confirmed by a person · ${note}`;
    seams.push({
      id: w.id,
      a: w.a,
      b: w.b,
      kind: w.fromOrder ? 'from-order' : w.kind,
      origin: w.fromOrder ? 'doll-proposed' : w.origin,
      lenA,
      lenB,
      residualMeanMm: m.mean,
      residualMaxMm: m.max,
      residualP95Mm: m.p95,
      stretchPct: sp,
      twisted,
      state,
      released: w.released,
      note,
      pathA: Uint32Array.from(w.A.v),
      pathB: Uint32Array.from(w.B.v),
      ...(l4
        ? {
            decidedBy: w.confirmed
              ? ('person' as const)
              : w.origin === 'graph' && !w.fromOrder
                ? ('engine' as const)
                : ('doll' as const),
          }
        : {}),
    });
  }
  // A contradiction next to a confirmed seam stretched > 20 % on the same pieces: that seam is the
  // likely culprit (it pulls the pieces away from where the contradicted seam wants them).
  if (l4) {
    const piecesOf = (s: { a: string[]; b: string[] }) => new Set([...s.a, ...s.b].map(pk));
    const pulled = seams.filter(
      (s) => s.decidedBy === 'person' && s.state === 'stretched' && s.stretchPct > 20,
    );
    for (const s of seams) {
      if (!s.note.startsWith('CONTRADICTION — ')) continue;
      const P = piecesOf(s);
      const c = pulled.find((x) => x !== s && [...piecesOf(x)].some((k) => P.has(k)));
      if (!c) continue;
      const add = ` · most likely culprit: the confirmed seam ${c.id} closes only by stretching ${c.stretchPct.toFixed(0)} % and pulls ${[...piecesOf(c)].join(' and ')} together`;
      const i = contradictions.findIndex((w) => s.note.endsWith(w));
      if (i >= 0) contradictions[i] += add;
      s.note += add;
    }
  }
  for (const s of G.layerSeams)
    seams.push({
      id: `${s.a}~${s.b}`,
      a: edgeIdsOf(s.a),
      b: edgeIdsOf(s.b),
      kind: s.kind,
      origin: 'layer',
      lenA: s.evidence.aLenMm ?? 0,
      lenB: s.evidence.bLenMm ?? 0,
      residualMeanMm: 0,
      residualMaxMm: 0,
      residualP95Mm: 0,
      stretchPct: 0,
      twisted: false,
      state: 'closed',
      note: 'layer seam — the layers are drawn as one piece',
      pathA: new Uint32Array(0),
      pathB: new Uint32Array(0),
    });

  for (const { s: sm, note } of suspects)
    seams.push({
      id: `${sm.seam.a}~${sm.seam.b}`,
      a: sm.a,
      b: sm.b,
      kind: sm.seam.kind,
      origin: 'graph',
      lenA: sm.seam.evidence.aLenMm ?? 0,
      lenB: sm.seam.evidence.bLenMm ?? 0,
      residualMeanMm: 0,
      residualMaxMm: 0,
      residualP95Mm: 0,
      stretchPct: 0,
      twisted: false,
      state: 'open',
      released: true,
      note,
      pathA: new Uint32Array(0),
      pathB: new Uint32Array(0),
    });
  // Free edges facing each other (a seam the pattern has not got): reported open, never solved.
  const freeAll = panels
    .filter((P) => P.group !== 'FLOAT')
    .flatMap((P) =>
      freeEdges(P)
        .filter((e) => e.lenMm >= 60)
        .map((e) => ({ P, e })),
    );
  const taken = new Set<string>();
  for (let i = 0; i < freeAll.length; i++)
    for (let j = i + 1; j < freeAll.length; j++) {
      const x = freeAll[i];
      const y = freeAll[j];
      if (x.P === y.P || x.P.group !== y.P.group || taken.has(x.e.id) || taken.has(y.e.id))
        continue;
      if (Math.abs(x.e.lenMm - y.e.lenMm) / Math.max(x.e.lenMm, y.e.lenMm) > 0.08) continue;
      const A = pathOf([x.e.id]);
      const B = pathOf([y.e.id]);
      if (!A || !B) continue;
      const gap = Math.min(
        meanDist(A, B, false, [0, 1], [0, 1]),
        meanDist(A, B, true, [0, 1], [0, 1]),
      );
      if (gap > 40) continue;
      taken.add(x.e.id);
      taken.add(y.e.id);
      seams.push({
        id: `${x.e.id}~${y.e.id}`,
        a: [x.e.id],
        b: [y.e.id],
        kind: 'facing-free',
        origin: 'doll-proposed',
        lenA: A.len,
        lenB: B.len,
        residualMeanMm: gap,
        residualMaxMm: gap,
        residualP95Mm: gap,
        stretchPct: 0,
        twisted: false,
        state: 'open',
        note: `open — ${x.e.id} (${x.e.lenMm.toFixed(0)} mm) and ${y.e.id} (${y.e.lenMm.toFixed(0)} mm) lie ${gap.toFixed(0)} mm apart, free, about equal: a seam the pattern has not got?`,
        pathA: Uint32Array.from(A.v),
        pathB: Uint32Array.from(B.v),
      });
    }

  // Loops for the report.
  const loopsOut: DollLoop[] = [];
  const labelOf = (l: RawLoop) =>
    l === neckLoop
      ? 'neck'
      : l === hemLoop
        ? 'hem'
        : l === armLoop.L
          ? 'armhole-L'
          : l === armLoop.R
            ? 'armhole-R'
            : 'other';
  for (const l of bodyLoops)
    loopsOut.push({
      group: 'BODY',
      label: labelOf(l),
      lenMm: l.len,
      closed: l.closed,
      path: Uint32Array.from(l.verts),
    });

  for (const p of proposals) if (!p.ok) void p;
  const positions = new Float32Array(3 * N);
  for (let i = 0; i < 3 * N; i++) positions[i] = Number.isFinite(pos[i]) ? pos[i] : 0;
  const outPanels = panels.map((P) => {
    const tris = new Uint32Array(P.mesh.tris.length);
    for (let t = 0; t < tris.length; t += 3) {
      tris[t] = P.mesh.tris[t];
      const flip = P.mirrored !== faceFlip.has(P.idx);
      tris[t + 1] = flip ? P.mesh.tris[t + 2] : P.mesh.tris[t + 1];
      tris[t + 2] = flip ? P.mesh.tris[t + 1] : P.mesh.tris[t + 2];
    }
    const uvf = new Float32Array(2 * P.count);
    for (let i = 0; i < 2 * P.count; i++) uvf[i] = uv[2 * P.offset + i];
    return {
      pieceKey: P.key,
      instance: 0 as const,
      mirrored: P.mirrored,
      group: P.group,
      offset: P.offset,
      count: P.count,
      tris,
      uv: uvf,
      boundary: Uint32Array.from(P.mesh.bVert),
      layers: P.layers,
    };
  });
  // Pieces that end up in no closed/proposed seam at all are floating too.
  for (const P of panels) {
    if (P.group === 'FLOAT') continue;
    const any = seams.some(
      (s) =>
        s.state !== 'open' &&
        s.origin !== 'layer' &&
        [...s.a, ...s.b].some((id) => pk(id) === P.key),
    );
    if (!any)
      floating.push({
        pieceKey: P.key,
        reason: plyWords(P) ?? 'in its group but no seam of it closed or was proposed',
      });
  }
  // Collar units: gaps after solving; a fall's outer edge vs the stand top it hangs from, and how
  // much of it stays outside the stand's surface.
  if (opt.debug)
    for (const cp of collarPlans) {
      const ys: number[] = [];
      const rs: number[] = [];
      for (const P of cp.unit)
        for (let i = 0; i < P.count; i++) {
          const q = inFrame(F, getPos(P.offset + i));
          ys.push(q.h);
          rs.push(q.r);
        }
      ys.sort((x, y) => x - y);
      rs.sort((x, y) => x - y);
      const pc = (a: number[], f: number) => a[Math.floor(f * (a.length - 1))]?.toFixed(0);
      warnings.push(
        `debug: unit ${cp.rep.keys.join('+')} (${cp.rep.role}) height above the neck axis p5/p50/p95 ${pc(ys, 0.05)}/${pc(ys, 0.5)}/${pc(ys, 0.95)} · radius ${pc(rs, 0.05)}/${pc(rs, 0.5)}/${pc(rs, 0.95)}`,
      );
    }
  for (const cp of collarPlans) {
    if (cp.fold && cp.outer) {
      const meanY = (vs: number[]) =>
        vs.reduce((t, v) => t + pos[3 * v + 1], 0) / Math.max(1, vs.length);
      cp.rep.outerYMm = meanY(cp.outer);
      cp.rep.baseYMm = meanY(cp.fold.line);
      cp.rep.outsidePct = outsideShare(cp.fold.fall, cp.fold.stand);
    }
    if (opt.debug && cp.work) {
      const w = cp.work;
      const g = rowGaps(pos, w.rows);
      const nA = w.rows.v.length - [...w.rows.v].filter((v) => !w.A.v.includes(v)).length;
      const bins = new Array(10).fill(0);
      const cnt = new Array(10).fill(0);
      for (let q = 0; q < nA; q++) {
        const k = [...w.A.v].indexOf(w.rows.v[q]);
        const b = Math.min(9, Math.floor((10 * w.A.s[k]) / Math.max(1, w.A.len)));
        bins[b] = Math.max(bins[b], g[q]);
        cnt[b]++;
      }
      const len3 = (P: Path) => {
        let t = 0;
        for (let k = 1; k < P.v.length; k++)
          t += Math.hypot(...sub(getPos(P.v[k]), getPos(P.v[k - 1])));
        return t;
      };
      const jumps: string[] = [];
      for (let k = 1; k < w.B.v.length; k++) {
        const d3 = Math.hypot(...sub(getPos(w.B.v[k]), getPos(w.B.v[k - 1])));
        const dr = w.B.s[k] - w.B.s[k - 1];
        if (d3 - dr > 8)
          jumps.push(
            `${panels[panelOf[w.B.v[k - 1]]].key}→${panels[panelOf[w.B.v[k]]].key} rest ${dr.toFixed(0)} 3D ${d3.toFixed(0)}`,
          );
      }
      if (jumps.length) warnings.push(`debug: ${w.id} base jumps: ${jumps.join(' · ')}`);
      warnings.push(
        `debug: ${w.id} gaps along the unit (10 bins, max mm): ${bins.map((x, i) => (cnt[i] ? x.toFixed(0) : '·')).join(' ')} · A rest ${w.A.len.toFixed(0)} 3D ${len3(w.A).toFixed(0)} · B rest ${w.B.len.toFixed(0)} 3D ${len3(w.B).toFixed(0)}`,
      );
    }
    if (cp.standTop && cp.outer && cp.stand && cp.topRange) {
      const meanY = (vs: number[]) =>
        vs.reduce((t, v) => t + pos[3 * v + 1], 0) / Math.max(1, vs.length);
      const Pt = restPath(cctx, cp.standTop);
      const onRange = cp.standTop.filter(
        (_, k) => Pt.s[k] >= cp.topRange![0] - 1 && Pt.s[k] <= cp.topRange![1] + 1,
      );
      cp.rep.outerYMm = meanY(cp.outer);
      cp.rep.baseYMm = meanY(onRange.length ? onRange : cp.standTop);
      const sv: number[] = [];
      for (const P of cp.stand) for (let i = 0; i < P.count; i++) sv.push(P.offset + i);
      // The sewn neck edge lies ON the stand top (within the seam's gap): not counted.
      const sewn = new Set(cp.attach ?? []);
      const fv: number[] = [];
      for (const P of cp.unit)
        for (let i = 0; i < P.count; i++) if (!sewn.has(P.offset + i)) fv.push(P.offset + i);
      cp.rep.outsidePct = outsideShare(fv, sv);
    }
    collarRep.units.push(cp.rep);
  }
  const tris = panels.reduce((t, P) => t + P.mesh.tris.length / 3, 0);
  return {
    collar: collarRep,
    panels: outPanels,
    positions,
    seams,
    loops: loopsOut,
    floating,
    skipped: G.skipped,
    proxies: proxyReport,
    stats: {
      vertices: N,
      triangles: tris,
      passes,
      ms: now() - t0,
      msMesh,
      msSolve,
      converged,
      nan,
      stretchP99Pct: p99 * 100,
      stretchMaxPct: smax * 100,
    },
    warnings,
    orderJoins,
    orderSurface,
    honesty: HONESTY,
    ...(l4
      ? {
          contradictions: [...preContradictions, ...contradictions],
          closures: closureReps,
          rows: {
            applied: resolvedRows?.applied.length ?? 0,
            confirmed: resolvedRows?.forced.length ?? 0,
            rejected: excludedPairs.length,
            closures: resolvedRows?.closures.length ?? 0,
            words: [
              ...(resolvedRows?.stale ?? []).map((x) => x.words),
              ...(resolvedRows?.orphan ?? []).map((x) => x.words),
            ],
          },
        }
      : {}),
  };
}

export type { SeamCandidate, PieceGeom };
