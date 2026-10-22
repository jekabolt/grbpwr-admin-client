// The pattern pieces the assembly drawings are made of: the card's DXF, read the same way the
// editor reads it (patterns → scoped sheets → nesting/dxf-geometry → block refs → findPiece), then
// segmented by the assembly engine so the stored seams (TechCard.seams) resolve on today's edges.
import { useMemo } from 'react';

import type { common_TechCard } from 'api/proto-http/admin';
import { depStatus, type PrintDep } from 'components/managers/print/use-print-ready';
import {
  bindingScopes,
  scopeKeyOfBinding,
} from 'components/managers/tech-card/components/bom-purpose';
import {
  findPiece,
  useDxfGeometry,
  useDxfIndex,
  type FoundPiece,
} from 'components/managers/tech-card/components/nesting/dxf-geometry';
import { patternSheetName } from 'components/managers/tech-card/components/nesting/sheet-name';
import {
  pieceBlockRefs,
  pieceRefKey,
  rollGoodsScopes,
} from 'components/managers/tech-card/components/piece-block-refs';
import { seamPieceOf, segmentPiece, twins } from 'lib/assembly-skeleton/geometry';
import { readablePieceName } from 'lib/assembly-skeleton/names';
import type { ClothState } from 'lib/assembly-skeleton/types';
import type { PieceDTO } from 'lib/nesting/types';
import { grainRotation } from 'lib/pom/upright';
import { isDxfUrl } from 'utils/pattern';

import type { AsmPiece, Pt } from './derive-assembly';
import type { TechpackPieceGeometry } from './derive-pieces';

type Ins = NonNullable<common_TechCard['techCard']>;

const CLOTH: Record<string, ClothState> = {
  TECH_CARD_BOM_PURPOSE_MAIN: 'main',
  TECH_CARD_BOM_PURPOSE_LINING: 'lining',
  TECH_CARD_BOM_PURPOSE_POCKETING: 'pocketing',
  TECH_CARD_BOM_PURPOSE_INTERFACING: 'interfacing',
  TECH_CARD_BOM_PURPOSE_INSULATION: 'insulation',
  TECH_CARD_BOM_PURPOSE_CONTRAST: 'contrast',
  TECH_CARD_BOM_PURPOSE_MESH: 'mesh',
  TECH_CARD_BOM_PURPOSE_OTHER: 'other',
};

