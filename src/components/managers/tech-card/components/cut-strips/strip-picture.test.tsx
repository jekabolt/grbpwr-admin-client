import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { Pt2 } from 'lib/assembly-skeleton/types';
import { apply } from 'lib/assembly-skeleton/union/affine';

import type { AssemblyInput } from '../../techpack/derive-assembly';
import { seamGraphOfCard, seamRowsOfCard } from '../card-seam-graph';
import { boxOf } from '../step-seams/step-picture';
import { StepPictureSvg, stepPictureOfOp, type SceneOp } from '../step-seams/step-picture-view';
import { OWNER_FIT, stepResults } from '../step-seams/step-result';
import { stripLengthText } from './strip-picture';
import { fromSeamStrip, oneLengthStrip, STRIP, waistbandCard, WAISTBAND } from './strip.fixture';

function sceneOf(input: AssemblyInput, explode = 0) {
  const geoms = new Map([...input.pieces].map(([key, piece]) => [key, piece.geom]));
  const operations = (input.techCard.techCard?.operations ?? []) as SceneOp[];
  return stepPictureOfOp(operations[0], seamGraphOfCard(input.techCard, input.pieces), geoms, {
    operations,
    index: 0,
    pieceKeys: new Set(geoms.keys()),
    byKey: seamRowsOfCard(input.techCard),
    nameOf: (key) => input.pieces.get(key)?.name ?? key,
    explode,
  });
}

const ringOf = (scene: ReturnType<typeof sceneOf>, key: string): Pt2[] =>
  (scene.geoms.get(key)?.rs ?? []).map((point) => apply(scene.layout.T.get(key)!, point));

