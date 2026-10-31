// P8 — the tech pack lays a piece placed by hand (a pose row) where the row says, and never reads
// the row as a seam of its step.

import { describe, expect, it } from 'vitest';

import type { Affine } from 'lib/assembly-skeleton/types';
import { compose } from 'lib/assembly-skeleton/union/affine';
import { newSeamKey, poseRow, toWire, type SeamPlacement } from 'lib/seams';

import { poseRowsOfCard } from '../components/card-seam-graph';
import { invert } from '../components/step-seams/step-picture';
import { placementT } from '../components/step-seams/step-pose';
import { card83StoredSeamsFixture } from './assembly-inference.fixture';
import { deriveAssembly, seamsOfOp, type AssemblyInput } from './derive-assembly';
import { editorOperationPictures } from './pages/assembly';

const near = (a: Affine, b: Affine) =>
  a.every((v, i) => Math.abs(v - b[i]) < (i >= 4 ? 1e-4 : 1e-6));
const relOf = (T: ReadonlyMap<string, Affine>, piece: string, host: string) =>
  compose(invert(T.get(host)!), T.get(piece)!);

function withPose(
  input: AssemblyInput,
  operationNumber: number,
  piece: string,
  host: string,
  placement: SeamPlacement,
) {
  const row = poseRow({
    seamKey: newSeamKey(),
    piece: input.pieces.get(piece)!.geom,
    host: input.pieces.get(host)!.geom,
    placement,
  });
  const card = input.techCard.techCard!;
  return {
    row,
    input: {
      ...input,
      techCard: {
        ...input.techCard,
        seams: [...(input.techCard.seams ?? []), toWire(row)],
        techCard: {
          ...card,
          operations: (card.operations ?? []).map((op) =>
            op.operationNumber === operationNumber
              ? { ...op, seamKeys: [...(op.seamKeys ?? []), row.seamKey] }
              : op,
          ),
        },
      },
    } as AssemblyInput,
  };
}

describe('the tech pack and a pose row', () => {
  it('a step whose only key is a pose reads its seams as before (the guess)', () => {
    const guess = [{ key: 'g' } as unknown as ReturnType<typeof seamsOfOp>[number]];
    const catalog = { byKey: new Map(), guessed: new Map([[10, guess]]), poses: new Set(['P']) };
    const op = { operationNumber: 10, seamKeys: ['P'] } as Parameters<typeof seamsOfOp>[0];
    expect(seamsOfOp(op, catalog)).toBe(guess);
    expect(seamsOfOp(op, { ...catalog, poses: undefined })).toEqual([]);
  });

  it('card 83: the posed piece lies on its host where the row says, in its step and later', () => {
    const base = card83StoredSeamsFixture();
    const plain = editorOperationPictures(base.techCard, deriveAssembly(base))!;
    // The first step drawing two pieces or more: its smallest piece goes onto its biggest.
    const [operationNumber, picture] = [...plain].find(([, p]) => p.layout.T.size >= 2)!;
    const area = (k: string) => Math.abs(base.pieces.get(k)?.geom.areaMm2 ?? 0);
    const drawn = [...picture.layout.T.keys()].filter((k) => base.pieces.has(k));
    const host = drawn.reduce((a, b) => (area(b) > area(a) ? b : a));
    const piece = drawn.filter((k) => k !== host).reduce((a, b) => (area(b) < area(a) ? b : a));
    const at: SeamPlacement = { xMm: 37.5, yMm: -22, rotDeg: 90, flip: false };

    const { row, input } = withPose(base, operationNumber, piece, host, at);
    expect([...poseRowsOfCard(input.techCard).keys()]).toEqual([row.seamKey]);
    const model = deriveAssembly(input);
    const posed = editorOperationPictures(input.techCard, model)!;
    const want = placementT(base.pieces.get(host)!.geom, base.pieces.get(piece)!.geom, at);

    expect(near(relOf(posed.get(operationNumber)!.layout.T, piece, host), want)).toBe(true);
    let later = 0;
    for (const [n, p] of posed)
      if (n > operationNumber && p.layout.T.has(piece) && p.layout.T.has(host)) {
        later += 1;
        expect(near(relOf(p.layout.T, piece, host), want), `op ${n}`).toBe(true);
      }
    // A later step that draws both lays them so too.
    expect(later, `after op ${operationNumber}: ${piece} on ${host}`).toBeGreaterThan(0);
    // Steps before it are laid as before.
    for (const [n, p] of plain)
      if (n < operationNumber)
        expect([...posed.get(n)!.layout.T], `op ${n}`).toEqual([...p.layout.T]);
  }, 300_000);
});
