import { describe, expect, it, vi } from 'vitest';
import { assemblyBlocks } from '../assembly-blocks';
import { assemblySweep, classifyAssemblyInputs, type AssemblyStep } from '../assembly-frontier';
import { assemblyLayout } from '../assembly-layout';
import { pieceAddPrefill } from '../assembly-node-views';
import { rowForFold } from '../operations-field';
import { pieceFoldStep } from './fold-step';
import { resolvePieceFoldStep, type InsertFoldPress } from './piece-fold';

const FUSING = 'TECH_CARD_OPERATION_TYPE_FUSING';
const PRESS = 'TECH_CARD_OPERATION_TYPE_PRESS';
const MACHINE = 'TECH_CARD_OPERATION_TYPE_MACHINE';

type Op = {
  operationType: string;
  inputKeys: string[];
  outputUnitKey?: string;
  foldKeys?: string[];
};

const op = (operationType: string, inputKeys: string[], extra: Partial<Op> = {}): Op => ({
  operationType,
  inputKeys,
  outputUnitKey: '',
  foldKeys: [],
  ...extra,
});

const resolve = (
  ops: Op[],
  options: { pieceFoldKeys?: string[]; at?: number; blocked?: () => boolean } = {},
) => {
  const insertPress = vi.fn<InsertFoldPress>((at) => at);
  const index = resolvePieceFoldStep({
    ops: ops as never,
    pieceKey: 'BP_L',
    pieceFoldKeys: new Set(options.pieceFoldKeys ?? []),
    foldKeys: ['fold-new'],
    at: 'at' in options ? options.at : 2,
    blocked: options.blocked ?? (() => false),
    insertPress,
  });
  return { index, insertPress };
};

describe('+ fold binding order', () => {
  it('(a) takes the piece own non-fusing step that already closes its folds', () => {
    const ops = [
      op(FUSING, ['BP_L'], { foldKeys: ['fold-1'] }),
      op(PRESS, ['BP_L']),
      op(MACHINE, ['BP_L'], { foldKeys: ['fold-2'] }),
    ];
    const { index, insertPress } = resolve(ops, { pieceFoldKeys: ['fold-1', 'fold-2'] });
    expect(index).toBe(2);
    expect(insertPress).not.toHaveBeenCalled();
  });

  it('(b) else the piece own Press step', () => {
    const ops = [op(FUSING, ['BP_L']), op(MACHINE, ['BP_L']), op(PRESS, ['BP_L'])];
    const { index, insertPress } = resolve(ops, { pieceFoldKeys: ['fold-1'] });
    expect(index).toBe(2);
    expect(insertPress).not.toHaveBeenCalled();
  });

  it('(c) else a new Press step where + operation would put it', () => {
    const ops = [op(MACHINE, ['BP_L']), op(MACHINE, ['BP_L', 'FRONT_L'], { outputUnitKey: 'U' })];
    const { index, insertPress } = resolve(ops, { at: 1 });
    expect(index).toBe(1);
    expect(insertPress).toHaveBeenCalledWith(1, 'BP_L', ['fold-new']);
  });

  it('never FUSING, even when FUSING is the only step', () => {
    const ops = [op(FUSING, ['BP_L'], { foldKeys: ['fold-1'] })];
    expect(pieceFoldStep(ops, 'BP_L', new Set(['fold-1']))).toBeNull();
    const { index, insertPress } = resolve(ops, { pieceFoldKeys: ['fold-1'], at: 1 });
    expect(index).toBe(1);
    expect(insertPress).toHaveBeenCalledWith(1, 'BP_L', ['fold-new']);
  });

  it('never a join or a press on two pieces', () => {
    const ops = [
      op(PRESS, ['BP_L', 'FRONT_L']),
      op(MACHINE, ['BP_L', 'FRONT_L'], { outputUnitKey: 'U', foldKeys: ['fold-1'] }),
      op(PRESS, ['BP_L'], { outputUnitKey: 'U2' }),
    ];
    expect(pieceFoldStep(ops, 'BP_L', new Set(['fold-1']))).toBeNull();
  });

  it('makes no step that would break the fold order', () => {
    const ops = [op(MACHINE, ['BP_L'])];
    const { index, insertPress } = resolve(ops, { at: 1, blocked: () => true });
    expect(index).toBeNull();
    expect(insertPress).not.toHaveBeenCalled();
  });

  it('makes no step without a place', () => {
    const { index, insertPress } = resolve([], { at: undefined });
    expect(index).toBeNull();
    expect(insertPress).not.toHaveBeenCalled();
  });
});

describe('the new Press step', () => {
  it('is that piece alone, an iron, pressed flat, a draft, closing the fold', () => {
    const row = rowForFold(' BP_L ', ['fold-new']);
    expect(row).toMatchObject({
      operationType: PRESS,
      pressEquipment: 'TECH_CARD_PRESS_EQUIPMENT_IRON',
      pressAction: 'TECH_CARD_PRESS_ACTION_PRESS_FLAT',
      zone: 'TECH_CARD_GARMENT_ZONE_OTHER',
      inputKeys: ['BP_L'],
      outputUnitKey: '',
      foldKeys: ['fold-new'],
      draft: true,
    });
    expect(row.historyKey).not.toBe('');
  });

  it('lands right after the piece own steps, as + operation does', () => {
    const pieces = [
      { lineKey: 'BP_L', name: 'BP_L' },
      { lineKey: 'FRONT_L', name: 'FRONT_L' },
    ];
    const keys = new Set(pieces.map((piece) => piece.lineKey));
    const step = (inputs: string[], outputUnitKey = ''): AssemblyStep => ({
      inputs: classifyAssemblyInputs(keys, inputs),
      outputUnitKey,
      outputUnitName: '',
    });
    const steps = [step(['FRONT_L']), step(['BP_L']), step(['BP_L', 'FRONT_L'], 'U')];
    const res = assemblySweep(pieces, steps);
    const { blocks } = assemblyBlocks(steps, res);
    const layout = assemblyLayout(blocks, steps, res);
    const at = pieceAddPrefill('BP_L', steps, res, blocks, layout)?.at;
    expect(at).toBe(2);
    const ops = [
      op(FUSING, ['FRONT_L']),
      op(FUSING, ['BP_L']),
      op(MACHINE, ['BP_L', 'FRONT_L'], { outputUnitKey: 'U' }),
    ];
    const { index, insertPress } = resolve(ops, { at });
    expect(index).toBe(2);
    expect(insertPress).toHaveBeenCalledWith(2, 'BP_L', ['fold-new']);
  });
});
