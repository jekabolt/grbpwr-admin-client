import { describe, expect, it } from 'vitest';
import { autoStepMaterialKeys } from './operations-field';
import { stepLabelStitch, stitchForAttachment } from './label-attach-stitch';
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
