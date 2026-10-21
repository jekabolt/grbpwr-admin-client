// Probe entry — bundled by scripts/nest-fold-probe.mjs. A half on fold through the CARD's own
// path (parseSheets → orientToGrain → applySeamAllowance → nest), the way the worker runs it.
import type {
  NestConfig,
  NestResult,
  PieceDTO,
  PieceManifestFacts,
  Pt,
} from '../src/lib/nesting/types';
import { NEST_DEFAULTS, placedPoly } from '../src/lib/nesting/types';
import { parseSheets } from '../src/lib/nesting/worker/parse-files';
import { orientToGrain } from '../src/lib/nesting/geom/grain-orient';
import { applySeamAllowance } from '../src/lib/nesting/geom/seam-allowance';
import { foldUnitOf } from '../src/lib/nesting/geom/fold-unit';
import { area, bounds, signedArea } from '../src/lib/nesting/geom/polygon';
import { nest } from '../src/lib/nesting/nest';
import { renderLayoutSvg } from '../src/lib/nesting/render/svg';
import {
  sizeAreasFromParsed,
  type SizeAreasOutcome,
} from 'components/managers/tech-card/components/nesting/size-areas-from-dxf';
import type { common_TechCardMarker } from 'api/proto-http/admin';

export { parseSheets, orientToGrain, applySeamAllowance, nest, renderLayoutSvg, placedPoly };

export type FileRun = {
  pieces: {
    id: number;
    name: string;
    drawnAreaCm2: number;
    cutAreaCm2: number;
    foldUnit: boolean;
    foldRefused: string | null;
    poly: Pt[];
    inner: { layer: string; pts: Pt[] }[];
  }[];
  result: NestResult;
  placed: { pieceId: number; name: string; poly: Pt[]; inner: { layer: string; pts: Pt[] }[] }[];
  svg: string;
};

/** One file, the blocks whose name matches `blockRe`, on `layer`, `qty` of each. */
export async function runFile(
  bytes: ArrayBuffer,
  name: string,
  opts: {
    blockRe: string;
    layer: string;
    grainLayer: string;
    allowanceCm: number;
    qty: number;
    budgetMs: number;
    widthCm: number;
    crossGrain?: boolean;
  },
): Promise<FileRun> {
  const parsed = await parseSheets([{ name, open: async () => bytes }], {
    unit: 'auto',
    tol: NEST_DEFAULTS.tol,
    tolChain: NEST_DEFAULTS.tolChain,
  });
  const re = new RegExp(opts.blockRe, 'i');
  const picked = parsed.pieces.filter(
    (p) => (p.layer ?? '') === opts.layer && re.test(p.blockName || p.name),
  );
  const oriented = orientToGrain(picked, opts.grainLayer).pieces;
  const cut = applySeamAllowance(oriented, opts.allowanceCm).pieces;
  const config: NestConfig = {
    pieces: cut.map((p) => ({ pieceId: p.id, quantity: opts.qty })),
    fabricWidthCm: opts.widthCm,
    gapCm: NEST_DEFAULTS.gapCm,
    edgeMarginCm: 0,
    allowCrossGrain: !!opts.crossGrain,
    fabricDirection: 'any',
    grainLayer: opts.grainLayer,
    seamAllowanceCm: opts.allowanceCm,
    timeBudgetMs: opts.budgetMs,
    rdpEpsCm: NEST_DEFAULTS.rdpEpsCm,
  };
  const result = await nest(
    cut,
    config,
    () => false,
    () => {},
  );
  const byId = new Map(cut.map((p) => [p.id, p]));
  return {
    pieces: cut.map((p) => ({
      id: p.id,
      name: p.name,
      drawnAreaCm2: picked.find((q) => q.id === p.id)?.areaCm2 ?? 0,
      cutAreaCm2: p.areaCm2,
      foldUnit: p.fold?.kind === 'unit',
      foldRefused: p.fold?.kind === 'refused' ? p.fold.reason : null,
      poly: p.poly,
      inner: (p.inner ?? []).map((c) => ({ layer: c.layer, pts: c.pts })),
    })),
    result,
    placed: result.placements.map((pl) => {
      const p = byId.get(pl.pieceId)!;
      return {
        pieceId: pl.pieceId,
        name: p.name,
        poly: placedPoly(p.poly, pl),
        inner: (p.inner ?? []).map((c) => ({ layer: c.layer, pts: placedPoly(c.pts, pl) })),
      };
    }),
    svg: renderLayoutSvg(result, cut, opts.widthCm),
  };
}

