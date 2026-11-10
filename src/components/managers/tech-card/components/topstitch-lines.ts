import type { PieceGeom } from 'lib/assembly-skeleton/types';
import { resolveEdge } from 'lib/assembly-skeleton/union';
import {
  anchorOfRunId,
  expandSidePart,
  normalizeParts,
  sidePartEdges,
  type EdgeAnchor,
  type SidePart,
} from 'lib/seams';
import { ulid } from 'utils/ulid';

import { runsOfSide } from './assembly-seams/seam-actions';
import { normalizeMaterialUnit } from './material-unit';
import type { TechCardFormData } from './schema';

export type TopstitchOperation = NonNullable<TechCardFormData['operations']>[number];
export type TopstitchLine = NonNullable<TopstitchOperation['topstitchLines']>[number];
export type TopstitchBomLine = NonNullable<TechCardFormData['bomItems']>[number];

const edgeLen = (id: string, geoms: ReadonlyMap<string, PieceGeom>) =>
  resolveEdge(id, geoms)?.len ?? 0;

export function isTopstitchThreadLine(line: Partial<TopstitchBomLine>): boolean {
  return (
    line.section === 'TECH_CARD_BOM_SECTION_THREAD' &&
    line.kind === 'TECH_CARD_BOM_KIND_TOPSTITCH_THREAD' &&
    normalizeMaterialUnit(line.unit) === 'm'
  );
}

export function topstitchThreadLines(bomItems: readonly TopstitchBomLine[]): TopstitchBomLine[] {
  return bomItems.filter(isTopstitchThreadLine);
}

/** Existing lines win; otherwise one linked thread wins, then a sole eligible card thread. */
export function topstitchThreadKey(
  operation:
    | {
        topstitchLines?: readonly { bomLineKey?: string }[];
        bomLineKeys?: readonly string[];
      }
    | undefined,
  bomItems: readonly TopstitchBomLine[],
): string {
  const eligible = topstitchThreadLines(bomItems);
  const eligibleKeys = new Set(eligible.map((line) => line.lineKey?.trim()).filter(Boolean));
  const bound = (operation?.topstitchLines ?? [])
    .map((line) => line.bomLineKey?.trim())
    .find((key) => key && eligibleKeys.has(key));
  if (bound) return bound;
  const linked = (operation?.bomLineKeys ?? []).filter((key) => eligibleKeys.has(key));
  if (linked.length === 1) return linked[0];
  return eligible.length === 1 ? eligible[0].lineKey?.trim() || '' : '';
}

/** Persisted anchors back to the one-sided picker/display parts. */
export function topstitchLineParts(
  line: Pick<TopstitchLine, 'parts'>,
  geoms: ReadonlyMap<string, PieceGeom> = new Map(),
): SidePart[] {
  return (line.parts ?? []).flatMap((anchor) => {
    const length = resolveEdge(anchor.edgeHint, geoms)?.len ?? anchor.lenMm;
    const from = Math.max(0, Math.min(length, anchor.range[0] * length));
    const to = Math.max(from, Math.min(length, anchor.range[1] * length));
    if (from <= 0.05 && to >= length - 0.05) return [{ target: anchor.edgeHint }];
    return [{ target: anchor.edgeHint, range: [from, to] as const }];
  });
}

type AnchorContext = {
  pieces: readonly PieceGeom[];
  grainDeg?: ReadonlyMap<string, number>;
};

/** One accepted A-side pick, stored as real seam anchors and no synthetic partner. */
export function createTopstitchLineFromPick(input: {
  parts: readonly SidePart[];
  geoms: ReadonlyMap<string, PieceGeom>;
  anchors: AnchorContext;
  bomLineKey: string;
  anchoredSize: string;
  lineKey?: string;
}): TopstitchLine | null {
  const normalized = normalizeParts(input.parts, input.geoms);
  const ranged = normalized.some((part) => !!part.range);
  const runs: SidePart[] = ranged
    ? normalized
    : runsOfSide(
        normalized.map((part) => part.target),
        input.geoms,
      ).map((target) => ({ target }));
  const parts = runs
    .map((part): EdgeAnchor | null => {
      const length = edgeLen(part.target, input.geoms);
      if (!(length > 0)) return null;
      const range: [number, number] = part.range
        ? [part.range[0] / length, part.range[1] / length]
        : [0, 1];
      return anchorOfRunId(input.anchors.pieces, part.target, input.anchors.grainDeg, range);
    })
    .filter((anchor): anchor is EdgeAnchor => !!anchor);
  if (!parts.length || parts.length !== runs.length) return null;
  return {
    lineKey: input.lineKey ?? ulid(),
    bomLineKey: input.bomLineKey,
    parts,
    anchoredSize: input.anchoredSize,
    rows: 1,
    sizes: [],
    measured: true,
  };
}

