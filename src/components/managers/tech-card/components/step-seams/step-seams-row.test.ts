import { describe, expect, it } from 'vitest';
import { card6Geoms, card6InnerLines } from './card6.fixture';
import { seamTileSideLines } from './step-seams-row';

describe('seamTileSideLines', () => {
  it('prints two code and whole-mm lines using the picker length model', () => {
    const geoms = card6Geoms();
    const sleeve = geoms.get('SLV_L')!.edges[0];
    const flap = geoms.get('FLP_L')!.edges[0];
    const placket = geoms.get('FLP_L_MAIN')!.edges[0];

    expect(
      seamTileSideLines(
        {
          a: [{ target: sleeve.id }, { target: flap.id }],
          b: [{ target: placket.id }],
        },
        geoms,
        card6InnerLines(),
      ),
    ).toEqual([
      `SLV_L + FLP_L ${Math.round(sleeve.lenMm + flap.lenMm)}`,
      `FLP_L_MAIN ${Math.round(placket.lenMm)}`,
    ]);
  });
});
