import { normBlock } from 'lib/pattern-import/fabrics/draft';
import type {
  DraftScopeTarget,
  GrainFeature,
  ManifestSize,
  ManifestSource,
  PieceSizeSpec,
  PieceSpec,
  PtMm,
} from 'lib/pattern-import/types';
import { writeScopes } from 'lib/pattern-import/write';
import { fuseAreaMm2, generateFuseGeometry, signedArea } from './geometry';
import type { FusePolygon, PieceFuseSpec } from './types';

export type FusingBomLine = {
  bomLineKey: string;
  code: string;
  label: string;
};

export type FusingSourceSize = {
  sizeToken: string;
  sizeId: number;
  rank: number;
  outline: PtMm[];
  darts?: PtMm[][];
  grain?: { a: PtMm; b: PtMm } | null;
};

export type FusingSourcePiece = {
  identity: string;
  displayName: string;
  piecesPerGarment: number;
  ungraded: boolean;
  /** null keeps a non-fused source piece available as a referenced zone. */
  fuse: PieceFuseSpec | null;
  seamAllowanceMm?: number | null;
  sizes: FusingSourceSize[];
};

export type BuildFusingSheetsInput = {
  techCardId: number;
  style: string;
  baseSizeId?: number | null;
  bomLines: FusingBomLine[];
  pieces: FusingSourcePiece[];
};

export type FusingSkippedSize = {
  piece: string;
  size: string;
  reason: string;
};

export type GeneratedFusingSheet = {
  bomLineKey: string;
  filename: string;
  dxfText: string;
  blocks: string[];
};

export type BuildFusingSheetsResult = {
  sheets: GeneratedFusingSheet[];
  warnings: string[];
  skippedSizes: FusingSkippedSize[];
};

const SOURCE: ManifestSource = {
  files: [],
  scale: { method: 'declared', factor: 1, measuredMm: null, declaredMm: null },
  sheet: { pages: 1, method: 'single', maxResidualMm: 0 },
  sizeEncoding: 'dxf-block',
  variant: null,
};

const slug = (value: string, fallback: string) =>
  value
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60) || fallback;

export function fusingSheetFilename(style: string, bomCode: string): string {
  return `${slug(style, 'style')}-fusing-${slug(bomCode, 'interlining')}.dxf`;
}

