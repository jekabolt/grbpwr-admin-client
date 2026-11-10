import { describe, expect, it, vi } from 'vitest';

import * as seamLength from 'components/managers/tech-card/components/step-seams/seam-length';

import { card83RealFixture } from './assembly-inference.fixture';
import { deriveAssembly } from './derive-assembly';
import { createPdfT } from './i18n';
import { ownerLayoutsByNumber, ownerStepResultsOfCard } from './owner-step-results';

vi.mock(
  'components/managers/tech-card/components/step-seams/seam-length',
  async (importOriginal) => {
    const actual = await importOriginal<typeof seamLength>();
    return { ...actual, sideLengthMm: vi.fn(actual.sideLengthMm) };
  },
);

describe('assembly seam lengths', () => {
  it('reads a stretch laid on another piece on the editor step picture, not the print layout', () => {
    const input = card83RealFixture();
    const editor = ownerLayoutsByNumber(
      ownerStepResultsOfCard(input.techCard, input.techCard, input.pieces, input.grainDeg),
    ).get(400);
    expect(editor?.size).toBeGreaterThan(1);

    const spy = vi.mocked(seamLength.sideLengthMm);
    spy.mockClear();
    const model = deriveAssembly({ ...input, t: createPdfT('ru') });
    expect(model.cards.get(400)?.metrics).toHaveLength(1);

    const neckline = model.cards.get(400)!.seams[0].b;
    const targets = neckline.map((part) => part.edgeId).join(' ');
    const placed = spy.mock.calls.find(
      ([parts]) => parts.map((part) => part.target).join(' ') === targets,
    )?.[3]?.placed;
    expect(placed).toBeDefined();
    for (const { piece } of neckline) expect(placed?.get(piece)).toEqual(editor?.get(piece));
  });
});
