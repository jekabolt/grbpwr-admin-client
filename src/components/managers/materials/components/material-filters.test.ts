import type { common_Material } from 'api/proto-http/admin';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MATERIAL_FILTERS,
  applyMaterialFilters,
  sectionCounts,
  suppliers,
  type MaterialFilterState,
} from './material-filters';

const material = (
  id: number,
  name: string,
  section: string,
  supplier: string,
  code = `M-${id}`,
): common_Material =>
  ({ id, name, section, supplier, code, archived: false, spec: '' }) as common_Material;

const rows = [
  material(1, 'Shell', 'TECH_CARD_BOM_SECTION_FABRIC', 'Acme'),
  material(2, 'Fusible', 'TECH_CARD_BOM_SECTION_INTERLINING', 'Freudenberg'),
  material(3, 'Tape', 'TECH_CARD_BOM_SECTION_INTERLINING', 'freudenberg'),
  material(4, 'Zip', 'TECH_CARD_BOM_SECTION_HARDWARE', 'YKK'),
];

const state = (patch: Partial<MaterialFilterState> = {}): MaterialFilterState => ({
  ...DEFAULT_MATERIAL_FILTERS,
  ...patch,
});

describe('material filters', () => {
  it('returns only interlinings when interlining is selected', () => {
    expect(
      applyMaterialFilters(rows, state({ section: 'TECH_CARD_BOM_SECTION_INTERLINING' })).map(
        (row) => row.name,
      ),
    ).toEqual(['Fusible', 'Tape']);
  });

  it('counts without section while respecting supplier, stock and search', () => {
    const stockById = new Map([
      [1, 2],
      [2, 4],
      [3, 0],
      [4, 8],
    ]);
    const counts = sectionCounts(
      rows,
      state({
        section: 'TECH_CARD_BOM_SECTION_HARDWARE',
        supplier: 'FREUDENBERG',
        inStock: true,
      }),
      { q: 'fusi', stockById },
    );
    expect(counts).toEqual([
      { value: '', label: 'all', count: 1 },
      { value: 'TECH_CARD_BOM_SECTION_INTERLINING', label: 'interlining', count: 1 },
      { value: 'TECH_CARD_BOM_SECTION_HARDWARE', label: 'hardware', count: 0 },
    ]);
  });

  it('dedupes suppliers case-insensitively', () => {
    expect(suppliers(rows)).toEqual(['Acme', 'Freudenberg', 'YKK']);
  });

  it('sorts by name, code and stock', () => {
    const unsorted = [
      { ...rows[0], name: 'Zulu', code: 'A-2' },
      { ...rows[1], name: 'Alpha', code: 'Z-1' },
    ];
    const stockById = new Map([
      [1, 9],
      [2, 2],
    ]);
    expect(applyMaterialFilters(unsorted, state({ sort: 'name' })).map((row) => row.name)).toEqual([
      'Alpha',
      'Zulu',
    ]);
    expect(applyMaterialFilters(unsorted, state({ sort: 'code' })).map((row) => row.code)).toEqual([
      'A-2',
      'Z-1',
    ]);
    expect(
      applyMaterialFilters(unsorted, state({ sort: 'stock' }), { stockById }).map((row) => row.id),
    ).toEqual([2, 1]);
  });

  it('lists a selected empty section and hides other empty sections', () => {
    expect(
      sectionCounts(rows, state({ section: 'TECH_CARD_BOM_SECTION_LABEL' })).map((row) => [
        row.label,
        row.count,
      ]),
    ).toEqual([
      ['all', 4],
      ['fabric', 1],
      ['interlining', 2],
      ['hardware', 1],
      ['label', 0],
    ]);
  });
});