function bbox(points: readonly PtMm[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function axisThrough(points: readonly PtMm[], angleDeg: number): { a: PtMm; b: PtMm } {
  const box = bbox(points);
  const centre = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  const radians = (angleDeg * Math.PI) / 180;
  const reach = Math.max(box.maxX - box.minX, box.maxY - box.minY, 20) / 2;
  const u = { x: Math.cos(radians), y: Math.sin(radians) };
  return {
    a: { x: centre.x - reach * u.x, y: centre.y - reach * u.y },
    b: { x: centre.x + reach * u.x, y: centre.y + reach * u.y },
  };
}

function grainOf(
  spec: PieceFuseSpec,
  source: FusingSourceSize,
  cut: readonly PtMm[],
): GrainFeature | null {
  if (spec.grain === 'any') return null;
  const sourceAngle = source.grain
    ? (Math.atan2(source.grain.b.y - source.grain.a.y, source.grain.b.x - source.grain.a.x) * 180) /
      Math.PI
    : 90;
  const angle =
    spec.grain === 'crosswise'
      ? sourceAngle + 90
      : spec.grain === 'bias'
        ? sourceAngle + 45
        : sourceAngle;
  const line = spec.grain === 'as_piece' && source.grain ? source.grain : axisThrough(cut, angle);
  const angleDeg = (Math.atan2(line.b.y - line.a.y, line.b.x - line.a.x) * 180) / Math.PI;
  return {
    kind: 'grain',
    origin: 'derived',
    ranges: [],
    confidence: 1,
    a: line.a,
    b: line.b,
    angleDeg,
    evidence: ['geometry'],
  };
}

function cutLoops(polygons: readonly FusePolygon[]): { cut: PtMm[]; loops: PtMm[][] } {
  const sorted = [...polygons].sort(
    (a, b) => Math.abs(signedArea(b.outer)) - Math.abs(signedArea(a.outer)),
  );
  const primary = sorted[0];
  return {
    cut: primary.outer,
    loops: sorted.flatMap((polygon, index) => [
      ...(index === 0 ? [] : [polygon.outer]),
      ...polygon.holes,
    ]),
  };
}

function routeOf(piece: FusingSourcePiece, lines: readonly FusingBomLine[]): FusingBomLine | null {
  const key = piece.fuse?.bomLineKey?.trim();
  if (key) return lines.find((line) => line.bomLineKey === key) ?? null;
  return lines.length === 1 ? lines[0] : null;
}

const zoneKey = (identity: string, size: string) =>
  `${normBlock(identity).toLowerCase()}|${size.trim().toLowerCase()}`;

/** Pure source-piece → one all-size DXF per used interlining BOM line. */
export function buildFusingSheets(input: BuildFusingSheetsInput): BuildFusingSheetsResult {
  const warnings: string[] = [];
  const skippedSizes: FusingSkippedSize[] = [];
  const byLine = new Map<string, FusingSourcePiece[]>();
  const validLines = input.bomLines.filter((line) => line.bomLineKey.trim());
  const zoneOutlines = new Map<string, PtMm[]>();
  for (const piece of input.pieces) {
    for (const size of piece.sizes)
      zoneOutlines.set(zoneKey(piece.identity, size.sizeToken), size.outline);
  }

  for (const piece of input.pieces) {
    if (!piece.fuse) continue;
    const line = routeOf(piece, validLines);
    if (!line) {
      warnings.push(
        `${piece.identity}: fused, interlining not chosen${piece.fuse.bomLineKey ? ` (${piece.fuse.bomLineKey} is not a live line)` : ''}`,
      );
      continue;
    }
    const list = byLine.get(line.bomLineKey) ?? [];
    list.push(piece);
    byLine.set(line.bomLineKey, list);
  }

  const sheets: GeneratedFusingSheet[] = [];
  for (const line of validLines) {
    const sources = byLine.get(line.bomLineKey) ?? [];
    if (!sources.length) continue;
    const pieceSpecs: PieceSpec[] = [];
    for (let pieceIndex = 0; pieceIndex < sources.length; pieceIndex++) {
      const sourcePiece = sources[pieceIndex];
      const fuse = sourcePiece.fuse!;
      const ordered = [...sourcePiece.sizes].sort((a, b) => a.rank - b.rank);
      const base = ordered.find((size) => size.sizeId === input.baseSizeId) ?? ordered[0] ?? null;
      if (!base) {
        warnings.push(`${sourcePiece.identity}: no source sizes`);
        continue;
      }
      const sizes: PieceSizeSpec[] = [];
      for (const sourceSize of ordered) {
        try {
          const reference =
            fuse.zone && 'dxfPieceKey' in fuse.zone
              ? zoneOutlines.get(zoneKey(fuse.zone.dxfPieceKey, sourceSize.sizeToken)) ??
                zoneOutlines.get(zoneKey(fuse.zone.dxfPieceKey, ''))
              : undefined;
          const polygons = generateFuseGeometry({
            outline: sourceSize.outline,
            spec: fuse,
            seamAllowanceMm: sourcePiece.seamAllowanceMm,
            darts: sourceSize.darts,
            zoneOutline: reference,
            expectedEdgeCount: fuse.mode === 'strip' ? base.outline.length : undefined,
          });
          const { cut, loops } = cutLoops(polygons);
          sizes.push({
            rank: sourceSize.rank,
            sizeToken: sourceSize.sizeToken,
            sizeId: sourceSize.sizeId,
            cut,
            cutLoops: loops,
            seam: null,
            grain: grainOf(fuse, sourceSize, cut),
            notches: [],
            drills: [],
            internal: [],
            fold: null,
            offset: null,
            walls: [],
            bbox: bbox(cut),
            areaMm2: fuseAreaMm2(polygons),
          });
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          skippedSizes.push({ piece: sourcePiece.identity, size: sourceSize.sizeToken, reason });
          warnings.push(`${sourcePiece.identity}_${sourceSize.sizeToken}: ${reason}`);
        }
      }
      if (!sizes.length) continue;
      pieceSpecs.push({
        identity: sourcePiece.identity,
        code: sourcePiece.identity,
        mods: [],
        displayName: sourcePiece.displayName,
        nameOrigin: 'operator',
        seed: pieceIndex,
        variant: null,
        pairHand: null,
        pairOf: null,
        unfoldedFold: false,
        piecesPerGarment: sourcePiece.piecesPerGarment,
        allowance: { meaning: 'cut', allowanceMm: 0, origin: 'operator', evidence: [] },
        fabrics: [line.bomLineKey],
        fused: true,
        ungraded: sourcePiece.ungraded,
        sizes,
      });
    }
    if (!pieceSpecs.length) continue;
    const scope: DraftScopeTarget = {
      scopeKey: line.bomLineKey,
      fabricPurpose: 'TECH_CARD_BOM_PURPOSE_UNSET',
      bomLineKey: line.bomLineKey,
      label: line.label || line.code,
      isInterlining: true,
      sections: ['TECH_CARD_BOM_SECTION_INTERLINING'],
    };
    const sizes: ManifestSize[] = [
      ...new Map(
        pieceSpecs.flatMap((piece) =>
          piece.sizes.map((size) => [size.sizeToken.toLowerCase(), size] as const),
        ),
      ).values(),
    ]
      .sort((a, b) => a.rank - b.rank)
      .map((size) => ({
        token: size.sizeToken,
        sizeId: size.sizeId,
        name: size.sizeToken,
        sourceLabel: size.sizeToken,
        rank: size.rank,
      }));
    const [written] = writeScopes(
      {
        techCardId: input.techCardId,
        scopes: [scope],
        pieces: pieceSpecs,
        sizes,
        source: SOURCE,
        generator: 'grbpwr/fusing-dxf',
        dialect: 'r12',
      },
      { embed: null },
    );
    warnings.push(
      ...written.detail.warnings.filter(
        (warning) => !warning.includes('no seam line') && !warning.includes('no grain line'),
      ),
    );
    sheets.push({
      bomLineKey: line.bomLineKey,
      filename: fusingSheetFilename(input.style, line.code),
      dxfText: written.detail.bareText,
      blocks: written.detail.plan.blocks.map((block) => block.name),
    });
  }
  return { sheets, warnings, skippedSizes };
}
