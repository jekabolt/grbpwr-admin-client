import { describe, expect, it } from 'vitest';

import { withSeamLayer, type SeamLayer, type StoredPose, type StoredSeam } from 'lib/seams';

import {
  CARD6_CHAIN_OPS,
  CARD6_CHAIN_PIECE_KEYS,
  CARD6_CHAIN_POSES,
  CARD6_CHAIN_SEAMS,
  card6ChainGeoms,
  card6ChainInnerLines,
} from './card6-chain.fixture';
import {
  blockRelation,
  joinsBlocks,
  onTopChip,
  pendingLayerRows,
  pendingStacking,
  pressEdits,
  pressLayer,
  type PendingLayerEdits,
} from './pose-picking';
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

describe('pressLayer: one press, one fact', () => {
  const backBlocks = [block('PCK'), block('TOP_R', 'TOP_L')];
  const backRows = [
    row('surface', 'PCK', 'TOP_L TOP_R'),
    pose('pose r', 'TOP_R:over', 'PCK'),
    pose('pose l', 'TOP_L:over', 'PCK'),
  ];
  const flags = (rows: readonly LayerRow[]) =>
    rows.flatMap((one) => [...one.sideA, ...one.sideB].filter((a) => a.layer));

  it('a press on any part takes the whole block', () => {
    for (const [piece, host, layer] of [
      ['TOP_R', 'PCK', 'under'],
      ['TOP_L', 'PCK', 'under'],
      ['PCK', 'TOP_L', 'over'],
    ] as const) {
      const pressed = pressLayer(backRows, backBlocks, piece, host, layer);
      const out = layersOf(backBlocks, pressed);
      expect(flags(pressed)).toHaveLength(1);
      expect(sorted(out.stacked)).toEqual(['TOP_L<PCK', 'TOP_R<PCK']);
      expect(out.layers[2]).toBe('PCK');
      expect(out.conflicts).toEqual([]);
    }
  });

  it('a press on a part that is on no row stores the flag on a row of its block', () => {
    const blocks = [block('U1'), block('MAIN', 'U')];
    const rows = [row('edge', 'U1', 'MAIN')];
    const pressed = pressLayer(rows, blocks, 'U', 'U1', 'under');
    expect(pressed[0].sideB[0].layer).toBe('under');
    expect(sorted(layersOf(blocks, pressed).stacked)).toEqual(['MAIN<U1', 'U<U1']);
  });

  it('stores the flag on the other block when that anchor relates only the two blocks', () => {
    const blocks = [block('A'), block('B'), block('C')];
    const pressed = pressLayer([row('s', 'A', 'B C')], blocks, 'A', 'B', 'under');
    expect(pressed[0].sideA[0].layer).toBeUndefined();
    expect(pressed[0].sideB[0].layer).toBe('over');
    expect(sorted(layersOf(blocks, pressed).stacked)).toEqual(['A<B']);
  });

  it('flags one anchor of a repeated piece and clears the hosts flag of a pose', () => {
    const blocks = [block('A'), block('B')];
    const pressed = pressLayer(
      [row('s', 'A', 'B B'), pose('p', 'A', 'B:over')],
      blocks,
      'A',
      'B',
      'over',
    );
    expect(flags(pressed)).toEqual([{ piece: 'A', layer: 'over' }]);
    expect(pressed[0].sideA[0].layer).toBe('over');
  });

  it('leaves rows it does not touch and returns the same rows with no row to store on', () => {
    const blocks = [block('A'), block('B'), block('C')];
    const rows = [row('ab', 'A', 'B'), row('bc', 'B:under', 'C')];
    const pressed = pressLayer(rows, blocks, 'A', 'B', 'under');
    expect(pressed[1]).toBe(rows[1]);
    expect(pressLayer(rows, blocks, 'A', 'C', 'under')).toBe(rows);
    expect(joinsBlocks(rows, ['A'], ['C'])).toBe(false);
    expect(joinsBlocks(rows, ['C'], ['B'])).toBe(true);
  });

  it('keeps a press through a third block: the path that contradicts it is cleared', () => {
    const blocks = [block('A'), block('B'), block('C')];
    const rows = [row('ab', 'A:under', 'B'), row('bc', 'B:under', 'C'), row('ca', 'C', 'A')];
    const out = layersOf(blocks, pressLayer(rows, blocks, 'C', 'A', 'under'));
    expect(sorted(out.stacked)).toEqual(['C<A']);
    expect(out.conflicts).toEqual([]);
  });

  // Every state reachable by ANY sequence of presses, so no depth limit is assumed.
  const reachable = (blocks: readonly LayerBlock[], start: readonly LayerRow[]) => {
    const pieces = blocks.flatMap((one) => one.pieces);
    const key = (rows: readonly LayerRow[]) =>
      JSON.stringify(rows.map((one) => [one.sideA, one.sideB]));
    const blockOf = (piece: string) => blocks.find((one) => one.pieces.includes(piece))!.pieces;
    const states = new Set([key(start)]);
    const queue = [start];
    const wrong: string[] = [];
    let presses = 0;
    while (queue.length) {
      const rows = queue.pop()!;
      for (const piece of pieces)
        for (const host of pieces) {
          const own = blockOf(piece);
          const other = blockOf(host);
          if (own === other || !joinsBlocks(rows, own, other)) continue;
          for (const layer of ['under', 'over'] as const) {
            presses++;
            const next = pressLayer(rows, blocks, piece, host, layer);
            const out = layersOf(blocks, next);
            const said = `${key(rows)} ${piece} ${layer} ${host}`;
            if (out.conflicts.length) wrong.push(`contrary after ${said}`);
            if (blockRelation(out.stacked, own, other) !== layer) wrong.push(`lost: ${said}`);
            for (const a of own)
              for (const b of other)
                if (out.layers.indexOf(a) < out.layers.indexOf(b) !== (layer === 'under'))
                  wrong.push(`mixed: ${said}`);
            for (const [under, over] of out.stacked)
              if (out.layers.indexOf(under) > out.layers.indexOf(over))
                wrong.push(`order: ${said}`);
            if (key(pressLayer(next, blocks, piece, host, layer)) !== key(next))
              wrong.push(`second press: ${said}`);
            // One fact per pair of blocks, never a flag on every anchor.
            if (flags(next).length > (blocks.length * (blocks.length - 1)) / 2)
              wrong.push(`flags: ${said}`);
            if (!states.has(key(next))) {
              states.add(key(next));
              queue.push(next);
            }
          }
        }
    }
    expect(wrong.slice(0, 5)).toEqual([]);
    return { states: states.size, presses };
  };

  it(
    'no press sequence stores contrary flags: two blocks, seam and pose rows',
    { timeout: 60_000 },
    () => {
      const { states, presses } = reachable(
        [block('A1', 'A2'), block('B1', 'B2')],
        [row('s', 'A1', 'B1'), row('t', 'A2', 'B1 B2'), pose('p', 'A2', 'B2')],
      );
      expect(states).toBeGreaterThan(2);
      expect(presses).toBeGreaterThan(20);
    },
  );

  it(
    'no press sequence stores contrary flags: three blocks in a triangle',
    { timeout: 60_000 },
    () => {
      const { states } = reachable(
        [block('A1', 'A2'), block('B1'), block('C1', 'C2')],
        [row('ab', 'A1', 'B1'), row('bc', 'B1', 'C1'), pose('ca', 'C2', 'A2')],
      );
      expect(states).toBeGreaterThan(8);
    },
  );

  it(
    'no press sequence stores contrary flags: rows that cross three and four blocks',
    { timeout: 60_000 },
    () => {
      const { states } = reachable(
        [block('A'), block('B'), block('C'), block('D')],
        [row('wide', 'A D', 'B C'), row('thin', 'B', 'D'), pose('p', 'C', 'D')],
      );
      expect(states).toBeGreaterThan(8);
    },
  );

  it('a press wins over legacy contrary flags between its two blocks', () => {
    const blocks = [block('A'), block('B1', 'B2')];
    const rows = [row('one', 'A:under', 'B1'), row('two', 'B2:under', 'A')];
    expect(layersOf(blocks, rows).conflicts).toHaveLength(1);
    const out = layersOf(blocks, pressLayer(rows, blocks, 'B1', 'A', 'under'));
    expect(sorted(out.stacked)).toEqual(['B1<A', 'B2<A']);
    expect(out.conflicts).toEqual([]);
  });
});