describe('the strip on a step picture', () => {
  it('lies inside the waistband, centred along it and painted last', () => {
    const scene = sceneOf(waistbandCard());
    const strip = boxOf(ringOf(scene, STRIP));
    const band = boxOf(ringOf(scene, WAISTBAND));
    expect(strip.x0).toBeGreaterThan(band.x0);
    expect(strip.x1).toBeLessThan(band.x1);
    expect(strip.y0).toBeGreaterThanOrEqual(band.y0 - 0.01);
    expect(strip.y1).toBeLessThanOrEqual(band.y1 + 0.01);
    // 672 in a 790 band: 59 each side
    expect(strip.x0 - band.x0).toBeCloseTo(59, 0);
    expect(band.x1 - strip.x1).toBeCloseTo(59, 0);
    expect(strip.x1 - strip.x0).toBeCloseTo(672, 0);
    expect(strip.y1 - strip.y0).toBeCloseTo(40, 0);
    expect([...scene.layout.T.keys()].at(-1)).toBe(STRIP);
    expect(scene.layout.stripHosts?.get(STRIP)).toBe(WAISTBAND);
  });

  it('stays apart while the seam is being picked, so its edges can be reached', () => {
    const scene = sceneOf(waistbandCard(), 0.12);
    const strip = boxOf(ringOf(scene, STRIP));
    const band = boxOf(ringOf(scene, WAISTBAND));
    expect(strip.y0 >= band.y1 || band.y0 >= strip.y1 || strip.x0 >= band.x1).toBe(true);
    expect(scene.layout.stripHosts).toBeUndefined();
  });

  it('is laid by the owner result too, and is no collision there', () => {
    const input = waistbandCard();
    const geoms = new Map([...input.pieces].map(([key, piece]) => [key, piece.geom]));
    const [result] = stepResults(
      {
        ops: (input.techCard.techCard?.operations ?? []) as SceneOp[],
        byKey: seamRowsOfCard(input.techCard),
        geoms,
        innerLines: new Map(),
        pieceKeys: new Set(geoms.keys()),
      },
      OWNER_FIT,
    );
    const place = (key: string) =>
      boxOf((geoms.get(key)?.rs ?? []).map((point) => apply(result.layout.T.get(key)!, point)));
    expect(place(STRIP).x0).toBeGreaterThan(place(WAISTBAND).x0);
    expect(place(STRIP).x1).toBeLessThan(place(WAISTBAND).x1);
    expect(result.layout.colliding).toEqual([]);
  });

  it('reads grey, named, with the host above and the length under it', () => {
    const scene = sceneOf(waistbandCard());
    const markup = renderToStaticMarkup(
      <StepPictureSvg
        w={640}
        h={240}
        pad={4}
        look='print'
        layout={scene.layout}
        geoms={scene.geoms}
      />,
    );
    expect(markup).toContain(`data-cut-strip="${STRIP}"`);
    expect(markup).toContain('fill="var(--color-borderColor)"');
    expect(markup).toMatch(/data-cut-strip-name="">rubber</);
    expect(markup).toMatch(/data-cut-strip-host="">waistband</);
    expect(markup).toMatch(/data-cut-strip-length="">M · 790 → 672</);
  });

  it('is grey only on a row tile', () => {
    const scene = sceneOf(waistbandCard());
    const markup = renderToStaticMarkup(
      <StepPictureSvg
        w={120}
        h={80}
        pad={2}
        look='tile'
        layout={scene.layout}
        geoms={scene.geoms}
      />,
    );
    expect(markup).toContain('data-cut-strip=');
    expect(markup).not.toContain('data-cut-strip-name');
  });

  it('does not write its input name twice on the canvas', () => {
    const scene = sceneOf(waistbandCard());
    const markup = renderToStaticMarkup(
      <StepPictureSvg
        w={640}
        h={240}
        pad={4}
        look='canvas'
        layout={scene.layout}
        geoms={scene.geoms}
        names={['waistband', 'rubber']}
      />,
    );
    expect(markup.match(/>rubber</g)).toHaveLength(1);
    expect(markup.match(/>waistband</g)).toHaveLength(1);
  });

  it('keeps a name it does not own: a unit round the host still says its own', () => {
    const scene = sceneOf(waistbandCard());
    const markup = renderToStaticMarkup(
      <StepPictureSvg
        w={640}
        h={240}
        pad={4}
        look='canvas'
        layout={scene.layout}
        geoms={scene.geoms}
        names={['belt unit', 'rubber']}
      />,
    );
    expect(markup).toMatch(/>belt unit</);
    expect(markup).toMatch(/data-cut-strip-host="">waistband</);
  });

  describe('a strip too thin for its name', () => {
    const nameOf = (markup: string) => {
      const text = /<text[^>]*data-cut-strip-name=""[^>]*>/.exec(markup)?.[0] ?? '';
      return {
        y: Number(/ y="([-\d.]+)"/.exec(text)?.[1]),
        end: text.includes('text-anchor="end"'),
      };
    };
    const topOf = (markup: string) => {
      const d = new RegExp(`<path d="([^"]+)"[^>]*data-cut-strip="${STRIP}"`).exec(markup)?.[1];
      return Math.min(
        ...[...(d ?? '').matchAll(/[ML][-\d.]+ ([-\d.]+)/g)].map((m) => Number(m[1])),
      );
    };
    const pictureOf = (width: number) => {
      const scene = sceneOf(
        waistbandCard(fromSeamStrip({ widthMm: { value: String(width) } } as never)),
      );
      return renderToStaticMarkup(
        <StepPictureSvg
          w={640}
          h={240}
          pad={4}
          look='print'
          layout={scene.layout}
          geoms={scene.geoms}
        />,
      );
    };

    it('writes it over the strip, on the far end of the host line', () => {
      const markup = pictureOf(8);
      const name = nameOf(markup);
      expect(name.y).toBeLessThan(topOf(markup));
      expect(name.end).toBe(true);
    });

    it('leaves it inside when the strip can hold it', () => {
      const markup = pictureOf(60);
      const name = nameOf(markup);
      expect(name.y).toBeGreaterThan(topOf(markup));
      expect(name.end).toBe(false);
    });
  });

  it('goes quiet once it is inside a unit: grey, no words, at the later step', () => {
    const input = waistbandCard();
    const operations = (input.techCard.techCard?.operations ?? []) as SceneOp[];
    const later = { operationNumber: 240, work: 'join_lockstitch', inputKeys: ['belt'] };
    const steps = [...operations, later] as SceneOp[];
    const geoms = new Map([...input.pieces].map(([key, piece]) => [key, piece.geom]));
    const scene = stepPictureOfOp(
      later as SceneOp,
      seamGraphOfCard(input.techCard, input.pieces),
      geoms,
      {
        operations: steps,
        index: 1,
        pieceKeys: new Set(geoms.keys()),
        byKey: seamRowsOfCard(input.techCard),
        nameOf: (key) => input.pieces.get(key)?.name ?? key,
        explode: 0,
      },
    );
    const markup = renderToStaticMarkup(
      <StepPictureSvg
        w={640}
        h={240}
        pad={4}
        look='print'
        layout={scene.layout}
        geoms={scene.geoms}
      />,
    );
    expect(markup).toContain(`data-cut-strip="${STRIP}"`);
    expect(markup).not.toContain('data-cut-strip-name');
    expect(markup).not.toContain('data-cut-strip-length');
  });

  it('says the words of the mode', () => {
    expect(
      stripLengthText({
        label: 'rubber',
        mode: 'from_seam',
        fitPct: 85,
        overlapMm: 30,
        widthMm: 40,
        sewnMm: 672,
        seamMm: 790.4,
        sizeName: 'M',
      }),
    ).toBe('M · 790 → 672');
    const one = waistbandCard(oneLengthStrip(700)).pieces.get(STRIP)?.geom.cutStrip;
    expect(one && stripLengthText(one)).toBe('all sizes · 700');
    expect(one && stripLengthText(one, { allSizes: 'XX' })).toBe('XX · 700');
    const typed = waistbandCard(
      fromSeamStrip({
        lengthMode: 'per_size',
        seamKey: '',
        fitPct: { value: '100' },
        overlapMm: { value: '0' },
        sizes: [{ sizeId: 2, manualCutMm: 650 }],
      } as never),
    ).pieces.get(STRIP)?.geom.cutStrip;
    expect(typed && stripLengthText(typed)).toBe('M · 650');
  });
});
