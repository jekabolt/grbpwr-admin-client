import type { common_Material } from 'api/proto-http/admin';
import { describe, expect, it, vi } from 'vitest';

import type { FormGarmentLabel } from './labels-schema';
import type { TechCardFormData } from './schema';
import { pickLabelMaterial, removeLabelWithLine, uniqueLineName } from './label-bom';

type FormState = Partial<TechCardFormData> & Record<string, unknown>;

function formHarness(seed: FormState) {
  const state = structuredClone(seed);
  const getValues = vi.fn((path?: string) => (path ? state[path] : state));
  const setValue = vi.fn((path: string, value: unknown) => {
    const parts = path.split('.');
    let target: Record<string, unknown> | unknown[] = state;
    for (const part of parts.slice(0, -1)) {
      const key = /^\d+$/.test(part) ? Number(part) : part;
      const next = (target as Record<string | number, unknown>)[key];
      if (next == null || typeof next !== 'object') {
        (target as Record<string | number, unknown>)[key] = /^\d+$/.test(
          parts[parts.indexOf(part) + 1] ?? '',
        )
          ? []
          : {};
      }
      target = (target as Record<string | number, unknown>)[key] as Record<string, unknown>;
    }
    const tail = parts.at(-1)!;
    (target as Record<string, unknown>)[tail] = value;
  });
  return { state, getValues: getValues as never, setValue: setValue as never };
}

const material = (id: number, name: string): common_Material =>
  ({ id, name, section: 'TECH_CARD_BOM_SECTION_LABEL', unit: 'pcs' }) as common_Material;

const bareLabel = (key: string): FormGarmentLabel => ({
  key,
  source: '',
  kind: '',
  madeBy: '',
  printMethod: '',
  lengthCm: '',
  placement: '',
  attachment: '',
  folding: '',
  size: '',
  qtyPerGarment: 1,
  bomItemId: 0,
  bomLineKey: '',
  note: '',
  mediaIds: [],
  calloutNumber: 0,
  artworkPerSize: false,
  artworkPerColorway: false,
  files: [],
});

describe('label BOM writers', () => {
  it('mints one line per label even when both pick the same material', () => {
    const h = formHarness({
      garmentLabels: [bareLabel('brand one'), bareLabel('brand two')],
      packagingItems: [],
      bomItems: [],
    });

    pickLabelMaterial(h.getValues, h.setValue, 'brand one', material(7, 'Black woven label'), {
      source: 'stock',
      kind: 'brand',
    });
    pickLabelMaterial(h.getValues, h.setValue, 'brand two', material(7, 'Black woven label'), {
      source: 'stock',
      kind: 'brand',
    });

    const lines = h.state.bomItems!;
    const labels = h.state.garmentLabels!;
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.name)).toEqual(['Black woven label', 'Black woven label 2']);
    expect(new Set(lines.map((line) => line.lineKey)).size).toBe(2);
    expect(labels.map((row) => row.bomLineKey)).toEqual(lines.map((line) => line.lineKey));
    expect(labels.map((row) => row.source)).toEqual(['stock', 'stock']);
  });

  it('repoints an unshared owned line and keeps its identity', () => {
    const row: FormGarmentLabel = {
      ...bareLabel('main label'),
      bomLineKey: 'line-a',
      source: 'stock',
    };
    const h = formHarness({
      garmentLabels: [row],
      packagingItems: [],
      bomItems: [
        {
          id: 31,
          lineKey: 'line-a',
          section: 'TECH_CARD_BOM_SECTION_LABEL',
          name: 'Old label',
          materialId: 3,
        },
      ],
    });

    pickLabelMaterial(h.getValues, h.setValue, 'main label', material(9, 'New label'), {
      source: 'make',
      kind: 'brand',
    });

    expect(h.state.bomItems).toHaveLength(1);
    expect(h.state.bomItems?.[0]).toMatchObject({
      id: 31,
      lineKey: 'line-a',
      name: 'New label',
      materialId: 9,
    });
    expect(h.state.garmentLabels?.[0]).toMatchObject({
      bomLineKey: 'line-a',
      source: 'make',
      kind: 'brand',
    });
  });

  it('mints a new owned line instead of repointing a shared line', () => {
    const h = formHarness({
      garmentLabels: [
        { ...bareLabel('brand'), bomLineKey: 'shared-line', source: 'stock' },
        { ...bareLabel('size'), bomLineKey: 'shared-line', source: 'stock' },
      ],
      packagingItems: [],
      bomItems: [
        {
          id: 32,
          lineKey: 'shared-line',
          section: 'TECH_CARD_BOM_SECTION_LABEL',
          name: 'Shared label',
          materialId: 3,
        },
      ],
    });

    pickLabelMaterial(h.getValues, h.setValue, 'brand', material(10, 'Replacement label'), {
      source: 'stock',
      kind: 'brand',
    });

    expect(h.state.bomItems).toHaveLength(2);
    expect(h.state.bomItems?.[0]).toMatchObject({
      lineKey: 'shared-line',
      name: 'Shared label',
      materialId: 3,
    });
    expect(h.state.garmentLabels?.[0].bomLineKey).not.toBe('shared-line');
    expect(h.state.garmentLabels?.[1].bomLineKey).toBe('shared-line');
  });

  it('removes an owned line and releases operation references', () => {
    const h = formHarness({
      garmentLabels: [{ ...bareLabel('flag'), bomLineKey: 'line-flag' }],
      packagingItems: [],
      bomItems: [
        {
          id: 44,
          lineKey: 'line-flag',
          section: 'TECH_CARD_BOM_SECTION_LABEL',
          name: 'Flag',
          materialId: 8,
        },
      ],
      operations: [{ bomLineKeys: ['line-flag'] }],
      pieces: [],
      patterns: [],
      pieceDxfAliases: [],
    });

    removeLabelWithLine(h.getValues, h.setValue, 'flag');

    expect(h.state.garmentLabels).toEqual([]);
    expect(h.state.bomItems).toEqual([]);
    expect(h.state.operations?.[0].bomLineKeys).toEqual([]);
  });

  it('keeps a line still named by another label or packaging row', () => {
    const line = {
      id: 52,
      lineKey: 'shared-line',
      section: 'TECH_CARD_BOM_SECTION_LABEL',
      name: 'Shared legacy line',
      materialId: 12,
    };
    const h = formHarness({
      garmentLabels: [
        { ...bareLabel('brand'), bomLineKey: 'shared-line' },
        { ...bareLabel('size'), bomLineKey: 'shared-line' },
      ],
      packagingItems: [{ key: 'insert', bomLineKey: 'shared-line' }],
      bomItems: [line],
    });

    removeLabelWithLine(h.getValues, h.setValue, 'brand');

    expect(h.state.garmentLabels?.map((row) => row.key)).toEqual(['size']);
    expect(h.state.bomItems).toEqual([line]);
  });
});

describe('uniqueLineName', () => {
  it('ignores the line being repointed', () => {
    expect(
      uniqueLineName(
        [
          { lineKey: 'a', name: 'Label' },
          { lineKey: 'b', name: 'Label 2' },
        ],
        'Label',
        'a',
      ),
    ).toBe('Label');
  });
});
