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
    fitPct: base.fitPct?.trim() || '100',
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

/**
 * The step's binding lines, once each, in the order the step took them (E3): `bomLineKeys` grows
 * as tiles are picked, so its order is the order lines were added; strip order is not, since a
 * second edge of the first line is appended after the second line's strip.
 */
export function bindingLinesOfStep(
  operation: BindingOperation | undefined,
  strips: readonly CutStrip[],
): string[] {
  const own = [
    ...new Set(
      bindingStripsOfStep(operation, strips)
        .map((strip) => strip.bomLineKey?.trim() ?? '')
        .filter(Boolean),
    ),
  ];
  const order = (operation?.bomLineKeys ?? []).map((key) => key.trim());
  const rank = (key: string) => {
    const at = order.indexOf(key);
    return at < 0 ? order.length + own.indexOf(key) : at;
  };
  return own.sort((a, b) => rank(a) - rank(b));
}

/** The line a new edge goes to: the one picked while it is still on the step, else the last added. */
export function chosenBindingLine(lines: readonly string[], picked: string): string {
  return lines.includes(picked) ? picked : lines[lines.length - 1] ?? '';
}

/**
 * The pending strip born by the tile is used first; later edges clone the same line. With
 * `bomLineKey` (E3, two lines on one step) only that line's strips count.
 */
export function bindingStripTarget(
  operation: BindingOperation | undefined,
  strips: readonly CutStrip[],
  sizeIds: readonly number[],
  bomLineKey?: string,
): BindingStripTarget | null {
  if (!isBindingOperation(operation)) return null;
  const own = bindingStripsOfStep(operation, strips, bomLineKey);
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
      .filter(
        (strip) => isBindingStrip(strip, operation) && inputs.has(strip.lineKey?.trim() ?? ''),
      )
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
): {
  strips: CutStrip[];
  inputKeys: string[];
  bomLineKeys: string[];
  removedLineKeys: string[];
} | null {
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
  const kept = strips.filter((strip) => !gone.has(strip.lineKey?.trim() ?? ''));
  const inputKeys = (operation?.inputKeys ?? []).filter((key) => !gone.has(key));
  return {
    strips: kept,
    inputKeys,
    bomLineKeys: withoutBareBindingLines(operation, removed, kept, inputKeys),
    removedLineKeys,
  };
}

/**
 * The step's link to a binding line is its strips: when the last own strip of a line goes, the
 * line leaves `bomLineKeys` too, exactly as the tile unpick does. Otherwise the PDF keeps listing a
 * binding under a step that binds nothing with it.
 */
function withoutBareBindingLines(
  operation: BindingOperation | undefined,
  removed: readonly CutStrip[],
  kept: readonly CutStrip[],
  inputKeys: readonly string[],
): string[] {
  const after = { ...operation, inputKeys };
  const still = new Set(
    bindingStripsOfStep(after, kept).map((strip) => strip.bomLineKey?.trim() ?? ''),
  );
  const bare = new Set(
    removed.map((strip) => strip.bomLineKey?.trim() ?? '').filter((key) => key && !still.has(key)),
  );
  return (operation?.bomLineKeys ?? []).filter((key) => !bare.has(key.trim()));
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

type TeardownCard = Parameters<typeof teardownBindingStrips>[0];
type TeardownScope = Parameters<typeof teardownBindingStrips>[1];

/**
 * The links a deleted step keeps for its undo: the row as it stands AFTER its binding teardown. The
 * strips and seams the teardown deletes do not come back, so naming them would make every undo of a
 * B1 step refuse with «piece deleted».
 */
export function bindingUndoLinks(
  card: TeardownCard,
  index: number,
): { inputKeys: string[]; seamKeys: string[]; bomLineKeys: string[] } {
  const operation = card.operations?.[index];
  const plan = teardownBindingStrips(card, { stepIndexes: [index] });
  const patch = plan.operations.find((entry) => entry.index === index);
  const inputKeys = patch?.inputKeys ?? [...(operation?.inputKeys ?? [])];
  const removed = (card.cutStrips ?? []).filter(
    (strip) =>
      !plan.strips.includes(strip) &&
      (operation?.inputKeys ?? []).includes(strip.lineKey?.trim() ?? ''),
  );
  return {
    inputKeys,
    seamKeys: patch?.seamKeys ?? [...(operation?.seamKeys ?? [])],
    bomLineKeys: withoutBareBindingLines(operation, removed, plan.strips, inputKeys),
  };
}

export type BindingTeardownIo = {
  read: () => Pick<TeardownCard, 'cutStrips' | 'operations'>;
  seamRows: readonly StoredSeam[];
  /** False while the seam store still holds another card: its rows must not authorize a delete. */
  seamReady: boolean;
  removeRows: (rows: StoredSeam[]) => Promise<boolean>;
  write: (plan: BindingStripTeardown) => void;
};

/**
 * Delete the stored seam rows first, then write a plan read AFTER that await: a strip edit that
 * lands while the RPC is in flight (the mm sync, the open editor) must survive the teardown.
 */
export async function runBindingTeardown(
  io: BindingTeardownIo,
  scope: TeardownScope,
): Promise<boolean> {
  const before = io.read();
  const plan = teardownBindingStrips({ ...before, seamRows: io.seamRows }, scope);
  if (!plan.operations.length && plan.strips.length === (before.cutStrips ?? []).length)
    return true;
  if (!io.seamReady) return false;
  const removeKeys = new Set(plan.seamRowsToRemove);
  const rows = io.seamRows.filter((row) => removeKeys.has(row.seamKey));
  if (rows.length && !(await io.removeRows(rows))) return false;
  io.write(teardownBindingStrips({ ...io.read(), seamRows: io.seamRows }, scope));
  return true;
}
