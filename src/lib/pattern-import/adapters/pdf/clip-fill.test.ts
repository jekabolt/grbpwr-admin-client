import { expect, it } from 'vitest';
import { walkOperatorList } from './walk';

it('clips fill marks to an oblique mask until restore, in either winding', () => {
  const ops = {
    constructPath: 1,
    moveTo: 2,
    lineTo: 3,
    closePath: 4,
    eoClip: 5,
    endPath: 6,
    fill: 7,
    rectangle: 8,
    save: 9,
    restore: 10,
    stroke: 11,
  };
  const rect = (x: number, y: number) => [[8], [x, y, 1, 1]];
  const outside = rect(1.2, 1.2),
    half = rect(0.5, 0.5),
    inside = rect(-0.5, -0.5);
  for (const coords of [
    [0, -2, 2, 0, 0, 2, -2, 0],
    [-2, 0, 0, 2, 2, 0, 0, -2],
  ]) {
    const { paths, styles } = walkOperatorList(
      {
        fnArray: [9, 1, 5, 6, 1, 7, 1, 7, 1, 7, 1, 11, 10, 1, 7],
        argsArray: [
          [],
          [[2, 3, 3, 3, 4], coords],
          [],
          [],
          outside,
          [],
          half,
          [],
          inside,
          [],
          inside,
          [],
          [],
          outside,
          [],
        ],
      },
      {
        ops,
        base: [1, 0, 0, 1, 0, 0],
        file: 'tile',
        page: 0,
        pageBox: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
        keepFills: true,
        sagittaMm: 0.05,
        ocName: () => null,
      },
    );
    expect(paths.map((p) => p.src.op)).toEqual([5, 7, 9, 11, 14]);
    expect(paths[0].visibleFill).toEqual([]);
    expect(paths[1].visibleFill).toEqual([
      { x: 0.5, y: 0.5 },
      { x: 1.5, y: 0.5 },
      { x: 0.5, y: 1.5 },
    ]);
    expect(paths[2].pts).toHaveLength(4);
    expect(styles[paths[0].style].clipQuad).toHaveLength(4);
    expect(styles[paths[0].style].clipPolygon).toBeUndefined();
    expect(styles[paths[0].style].localClipPolygon).toHaveLength(4);
    expect(styles[paths[3].style].clipPolygon).toHaveLength(4);
    expect(styles[paths[3].style].clipQuad).toBeUndefined();
    expect(paths.slice(0, 4).every((p) => !p.visibleMotif)).toBe(true);
    expect(paths[4].visibleFill).toBeUndefined();
    expect(paths[4].visibleMotif).toBe(true);
  }
});
