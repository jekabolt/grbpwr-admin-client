// Grade map · builder input from a parsed pattern file. The geometry the runtime sees: the same
// per-size piece frame as fusing-dxf `sourcePieces` (outline, sewing outline, internal lines), read
// with the same helpers, but without the card (no aliases, no BOM, no api): the import worker cannot
// pull regenerate.ts. `grade-map/source.test.ts` holds it equal to `sourcePieces` on real files.

import { bareToken } from 'components/managers/tech-card/components/nesting/block-code';
import {
  defaultContourLayer,
  layerOptions,
} from 'components/managers/tech-card/components/nesting/contour-layer';
import {
  pieceNetOutline,
  sewingLineLayer,
} from 'components/managers/tech-card/components/nesting/net-outline';
import { splitPiecesBySize } from 'components/managers/tech-card/components/nesting/split-pieces';
import { fusingInternalLines } from 'lib/fusing-dxf/internal-lines';
import type { PieceDTO } from 'lib/nesting/types';
import { normBlock } from 'lib/pattern-import/fabrics/draft';
import type { PtMm } from 'lib/pattern-import/types';
import { buildFileMap } from './build';
import { dist } from './geom';
import type { GmBuildOptions, GmFile, GmPieceBuild, GmPieceInput, GmSizeGeometry } from './types';

/** A size the file may name: its dictionary id, the tokens a block code may spell it with, its rank. */
export type GmSizeRef = { id: number; tokens: readonly string[]; rank: number };

const mm = (p: { x: number; y: number }): PtMm => ({ x: p.x * 10, y: p.y * 10 });

/**
 * Every piece of a parsed file with its sizes in the runtime frame (`sourcePieces`' sizes, without
 * darts and grain), keyed by identity. A row whose size resolves to no id is left out.
 */
export function gradeMapSources(
  parsed: readonly PieceDTO[],
  sizes: readonly GmSizeRef[],
): { key: string; ungraded: boolean; sizes: GmSizeGeometry[] }[] {
  const tokens = new Map<string, GmSizeRef>();
  for (const s of sizes) {
    if (!s.id) continue;
    for (const t of s.tokens) if (bareToken(t)) tokens.set(bareToken(t), s);
  }
  const split = splitPiecesBySize(parsed, new Set(tokens.keys()));
  const contourLayer = defaultContourLayer(layerOptions(parsed, split.codeById));
  const seamLayer = sewingLineLayer(parsed, split.codeById);
  const chosen = contourLayer ? parsed.filter((p) => p.layer === contourLayer) : [...parsed];
  const byIdentity = new Map<string, { spelling: string; rows: PieceDTO[] }>();
  for (const piece of chosen) {
    const code = split.codeById.get(piece.id);
    const identity = normBlock(code?.identity ?? piece.blockName ?? '');
    if (!identity) continue;
    const key = identity.toLowerCase();
    const group = byIdentity.get(key) ?? { spelling: identity, rows: [] };
    group.rows.push(piece);
    byIdentity.set(key, group);
  }
  const out: { key: string; ungraded: boolean; sizes: GmSizeGeometry[] }[] = [];
  for (const group of byIdentity.values()) {
    const bySize = new Map<string, PieceDTO>();
    for (const row of group.rows) {
      const code = split.codeById.get(row.id);
      const sizeKey = bareToken(row.manifest?.size || code?.size || '');
      if (!bySize.has(sizeKey)) bySize.set(sizeKey, row);
    }
    const geos: GmSizeGeometry[] = [];
    let named = false;
    for (const [sizeKey, row] of bySize) {
      const code = split.codeById.get(row.id);
      if (row.manifest?.size || code?.size) named = true;
      const sizeId = row.manifest?.sizeId || tokens.get(sizeKey)?.id || 0;
      if (!sizeId) continue;
      geos.push({
        sizeId,
        cut: row.poly.map(mm),
        seam: pieceNetOutline(row, parsed, seamLayer)?.map(mm) ?? null,
        lines: fusingInternalLines(row, seamLayer).map((l) => ({
          layer: l.layer,
          closed: l.closed,
          points: l.points,
        })),
      });
    }
    if (geos.length) out.push({ key: group.spelling, ungraded: !named, sizes: geos });
  }
  return out;
}

/** Every size draws the same piece (0.01 mm): nothing to carry. */
export function sameInEverySize(geos: readonly GmSizeGeometry[]): boolean {
  const same = (a: readonly PtMm[], b: readonly PtMm[]) =>
    a.length === b.length && a.every((p, i) => dist(p, b[i]) <= 0.01);
  const g0 = geos[0];
  return geos.every(
    (g) =>
      same(g.cut, g0.cut) &&
      g.lines.length === g0.lines.length &&
      g.lines.every((l, i) => same(l.points, g0.lines[i].points)),
  );
}

/**
 * The builder input of a file: graded pieces only (two sizes or more, not ungraded, not the same
 * in every size). The base of a piece is `baseSizeId` when the piece has it, else its middle size.
 */
export function gradeMapInputs(
  sources: readonly { key: string; ungraded: boolean; sizes: GmSizeGeometry[] }[],
  sizeOrder: readonly number[],
  baseSizeId: number,
): GmPieceInput[] {
  const out: GmPieceInput[] = [];
  for (const p of sources) {
    if (p.sizes.length < 2 || p.ungraded || sameInEverySize(p.sizes)) continue;
    const ids = new Set(p.sizes.map((g) => g.sizeId));
    const order = sizeOrder.filter((id) => ids.has(id));
    if (order.length < 2) continue;
    const base = ids.has(baseSizeId) ? baseSizeId : order[Math.floor(order.length / 2)];
    out.push({
      key: p.key,
      baseSizeId: base,
      sizes: p.sizes.filter((g) => order.includes(g.sizeId)),
    });
  }
  return out;
}

/** The middle size by rank: the base when the card's own is not known. */
export function middleSize(sizes: readonly GmSizeRef[]): number {
  const order = [...sizes].sort((a, b) => a.rank - b.rank);
  return order[Math.floor((order.length - 1) / 2)]?.id ?? 0;
}

/** The map of a parsed file, or null when no piece is graded. */
export function gradeMapOfParsed(
  parsed: readonly PieceDTO[],
  sizes: readonly GmSizeRef[],
  baseSizeId: number = middleSize(sizes),
  opts: GmBuildOptions = {},
): { file: GmFile; builds: GmPieceBuild[]; inputs: GmPieceInput[] } | null {
  const sizeOrder = [...sizes].sort((a, b) => a.rank - b.rank).map((s) => s.id);
  const inputs = gradeMapInputs(gradeMapSources(parsed, sizes), sizeOrder, baseSizeId);
  if (!inputs.length) return null;
  const { file, builds } = buildFileMap(inputs, sizeOrder, baseSizeId, opts);
  return { file, builds, inputs };
}
