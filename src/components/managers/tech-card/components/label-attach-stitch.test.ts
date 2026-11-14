import { describe, expect, it } from 'vitest';
import { autoStepMaterialKeys } from './operations-field';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { labelAttachmentFact, stepLabelStitch, stitchForAttachment } from './label-attach-stitch';
import { LabelShapeIcon } from './label-shape-icon';
import { GarmentLabelInset, GarmentLabelOverlay } from './garment-label-picture';
import type { PieceGeom } from 'lib/assembly-skeleton/types';
import type { common_TechCard } from 'api/proto-http/admin';
import { mapFormToTechCardInsert, mapTechCardToForm } from './schema';

const S = (s: string) => `TECH_CARD_LABEL_ATTACH_STITCH_${s}`;

describe('J1 label attachment → step stitch', () => {
  it('maps every label word', () => {
    expect(stitchForAttachment('sewn into the seam')).toBe(S('CAUGHT_IN_SEAM'));
    expect(stitchForAttachment('sewn 4 sides')).toBe(S('FOUR_SIDES'));
    expect(stitchForAttachment('sewn 2 sides', '')).toBe(S('TWO_SIDES_TOP_BOTTOM'));
    expect(stitchForAttachment('sewn 2 sides', 'width')).toBe(S('TWO_SIDES_LEFT_RIGHT'));
    expect(stitchForAttachment('sewn 1 edge')).toBe(S('ONE_EDGE'));
    expect(stitchForAttachment('corner tacks')).toBe(S('CORNERS_TACK'));
    expect(stitchForAttachment('on_fabric_piece')).toBe(S('OTHER'));
    for (const w of ['heat press', 'swift tack', 'hung', 'stuck on', ''])
      expect(stitchForAttachment(w)).toBe(S('UNKNOWN'));
  });

  const labels = [
    { lineKey: 'L1', attachment: 'hung' },
    { lineKey: 'L2', attachment: 'sewn 4 sides' },
    { lineKey: 'L3', attachment: 'sewn into the seam' },
  ];

  it('a label step takes the first sewn linked label, in link order', () => {
    const step = { work: 'attach_label', labelAttachStitch: S('ONE_EDGE') };
    expect(stepLabelStitch({ ...step, labelKeys: ['L3', 'L2'] }, labels)).toBe(S('CAUGHT_IN_SEAM'));
    expect(stepLabelStitch({ ...step, labelKeys: ['L1', 'L2'] }, labels)).toBe(S('FOUR_SIDES'));
    expect(stepLabelStitch({ ...step, labelKeys: ['L1'] }, labels)).toBe(S('UNKNOWN'));
  });

  it('a label step with no label linked keeps its stored stitch', () => {
    const step = { work: 'attach_label', labelAttachStitch: S('CAUGHT_IN_SEAM'), labelKeys: [] };
    expect(stepLabelStitch(step, labels)).toBe(S('CAUGHT_IN_SEAM'));
  });

  it('a label step whose labels say nothing yet keeps its stored stitch', () => {
    const blank = [{ lineKey: 'L4', attachment: '' }];
    const step = { work: 'attach_label', labelAttachStitch: S('FOUR_SIDES'), labelKeys: ['L4'] };
    expect(stepLabelStitch(step, blank)).toBe(S('FOUR_SIDES'));
    expect(stepLabelStitch({ ...step, labelKeys: ['L4', 'L1'] }, [...blank, ...labels])).toBe(
      S('UNKNOWN'),
    );
  });

  it('another step keeps its own value', () => {
    const step = { work: 'side_seam', labelAttachStitch: S('UNKNOWN'), labelKeys: ['L2'] };
    expect(stepLabelStitch(step, labels)).toBe(S('UNKNOWN'));
  });

  it('auto-links the only label line by the step work, not by the stitch', () => {
    const lines = [{ lineKey: 'L9', section: 'TECH_CARD_BOM_SECTION_LABEL' }];
    expect(autoStepMaterialKeys({ work: 'attach_label', bomLineKeys: [] }, lines)).toEqual(['L9']);
    expect(
      autoStepMaterialKeys({ work: 'side_seam', labelAttachStitch: S('FOUR_SIDES') }, lines),
    ).toEqual([]);
  });

  const saved = (attachment: string, linked: boolean, stored = '') => {
    const card = {
      id: 1,
      techCard: {
        bomItems: [{ id: 5, lineKey: 'L1', section: 'TECH_CARD_BOM_SECTION_LABEL' }],
        garmentLabels: [{ key: 'brand', lineKey: 'LBL1', attachment }],
        operations: [
          {
            operationNumber: 590,
            operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
            machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
            work: 'attach_label',
            labelKeys: linked ? ['LBL1'] : [],
            ...(stored ? { stitching: { labelAttachStitch: stored } } : {}),
          },
        ],
      },
    } as unknown as common_TechCard;
    const form = mapTechCardToForm(card);
    const op = mapFormToTechCardInsert(form).operations?.[0];
    return op?.stitching?.labelAttachStitch ?? S('UNKNOWN');
  };

  it('the save writes the linked label stitch into the step', () => {
    expect(saved('sewn 4 sides', true, S('CAUGHT_IN_SEAM'))).toBe(S('FOUR_SIDES'));
    expect(saved('hung', true, S('CAUGHT_IN_SEAM'))).toBe(S('UNKNOWN'));
  });

  it('the save keeps the stored stitch of a step with no label linked', () => {
    expect(saved('sewn 4 sides', false, S('CAUGHT_IN_SEAM'))).toBe(S('CAUGHT_IN_SEAM'));
  });
});