const physicalParts = (
  parts: readonly SidePart[],
  geoms: ReadonlyMap<string, PieceGeom>,
): { edge: string; from: number; to: number }[] =>
  parts
    .flatMap((part) => expandSidePart(part, geoms))
    .flatMap((part) =>
      sidePartEdges(part).map((edge) => ({
        edge,
        from: part.range ? Math.min(...part.range) : 0,
        to: part.range ? Math.max(...part.range) : edgeLen(edge, geoms),
      })),
    );

/** Binding-style duplicate-span refusal for lines in one step. */
export function topstitchPickOverlaps(
  lines: readonly TopstitchLine[],
  id: string,
  range: readonly [number, number] | undefined,
  geoms: ReadonlyMap<string, PieceGeom>,
): boolean {
  const length = edgeLen(id, geoms);
  const from = range ? Math.min(...range) : 0;
  const to = range ? Math.max(...range) : length;
  return lines.some((line) =>
    physicalParts(topstitchLineParts(line, geoms), geoms).some(
      (part) => part.edge === id && Math.min(to, part.to) - Math.max(from, part.from) > 1,
    ),
  );
}

export function topstitchLineMm(
  line: TopstitchLine,
  sizeId: number | undefined,
): number | undefined {
  const row = (line.sizes ?? []).find((size) => Number(size.sizeId) === Number(sizeId));
  const mm = Number(row?.lineMm);
  return Number.isFinite(mm) && mm > 0 ? mm : undefined;
}

export function topstitchThreadMm(
  operations: readonly TopstitchOperation[],
  bomLineKey: string,
  sizeId: number | undefined,
): number | undefined {
  const lines = operations
    .flatMap((operation) => operation.topstitchLines ?? [])
    .filter((line) => line.bomLineKey === bomLineKey);
  if (!lines.length) return undefined;
  let known = true;
  const total = lines.reduce((sum, line) => {
    const mm = topstitchLineMm(line, sizeId);
    if (mm == null) known = false;
    return sum + (mm ?? 0) * Math.max(1, line.rows || 1);
  }, 0);
  return known ? total : undefined;
}

export function clearTopstitchLinesForKind(
  operation: TopstitchOperation,
  remainsTopstitch: boolean,
): TopstitchOperation {
  if (remainsTopstitch || !(operation.topstitchLines ?? []).length) return operation;
  return { ...operation, topstitchLines: [] };
}

export function unlinkTopstitchBomLine(
  operations: readonly TopstitchOperation[],
  bomLineKey: string,
): { operations: TopstitchOperation[]; changed: boolean } {
  let changed = false;
  const next = operations.map((operation) => {
    const lines = operation.topstitchLines ?? [];
    const kept = lines.filter((line) => line.bomLineKey !== bomLineKey);
    if (kept.length === lines.length) return operation;
    changed = true;
    return { ...operation, topstitchLines: kept };
  });
  return { operations: changed ? next : [...operations], changed };
}

export function dropTopstitchMeasured<T extends Pick<TechCardFormData, 'operations'>>(data: T): T {
  let changed = false;
  const operations = (data.operations ?? []).map((operation) => {
    let lineChanged = false;
    const topstitchLines = (operation.topstitchLines ?? []).map((line) => {
      if (line.measured === undefined) return line;
      lineChanged = true;
      const rest = { ...line };
      delete rest.measured;
      return rest;
    });
    if (!lineChanged) return operation;
    changed = true;
    return { ...operation, topstitchLines };
  });
  return changed ? ({ ...data, operations } as T) : data;
}
