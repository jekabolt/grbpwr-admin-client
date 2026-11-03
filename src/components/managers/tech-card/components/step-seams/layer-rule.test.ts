import { describe, expect, it } from 'vitest';

import type { SeamLayer } from 'lib/seams';

import {
  CARD6_CHAIN_OPS,
  CARD6_CHAIN_PIECE_KEYS,
  CARD6_CHAIN_POSES,
  CARD6_CHAIN_SEAMS,
  card6ChainGeoms,
  card6ChainInnerLines,
} from './card6-chain.fixture';
import { pendingLayerRows, pendingStacking, type PendingLayerEdits } from './pose-picking';
import { posePickup } from './step-pose';
import {
  layersOf,
  OWNER_FIT,
  stepResults,
  type LayerBlock,
  type LayerRow,
  type StepResultsInput,
} from './step-result';

const block = (...pieces: string[]): LayerBlock => ({ pieces });
const anchor = (spec: string) => {
  const [piece, layer] = spec.split(':');
  return { piece, ...(layer ? { layer: layer as SeamLayer } : {}) };
};
const row = (key: string, a: string, b: string): LayerRow => ({
  key,
  sideA: a.split(' ').map(anchor),
  sideB: b.split(' ').map(anchor),
});
const pose = (key: string, piece: string, host: string): LayerRow => ({
  ...row(key, piece, host),
  pose: true,
});

const sorted = (pairs: readonly (readonly [string, string])[]) =>
  pairs.map(([under, over]) => `${under}<${over}`).sort();

const agreesWithOrder = (stacking: {
  layers: readonly string[];
  stacked: readonly (readonly [string, string])[];
}) => {
  for (const [under, over] of stacking.stacked)
    expect(stacking.layers.indexOf(under)).toBeLessThan(stacking.layers.indexOf(over));
};

describe('layersOf: a claim is about two blocks', () => {
  it('lifts a flag on one part to both whole blocks', () => {
    const out = layersOf(
      [block('PCK'), block('TOP_R', 'TOP_L')],
      [pose('p', 'TOP_R:under', 'PCK')],
    );
    expect(sorted(out.stacked)).toEqual(['TOP_L<PCK', 'TOP_R<PCK']);
    expect([...out.lower].sort()).toEqual(['TOP_L', 'TOP_R']);
    expect(out.layers).toEqual(['TOP_R', 'TOP_L', 'PCK']);
    expect(out.conflicts).toEqual([]);
  });

  it('keeps the carried inner order and claims inside a lifted block', () => {
    const out = layersOf(
      [{ pieces: ['MAIN', 'U'], layers: ['U', 'MAIN'], stacked: [['U', 'MAIN']] }, block('U1')],
      [row('s', 'U1:under', 'MAIN')],
    );
    expect(out.layers).toEqual(['U1', 'U', 'MAIN']);
    expect(sorted(out.stacked)).toEqual(['U1<MAIN', 'U1<U', 'U<MAIN']);
    agreesWithOrder(out);
  });

  it('reads a flag between two pieces of one block as a claim about those two only', () => {
    const out = layersOf([block('A', 'B'), block('C')], [row('s', 'A:over', 'B')]);
    expect(sorted(out.stacked)).toEqual(['B<A']);
    expect(out.layers).toEqual(['B', 'A', 'C']);
  });

  it('first flag wins, a contrary one is listed and the row is left as it is', () => {
    const rows = [row('one', 'A:under', 'B1'), row('two', 'B2:under', 'A')];
    const out = layersOf([block('A'), block('B1', 'B2')], rows);
    expect(sorted(out.stacked)).toEqual(['A<B1', 'A<B2']);
    expect(out.conflicts).toEqual([{ key: 'two', piece: 'B2', partner: 'A', layer: 'under' }]);
    expect(rows[1].sideA[0].layer).toBe('under');
  });

  it('two flags that say the same thing are one fact, not a conflict', () => {
    const out = layersOf(
      [block('A'), block('B1', 'B2')],
      [row('one', 'A:under', 'B1 B2:over'), pose('two', 'B2:over', 'A')],
    );
    expect(sorted(out.stacked)).toEqual(['A<B1', 'A<B2']);
    expect(out.conflicts).toEqual([]);
  });

  it('lists a flag that closes a cycle through a third block', () => {
    const out = layersOf(
      [block('A'), block('B'), block('C')],
      [row('ab', 'A:under', 'B'), row('bc', 'B:under', 'C'), row('ca', 'C:under', 'A')],
    );
    expect(sorted(out.stacked)).toEqual(['A<B', 'B<C']);
    expect(out.conflicts.map((conflict) => conflict.key)).toEqual(['ca']);
    expect(out.layers).toEqual(['A', 'B', 'C']);
  });

  it('a claim beats the carried order and always shows in the order', () => {
    const carried = layersOf(
      [{ pieces: ['A', 'B', 'C'], layers: ['A', 'B', 'C'] }],
      [row('s', 'C:under', 'A')],
    );
    expect(carried.layers).toEqual(['C', 'A', 'B']);
    agreesWithOrder(carried);
  });

  it('a surface part follows the rule: with no flag the later input is on top', () => {
    const out = layersOf([block('HOST'), block('PART')], [row('s', 'HOST', 'PART')]);
    expect(out.stacked).toEqual([]);
    expect(out.lower).toEqual([]);
    expect(out.layers).toEqual(['HOST', 'PART']);

    // No hint lifts the part either: the earlier input stays under the later one.
    const partFirst = layersOf([block('PART'), block('HOST')], [row('s', 'HOST', 'PART')]);
    expect(partFirst.layers).toEqual(['PART', 'HOST']);
  });
});