// ── synthetic cases (asserts) ─────────────────────────────────────────────────────────────────

const FACTS: PieceManifestFacts = {
  techCardId: 1,
  identity: 'RUF',
  size: 'M',
  sizeId: 1,
  cardName: 'RUF',
  pairHand: null,
  pairOf: null,
  unfolded: false,
  halfFold: true,
  cutLayer: '1',
  seamLayer: '14',
  grainLayer: '7',
  cutAllowanceCm: 1,
};

let nextId = 1;
const P = (x: number, y: number): Pt => ({ x, y });
const seg = (layer: string, a: Pt, b: Pt) => ({ layer, closed: false, pts: [a, b] });
function mk(
  poly: Pt[],
  inner: { layer: string; closed: boolean; pts: Pt[] }[],
  manifest?: Partial<PieceManifestFacts> | null,
): PieceDTO {
  const ring = signedArea(poly) < 0 ? [...poly].reverse() : poly;
  const bb = bounds(ring);
  return {
    id: nextId++,
    name: `T${nextId - 1}`,
    blockName: `T${nextId - 1}`,
    layer: '1',
    source: 'synthetic',
    poly: ring,
    inner,
    bboxW: bb.maxX - bb.minX,
    bboxH: bb.maxY - bb.minY,
    areaCm2: area(ring),
    originX: 0,
    originY: 0,
    ...(manifest === null ? {} : { manifest: { ...FACTS, ...(manifest ?? {}) } }),
  };
}

export type Case = { name: string; ok: boolean; detail: string };

