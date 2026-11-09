import type { common_Material } from 'api/proto-http/admin';
import { segmentPiece } from 'lib/assembly-skeleton/geometry';
import type { PieceGeom } from 'lib/assembly-skeleton/types';
import type { SidePart, StoredSeam } from 'lib/seams';

import { rowFromHand, type AnchorCtx } from './assembly-seams/seam-actions';
import { bornCutStrip } from './form-writers';
import { kindLabel } from './bom-kind';
import { sectionShort } from './bom-line-picker';
import { stripFoundPiece } from './cut-strips/strip-pieces';
import { sideLengthMm } from './step-seams/seam-length';
import type { CutStrip, CutStripLine } from './cut-strip-editor/use-cut-strip';
import { freshCutStrip } from './cut-strip-editor/use-cut-strip';

export const BINDING_BOM_KINDS = new Set([
  'TECH_CARD_BOM_KIND_BINDING',
  'TECH_CARD_BOM_KIND_TAPE',
  'TECH_CARD_BOM_KIND_PIPING',
]);

type BindingLine = CutStripLine & {
  section?: string;
  kind?: string;
  materialId?: number;
};

type BindingOperation = {
  work?: string;
  machineType?: string;
  inputKeys?: readonly string[];
  bomLineKeys?: readonly string[];
  seamKeys?: readonly string[];
};

export function isBindingOperation(operation: BindingOperation | undefined): boolean {
  return (
    operation?.work?.trim() === 'bind_tape_edge' ||
    operation?.machineType === 'TECH_CARD_MACHINE_TYPE_BINDING_TAPING'
  );
}

/** Binding articles are offered by kind, even when they live outside normal operation sections. */
export function bindingBomLines<T extends BindingLine>(lines: readonly T[]): T[] {
  return lines.filter((line) => BINDING_BOM_KINDS.has(line.kind?.trim() ?? ''));
}

export function bindingLineSub(line: BindingLine): string {
  return [sectionShort(line.section), kindLabel(line.kind)].filter(Boolean).join(' · ');
}

export function bindingStripsOfStep(
  operation: BindingOperation | undefined,
  strips: readonly CutStrip[],
  bomLineKey?: string,
): CutStrip[] {
  const inputs = new Set(operation?.inputKeys ?? []);
  const wanted = bomLineKey?.trim() ?? '';
  return strips.filter(
    (strip) =>
      inputs.has(strip.lineKey?.trim() ?? '') && (!wanted || strip.bomLineKey?.trim() === wanted),
  );
}

export function freshBindingStrip({
  line,
  sizeIds,
  material,
}: {
  line: BindingLine;
  sizeIds: readonly number[];
  material?: common_Material;
}): CutStrip {
  const strip = freshCutStrip({
    line,
    sizeIds,
    seams: [],
    pieces: [],
    material,
    placement: '__binding__',
  });
  return {
    ...strip,
    lengthMode: 'from_seam',
    seamKey: '',
    fitPct: '100',
    overlapMm: '30',
    qty: 1,
  };
}

/** A second edge gets another identity while retaining the binding article and physical width. */
export function nextBindingStrip(base: CutStrip, sizeIds: readonly number[]): CutStrip {
  return {
    ...bornCutStrip(base.bomLineKey?.trim() ?? ''),
    lengthMode: 'from_seam',
    seamKey: '',
    fitPct: '100',
    overlapMm: base.overlapMm?.trim() || '30',
    widthMm: base.widthMm ?? '',
    qty: 1,
    sizes: [...new Set(sizeIds.map(Number).filter((sizeId) => sizeId > 0))].map((sizeId) => ({
      sizeId,
      seamMm: '',
      manualCutMm: '',
    })),
  };
}

export type BindingStripTarget = { strip: CutStrip; fresh: boolean };

/** The pending strip born by the tile is used first; later edges clone the same line. */
export function bindingStripTarget(
  operation: BindingOperation | undefined,
  strips: readonly CutStrip[],
  sizeIds: readonly number[],
): BindingStripTarget | null {
  if (!isBindingOperation(operation)) return null;
  const own = bindingStripsOfStep(operation, strips);
  const open = own.find((strip) => strip.lengthMode === 'from_seam' && !strip.seamKey?.trim());
  if (open) return { strip: open, fresh: false };
  const base = own[0];
  return base ? { strip: nextBindingStrip(base, sizeIds), fresh: true } : null;
}