describe('layersOf with an order: the window beats the flags between blocks', () => {
  const blocks = [
    { key: 'a', pieces: ['A'] },
    { key: 'b', pieces: ['B1', 'B2'] },
  ];

  it('puts the blocks as the order says, whatever the flags between them say', () => {
    const rows = [row('one', 'A:under', 'B1'), pose('two', 'B2:under', 'A')];
    const out = layersOf(blocks, rows, ['b', 'a']);
    expect(out.layers).toEqual(['B1', 'B2', 'A']);
    expect(sorted(out.stacked)).toEqual(['B1<A', 'B2<A']);
    expect(out.conflicts).toEqual([]);
    agreesWithOrder(out);
  });

  it('never lists a flag between blocks as a conflict', () => {
    const rows = [row('one', 'A:over', 'B1'), row('two', 'B2:over', 'A')];
    expect(layersOf(blocks, rows).conflicts).toHaveLength(1);
    expect(layersOf(blocks, rows, ['a', 'b']).conflicts).toEqual([]);
    expect(layersOf(blocks, rows, ['b', 'a']).conflicts).toEqual([]);
  });

  it('the flags themselves are not rewritten', () => {
    const rows = [row('one', 'A:under', 'B1')];
    layersOf(blocks, rows, ['b', 'a']);
    expect(rows[0].sideA[0].layer).toBe('under');
  });

  it('a flag inside a block works as before, and a contrary one is still listed', () => {
    const rows = [row('in', 'B2:under', 'B1'), row('in2', 'B1:under', 'B2')];
    const out = layersOf(blocks, rows, ['b', 'a']);
    expect(out.layers).toEqual(['B2', 'B1', 'A']);
    expect(out.stacked).toContainEqual(['B2', 'B1']);
    expect(out.conflicts.map((conflict) => conflict.key)).toEqual(['in2']);
  });

  it('keeps the carried inner order of a block it moves', () => {
    const out = layersOf(
      [
        { key: 'u', pieces: ['MAIN', 'U'], layers: ['U', 'MAIN'], stacked: [['U', 'MAIN']] },
        { key: 'one', pieces: ['U1'] },
      ],
      [],
      ['one', 'u'],
    );
    expect(out.layers).toEqual(['U1', 'U', 'MAIN']);
    agreesWithOrder(out);
  });

  it('a key no longer among the inputs is skipped, a new input goes on top', () => {
    const three = [...blocks, { key: 'c', pieces: ['C'] }];
    expect(layersOf(three, [], ['gone', 'b', 'a']).layers).toEqual(['B1', 'B2', 'A', 'C']);
    expect(layersOf(three, [], ['b', 'gone', 'b', 'a']).layers).toEqual(['B1', 'B2', 'A', 'C']);
  });

  it('a block with no pieces takes no place', () => {
    const empty = [...blocks, { key: 'none', pieces: [] }];
    expect(layersOf(empty, [], ['none', 'b', 'a']).layers).toEqual(['B1', 'B2', 'A']);
  });

  it('no order, an empty one and one of stale keys all read as today, byte for byte', () => {
    const rows = [row('one', 'A:over', 'B1'), row('two', 'B2:under', 'A')];
    const today = layersOf(blocks, rows);
    expect(layersOf(blocks, rows, [])).toEqual(today);
    expect(layersOf(blocks, rows, ['gone'])).toEqual(today);
  });

  it('a block hands the pairs it set on', () => {
    const out = layersOf(blocks, [], ['b', 'a']);
    const next = layersOf(
      [
        {
          key: 'whole',
          pieces: ['A', 'B1', 'B2'],
          layers: out.layers,
          stacked: out.stacked,
        },
        { key: 'c', pieces: ['C'] },
      ],
      [],
    );
    expect(next.layers).toEqual(['B1', 'B2', 'A', 'C']);
  });
});

