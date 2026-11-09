import type { common_Material } from 'api/proto-http/admin';
import { segmentPiece } from 'lib/assembly-skeleton/geometry';
import type { PieceGeom } from 'lib/assembly-skeleton/types';
import type { SidePart, StoredSeam } from 'lib/seams';

import { rowFromHand, type AnchorCtx } from './assembly-seams/seam-actions';
import { bomPurposeLabel, isRollGoodsSection } from './bom-purpose';
import { bornCutStrip } from './form-writers';
import { kindLabel } from './bom-kind';
import { sectionShort } from './bom-line-picker';
import { rowTouchesStrip, stripFoundPiece } from './cut-strips/strip-pieces';
import { sideLengthMm } from './step-seams/seam-length';
import type { CutStrip, CutStripLine } from './cut-strip-editor/use-cut-strip';
import { cutStripEligible, freshCutStrip } from './cut-strip-editor/use-cut-strip';

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

export type BindingOperation = {
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

export function isBindingLine(line: BindingLine): boolean {
  return (
    BINDING_BOM_KINDS.has(line.kind?.trim() ?? '') ||
    (isRollGoodsSection(line.section) &&
      line.purpose === 'TECH_CARD_BOM_PURPOSE_BINDING' &&
      cutStripEligible(line))
  );
}

/** Kinds lead, then purpose-based roll goods; both groups keep their BOM order. */
export function bindingBomLines<T extends BindingLine>(
  lines: readonly T[],
  blockedPurposeLineKeys: ReadonlySet<string> = new Set(),
): T[] {
  const kinds: T[] = [];
  const purposes: T[] = [];
  for (const line of lines) {
    if (BINDING_BOM_KINDS.has(line.kind?.trim() ?? '')) {
      kinds.push(line);
    } else if (isBindingLine(line) && !blockedPurposeLineKeys.has(line.lineKey?.trim() ?? '')) {
      purposes.push(line);
    }
  }
  return [...kinds, ...purposes];
}

export function bindingLineSub(line: BindingLine): string {
  return [sectionShort(line.section), kindLabel(line.kind) || bomPurposeLabel(line.purpose)]
    .filter(Boolean)
    .join(' · ');
}

/** Only B1-created strips belong to the binding picker and its destructive gestures. */
/**
 * A strip the B1 tile owns. `placement` is client-only and gone after a reload, so the stored truth is
 * the owner: a from_seam strip taken by a B1 step is that step's binding strip.
 */
export function isBindingStrip(
  strip: Pick<CutStrip, 'placement' | 'lineKey' | 'lengthMode'>,
  owner?: BindingOperation,
): boolean {
  if (strip.placement?.trim() === '__binding__') return true;
  const key = strip.lineKey?.trim() ?? '';
  return (
    !!key &&
    !!owner &&
    isBindingOperation(owner) &&
    strip.lengthMode === 'from_seam' &&
    (owner.inputKeys ?? []).some((input) => input.trim() === key)
  );
}

/** Binding strips of any step of the card. */
export function isCardBindingStrip(
  strip: Pick<CutStrip, 'placement' | 'lineKey' | 'lengthMode'>,
  operations: readonly BindingOperation[],
): boolean {
  return isBindingStrip(strip) || operations.some((operation) => isBindingStrip(strip, operation));
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
      isBindingStrip(strip, operation) &&
      inputs.has(strip.lineKey?.trim() ?? '') &&
      (!wanted || strip.bomLineKey?.trim() === wanted),
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
    placement: '__binding__',
    lengthMode: 'from_seam',
    seamKey: '',
    fitPct: '100',
    overlapMm: '30',
    widthMm: isRollGoodsSection(line.section) ? '' : strip.widthMm,
    qty: 1,
  };
}

/** A second edge gets another identity while retaining the binding article and physical width. */
export function nextBindingStrip(base: CutStrip, sizeIds: readonly number[]): CutStrip {
  return {
    ...bornCutStrip(base.bomLineKey?.trim() ?? ''),
    placement: '__binding__',
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
      .filter((strip) => isBindingStrip(strip, operation) && inputs.has(strip.lineKey?.trim() ?? ''))
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
    (strip) =>
      isBindingStrip(strip, operation) &&
      inputs.has(strip.lineKey?.trim() ?? '') &&
      strip.seamKey?.trim() === seamKey.trim(),
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

export type BindingStripTeardownPatch = {
  index: number;
  inputKeys: string[];
  seamKeys: string[];
};

export type BindingStripTeardown = {
  strips: CutStrip[];
  operations: BindingStripTeardownPatch[];
  seamRowsToRemove: string[];
};

/**
 * Plan one binding-strip teardown without mutating form or seam state. Step ownership is the
 * operation whose inputs contain the marked strip; a BOM teardown selects marked strips by line.
 */
export function teardownBindingStrips(
  card: {
    cutStrips?: readonly CutStrip[];
    operations?: readonly BindingOperation[];
    seamRows?: readonly StoredSeam[];
  },
  scope: { stepIndexes?: readonly number[]; bomLineKeys?: readonly string[] },
): BindingStripTeardown {
  const strips = card.cutStrips ?? [];
  const operations = card.operations ?? [];
  const stepIndexes = new Set(scope.stepIndexes ?? []);
  const bomLineKeys = new Set((scope.bomLineKeys ?? []).map((key) => key.trim()).filter(Boolean));
  const stepStripKeys = new Set<string>();
  for (const index of stepIndexes) {
    for (const key of operations[index]?.inputKeys ?? []) if (key.trim()) stepStripKeys.add(key);
  }
  const removed = strips.filter((strip) => {
    if (!isCardBindingStrip(strip, operations)) return false;
    const lineKey = strip.lineKey?.trim() ?? '';
    if (!stepIndexes.size && !bomLineKeys.size) return false;
    if (stepIndexes.size && (!lineKey || !stepStripKeys.has(lineKey))) return false;
    if (bomLineKeys.size && !bomLineKeys.has(strip.bomLineKey?.trim() ?? '')) return false;
    return true;
  });
  if (!removed.length) return { strips: [...strips], operations: [], seamRowsToRemove: [] };

  const goneStrips = new Set(removed.map((strip) => strip.lineKey?.trim() ?? '').filter(Boolean));
  const stripSeamKeys = new Set(
    removed.map((strip) => strip.seamKey?.trim() ?? '').filter(Boolean),
  );
  const seamRowsToRemove = [
    ...new Set(
      (card.seamRows ?? [])
        .filter((row) => stripSeamKeys.has(row.seamKey) || rowTouchesStrip(row, goneStrips))
        .map((row) => row.seamKey),
    ),
  ];
  const goneSeams = new Set([...stripSeamKeys, ...seamRowsToRemove]);
  const patches: BindingStripTeardownPatch[] = [];
  operations.forEach((operation, index) => {
    const inputKeys = (operation.inputKeys ?? []).filter((key) => !goneStrips.has(key));
    const seamKeys = (operation.seamKeys ?? []).filter((key) => !goneSeams.has(key));
    if (
      inputKeys.length !== (operation.inputKeys ?? []).length ||
      seamKeys.length !== (operation.seamKeys ?? []).length
    ) {
      patches.push({ index, inputKeys, seamKeys });
    }
  });
  return {
    strips: strips.filter((strip) => !goneStrips.has(strip.lineKey?.trim() ?? '')),
    operations: patches,
    seamRowsToRemove,
  };
}
