// Edge roles (§5.2): which edge of a piece is the neckline, shoulder, armhole, side, hem, CF … read
// from four cheap signals, strongest first:
//   1. the seam partner's piece kind (an edge sewn to a sleeve is an armhole, to a placket a CF);
//   2. position and shape in the upright piece (bottom-most run = hem; the straight slanted top
//      edge = shoulder; edges on its high end = neckline, on its low end = armhole);
//   3. the piece kind from its name (roles.json — the same book the assembly skeleton reads);
//   4. the twin / layer structure (a back sewn to its mirror twin along a vertical = CB).
// Every reading carries a confidence and the reason in words. A piece whose name says nothing
// gets `unknown` on every edge: the POMs that need it say «not found» instead of guessing.

import type { Edge, EdgeId, PieceGeom } from 'lib/assembly-skeleton/types';
import { bboxOf, chordTilt, dist, first, last, meanY, mirrorErrorMm, type BBox } from './geom';
import { partnersOf, type Model, type Partner } from './model';
import { BODY_TOP, LEG, STRIP } from './pieces';
import type { EdgeRole, PieceInfo, PieceKind, RoleReading } from './types';

type Feat = {
  e: Edge;
  bb: BBox;
  vmid: number;
  ymaxN: number;
  tilt: number;
  straight: boolean;
  longV: boolean;
  bottom: boolean;
  partners: { p: Partner; kind: PieceKind; info: PieceInfo }[];
};

const SYM_MM = 6;