describe('J1 one attachment fact for every reader', () => {
  it('says the same words and scheme for every value', () => {
    const f = (attachment: string, foldAxis = '') => labelAttachmentFact({ attachment, foldAxis });
    expect(f('sewn into the seam')).toMatchObject({ words: 'sewn into the seam', scheme: 'seam' });
    expect(f('sewn 4 sides')).toMatchObject({ words: 'sewn 4 sides', scheme: 'four' });
    expect(f('sewn 2 sides')).toMatchObject({
      words: 'sewn 2 sides · top + bottom',
      scheme: 'top_bottom',
    });
    expect(f('sewn 2 sides', 'width')).toMatchObject({
      words: 'sewn 2 sides · left + right',
      scheme: 'left_right',
    });
    expect(f('sewn 1 edge')).toMatchObject({ scheme: 'edge' });
    expect(f('corner tacks')).toMatchObject({ scheme: 'corners' });
    expect(f('on_fabric_piece')).toMatchObject({ words: 'on fabric piece', scheme: 'piece' });
    expect(f('hung')).toMatchObject({ words: 'hung · not sewn', scheme: 'none', notSewn: true });
    expect(f('')).toMatchObject({ words: '', scheme: 'none', notSewn: false });
  });

  it('the label picture draws the scheme of the fact', () => {
    const draw = (attachment: string, foldAxis = '') =>
      renderToStaticMarkup(
        createElement(LabelShapeIcon, {
          label: { key: 'brand', attachment, foldAxis, widthMm: 50, heightMm: 20 },
        }),
      );
    for (const [w, scheme] of [
      ['sewn into the seam', 'seam'],
      ['sewn 4 sides', 'four'],
      ['sewn 1 edge', 'edge'],
      ['corner tacks', 'corners'],
      ['on_fabric_piece', 'piece'],
    ])
      expect(draw(w)).toContain(`data-label-stitch="${scheme}"`);
    expect(draw('sewn 2 sides')).toContain('data-label-stitch="top_bottom"');
    expect(draw('sewn 2 sides', 'width')).toContain('data-label-stitch="left_right"');
    expect(draw('hung')).not.toContain('data-label-stitch');
  });
});

