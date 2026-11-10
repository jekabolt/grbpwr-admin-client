import type { common_TechCard } from 'api/proto-http/admin';
import { describe, expect, it } from 'vitest';

import { mapFormToTechCardInsert, mapTechCardToForm } from './schema';

const anchor = {
  pieceLineKey: 'front',
  samples: [
    { u: 0, v: 0 },
    { u: 0.25, v: 0 },
    { u: 0.5, v: 0 },
    { u: 0.75, v: 0 },
    { u: 1, v: 0 },
  ],
  perimShare: 0.25,
  lenMm: 240,
  notches: 0,
  turnDeg: 0,
  rangeFrom: 0.25,
  rangeTo: 0.75,
  edgeHint: 'front#0',
  contourSig: 'shape',
  placement: undefined,
  layer: undefined,
};

const card = {
  id: 91,
  techCard: {
    bomItems: [
      {
        lineKey: 'thread-a',
        name: 'topstitch 40/2',
        section: 'TECH_CARD_BOM_SECTION_THREAD',
        kind: 'TECH_CARD_BOM_KIND_TOPSTITCH_THREAD',
        unit: 'm',
        threadPerMm: { value: '2.5' },
      },
      { lineKey: 'keep', name: 'keep', section: 'TECH_CARD_BOM_SECTION_THREAD', unit: 'm' },
      { lineKey: 'clear', name: 'clear', section: 'TECH_CARD_BOM_SECTION_THREAD', unit: 'm' },
    ],
    operations: [
      {
        operationNumber: 10,
        operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
        machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
        topstitch: { mode: 'TECH_CARD_TOPSTITCH_MODE_EDGE', widthMm: { value: '2' }, rows: 1 },
        bomLineKeys: ['thread-a'],
        topstitchLines: [
          {
            lineKey: 'line-a',
            bomLineKey: 'thread-a',
            parts: [anchor],
            anchoredSize: 'M',
            rows: 2,
            sizes: [
              { sizeId: 1, lineMm: { value: '240.5' } },
              { sizeId: 2, lineMm: { value: '252' } },
            ],
            measured: undefined,
            stale: true,
          },
        ],
      },
    ],
  },
} as unknown as common_TechCard;

describe('topstitch form and wire mapping', () => {
  it('round-trips anchors, sizes, rows, stale state and the aware flag', () => {
    const form = mapTechCardToForm(card);
    const line = form.operations?.[0]?.topstitchLines?.[0];
    expect(line).toMatchObject({
      lineKey: 'line-a',
      bomLineKey: 'thread-a',
      anchoredSize: 'M',
      rows: 2,
      stale: true,
      sizes: [
        { sizeId: 1, lineMm: '240.5' },
        { sizeId: 2, lineMm: '252' },
      ],
      parts: [{ piece: 'front', edgeHint: 'front#0', range: [0.25, 0.75] }],
    });

    line!.measured = true;
    const payload = mapFormToTechCardInsert(form);
    expect(payload.topstitchLinesAware).toBe(true);
    expect(payload.operations?.[0]?.topstitchLines?.[0]).toMatchObject({
      lineKey: 'line-a',
      bomLineKey: 'thread-a',
      anchoredSize: 'M',
      rows: 2,
      measured: true,
      stale: undefined,
      sizes: [
        { sizeId: 1, lineMm: { value: '240.5' } },
        { sizeId: 2, lineMm: { value: '252' } },
      ],
      parts: [{ pieceLineKey: 'front', rangeFrom: 0.25, rangeTo: 0.75 }],
    });
  });

  it('keeps absent thread_per_mm silent and preserves explicit clear', () => {
    const form = mapTechCardToForm(card);
    const items = form.bomItems ?? [];
    expect(items.find((line) => line.lineKey === 'thread-a')?.threadPerMm).toBe('2.5');
    expect(items.find((line) => line.lineKey === 'keep')?.threadPerMm).toBeUndefined();
    const clear = items.find((line) => line.lineKey === 'clear');
    clear!.threadPerMm = '';

    const payload = mapFormToTechCardInsert(form);
    expect(payload.bomItems?.find((line) => line.lineKey === 'keep')?.threadPerMm).toBeUndefined();
    expect(payload.bomItems?.find((line) => line.lineKey === 'clear')?.threadPerMm).toEqual({
      value: '',
    });
  });
});