const NOTCH_LAYER = '4';
const SIMPLIFY_MM = 0.3;
const ON_OUTLINE_MM = 2;

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Douglas–Peucker: the drawing does not need the DXF's every vertex. */
function simplify(pts: readonly Pt[], tol = SIMPLIFY_MM): Pt[] {
  if (pts.length < 3) return [...pts];
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let worst = -1;
    let at = -1;
    for (let i = s + 1; i < e; i++) {
      const d = segDist(pts[i], pts[s], pts[e]);
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > tol && at > 0) {
      keep[at] = 1;
      stack.push([s, at], [at, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

function area(pts: readonly Pt[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return Math.abs(a / 2);
}

function onOutline(line: readonly Pt[], outline: readonly Pt[]): boolean {
  return line.every((p) => {
    for (let i = 0; i < outline.length; i++) {
      if (segDist(p, outline[i], outline[(i + 1) % outline.length]) <= ON_OUTLINE_MM) return true;
    }
    return false;
  });
}

/** PieceDTO (cm, y up) → the drawing frame (mm, y down). */
const draw = (pts: readonly { x: number; y: number }[]): Pt[] =>
  pts.map((q) => [q.x * 10, -q.y * 10]);

function cloth(ins: Ins, piece: NonNullable<Ins['pieces']>[number]): ClothState | null {
  const line = piece.materials?.[0]?.bomLineKey;
  const bom = line ? ins.bomItems?.find((b) => b.lineKey === line) : undefined;
  return bom?.purpose ? CLOTH[bom.purpose] ?? null : null;
}

/** Card pieces + what the DXF holds for each → the drawings' pieces (pure). */
export function buildAssemblyPieces(
  techCard: common_TechCard,
  found: ReadonlyMap<string, FoundPiece>,
): { pieces: Map<string, AsmPiece>; grainDeg: Map<string, number> } {
  const ins = techCard.techCard;
  const pieces = new Map<string, AsmPiece>();
  const grainDeg = new Map<string, number>();
  if (!ins) return { pieces, grainDeg };
  const geoms = [];
  const drawn = new Map<string, Omit<AsmPiece, 'geom'>>();
  for (const p of ins.pieces ?? []) {
    const key = p.lineKey ?? '';
    const f = key ? found.get(key) : undefined;
    if (!f) continue;
    const dto: PieceDTO = seamPieceOf(f.layers?.length ? f.layers : [f.piece]) ?? f.piece;
    const name = readablePieceName(p.name ?? '') || p.name || key;
    const c = cloth(ins, p);
    geoms.push(
      segmentPiece({
        pieceKey: key,
        name,
        piece: dto,
        piecesPerGarment: p.piecesPerGarment || 1,
        cutSymmetry: p.cutSymmetry ?? null,
        cloth: c,
        fused: false,
      }),
    );
    grainDeg.set(key, grainRotation(f.piece));
    // the cut line is the biggest closed loop the block draws (the sewing line sits inside it)
    const loops = [
      draw(dto.poly),
      ...(dto.inner ?? []).filter((l) => l.closed).map((l) => draw(l.pts)),
    ]
      .filter((l) => l.length >= 3)
      .map((pts) => ({ pts, a: area(pts) }))
      .sort((x, y) => y.a - x.a);
    const cut = loops[0]?.pts ?? [];
    const cutArea = loops[0]?.a ?? 0;
    const inner: Pt[][] = [];
    const notch: Pt[][] = [];
    for (const l of dto.inner ?? []) {
      if (l.pts.length < 2) continue;
      const pts = draw(l.pts);
      if (l.layer === NOTCH_LAYER) {
        notch.push(pts);
        continue;
      }
      if (l.closed) {
        if (area(pts) < cutArea * 0.5) inner.push(simplify([...pts, pts[0]]));
        continue;
      }
      if (dist(pts[0], pts[pts.length - 1]) < 1e-6 && pts.length < 3) continue;
      if (!onOutline(pts, cut)) inner.push(simplify(pts));
    }
    drawn.set(key, {
      key,
      name: p.name || name,
      cut: simplify(cut),
      inner,
      notch,
      pocketing: c === 'pocketing',
      area: cutArea,
    });
  }
  for (const g of twins(geoms)) {
    const d = drawn.get(g.pieceKey);
    if (d) pieces.set(g.pieceKey, { ...d, geom: g });
  }
  return { pieces, grainDeg };
}

export type AssemblyGeometry = {
  pieces: Map<string, AsmPiece>;
  grainDeg: Map<string, number>;
  /** Each card piece's DXF block, for the cut-pieces sheet (null while the DXF is unread). */
  shapes: TechpackPieceGeometry;
  dep: PrintDep;
};

/** The card's DXF pieces for the assembly drawings; `dep` feeds the print-ready gate. */
export function useAssemblyGeometry(techCard: common_TechCard): AssemblyGeometry {
  const ins = techCard.techCard;
  const scopes = useMemo(() => rollGoodsScopes((ins?.bomItems ?? []) as never), [ins?.bomItems]);
  const files = useMemo(() => {
    const sheets = bindingScopes(scopes, ins?.patterns ?? []);
    return (ins?.patterns ?? [])
      .filter((p) => p.url && isDxfUrl(p.url))
      .map((p) => ({
        scopeKey: scopeKeyOfBinding(p.fabricPurpose, p.bomLineKey, sheets),
        name: patternSheetName(p),
        url: p.url ?? '',
      }));
  }, [ins?.patterns, scopes]);
  const refs = useMemo(
    () => pieceBlockRefs((ins?.pieceDxfAliases?.items ?? []) as never, scopes),
    [ins?.pieceDxfAliases, scopes],
  );
  const query = useDxfGeometry(files, true);
  const index = useDxfIndex(query.data);
  const built = useMemo(() => {
    const found = new Map<string, FoundPiece>();
    const shapeByKey = index ? new Map<string, FoundPiece | null>() : null;
    for (const p of ins?.pieces ?? []) {
      const key = p.lineKey ?? '';
      const f = key ? findPiece(index, refs.get(pieceRefKey(key)) ?? []) : null;
      if (f) found.set(key, f);
      if (key) shapeByKey?.set(pieceRefKey(key), f);
    }
    return {
      ...buildAssemblyPieces(techCard, found),
      shapes: { shapeByKey, grainLayer: index?.grainLayer ?? '' },
    };
  }, [techCard, ins?.pieces, index, refs]);
  const status = files.length ? depStatus(query.isLoading, query.isError) : 'ok';
  return {
    ...built,
    dep: {
      label: 'pattern geometry',
      status: status === 'ok' && files.length && !index ? 'pending' : status,
    },
  };
}