const decimal = (value: string | undefined, fallback: number) => {
  const parsed = Number((value ?? '').trim().replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Build the ordinary two-sided row without asking the user to click an undrawn strip. The synthetic
 * rectangle is exactly as long as the selected cloth span, so its persisted long-edge anchor is the
 * same anchor the real strip resolves to once seamMm has been synced.
 */
export function bindingRowFromCloth(
  cloth: readonly SidePart[],
  strip: CutStrip,
  geoms: ReadonlyMap<string, PieceGeom>,
  anchorCtx: AnchorCtx,
): StoredSeam | null {
  const lineKey = strip.lineKey?.trim() ?? '';
  const sewnMm = sideLengthMm(cloth, geoms, () => 0);
  if (!lineKey || !Number.isFinite(sewnMm) || sewnMm <= 0) return null;
  const widthMm = decimal(strip.widthMm, 10);
  const found = stripFoundPiece(lineKey, {
    label: 'binding',
    mode: 'from_seam',
    fitPct: 100,
    overlapMm: decimal(strip.overlapMm, 30),
    widthMm,
    seamMm: sewnMm,
    sewnMm,
  });
  const piece = segmentPiece({
    pieceKey: lineKey,
    name: 'binding',
    piece: found.piece,
    piecesPerGarment: 1,
    cutSymmetry: null,
    cloth: null,
    fused: false,
  });
  const long = [...piece.edges].sort((left, right) => right.lenMm - left.lenMm)[0];
  if (!long) return null;
  const withStrip = new Map(geoms);
  withStrip.set(lineKey, piece);
  return rowFromHand(
    cloth,
    [long.id],
    withStrip,
    { ...anchorCtx, pieces: [...anchorCtx.pieces, piece] },
    { direction: 'reversed' },
  );
}

/** Attach the canonical stored key to the exact strip anchor the accepted row contains. */
export function linkBindingStripToSeam(
  operation: BindingOperation | undefined,
  strips: readonly CutStrip[],
  row: StoredSeam,
  seamKey: string,
): { strips: CutStrip[]; stripLineKey: string } | null {
  if (!isBindingOperation(operation)) return null;
  const inputs = new Set(operation?.inputKeys ?? []);
  const stripKeys = new Set(
    strips
      .filter((strip) => inputs.has(strip.lineKey?.trim() ?? ''))
      .map((strip) => strip.lineKey?.trim() ?? '')
      .filter(Boolean),
  );
  const stripLineKey = [...row.sideA, ...row.sideB]
    .map((anchor) => anchor.piece)
    .find((key) => stripKeys.has(key));
  if (!stripLineKey) return null;
  let changed = false;
  const next = strips.map((strip) => {
    if (strip.lineKey?.trim() !== stripLineKey || strip.seamKey?.trim() === seamKey) return strip;
    changed = true;
    return { ...strip, seamKey };
  });
  return changed ? { strips: next, stripLineKey } : null;
}

export function removeBindingStripsForSeam(
  operation: BindingOperation | undefined,
  strips: readonly CutStrip[],
  seamKey: string,
): { strips: CutStrip[]; inputKeys: string[]; removedLineKeys: string[] } | null {
  if (!isBindingOperation(operation)) return null;
  const inputs = new Set(operation?.inputKeys ?? []);
  const removed = strips.filter(
    (strip) => inputs.has(strip.lineKey?.trim() ?? '') && strip.seamKey?.trim() === seamKey.trim(),
  );
  if (!removed.length) return null;
  const removedLineKeys = removed.map((strip) => strip.lineKey?.trim() ?? '').filter(Boolean);
  const gone = new Set(removedLineKeys);
  return {
    strips: strips.filter((strip) => !gone.has(strip.lineKey?.trim() ?? '')),
    inputKeys: (operation?.inputKeys ?? []).filter((key) => !gone.has(key)),
    removedLineKeys,
  };
}

export function unpickBindingLine(
  operation: BindingOperation | undefined,
  strips: readonly CutStrip[],
  bomLineKey: string,
  removeBomLink: boolean,
): {
  strips: CutStrip[];
  inputKeys: string[];
  seamKeys: string[];
  bomLineKeys: string[];
  stripKeys: string[];
  seamKeysRemoved: string[];
} {
  const own = bindingStripsOfStep(operation, strips, bomLineKey);
  const stripKeys = own.map((strip) => strip.lineKey?.trim() ?? '').filter(Boolean);
  const seamKeysRemoved = own.map((strip) => strip.seamKey?.trim() ?? '').filter(Boolean);
  const goneStrips = new Set(stripKeys);
  const goneSeams = new Set(seamKeysRemoved);
  return {
    strips: strips.filter((strip) => !goneStrips.has(strip.lineKey?.trim() ?? '')),
    inputKeys: (operation?.inputKeys ?? []).filter((key) => !goneStrips.has(key)),
    seamKeys: (operation?.seamKeys ?? []).filter((key) => !goneSeams.has(key)),
    bomLineKeys: removeBomLink
      ? (operation?.bomLineKeys ?? []).filter((key) => key !== bomLineKey)
      : [...(operation?.bomLineKeys ?? [])],
    stripKeys,
    seamKeysRemoved,
  };
}