describe('J1 the step picture draws the label sewn by its word', () => {
  const drawOverlay = (attachment: string, foldAxis = '', stitchLines: number[] = []) =>
    renderToStaticMarkup(
      createElement(
        'svg',
        null,
        createElement(GarmentLabelOverlay, {
          pieces: [
            {
              key: 'l',
              drawn: [
                [0, 20],
                [50, 20],
                [50, 0],
                [0, 0],
              ],
            },
          ],
          geoms: new Map([
            [
              'l',
              {
                garmentLabel: {
                  label: 'brand',
                  widthMm: 50,
                  heightMm: 20,
                  fold: 'flat',
                  foldAxis,
                  foldLines: [],
                  stitchLines,
                  attachment,
                },
              } as unknown as PieceGeom,
            ],
          ]),
          hair: 1,
        }),
      ),
    );
  it('draws every sewn scheme, nothing for a label that is not sewn', () => {
    for (const [w, scheme] of [
      ['sewn into the seam', 'seam'],
      ['sewn 4 sides', 'four'],
      ['sewn 1 edge', 'edge'],
      ['corner tacks', 'corners'],
    ])
      expect(drawOverlay(w)).toContain(`data-label-attach="${scheme}"`);
    expect(drawOverlay('sewn 2 sides')).toContain('data-label-attach="top_bottom"');
    expect(drawOverlay('sewn 2 sides', 'width')).toContain('data-label-attach="left_right"');
    expect(drawOverlay('hung')).not.toContain('data-label-attach');
  });
  it('the label own stitch lines win over the word', () => {
    expect(drawOverlay('sewn 4 sides', '', [0, 20])).not.toContain('data-label-attach');
  });
});

describe('J1 owner edits 14.11: not sewn has no sewn edge, a fabric piece is framed', () => {
  const icon = (attachment: string) =>
    renderToStaticMarkup(
      createElement(LabelShapeIcon, {
        label: { key: 'brand', attachment, widthMm: 50, heightMm: 20 },
      }),
    );
  const overlay = (attachment: string) =>
    renderToStaticMarkup(
      createElement(
        'svg',
        null,
        createElement(GarmentLabelOverlay, {
          pieces: [
            {
              key: 'l',
              drawn: [
                [0, 20],
                [50, 20],
                [50, 0],
                [0, 0],
              ],
            },
          ],
          geoms: new Map([
            [
              'l',
              {
                garmentLabel: {
                  label: 'brand',
                  widthMm: 50,
                  heightMm: 20,
                  fold: 'flat',
                  foldAxis: '',
                  foldLines: [],
                  stitchLines: [],
                  attachment,
                },
              } as unknown as PieceGeom,
            ],
          ]),
          hair: 1,
        }),
      ),
    );
  it('a label that is not sewn has no sewn edge on the tile or the step picture', () => {
    for (const w of ['hung', 'heat press', 'swift tack', 'stuck on']) {
      expect(icon(w)).not.toContain('data-label-sewn-edge');
      expect(overlay(w)).not.toContain('data-label-sewn-edge');
    }
    expect(icon('sewn 4 sides')).toContain('data-label-sewn-edge');
    expect(overlay('sewn 4 sides')).toContain('data-label-sewn-edge');
  });
  it('a label on a fabric piece is framed on the tile and the step picture alike', () => {
    expect(icon('on_fabric_piece')).toContain('data-label-stitch="piece"');
    expect(overlay('on_fabric_piece')).toContain('data-label-attach="piece"');
  });
});

describe('J1 owner 14.11 variant A: the label drawn large under the step picture', () => {
  const mark = (attachment: string, foldAxis: '' | 'width' = '', stitchLines: number[] = []) => ({
    label: 'brand',
    widthMm: 50,
    heightMm: 20,
    fold: 'flat' as const,
    foldAxis,
    foldLines: [],
    stitchLines,
    attachment,
  });
  const inset = (m: ReturnType<typeof mark>) =>
    renderToStaticMarkup(createElement(GarmentLabelInset, { mark: m }));
  it('draws the sewn scheme of the word, about 40 mm long', () => {
    for (const [w, scheme] of [
      ['corner tacks', 'corners'],
      ['on_fabric_piece', 'piece'],
      ['sewn 4 sides', 'four'],
    ])
      expect(inset(mark(w))).toContain(`data-label-attach="${scheme}"`);
    expect(inset(mark('sewn 2 sides', 'width'))).toContain('data-label-attach="left_right"');
    expect(inset(mark('corner tacks'))).toMatch(/<svg width="150(\.0+)?"/);
  });
  it('a label with its own stitch lines is drawn by them', () => {
    const html = inset(mark('sewn 4 sides', '', [0, 20]));
    expect(html).not.toContain('data-label-attach');
    expect(html).toContain('data-label-stitch=');
  });
  it('a label that is not sewn has no stitch and no sewn edge', () => {
    const html = inset(mark('hung'));
    expect(html).toContain('data-label-inset');
    expect(html).not.toContain('data-label-attach');
    expect(html).not.toContain('data-label-sewn-edge');
  });
});
