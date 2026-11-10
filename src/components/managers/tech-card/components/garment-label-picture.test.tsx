import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';

import { GarmentLabelOverlay } from './garment-label-picture';

// The owner's composition label: 30 × 100, folded at 50, sewn at 40 and 60 → 30 × 40 shows.
const mark = {
  label: 'composition',
  widthMm: 30,
  heightMm: 100,
  fold: 'half' as const,
  foldLines: [50],
  stitchLines: [40, 60],
  attachment: 'sewn_into_seam',
};

// Drawn y-down on screen from a y-up piece: a, b at the bottom; c, d at the top.
const drawn: Pt2[] = [
  [0, 40],
  [30, 40],
  [30, 0],
  [0, 0],
];

const render = (stitchLines: number[]) =>
  renderToStaticMarkup(
    <svg>
      <GarmentLabelOverlay
        pieces={[{ key: 'label', drawn }]}
        geoms={
          new Map([['label', { garmentLabel: { ...mark, stitchLines } } as unknown as PieceGeom]])
        }
        hair={1}
        outlineWidth={2}
      />
    </svg>,
  );

const stitchYs = (html: string) =>
  [...html.matchAll(/d="M[\d.]+ ([\d.]+) L[\d.]+ ([\d.]+)"[^>]*data-label-stitch/g)].map((m) =>
    Number(m[1]),
  );

describe('garment label picture', () => {
  it('draws the sewn edge at the top, just inside the outline, as wide as it', () => {
    const html = render([40, 60]);
    const ys = stitchYs(html);
    expect(ys).toHaveLength(1);
    expect(ys[0]).toBeGreaterThan(0);
    expect(ys[0]).toBeLessThan(4);
    expect(html).toContain('stroke-width="2"');
    expect(html).toContain('data-label-layers="2"');
  });
  it('draws both seams of a label sewn at both ends', () => {
    expect(stitchYs(render([0, 100])).length).toBe(1);
    const flat = renderToStaticMarkup(
      <svg>
        <GarmentLabelOverlay
          pieces={[{ key: 'label', drawn }]}
          geoms={
            new Map([
              [
                'label',
                {
                  garmentLabel: { ...mark, fold: 'flat', foldLines: [], stitchLines: [0, 100] },
                } as unknown as PieceGeom,
              ],
            ])
          }
          hair={1}
          outlineWidth={2}
        />
      </svg>,
    );
    const ys = stitchYs(flat);
    expect(ys).toHaveLength(2);
    expect(Math.min(...ys)).toBeLessThan(4);
    expect(Math.max(...ys)).toBeGreaterThan(36);
  });
  it('draws no stitch on an unsewn label', () => {
    expect(stitchYs(render([]))).toHaveLength(0);
  });
  it('draws the tee tip as the sewn line on both axes', () => {
    const tee = {
      ...mark,
      fold: 'tee' as const,
      foldLines: [42, 58],
      stitchLines: [47, 53],
    };
    const height = renderToStaticMarkup(
      <svg>
        <GarmentLabelOverlay
          pieces={[{ key: 'label', drawn }]}
          geoms={new Map([['label', { garmentLabel: tee } as unknown as PieceGeom]])}
          hair={1}
          outlineWidth={2}
        />
      </svg>,
    );
    expect(height).toContain('d="M0.00 20.00 L30.00 20.00"');

    const widthDrawn: Pt2[] = [
      [0, 30],
      [84, 30],
      [84, 0],
      [0, 0],
    ];
    const width = renderToStaticMarkup(
      <svg>
        <GarmentLabelOverlay
          pieces={[{ key: 'label', drawn: widthDrawn }]}
          geoms={
            new Map([
              [
                'label',
                {
                  garmentLabel: { ...tee, widthMm: 100, heightMm: 30, foldAxis: 'width' },
                } as unknown as PieceGeom,
              ],
            ])
          }
          hair={1}
          outlineWidth={2}
        />
      </svg>,
    );
    expect(width).toContain('d="M42.00 30.00 L42.00 0.00"');
  });
});