function feats(model: Model, g: PieceGeom): Feat[] {
  const bb = bboxOf(g.rs);
  const h = Math.max(1, bb.h);
  return g.edges.map((e) => {
    const ys = e.pts.map((p) => p[1]);
    const tilt = chordTilt(e);
    const straightness = e.chordMm / Math.max(1, e.lenMm);
    const longV = tilt >= 55 && e.lenMm >= 0.3 * h && straightness >= 0.9;
    const ymaxN = (Math.max(...ys) - bb.y0) / h;
    const partners = partnersOf(model, e.id)
      .filter((p) => p.piece !== g.pieceKey || p.edge !== e.id)
      .map((p) => {
        const info = model.info.get(p.piece);
        return info ? { p, kind: info.kind, info } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
    return {
      e,
      bb,
      vmid: (meanY(e.pts) - bb.y0) / h,
      ymaxN,
      tilt,
      straight: straightness >= 0.985,
      longV,
      bottom: !longV && ymaxN <= 0.15,
      partners,
    };
  });
}

const R = (role: EdgeRole, confidence: number, why: string): RoleReading => ({
  role,
  confidence: Math.round(confidence * 100) / 100,
  why,
});

const groupOf = (k: PieceKind): 'front' | 'back' | 'side' | null =>
  k === 'front' ? 'front' : k === 'back' || k === 'yoke' ? 'back' : k === 'side' ? 'side' : null;

const partnerWord = (f: Feat, kinds: ReadonlySet<PieceKind> | ((k: PieceKind) => boolean)) =>
  f.partners.find((x) => (typeof kinds === 'function' ? kinds(x.kind) : kinds.has(x.kind)));

const COLLARISH: ReadonlySet<PieceKind> = new Set(['collar', 'stand', 'hood', 'rib']);
const CF_PARTNER: ReadonlySet<PieceKind> = new Set(['placket', 'facing']);

// ── body panels of a top ──────────────────────────────────────────────────────────────────────

function classifyBodyTop(
  model: Model,
  g: PieceGeom,
  info: PieceInfo,
  out: Map<EdgeId, RoleReading>,
) {
  const fs = feats(model, g);
  const kind = info.kind;
  const grp = groupOf(kind);
  const symmetric = !info.hand && mirrorErrorMm(g) <= SYM_MM;
  const garmentHasYoke = [...model.info.values()].some((p) => p.kind === 'yoke' && !p.lining);

  // 1. long straight verticals: CF / CB / side / panel.
  for (const f of fs) {
    if (!f.longV) continue;
    const id = f.e.id;
    if (kind === 'yoke') {
      out.set(id, R('armhole', 0.7, 'yoke: the short side edge is part of the armhole'));
      continue;
    }
    const closure = f.partners.find((x) => x.p.seam.kind === 'closure-not-seam');
    const cfPart = partnerWord(f, CF_PARTNER);
    if (kind === 'front' && (closure || cfPart)) {
      out.set(
        id,
        R(
          'cf',
          0.9,
          closure
            ? `closure with ${closure.p.piece}`
            : `sewn to the ${cfPart!.kind} ${cfPart!.p.piece}`,
        ),
      );
      continue;
    }
    const body = f.partners.filter((x) => groupOf(x.kind) && x.p.seam.kind !== 'closure-not-seam');
    const other = body.find((x) => groupOf(x.kind) !== grp);
    if (other) {
      out.set(id, R('side', 0.85, `sewn to the ${other.kind} panel ${other.p.piece}`));
      continue;
    }
    const same = body.find((x) => groupOf(x.kind) === grp);
    if (same) {
      const mirrorTwin =
        g.twinOf.some((t) => t.key === same.p.piece && t.kind === 'mirror') &&
        info.hand &&
        same.info.hand &&
        info.hand !== same.info.hand;
      if (mirrorTwin && kind === 'back')
        out.set(id, R('cb', 0.85, `sewn to its mirror twin ${same.p.piece}`));
      else if (mirrorTwin && kind === 'front')
        out.set(id, R('cf', 0.8, `CF seam to its mirror twin ${same.p.piece}`));
      else out.set(id, R('panel', 0.85, `sewn to the ${same.kind} panel ${same.p.piece}`));
      continue;
    }
    // Unpaired.
    if (kind === 'front') {
      if (info.hand) out.set(id, R('cf', 0.7, 'unsewn long vertical of a front'));
      else if (symmetric)
        out.set(id, R('side', 0.6, 'symmetric full front: an unsewn vertical is a side'));
      else
        out.set(id, R('cf', 0.55, 'front without a hand: the unsewn vertical read as CF (fold?)'));
    } else if (kind === 'back') {
      if (symmetric)
        out.set(id, R('side', 0.6, 'symmetric full back: an unsewn vertical is a side'));
      else out.set(id, R('cb', 0.6, 'unsewn long vertical of a back half: CB or fold'));
    } else out.set(id, R('side', 0.6, 'side panel: unsewn vertical'));
  }

  // 2. bottom run: hem, or the yoke seam of a yoke.
  for (const f of fs) {
    if (!f.bottom || out.has(f.e.id)) continue;
    if (kind === 'yoke') {
      out.set(f.e.id, R('yoke-seam', 0.8, 'bottom edge of a yoke'));
      continue;
    }
    const band = partnerWord(f, new Set<PieceKind>(['hemband', 'rib']));
    // A bottom edge sewn to the TOP of another body panel is a yoke seam; sewn to another bottom
    // edge it is the graph pairing two hems — still a hem.
    const body = f.partners.find((x) => {
      if (!groupOf(x.kind)) return false;
      const pg = model.geoms.get(x.p.piece);
      const pe = model.edges.get(x.p.edge);
      if (!pg || !pe) return false;
      const bb = bboxOf(pg.rs);
      return (meanY(pe.pts) - bb.y0) / Math.max(1, bb.h) >= 0.5;
    });
    if (band) out.set(f.e.id, R('hem', 0.9, `sewn to the ${band.kind} ${band.p.piece}`));
    else if (body)
      out.set(f.e.id, R('yoke-seam', 0.6, `bottom edge sewn to the ${body.kind} ${body.p.piece}`));
    else out.set(f.e.id, R('hem', 0.8, 'bottom-most run of the panel, unsewn'));
  }

  // 3. top runs, in contour order.
  const isTop = (f: Feat) => !out.has(f.e.id) && f.vmid >= 0.45;
  const runs: Feat[][] = [];
  const n = fs.length;
  const startAt = fs.findIndex((f) => !isTop(f));
  if (startAt < 0) runs.push(fs.slice());
  else {
    let cur: Feat[] = [];
    for (let j = 1; j <= n; j++) {
      const f = fs[(startAt + j) % n];
      if (isTop(f)) cur.push(f);
      else if (cur.length) {
        runs.push(cur);
        cur = [];
      }
    }
    if (cur.length) runs.push(cur);
  }
  for (const run of runs) classifyTopRun(run, info, kind, grp, garmentHasYoke, fs, out);

  // 4. what is left (short edges low on the piece): by partner, else unknown.
  for (const f of fs) {
    if (out.has(f.e.id)) continue;
    const sl = partnerWord(f, new Set<PieceKind>(['sleeve']));
    if (sl) out.set(f.e.id, R('armhole', 0.75, `sewn to the sleeve ${sl.p.piece}`));
    else out.set(f.e.id, R('unknown', 0.3, 'short edge low on the panel — no rule reads it'));
  }
}

function classifyTopRun(
  run: Feat[],
  info: PieceInfo,
  kind: PieceKind,
  grp: 'front' | 'back' | 'side' | null,
  garmentHasYoke: boolean,
  all: Feat[],
  out: Map<EdgeId, RoleReading>,
) {
  const strong = new Map<EdgeId, RoleReading>();
  for (const f of run) {
    const sl = partnerWord(f, new Set<PieceKind>(['sleeve']));
    const col = partnerWord(f, COLLARISH);
    const yoke = partnerWord(f, new Set<PieceKind>(['yoke']));
    const opp = f.partners.find(
      (x) => groupOf(x.kind) && groupOf(x.kind) !== grp && x.kind !== 'side',
    );
    if (sl) strong.set(f.e.id, R('armhole', 0.9, `sewn to the sleeve ${sl.p.piece}`));
    else if (col) strong.set(f.e.id, R('neckline', 0.9, `sewn to the ${col.kind} ${col.p.piece}`));
    else if (yoke && kind === 'back')
      strong.set(f.e.id, R('yoke-seam', 0.85, `sewn to the yoke ${yoke.p.piece}`));
    else if (
      (yoke || opp) &&
      f.straight &&
      f.tilt >= 3 &&
      f.tilt <= 50 &&
      f.e.lenMm >= 40 &&
      f.ymaxN >= 0.8
    )
      strong.set(
        f.e.id,
        R(
          'shoulder',
          0.85,
          `straight top edge sewn to the ${(yoke ?? opp)!.kind} ${(yoke ?? opp)!.p.piece}`,
        ),
      );
  }
  let shoulders = run.filter((f) => strong.get(f.e.id)?.role === 'shoulder');
  // A full piece (no hand) has two shoulders; a half has one. A partner found only one of them
  // when the other one's seam went to an identical layer (yoke + yoke facing).
  const wantTwo = !info.hand && kind !== 'side';
  if (shoulders.length === 1 && wantTwo) {
    const s0 = shoulders[0];
    const mid = (s0.bb.x0 + s0.bb.x1) / 2;
    const sx = (s0.e.pts[0][0] + last(s0.e)[0]) / 2;
    const twin = run.find(
      (f) =>
        f !== s0 &&
        !strong.has(f.e.id) &&
        f.straight &&
        Math.abs(f.e.lenMm - s0.e.lenMm) <= 3 &&
        Math.abs(f.tilt - s0.tilt) <= 3 &&
        Math.sign((f.e.pts[0][0] + last(f.e)[0]) / 2 - mid) !== Math.sign(sx - mid),
    );
    if (twin) {
      strong.set(
        twin.e.id,
        R('shoulder', 0.8, `mirror of shoulder ${s0.e.id} on the other side of the piece`),
      );
      shoulders = [s0, twin];
    }
  }
  if (!shoulders.length && kind !== 'side') {
    // Shape: straight, gently slanted, high, shoulder-length.
    const cands = run
      .filter(
        (f) =>
          !strong.has(f.e.id) &&
          f.straight &&
          f.tilt >= 3 &&
          f.tilt <= 45 &&
          f.e.lenMm >= 50 &&
          f.e.lenMm <= 260 &&
          f.ymaxN >= 0.85,
      )
      .sort((a, b) => b.vmid - a.vmid);
    const pick: Feat[] = [];
    for (const c of cands) {
      if (pick.length >= 2) break;
      const cx = (c.e.pts[0][0] + last(c.e)[0]) / 2;
      const mid = (c.bb.x0 + c.bb.x1) / 2;
      if (pick.length === 1) {
        const px = (pick[0].e.pts[0][0] + last(pick[0].e)[0]) / 2;
        if (Math.sign(px - mid) === Math.sign(cx - mid)) continue;
      }
      pick.push(c);
    }
    for (const c of pick)
      strong.set(c.e.id, R('shoulder', 0.65, 'straight, gently slanted top edge (shape)'));
    shoulders = pick;
  }
  for (const [id, r] of strong) out.set(id, r);

  if (shoulders.length) {
    // From each shoulder: edges on its high (HPS) end are neckline, on its low end armhole.
    const idx = (f: Feat) => run.indexOf(f);
    for (const s of shoulders) {
      // A contour is CCW and a run is contiguous: the start of `s` meets the edge before it.
      const hpsIsStart = first(s.e)[1] >= last(s.e)[1];
      const i = idx(s);
      const towardPrevIsHps = hpsIsStart;
      const walk = (step: -1 | 1, role: EdgeRole) => {
        for (let j = i + step; j >= 0 && j < run.length; j += step) {
          const f = run[j];
          if (shoulders.includes(f)) break;
          const st = strong.get(f.e.id);
          if (st && st.role !== role && role === 'neckline' && shoulders.length === 2) {
            // Between the two shoulders of a full piece there is only neckline: a seam the graph
            // drew to a sleeve there is the graph's mistake, not an armhole.
            out.set(
              f.e.id,
              R(
                'neckline',
                0.65,
                `between the two shoulders (the graph's ${st.role} reading — ${st.why} — overruled)`,
              ),
            );
            continue;
          }
          if (st) continue;
          const conf = 0.75;
          out.set(
            f.e.id,
            R(
              role,
              f.e.lenMm < 20 ? 0.6 : conf,
              `on the ${role === 'neckline' ? 'high (HPS)' : 'low (shoulder point)'} end of shoulder ${s.e.id}`,
            ),
          );
        }
      };
      walk(towardPrevIsHps ? -1 : 1, 'neckline');
      walk(towardPrevIsHps ? 1 : -1, 'armhole');
    }
    return;
  }
  // No shoulder in the run.
  const free = run.filter((f) => !out.has(f.e.id));
  if (!free.length) return;
  if (kind === 'side') {
    for (const f of free) out.set(f.e.id, R('armhole', 0.65, 'top of a side panel'));
    return;
  }
  if (kind === 'back' && garmentHasYoke) {
    const seam = free.filter((f) => f.tilt <= 35).sort((a, b) => b.e.lenMm - a.e.lenMm)[0];
    for (const f of free) {
      if (f === seam) out.set(f.e.id, R('yoke-seam', 0.7, 'top edge of a back under a yoke'));
      else out.set(f.e.id, R('armhole', 0.65, 'top side edge of a back under a yoke'));
    }
    return;
  }
  // A body panel that does not reach the shoulder: its top is armhole, unless it is the centre
  // panel (has a CF/CB edge next to the run), where a concave edge next to the centre is neckline.
  const centreIds = new Set(
    all.filter((f) => ['cf', 'cb'].includes(out.get(f.e.id)?.role ?? '')).map((f) => f.e.id),
  );
  for (const f of free) {
    const k = all.indexOf(f);
    const nb = [all[(k + 1) % all.length], all[(k - 1 + all.length) % all.length]];
    const nearCentre = nb.some((x) => centreIds.has(x.e.id));
    if (nearCentre && f.e.turnDeg < -30)
      out.set(f.e.id, R('neckline', 0.55, 'concave top edge next to the centre line'));
    else
      out.set(
        f.e.id,
        R('armhole', centreIds.size ? 0.55 : 0.65, 'top of a panel without a shoulder'),
      );
  }
}

// ── sleeve ─────────────────────────────────────────────────────────────────────────────────

function classifySleeve(model: Model, g: PieceGeom, out: Map<EdgeId, RoleReading>) {
  for (const f of feats(model, g)) {
    const id = f.e.id;
    const sl = f.partners.find((x) => x.kind === 'sleeve' && x.p.piece !== g.pieceKey);
    if (f.longV) {
      if (sl) out.set(id, R('sleeve-seam', 0.85, `sewn to the sleeve panel ${sl.p.piece}`));
      else out.set(id, R('underarm', 0.75, 'long side of a one-piece sleeve'));
    } else if (f.bottom) {
      const cuff = partnerWord(f, new Set<PieceKind>(['cuff', 'rib']));
      out.set(
        id,
        cuff
          ? R('wrist', 0.9, `sewn to the ${cuff.kind} ${cuff.p.piece}`)
          : R('wrist', 0.8, 'bottom run of the sleeve'),
      );
    } else if (f.vmid >= 0.5) {
      const body = partnerWord(f, (k) => BODY_TOP.has(k));
      out.set(
        id,
        body
          ? R('cap', 0.9, `sewn to the ${body.kind} ${body.p.piece}`)
          : R('cap', f.e.turnDeg > 0 ? 0.85 : 0.7, 'top run of the sleeve'),
      );
    } else {
      out.set(id, R('vent', 0.65, 'short edge low on the sleeve (opening / vent)'));
    }
  }
}

// ── collar / stand ─────────────────────────────────────────────────────────────────────────

function classifyCollar(
  model: Model,
  g: PieceGeom,
  kind: PieceKind,
  out: Map<EdgeId, RoleReading>,
) {
  const fs = feats(model, g);
  const maxLen = Math.max(...fs.map((f) => f.e.lenMm));
  const long = fs.filter((f) => f.e.lenMm >= 0.5 * maxLen);
  for (const f of fs)
    if (!long.includes(f)) out.set(f.e.id, R('collar-end', 0.75, 'short end of the collar'));
  if (!long.length) return;
  const byHeight = [...long].sort((a, b) => a.vmid - b.vmid);
  const lower = byHeight[0];
  const upper = byHeight[byHeight.length - 1];
  const longest = [...long].sort((a, b) => b.e.lenMm - a.e.lenMm)[0];
  const neckRole: EdgeRole = kind === 'stand' ? 'stand-neck' : 'collar-neck';
  const topRole: EdgeRole = kind === 'stand' ? 'stand-top' : 'collar-outer';
  // Collar: the outer (fall) edge is the upper and the longer; stand: the neck edge is the lower
  // and the longer. When length agrees with position the reading is firmer.
  const agree = kind === 'stand' ? longest === lower : longest === upper;
  for (const f of long) {
    if (long.length > 2 && f !== lower && f !== upper) {
      out.set(f.e.id, R('collar-end', 0.6, 'a long edge between the neck and outer edges'));
      continue;
    }
    const isLower = f === lower;
    const body = partnerWord(f, (k) => BODY_TOP.has(k));
    const other = f.partners.find((x) =>
      kind === 'stand' ? x.kind === 'collar' : x.kind === 'stand',
    );
    const layer = f.partners.find((x) => x.kind === kind);
    if (body) out.set(f.e.id, R(neckRole, 0.9, `sewn to the ${body.kind} ${body.p.piece}`));
    else if (other)
      out.set(
        f.e.id,
        R(
          kind === 'stand' ? 'stand-top' : 'collar-neck',
          0.9,
          `sewn to the ${other.kind} ${other.p.piece}`,
        ),
      );
    else {
      const base = agree ? 0.8 : 0.65;
      const conf = layer && !isLower && kind === 'collar' ? 0.85 : base;
      out.set(
        f.e.id,
        R(
          isLower ? neckRole : topRole,
          conf,
          `${isLower ? 'lower' : 'upper'} long edge${agree ? ', and the length agrees' : ''}`,
        ),
      );
    }
  }
}

// ── strips: placket, cuff, waistband, facing … ───────────────────────────────────────────

function classifyStrip(model: Model, g: PieceGeom, kind: PieceKind, out: Map<EdgeId, RoleReading>) {
  const fs = feats(model, g);
  const maxLen = Math.max(...fs.map((f) => f.e.lenMm));
  for (const f of fs) {
    if (f.e.lenMm < 0.5 * maxLen) {
      out.set(f.e.id, R('strip-end', 0.75, `short end of the ${kind}`));
      continue;
    }
    const onto = f.partners.find((x) => x.kind !== kind && x.p.seam.kind !== 'closure-not-seam');
    if (onto)
      out.set(f.e.id, R('strip-attach', 0.85, `sewn onto the ${onto.kind} ${onto.p.piece}`));
    else out.set(f.e.id, R('strip-edge', 0.65, `free long edge of the ${kind}`));
  }
}

// ── legs (trousers) and skirt panels ───────────────────────────────────────────────────────

function classifyLeg(model: Model, g: PieceGeom, info: PieceInfo, out: Map<EdgeId, RoleReading>) {
  const fs = feats(model, g);
  const n = fs.length;
  for (const f of fs) {
    if (f.bottom)
      out.set(f.e.id, R(info.kind === 'skirt' ? 'hem' : 'leg-hem', 0.8, 'bottom run of the panel'));
    else if (!f.longV && f.ymaxN >= 0.97 && f.tilt <= 30) {
      const wb = partnerWord(f, new Set<PieceKind>(['waistband']));
      out.set(
        f.e.id,
        wb
          ? R('waist', 0.9, `sewn to the waistband ${wb.p.piece}`)
          : R('waist', 0.75, 'top edge of the panel'),
      );
    }
  }
  if (info.kind === 'skirt') {
    for (const f of fs)
      if (!out.has(f.e.id))
        out.set(f.e.id, R(f.longV ? 'side' : 'unknown', f.longV ? 0.6 : 0.3, 'skirt panel'));
    return;
  }
  // Rise: the concave curve high on the inner side; the crotch point is its lower end.
  const rise = fs
    .filter(
      (f) =>
        !out.has(f.e.id) && f.e.turnDeg < -20 && f.vmid >= 0.5 && f.vmid <= 0.97 && f.e.lenMm >= 80,
    )
    .sort((a, b) => a.e.turnDeg - b.e.turnDeg)[0];
  if (rise) {
    const fly = partnerWord(rise, new Set<PieceKind>(['fly']));
    out.set(
      rise.e.id,
      R(
        'rise',
        fly ? 0.85 : 0.7,
        fly ? `sewn to the fly ${fly.p.piece}` : 'concave curve high on the panel',
      ),
    );
    const crotch = first(rise.e)[1] <= last(rise.e)[1] ? first(rise.e) : last(rise.e);
    // Inseam: the long edge that starts at the crotch point; outseam: the other long one(s).
    const longs = fs.filter((f) => !out.has(f.e.id) && f.e.lenMm >= 0.3 * f.bb.h && f.tilt >= 50);
    const ins = longs.sort(
      (a, b) =>
        Math.min(dist(first(a.e), crotch), dist(last(a.e), crotch)) -
        Math.min(dist(first(b.e), crotch), dist(last(b.e), crotch)),
    )[0];
    for (const f of longs) {
      if (f === ins) out.set(f.e.id, R('inseam', 0.75, 'long edge from the crotch point down'));
      else out.set(f.e.id, R('outseam', 0.7, 'long edge on the outer side'));
    }
  }
  for (let k = 0; k < n; k++) {
    const f = fs[k];
    if (out.has(f.e.id)) continue;
    const nb = [fs[(k + 1) % n], fs[(k - 1 + n) % n]].map((x) => out.get(x.e.id)?.role);
    if (f.vmid > 0.5 && nb.includes('outseam') && nb.includes('waist'))
      out.set(f.e.id, R('outseam', 0.5, 'between the waist and the outseam (pocket opening?)'));
    else out.set(f.e.id, R('unknown', 0.3, 'no rule reads this leg edge'));
  }
}

// ── entry ──────────────────────────────────────────────────────────────────────────────────

/** Roles of every edge of every piece of `model` (its `roles` map is filled and returned). */
export function classifyEdges(model: Model): Map<EdgeId, RoleReading> {
  const out = new Map<EdgeId, RoleReading>();
  for (const g of model.geoms.values()) {
    const info = model.info.get(g.pieceKey);
    if (!info || !g.edges.length) continue;
    const k = info.kind;
    if (model.garment === 'top' && BODY_TOP.has(k)) classifyBodyTop(model, g, info, out);
    else if (LEG.has(k)) classifyLeg(model, g, info, out);
    else if (k === 'sleeve') classifySleeve(model, g, out);
    else if (k === 'collar' || k === 'stand') classifyCollar(model, g, k, out);
    else if (STRIP.has(k)) classifyStrip(model, g, k, out);
    else if (k === 'pocket')
      for (const e of g.edges) out.set(e.id, R('pocket-edge', 0.6, 'edge of a pocket piece'));
    else for (const e of g.edges) out.set(e.id, R('unknown', 0, info.why));
  }
  model.roles = out;
  return out;
}
