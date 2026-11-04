import type { common_Material } from 'api/proto-http/admin';
import { describe, expect, it, vi } from 'vitest';

import type { FormGarmentLabel } from './labels-schema';
import type { TechCardFormData } from './schema';
import {
  dropPackagingRowLine,
  packagingLineForPick,
  pickLabelMaterial,
  removeLabelWithLine,
  removePackagingItemWithLine,
  takeLabelMaterialOff,
  uniqueLineName,
} from './label-bom';

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

describe('takeLabelMaterialOff', () => {
  const LABEL = 'TECH_CARD_BOM_SECTION_LABEL';
  const file = { colorwayId: 0, sizeId: 0, libraryFileId: 7, sourceHash: '', publicUrl: 'u' };
  const composition = (over: Partial<FormGarmentLabel> = {}): FormGarmentLabel => ({
    ...bareLabel('composition'),
    kind: 'composition',
    source: 'stock',
    bomLineKey: 'L1',
    bomItemId: 9,
    files: [file],
    ...over,
  });
  const line = (section = LABEL) => ({ lineKey: 'L1', id: 9, section, name: 'tape' });
  const seed = (over: FormState = {}): FormState => ({
    garmentLabels: [composition()],
    packagingItems: [],
    bomItems: [line()],
    operations: [],
    pieces: [],
    labels: [],
    ...over,
  });
  const take = (h: ReturnType<typeof formHarness>) =>
    takeLabelMaterialOff(h.getValues, h.setValue, 'composition');
  const row = (h: ReturnType<typeof formHarness>) =>
    (h.state.garmentLabels as FormGarmentLabel[])[0];

  it('drops the line and keeps the row, its kind and its files', () => {
    const h = formHarness(
      seed({ operations: [{ bomLineKeys: ['L1', 'L2'] }] } as unknown as FormState),
    );
    take(h);
    expect(h.state.bomItems).toEqual([]);
    expect((h.state.operations as { bomLineKeys: string[] }[])[0].bomLineKeys).toEqual(['L2']);
    expect(h.state.garmentLabels).toHaveLength(1);
    expect(row(h)).toMatchObject({
      bomLineKey: '',
      bomItemId: 0,
      source: '',
      kind: 'composition',
      files: [file],
    });
  });

  it('a row with no source only lets go of its line', () => {
    const h = formHarness(seed({ garmentLabels: [composition({ source: '' })] }));
    take(h);
    expect(h.state.bomItems).toHaveLength(1);
    expect(row(h)).toMatchObject({ bomLineKey: '', bomItemId: 0, source: '' });
  });

  it('a line another label names stays', () => {
    const brand = { ...bareLabel('brand'), source: 'stock', bomLineKey: 'L1' } as FormGarmentLabel;
    const h = formHarness(seed({ garmentLabels: [composition(), brand] }));
    take(h);
    expect(h.state.bomItems).toHaveLength(1);
    expect(row(h)).toMatchObject({ bomLineKey: '', source: '' });
    expect((h.state.garmentLabels as FormGarmentLabel[])[1]).toMatchObject({
      bomLineKey: 'L1',
      source: 'stock',
    });
  });

  it('a line moved out of the label section stays', () => {
    const h = formHarness(seed({ bomItems: [line('TECH_CARD_BOM_SECTION_TRIM')] } as FormState));
    take(h);
    expect(h.state.bomItems).toHaveLength(1);
    expect(row(h)).toMatchObject({ bomLineKey: '', source: '' });
  });

  it('a row that is not there changes nothing', () => {
    const h = formHarness(seed({ garmentLabels: [] }));
    take(h);
    expect(h.state.bomItems).toHaveLength(1);
    expect(h.state.garmentLabels).toEqual([]);
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

describe('packaging BOM lines', () => {
  const PACKAGING = 'TECH_CARD_BOM_SECTION_PACKAGING';
  const line = (lineKey: string, materialId: number, name: string) => ({
    lineKey,
    materialId,
    name,
    section: PACKAGING,
  });
  const row = (key: string, bomLineKey: string) => ({ key, bomLineKey, bomItemId: 0 });
  const form = (bomItems: unknown[], packagingItems: unknown[]) =>
    formHarness({ bomItems, packagingItems, garmentLabels: [] } as never);

  it('a new pick mints a packaging line', () => {
    const h = form([], []);
    const key = packagingLineForPick(h.getValues, h.setValue, material(7, 'Dust bag'));
    const lines = h.state.bomItems as ReturnType<typeof line>[];
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ section: PACKAGING, materialId: 7, name: 'Dust bag' });
    expect(key).toBe(lines[0].lineKey);
  });

  it('a second row of the material takes the same line', () => {
    const h = form([line('L1', 7, 'Dust bag')], [row('dust_bag', 'L1')]);
    expect(packagingLineForPick(h.getValues, h.setValue, material(7, 'Dust bag'))).toBe('L1');
    expect(h.state.bomItems).toHaveLength(1);
  });

  it('a row alone on its line repoints it to the new material', () => {
    const h = form([line('L1', 7, 'Box S')], [row('box', 'L1')]);
    expect(packagingLineForPick(h.getValues, h.setValue, material(8, 'Box L'), 0)).toBe('L1');
    expect(h.state.bomItems).toEqual([
      expect.objectContaining({ lineKey: 'L1', materialId: 8, name: 'Box L', section: PACKAGING }),
    ]);
  });

  it('a row sharing its line leaves it and mints another', () => {
    const h = form([line('L1', 7, 'Bag')], [row('dust_bag', 'L1'), row('other', 'L1')]);
    const key = packagingLineForPick(h.getValues, h.setValue, material(8, 'Tissue'), 0);
    const lines = h.state.bomItems as ReturnType<typeof line>[];
    expect(lines.map((l) => l.materialId)).toEqual([7, 8]);
    expect(key).toBe(lines[1].lineKey);
  });

  it('moving onto a material that has a line drops the old lone line', () => {
    const h = form(
      [line('L1', 7, 'Box S'), line('L2', 8, 'Box L')],
      [row('box', 'L1'), row('other', 'L2')],
    );
    expect(packagingLineForPick(h.getValues, h.setValue, material(8, 'Box L'), 0)).toBe('L2');
    expect((h.state.bomItems as ReturnType<typeof line>[]).map((l) => l.lineKey)).toEqual(['L2']);
  });

  it('removing a row takes its line, and a shared line stays', () => {
    const h = form(
      [line('L1', 7, 'Bag'), line('L2', 8, 'Tissue')],
      [row('dust_bag', 'L1'), row('other', 'L1'), row('tissue', 'L2')],
    );
    removePackagingItemWithLine(h.getValues, h.setValue, 'tissue', 2);
    removePackagingItemWithLine(h.getValues, h.setValue, 'other', 1);
    expect((h.state.bomItems as ReturnType<typeof line>[]).map((l) => l.lineKey)).toEqual(['L1']);
    expect(h.state.packagingItems).toEqual([row('dust_bag', 'L1')]);
    removePackagingItemWithLine(h.getValues, h.setValue, 'dust_bag', 0);
    expect(h.state.bomItems).toEqual([]);
  });

  it('a line outside the packaging section is not the row to take', () => {
    const fabric = { ...line('L1', 7, 'Canvas'), section: 'TECH_CARD_BOM_SECTION_FABRIC' };
    const h = form([fabric], [row('other', 'L1')]);
    dropPackagingRowLine(h.getValues, h.setValue, 0);
    expect(h.state.bomItems).toEqual([fabric]);
  });
});