describe('pendingStacking: the same rule on the pending rows', () => {
  const blocks = [block('A'), block('B1', 'B2')];
  const rows = [row('s', 'A', 'B1'), pose('p', 'B2:over', 'A')];

  it('no edits show the stored result', () => {
    expect(pendingStacking({ blocks, rows }, {})).toEqual(layersOf(blocks, rows));
  });

  it('a seam edit, a flag edit, a dropped and a moved pose all reach the rule', () => {
    const seam = { sideA: [anchor('A:over')], sideB: [anchor('B1')] };
    expect(
      sorted(
        pendingStacking({ blocks, rows: [rows[0]] }, { seams: new Map([['s', seam]]) }).stacked,
      ),
    ).toEqual(['B1<A', 'B2<A']);
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

  it('a re-flagged seam keeps its place, an otherwise edited one goes last', () => {
    const rows = [row('s1', 'B1', 'A'), row('s2', 'B2', 'A')];
    const edit = (side: LayerRow['sideA']) =>
      new Map([['s1', { sideA: side, sideB: rows[0].sideB }]]);
    const keys = (seams: ReturnType<typeof edit>) =>
      pendingLayerRows(rows, { seams }).map((one) => one.key);
    expect(keys(edit([{ piece: 'B1', layer: 'under' }]))).toEqual(['s1', 's2']);
    expect(keys(edit([{ piece: 'B3' }]))).toEqual(['s2', 's1']);
  });

  it('a new pose joins the blocks and carries its flag', () => {
    const pending = pendingLayerRows([], {
      moved: new Map([['B1', { host: 'A' }]]),
      layers: new Map([['B1', 'under']]),
    });
    expect(joinsBlocks(pending, ['B1', 'B2'], ['A'])).toBe(true);
    expect(sorted(layersOf(blocks, pending).stacked)).toEqual(['B1<A', 'B2<A']);
  });
});

describe('onTopChip: one chip, never off', () => {
  const pressChip = (
    blocks: readonly LayerBlock[],
    rows: readonly LayerRow[],
    press: NonNullable<ReturnType<typeof onTopChip>>['press'],
  ) =>
    press!.hosts.reduce<readonly LayerRow[]>(
      (all, host) => pressLayer(all, blocks, press!.piece, host, 'over'),
      rows,
    );
  const flagsIn = (rows: readonly LayerRow[]) =>
    rows.flatMap((one) => [...one.sideA, ...one.sideB]).filter((one) => one.layer).length;

  describe('with two inputs', () => {
    const blocks = [block('A'), block('B', 'C')];
    const rows = [row('s', 'A', 'B C')];

    it('nothing picked: names the input on top, active, and a press swaps', () => {
      const first = onTopChip(blocks, rows, layersOf(blocks, rows).layers, null)!;
      expect(first).toMatchObject({ input: 2, active: true });

      const swapped = pressChip(blocks, rows, first.press);
      const swappedOrder = layersOf(blocks, swapped).layers;
      expect(swappedOrder).toEqual(['B', 'C', 'A']);
      const second = onTopChip(blocks, swapped, swappedOrder, null)!;
      expect(second).toMatchObject({ input: 1, active: true });

      const back = pressChip(blocks, swapped, second.press);
      expect(onTopChip(blocks, back, layersOf(blocks, back).layers, null)).toMatchObject({
        input: 2,
        active: true,
      });
      // Two presses, one pair: one fact, never an off state and never two facts.
      expect(flagsIn(back)).toBe(1);
    });

    it('a block picked: names it, active when on top, and a press puts it on top', () => {
      const layers = layersOf(blocks, rows).layers;
      const low = onTopChip(blocks, rows, layers, 'A')!;
      expect(low).toMatchObject({ input: 1, active: false });

      const pressed = pressChip(blocks, rows, low.press);
      const after = layersOf(blocks, pressed).layers;
      expect(after.at(-1)).toBe('A');
      expect(onTopChip(blocks, pressed, after, 'A')).toEqual({
        input: 1,
        active: true,
        press: null,
      });
    });

    it('already on top: the press writes nothing, from any piece of the block', () => {
      const layers = layersOf(blocks, rows).layers;
      for (const picked of ['B', 'C'])
        expect(onTopChip(blocks, rows, layers, picked)).toEqual({
          input: 2,
          active: true,
          press: null,
        });
    });

    it('a piece of no input reads as nothing picked', () => {
      const layers = layersOf(blocks, rows).layers;
      const chip = onTopChip(blocks, rows, layers, 'GHOST')!;
      expect(chip).toMatchObject({ input: 2, active: true, press: { piece: 'A' } });
    });
  });

  describe('with three inputs, the same chip on the picked block', () => {
    const blocks = [block('A'), block('B'), block('C')];
    const rows = [row('ab', 'A', 'B'), row('bc', 'B', 'C'), row('ac', 'A', 'C')];
    const layers = layersOf(blocks, rows).layers;

    it('names the top with nothing picked and has nothing to swap', () => {
      expect(onTopChip(blocks, rows, layers, null)).toEqual({
        input: 3,
        active: true,
        press: null,
      });
    });

    it('lifts the picked block over each block above it, one fact per pair', () => {
      const bottom = onTopChip(blocks, rows, layers, 'A')!;
      expect(bottom).toMatchObject({ input: 1, active: false });
      expect(bottom.press?.hosts).toEqual(['B', 'C']);

      const pressed = pressChip(blocks, rows, bottom.press);
      const after = layersOf(blocks, pressed);
      expect(after.layers.at(-1)).toBe('A');
      expect(after.conflicts).toEqual([]);
      expect(flagsIn(pressed)).toBe(2);
      expect(onTopChip(blocks, pressed, after.layers, 'A')).toMatchObject({
        active: true,
        press: null,
      });

      const middle = onTopChip(blocks, rows, layers, 'B')!;
      expect(middle.press?.hosts).toEqual(['C']);
      const lifted = pressChip(blocks, rows, middle.press);
      expect(layersOf(blocks, lifted).layers).toEqual(['A', 'C', 'B']);
      expect(flagsIn(lifted)).toBe(1);
    });
  });

  it('with a block above and not joined, a press writes nothing and the chip stays disabled', () => {
    const blocks = [block('A'), block('B'), block('C')];
    const rows = [row('ab', 'A', 'B')];
    const layers = layersOf(blocks, rows).layers;
    expect(layers).toEqual(['A', 'B', 'C']);

    // A is joined to B only and C stays above it: lifting over B alone would store a fact and leave
    // the chip inactive after a reload.
    expect(onTopChip(blocks, rows, layers, 'A')).toEqual({ input: 1, active: false, press: null });
    // B is below C with no row between them, too.
    expect(onTopChip(blocks, rows, layers, 'B')).toEqual({ input: 2, active: false, press: null });
  });

  it('with no row between the blocks there is no fact to store', () => {
    const blocks = [block('A'), block('B')];
    const layers = layersOf(blocks, []).layers;
    expect(onTopChip(blocks, [], layers, null)).toEqual({ input: 2, active: true, press: null });
    expect(onTopChip(blocks, [], layers, 'A')).toEqual({ input: 1, active: false, press: null });
  });

  it('shows no chip when the step has no input with a piece', () => {
    expect(onTopChip([], [], [], null)).toBeNull();
    expect(onTopChip([block()], [], [], null)).toBeNull();
  });

  it('preview equals saved: the pending picture is the picture of the pressed rows', () => {
    const blocks = [block('A'), block('B', 'C')];
    const rows = [row('s', 'A', 'B C'), pose('p', 'C', 'A')];
    const chip = onTopChip(blocks, rows, layersOf(blocks, rows).layers, 'A')!;
    const pressed = pressChip(blocks, rows, chip.press);
    const stored = (key: string) => rows.find((one) => one.key === key);
    const edits = pressEdits(rows, pressed, stored, { seams: new Map(), layers: new Map() });

    expect(pendingStacking({ blocks, rows }, edits)).toEqual(layersOf(blocks, pressed));
    expect(pendingStacking({ blocks, rows }, edits).layers.at(-1)).toBe('A');
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

  /** What «done» stores after a press: re-flagged rows, each in its place. */
  const saved = (
    opIndex: number,
    seams: ReadonlyMap<string, StoredSeam>,
    layers: ReadonlyMap<string, SeamLayer | null>,
  ): StepResultsInput => {
    const byKey = new Map(input.byKey);
    for (const [key, one] of seams) byKey.set(key, one);
    const poses = new Map<string, StoredPose>(input.poses);
    const op = input.ops[opIndex];
    for (const [piece, layer] of layers) {
      const key = (op.poseKeys ?? []).find((k) => poses.get(k)?.sideA[0]?.piece === piece);
      const own = key ? poses.get(key) : undefined;
      if (!key || !own) continue;
      poses.set(key, {
        ...own,
        sideA: [withSeamLayer(own.sideA[0], layer), ...own.sideA.slice(1)],
        sideB: own.sideB.map((a) => withSeamLayer(a, null)),
      });
    }
    return { ...input, byKey, poses };
  };

  const prefix = (one: StepResultsInput, opIndex: number): StepResultsInput => ({
    ...one,
    ops: one.ops.slice(0, opIndex + 1),
  });
  const indexOfOp = (operationNumber: number) =>
    input.ops.findIndex((op) => op.operationNumber === operationNumber);
  const storedOf = (key: string) => input.byKey.get(key);

  it.each([380, 490, 570])(
    'op %i: any press on any part, then the opposite one',
    { timeout: 60_000 },
    (operationNumber) => {
      const opIndex = indexOfOp(operationNumber);
      const result = stepResults(prefix(input, opIndex), OWNER_FIT)[opIndex];
      const { blocks, rows } = result.layerInput;
      expect(blocks.length).toBeGreaterThan(1);
      const check = (
        edits: ReturnType<typeof pressEdits<StoredSeam>>,
        pickup: ReturnType<typeof posePickup>,
        layer: SeamLayer,
      ) => {
        const preview = pendingStacking({ blocks, rows }, edits);
        const after = stepResults(
          prefix(saved(opIndex, edits.seams, edits.layers), opIndex),
          OWNER_FIT,
        )[opIndex];
        expect(after.layers).toEqual(preview.layers);
        expect(after.stacked).toEqual(preview.stacked);
        expect(after.lower).toEqual(preview.lower);
        expect(after.layerConflicts).toEqual([]);
        expect(after.transforms).toEqual(result.transforms);
        expect(blockRelation(after.stacked, pickup.block, pickup.hostBlock)).toBe(layer);
      };
      for (const piece of blocks.flatMap((one) => one.pieces)) {
        const pickup = posePickup(
          piece,
          { blocks: result.blocks, transforms: result.transforms, hung: result.hung },
          input.geoms,
        );
        expect(pickup.host).not.toBeNull();
        expect(joinsBlocks(rows, pickup.block, pickup.hostBlock)).toBe(true);
        for (const [first, second] of [
          ['under', 'over'],
          ['over', 'under'],
        ] as const) {
          let edits = pressEdits(
            rows,
            pressLayer(rows, blocks, piece, pickup.host!, first),
            storedOf,
            {
              seams: new Map(),
              layers: new Map(),
            },
          );
          check(edits, pickup, first);
          const pending = pendingLayerRows(rows, edits);
          edits = pressEdits(
            pending,
            pressLayer(pending, blocks, piece, pickup.host!, second),
            storedOf,
            edits,
          );
          check(edits, pickup, second);
        }
      }
    },
  );

  it('a saved press rides whole in the block to the later steps', { timeout: 60_000 }, () => {
    const opIndex = indexOfOp(380);
    const result = stepResults(prefix(input, opIndex), OWNER_FIT)[opIndex];
    const { blocks, rows } = result.layerInput;
    const big = blocks.find((one) => one.pieces.length > 1)!.pieces;
    const small = blocks.find((one) => one.pieces.length === 1)!.pieces;
    const edits = pressEdits(rows, pressLayer(rows, blocks, big[0], small[0], 'under'), storedOf, {
      seams: new Map(),
      layers: new Map(),
    });
    const later = stepResults(saved(opIndex, edits.seams, edits.layers), OWNER_FIT).find(
      (one) =>
        one.opIndex > opIndex &&
        one.layerInput.blocks.some((block) =>
          [...big, ...small].every((p) => block.pieces.includes(p)),
        ),
    )!;
    for (const under of big) expect(later.stacked).toContainEqual([under, small[0]]);
    for (const under of big)
      expect(later.layers.indexOf(under)).toBeLessThan(later.layers.indexOf(small[0]));
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