export async function synthetic(): Promise<Case[]> {
  const out: Case[] = [];
  const ck = (name: string, ok: boolean, detail: unknown) =>
    out.push({ name, ok, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
  const grainV = seg('7', P(10, 15), P(10, 30));
  const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, b);

  // the rectangle half: fold line along x = 0 (the whole left edge)
  const rect = () => [P(0, 0), P(25, 0), P(25, 40), P(0, 40)];
  const foldL = seg('6', P(0, 0), P(0, 40));
  const b = mk(rect(), [foldL, grainV]);
  const bu = foldUnitOf(b);
  ck(
    'rectangle half → unit 50 × 40, area 2×',
    bu.fold?.kind === 'unit' &&
      near(bu.bboxW, 50) &&
      near(bu.bboxH, 40) &&
      near(bu.areaCm2, 2 * b.areaCm2) &&
      bu.fold.halfAreaCm2 === b.areaCm2,
    { fold: bu.fold, w: bu.bboxW, h: bu.bboxH, a: bu.areaCm2 },
  );
  const lines6 = (bu.inner ?? []).filter((c) => c.layer === '6');
  const grains = (bu.inner ?? []).filter((c) => c.layer === '7');
  ck(
    'the unit keeps the fold line once (its axis, x = 25) and mirrors the grain',
    lines6.length === 1 &&
      lines6[0].pts.every((q) => near(q.x, 25)) &&
      grains.length === 2 &&
      grains.some((g) => g.pts.every((q) => near(q.x, 15))) &&
      grains.some((g) => g.pts.every((q) => near(q.x, 35))),
    { lines6, grains },
  );
  ck('idempotent: the unit stays the unit', foldUnitOf(bu) === bu, '');

  // the ruffle M: a crescent whose fold run is one end, its tip 2 cm off the fold line (a slot)
  const slot = (tip: number) => [
    P(0, 0),
    P(30, 0),
    P(30, 50),
    P(tip, 50),
    P(tip, 40),
    P(20, 40),
    P(20, 10),
    P(0, 10),
  ];
  const foldS = seg('6', P(0, 0), P(0, 10));
  const s = mk(slot(2), [foldS, seg('7', P(25, 15), P(25, 35))]);
  const su = foldUnitOf(s);
  ck(
    'slot half (tip 2 cm off the fold) → unit, area 2×, 60 cm across',
    su.fold?.kind === 'unit' && near(su.areaCm2, 2 * s.areaCm2) && near(su.bboxW, 60),
    { fold: su.fold, w: su.bboxW, a: su.areaCm2, half: s.areaCm2 },
  );
  // the ruffle XS: the tip crosses the fold line by 1 cm → refused, never the half as drawn
  const o = mk(slot(-1), [foldS, seg('7', P(25, 15), P(25, 35))]);
  const ou = foldUnitOf(o);
  ck(
    'tip crosses the fold line by 1 cm → refused, poly kept',
    ou.fold?.kind === 'refused' &&
      /crosses its fold line by 1\.0 cm/.test(ou.fold.reason) &&
      ou.poly === o.poly,
    ou.fold,
  );
  const t = mk(
    [P(0, 0), P(30, 0), P(30, 50), P(0, 50), P(0, 40), P(20, 40), P(20, 10), P(0, 10)],
    [foldS],
  );
  const tu = foldUnitOf(t);
  ck(
    'the half touches its fold line away from the fold edge → refused',
    tu.fold?.kind === 'refused' && /touches its fold line/.test(tu.fold.reason),
    tu.fold,
  );

  // D3: one evidence never unfolds
  const noFacts = foldUnitOf(mk(rect(), [foldL], null));
  ck(
    'a mirror line on the edge, no converter facts → refused',
    noFacts.fold?.kind === 'refused' && /no converter facts/.test(noFacts.fold.reason),
    noFacts.fold,
  );
  const notHalf = foldUnitOf(mk(rect(), [foldL], { halfFold: false }));
  ck(
    'a mirror line on the edge, the manifest says no half → refused',
    notHalf.fold?.kind === 'refused' && /did not declare a half/.test(notHalf.fold.reason),
    notHalf.fold,
  );
  const declUnf = foldUnitOf(mk(rect(), [foldL], { halfFold: false, unfolded: true }));
  ck(
    'a mirror line on the edge of a piece declared unfolded → refused',
    declUnf.fold?.kind === 'refused' && /declared unfolded/.test(declUnf.fold.reason),
    declUnf.fold,
  );
  const noLine = foldUnitOf(mk(rect(), [grainV]));
  ck(
    'the manifest says half, no fold line → refused',
    noLine.fold?.kind === 'refused' && /no fold line/.test(noLine.fold.reason),
    noLine.fold,
  );
  const offEdge = foldUnitOf(mk(rect(), [seg('6', P(10, 0), P(10, 40))]));
  ck(
    'the manifest says half, the fold line inside the piece → refused',
    offEdge.fold?.kind === 'refused' && /not on the cut line/.test(offEdge.fold.reason),
    offEdge.fold,
  );
  const two = foldUnitOf(mk(rect(), [foldL, seg('6', P(25, 0), P(25, 40))]));
  ck(
    'two fold lines → refused',
    two.fold?.kind === 'refused' && /2 fold lines/.test(two.fold.reason),
    two.fold,
  );
  const oblique = foldUnitOf(mk(rect(), [foldL, seg('7', P(5, 5), P(20, 20))]));
  ck(
    'grain 45° off the fold line → refused',
    oblique.fold?.kind === 'refused' && /45° off the fold line/.test(oblique.fold.reason),
    oblique.fold,
  );
  const across = foldUnitOf(mk(rect(), [foldL, seg('7', P(5, 20), P(20, 20))]));
  ck('grain across the fold → unit', across.fold?.kind === 'unit', across.fold);

  // mutation: a normal unfolded fold piece (converter unfolded it, fold line on layer 8 as a
  // reference) and a plain piece — untouched, the same objects, nested as before
  const full = mk(
    [P(0, 0), P(50, 0), P(50, 40), P(0, 40)],
    [seg('8', P(25, 0), P(25, 40)), seg('7', P(10, 10), P(10, 30))],
    { halfFold: false, unfolded: true },
  );
  const plain = mk([P(0, 0), P(20, 0), P(20, 30), P(0, 30)], [], null);
  const sa0 = applySeamAllowance([full, plain], 0).pieces;
  ck(
    'mutation: an unfolded fold piece and a plain piece pass unchanged (same objects)',
    sa0[0] === full && sa0[1] === plain && !sa0[0].fold && !sa0[1].fold,
    sa0.map((p) => p.fold ?? null),
  );
  const sa1 = applySeamAllowance([full, b], 1).pieces;
  ck(
    'with 1 cm allowance: the unfolded piece is offset as before, the half as its unit',
    !sa1[0].fold &&
      near(sa1[0].bboxW, 52, 1e-3) &&
      sa1[1].fold?.kind === 'unit' &&
      near(sa1[1].bboxW, 52, 1e-3) &&
      near(sa1[1].bboxH, 42, 1e-3),
    sa1.map((p) => ({ w: p.bboxW, h: p.bboxH, fold: p.fold ?? null })),
  );

  // the nest: the unit placed, the refused half unplaced with its reason, the others as before
  const cut = applySeamAllowance([b, o, full, plain], 0).pieces;
  const config: NestConfig = {
    pieces: cut.map((p) => ({ pieceId: p.id, quantity: 1 })),
    fabricWidthCm: 140,
    gapCm: NEST_DEFAULTS.gapCm,
    edgeMarginCm: 0,
    allowCrossGrain: false,
    fabricDirection: 'any',
    grainLayer: '7',
    seamAllowanceCm: 0,
    timeBudgetMs: 800,
    rdpEpsCm: NEST_DEFAULTS.rdpEpsCm,
  };
  const res = await nest(
    cut,
    config,
    () => false,
    () => {},
  );
  const placedIds = res.placements.map((pl) => pl.pieceId).sort((x, y) => x - y);
  const want = [cut[0].id, cut[2].id, cut[3].id].sort((x, y) => x - y);
  ck(
    'nest: unit + unfolded + plain placed, the crossing half unplaced (fold) with a warning',
    JSON.stringify(placedIds) === JSON.stringify(want) &&
      res.unplaced.length === 1 &&
      res.unplaced[0].pieceId === o.id &&
      res.unplaced[0].reason === 'fold' &&
      res.warnings.some((w) => w.startsWith('half on fold, not placed: ') && w.includes(o.name)),
    { placedIds, want, unplaced: res.unplaced, warnings: res.warnings },
  );

  // continuing a marker: a refused half outside its composition is that size's gap, not a stop
  const SID: Record<string, number> = { xs: 1, m: 3 };
  const ruf = (size: string, tip: number) => {
    const p = mk(slot(tip), [foldS, seg('7', P(25, 15), P(25, 35))], { size });
    return { ...p, name: `RUF_${size}`, blockName: `RUF_${size}` };
  };
  const fp = (size: string, w: number) => {
    const p = mk([P(0, 0), P(w, 0), P(w, 40), P(0, 40)], [seg('7', P(5, 10), P(5, 30))], {
      identity: 'FP',
      cardName: 'FP',
      size,
      halfFold: false,
    });
    return { ...p, name: `FP_${size}`, blockName: `FP_${size}` };
  };
  const file = [ruf('XS', -1), ruf('M', 2), fp('XS', 18), fp('M', 20)];
  const cutM = applySeamAllowance(file, 0).pieces;
  const blob = (names: string[]) =>
    cutM
      .filter((p) => names.includes(p.blockName ?? ''))
      .map((p) => ({
        blockName: p.blockName ?? '',
        area: p.areaCm2,
        sizeId: SID[(p.manifest?.size ?? '').toLowerCase()],
      }));
  const cont = continueMarker(file, blob(['RUF_M', 'FP_M']), [SID.xs, SID.m], ['xs', 'm']);
  const unitM = cutM[1].areaCm2;
  ck(
    'continuing an M marker: M from the unit, XS «half on fold» (no area), not a refusal',
    cont.ok &&
      near(cont.areas.areaBySize.get(SID.m) ?? 0, unitM + 800) &&
      !cont.areas.areaBySize.has(SID.xs) &&
      cont.areas.sizesWithoutPieces.includes(SID.xs) &&
      cont.areas.sizesFoldRefused.length === 1 &&
      cont.areas.sizesFoldRefused[0].sizeId === SID.xs &&
      /RUF_XS \(the half crosses its fold line/.test(cont.areas.sizesFoldRefused[0].piece),
    cont,
  );
  const noRuf = continueMarker(file, blob(['FP_M']), [SID.xs, SID.m], ['xs', 'm']);
  ck(
    'a marker without the ruffle: both sizes have areas, the refused half is not its business',
    noRuf.ok &&
      near(noRuf.areas.areaBySize.get(SID.xs) ?? 0, 720) &&
      near(noRuf.areas.areaBySize.get(SID.m) ?? 0, 800) &&
      noRuf.areas.sizesFoldRefused.length === 0,
    noRuf,
  );
  const withXs = continueMarker(
    file,
    [
      ...blob(['RUF_M', 'FP_M', 'FP_XS']),
      { blockName: 'RUF_XS', area: file[0].areaCm2, sizeId: SID.xs },
    ],
    [SID.xs, SID.m],
    ['xs', 'm'],
  );
  ck(
    'a marker that cut the refused size itself → refused, named',
    !withXs.ok && /half on fold that cannot be cut: RUF_XS/.test(withXs.reason),
    withXs,
  );
  return out;
}

// ── continuing a marker (size-areas-from-dxf): the card's own function on a parsed file ────────

type BlobRow = { blockName: string; area: number; sizeId?: number };

function continueMarker(
  parsed: PieceDTO[],
  rows: BlobRow[],
  sizeIds: number[],
  tokens: string[],
  conditions = { seamAllowanceMm: 0, contourLayer: '1', grainLayer: '7' },
): SizeAreasOutcome {
  const marker = {
    summary: {
      seamAllowanceMm: { value: String(conditions.seamAllowanceMm) },
      contourLayer: conditions.contourLayer,
      grainLayer: conditions.grainLayer,
    },
    layout: {
      schemaVersion: 4,
      pieces: rows.map((r, i) => ({
        pieceId: i + 1,
        name: r.blockName,
        blockName: r.blockName,
        source: 'probe.dxf',
        sourceUrl: '',
        quantity: 1,
        poly: [],
        bboxWCm: 0,
        bboxHCm: 0,
        areaCm2: r.area,
        pieceLineKey: '',
        sizeId: r.sizeId,
      })),
      placements: [],
      warnings: [],
    },
  } as unknown as common_TechCardMarker;
  return sizeAreasFromParsed({
    marker,
    parsed,
    sizeIds,
    tokensOfSize: (id) => [tokens[sizeIds.indexOf(id)] ?? ''],
    isSizeToken: (t) => ['xs', 's', 'm', 'l', 'xl'].includes(t),
  });
}

export type ContinueRun = {
  name: string;
  ok: boolean;
  detail: unknown;
};

/**
 * Real file (Ulmus): markers captured on M/L/XL continued to the whole run XS…XL. The blob is
 * what a save of the card chain records (one row per INSERT copy, the cut area, size id).
 */
export async function continueFile(bytes: ArrayBuffer, name: string): Promise<ContinueRun[]> {
  const parsed = (
    await parseSheets([{ name, open: async () => bytes }], {
      unit: 'auto',
      tol: NEST_DEFAULTS.tol,
      tolChain: NEST_DEFAULTS.tolChain,
    })
  ).pieces;
  const tokens = ['xs', 's', 'm', 'l', 'xl'];
  const sizeIds = [1, 2, 3, 4, 5];
  const sizeOf = (p: PieceDTO) => tokens.indexOf((p.manifest?.size ?? '').toLowerCase()) + 1;
  const cut = applySeamAllowance(
    orientToGrain(
      parsed.filter((p) => (p.layer ?? '') === '1'),
      '7',
    ).pieces,
    0,
  ).pieces;
  const blobOf = (sizes: number[], keep: (p: PieceDTO) => boolean): BlobRow[] =>
    cut
      .filter((p) => sizes.includes(sizeOf(p)) && keep(p))
      .map((p) => ({ blockName: p.blockName ?? '', area: p.areaCm2, sizeId: sizeOf(p) }));
  const expected = (rows: BlobRow[], sizeId: number) =>
    rows.filter((r) => r.sizeId === sizeId).reduce((a, r) => a + r.area, 0);
  const isRuf = (p: PieceDTO) => /^RUF_/i.test(p.blockName ?? '');
  const out: ContinueRun[] = [];
  const near = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, b);
  const summary = (o: SizeAreasOutcome) =>
    o.ok
      ? {
          areaBySize: Object.fromEntries(
            [...o.areas.areaBySize].map(([k, v]) => [tokens[k - 1], Math.round(v)]),
          ),
          without: o.areas.sizesWithoutPieces.map((k) => tokens[k - 1]),
          fold: o.areas.sizesFoldRefused.map((f) => `${tokens[f.sizeId - 1]}: ${f.piece}`),
        }
      : { reason: o.reason };

  const mlxl = blobOf([3, 4, 5], () => true);
  const a = continueMarker(parsed, mlxl, sizeIds, tokens);
  out.push({
    name: 'Ulmus M/L/XL marker → XS…XL: M/L/XL areas as recorded, XS/S «half on fold»',
    ok:
      a.ok &&
      [3, 4, 5].every((s) => near(a.areas.areaBySize.get(s) ?? 0, expected(mlxl, s))) &&
      !a.areas.areaBySize.has(1) &&
      !a.areas.areaBySize.has(2) &&
      a.areas.sizesFoldRefused.map((f) => f.sizeId).join(',') === '1,2' &&
      a.areas.sizesFoldRefused.every((f) =>
        /^RUF_X?S \(the half crosses its fold line/.test(f.piece),
      ),
    detail: summary(a),
  });
  const noRuf = blobOf([3, 4, 5], (p) => !isRuf(p));
  const b = continueMarker(parsed, noRuf, sizeIds, tokens);
  out.push({
    name: 'Ulmus M/L/XL marker without RUF → all five sizes have areas',
    ok:
      b.ok &&
      [1, 2, 3, 4, 5].every((s) => (b.areas.areaBySize.get(s) ?? 0) > 0) &&
      [3, 4, 5].every((s) => near(b.areas.areaBySize.get(s) ?? 0, expected(noRuf, s))) &&
      b.areas.sizesFoldRefused.length === 0,
    detail: summary(b),
  });
  const withS = blobOf([2, 3], () => true);
  const c = continueMarker(parsed, withS, sizeIds, tokens);
  out.push({
    name: 'Ulmus S/M marker (S is in the composition) → refused, names RUF_S',
    ok: !c.ok && /half on fold that cannot be cut: RUF_S \(/.test(c.reason),
    detail: summary(c),
  });
  return out;
}