describe('pendingStacking: the same rule on the pending rows', () => {
  const blocks = [block('A'), block('B1', 'B2')];
  const rows = [row('s', 'A', 'B1'), pose('p', 'B2:over', 'A')];

  it('no edits show the stored result', () => {
    expect(pendingStacking({ blocks, rows }, {})).toEqual(layersOf(blocks, rows));
  });

  it('reads the same order as the result', () => {
    const named = [
      { key: 'a', pieces: ['A'] },
      { key: 'b', pieces: ['B1', 'B2'] },
    ];
    const pending = pendingStacking({ blocks: named, rows, order: ['b', 'a'] }, {});
    expect(pending).toEqual(layersOf(named, rows, ['b', 'a']));
    expect(pending.layers).toEqual(['B1', 'B2', 'A']);
  });

  it('a flag edit, a dropped and a moved pose all reach the rule', () => {
    expect(
      sorted(pendingStacking({ blocks, rows }, { layers: new Map([['B2', 'under']]) }).stacked),
    ).toEqual(['B1<A', 'B2<A']);
    expect(pendingStacking({ blocks, rows }, { layers: new Map([['B2', null]]) }).stacked).toEqual(
      [],
    );
    expect(pendingStacking({ blocks, rows }, { dropped: new Set(['B2']) }).stacked).toEqual([]);
    expect(
      sorted(
        pendingStacking(
          { blocks: [...blocks, block('C')], rows },
          { moved: new Map([['B2', { host: 'C', layer: 'over' }]]) },
        ).stacked,
      ),
    ).toEqual(['C<B1', 'C<B2']);
  });

  it('a re-flagged pose keeps its place, a moved one goes last', () => {
    const rows: LayerRow[] = [
      { key: 'p1', pose: true, sideA: [{ piece: 'B1' }], sideB: [{ piece: 'A' }] },
      { key: 'p2', pose: true, sideA: [{ piece: 'B2' }], sideB: [{ piece: 'A' }] },
    ];
    const keys = (edits: PendingLayerEdits) => pendingLayerRows(rows, edits).map((row) => row.key);
    expect(keys({ layers: new Map([['B1', 'under']]) })).toEqual(['p1', 'p2']);
    expect(keys({ moved: new Map([['B1', { host: 'A' }]]) })).toEqual(['p2', 'p1']);
  });

  it('a new pose joins the blocks and carries its flag', () => {
    const pending = pendingLayerRows([], {
      moved: new Map([['B1', { host: 'A' }]]),
      layers: new Map([['B1', 'under']]),
    });
    expect(sorted(layersOf(blocks, pending).stacked)).toEqual(['B1<A', 'B2<A']);
  });
});

describe('preview equals saved', () => {
  const input: StepResultsInput = {
    ops: CARD6_CHAIN_OPS,
    byKey: CARD6_CHAIN_SEAMS,
    poses: CARD6_CHAIN_POSES,
    geoms: card6ChainGeoms(),
    innerLines: card6ChainInnerLines(),
    pieceKeys: CARD6_CHAIN_PIECE_KEYS,
  };

  const withOrder = (opIndex: number, order: readonly string[]): StepResultsInput => ({
    ...input,
    ops: input.ops.map((op, at) => (at === opIndex ? { ...op, layerOrder: [...order] } : op)),
  });
  const prefix = (one: StepResultsInput, opIndex: number): StepResultsInput => ({
    ...one,
    ops: one.ops.slice(0, opIndex + 1),
  });
  const indexOfOp = (operationNumber: number) =>
    input.ops.findIndex((op) => op.operationNumber === operationNumber);

  it.each([380, 490, 570])(
    'op %i: every rotation of the blocks, what the preview shows is what is saved',
    { timeout: 60_000 },
    (operationNumber) => {
      const opIndex = indexOfOp(operationNumber);
      const result = stepResults(prefix(input, opIndex), OWNER_FIT)[opIndex];
      const { blocks, rows } = result.layerInput;
      const keys = blocks.map((one) => one.key!);
      expect(keys.length).toBeGreaterThan(1);
      for (let turn = 0; turn < keys.length; turn++) {
        const order = [...keys.slice(turn), ...keys.slice(0, turn)];
        const preview = pendingStacking({ blocks, rows, order }, {});
        const after = stepResults(prefix(withOrder(opIndex, order), opIndex), OWNER_FIT)[opIndex];
        expect(after.layers).toEqual(preview.layers);
        expect(after.stacked).toEqual(preview.stacked);
        expect(after.lower).toEqual(preview.lower);
        expect(after.layerConflicts).toEqual([]);
        // The order moves no piece.
        expect(after.transforms).toEqual(result.transforms);
        const at = (key: string) =>
          blocks.find((one) => one.key === key)!.pieces.map((piece) => after.layers.indexOf(piece));
        order.slice(1).forEach((key, index) => {
          expect(Math.max(...at(order[index]))).toBeLessThan(Math.min(...at(key)));
        });
      }
    },
  );

  it('with no order on any step the results carry none', { timeout: 60_000 }, () => {
    for (const one of stepResults(input, OWNER_FIT)) expect(one).not.toHaveProperty('ordered');
  });

  it('a saved order rides whole in the block to the later steps', { timeout: 60_000 }, () => {
    const opIndex = indexOfOp(380);
    const result = stepResults(prefix(input, opIndex), OWNER_FIT)[opIndex];
    const { blocks } = result.layerInput;
    const big = blocks.find((one) => one.pieces.length > 1)!;
    const small = blocks.find((one) => one.pieces.length === 1)!;
    const later = stepResults(withOrder(opIndex, [big.key!, small.key!]), OWNER_FIT).find(
      (one) =>
        one.opIndex > opIndex &&
        one.layerInput.blocks.some((block) =>
          [...big.pieces, ...small.pieces].every((p) => block.pieces.includes(p)),
        ),
    )!;
    for (const under of big.pieces) {
      expect(later.stacked).toContainEqual([under, small.pieces[0]]);
      expect(later.layers.indexOf(under)).toBeLessThan(later.layers.indexOf(small.pieces[0]));
    }
  });
});

describe('posePickup works on blocks', () => {
  it('names both whole blocks of the pickup, whichever part is taken', () => {
    const layout = {
      blocks: [{ pieces: ['BP_U_1'] }, { pieces: ['BP_U', 'BP_MAIN'] }],
      transforms: new Map(),
      hung: [['BP_U_1', 'BP_MAIN']] as const,
    };
    const geoms = new Map();
    const u1 = posePickup('BP_U_1', layout, geoms);
    expect(u1.host).toBe('BP_MAIN');
    expect(u1.block).toEqual(['BP_U_1']);
    expect(u1.hostBlock).toEqual(['BP_U', 'BP_MAIN']);
    const part = posePickup('BP_U', layout, geoms);
    expect(part.block).toEqual(['BP_U', 'BP_MAIN']);
    expect(part.hostBlock).toEqual(['BP_U_1']);
    expect(posePickup('NOPE', layout, geoms).hostBlock).toEqual([]);
  });
});
