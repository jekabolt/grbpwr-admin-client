import { common_Material, common_MaterialStockRow } from 'api/proto-http/admin';
import { techCardBomSectionOptions } from 'constants/filter';
import {
  Button,
  Close,
  Drawer,
  Select,
  SideRailGroup,
  SideRailItem,
  Text,
  ToggleSwitch,
  ViewSwitch,
} from 'ui';
import { composeArticleFromMaterial } from './material-code';

export type MaterialSort = 'name' | 'code' | 'stock';

export type MaterialFilterState = {
  section: string;
  supplier: string;
  inStock: boolean;
  archived: boolean;
  sort: MaterialSort;
};

export const DEFAULT_MATERIAL_FILTERS: MaterialFilterState = {
  section: '',
  supplier: '',
  inStock: false,
  archived: false,
  sort: 'name',
};

type StockValue =
  | common_MaterialStockRow
  | { onHand?: string | number | { value?: string } }
  | string
  | number
  | undefined;

export type MaterialFilterContext = {
  q?: string;
  stockById?: ReadonlyMap<number, StockValue>;
};

export type MaterialSectionCount = {
  value: string;
  label: string;
  count: number;
};

const materialId = (material: common_Material): number => Number(material.id) || 0;

const stockNumber = (value: StockValue): number => {
  const raw =
    typeof value === 'number' || typeof value === 'string'
      ? value
      : value && 'onHand' in value
        ? value.onHand
        : undefined;
  const text =
    typeof raw === 'object' && raw !== null
      ? String(raw.value ?? '').trim()
      : String(raw ?? '').trim();
  const parsed = Number(text || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const stockFor = (material: common_Material, stockById?: ReadonlyMap<number, StockValue>): number =>
  stockNumber(stockById?.get(materialId(material)));

const sameSupplier = (left?: string, right?: string): boolean =>
  (left ?? '').trim().localeCompare((right ?? '').trim(), undefined, { sensitivity: 'base' }) === 0;

const matchesSearch = (material: common_Material, query?: string): boolean => {
  const needle = query?.trim().toLocaleLowerCase() ?? '';
  if (!needle) return true;
  return [
    material.code,
    composeArticleFromMaterial(material, true),
    material.name,
    material.supplier,
    material.spec,
  ].some((value) => value?.toLocaleLowerCase().includes(needle));
};

export function normalizeMaterialSort(value?: string | null): MaterialSort {
  if (value === 'code' || value === 'code-asc') return 'code';
  if (value === 'stock' || value === 'stock-low') return 'stock';
  return 'name';
}

export function applyMaterialFilters(
  materials: readonly common_Material[],
  state: MaterialFilterState,
  { q, stockById }: MaterialFilterContext = {},
): common_Material[] {
  const filtered = materials.filter((material) => {
    if (state.section && material.section !== state.section) return false;
    if (state.supplier && !sameSupplier(material.supplier, state.supplier)) return false;
    if (state.inStock && stockFor(material, stockById) <= 0) return false;
    if (!state.archived && material.archived) return false;
    return matchesSearch(material, q);
  });

  const name = (material: common_Material) => material.name?.trim() ?? '';
  const code = (material: common_Material) =>
    (material.code?.trim() || composeArticleFromMaterial(material, true)).trim();
  const compare = (left: string, right: string) =>
    left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true });

  return [...filtered].sort((left, right) => {
    if (state.sort === 'stock') {
      return (
        stockFor(left, stockById) - stockFor(right, stockById) || compare(name(left), name(right))
      );
    }
    if (state.sort === 'code') {
      return compare(code(left), code(right)) || compare(name(left), name(right));
    }
    return compare(name(left), name(right)) || compare(code(left), code(right));
  });
}

export function sectionCounts(
  materials: readonly common_Material[],
  state: MaterialFilterState,
  context: MaterialFilterContext = {},
): MaterialSectionCount[] {
  const visible = applyMaterialFilters(materials, { ...state, section: '' }, context);
  const counts = new Map<string, number>();
  visible.forEach((material) => {
    const section = material.section ?? '';
    counts.set(section, (counts.get(section) ?? 0) + 1);
  });

  const rows: MaterialSectionCount[] = [{ value: '', label: 'all', count: visible.length }];
  techCardBomSectionOptions.forEach((option) => {
    const count = counts.get(option.value) ?? 0;
    if (count > 0 || state.section === option.value) rows.push({ ...option, count });
  });
  return rows;
}

export function suppliers(materials: readonly common_Material[]): string[] {
  const names = new Map<string, string>();
  materials.forEach((material) => {
    const name = material.supplier?.trim();
    if (!name) return;
    const key = name.toLocaleLowerCase();
    if (!names.has(key)) names.set(key, name);
  });
  return [...names.values()].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: 'base' }),
  );
}

export function activeFilterCount(state: MaterialFilterState): number {
  return (
    Number(!!state.section) +
    Number(!!state.supplier) +
    Number(state.inStock) +
    Number(state.archived)
  );
}

const SORT_OPTIONS = [
  { value: 'name', label: 'name' },
  { value: 'code', label: 'code' },
  { value: 'stock', label: 'stock' },
] as const;

function MaterialFilters({
  state,
  onChange,
  counts,
  suppliers: supplierNames,
  columns = 1,
  hideSupplier = false,
  showSort = false,
}: {
  state: MaterialFilterState;
  onChange: (next: MaterialFilterState) => void;
  counts: MaterialSectionCount[];
  suppliers: string[];
  columns?: 1 | 2;
  hideSupplier?: boolean;
  showSort?: boolean;
}) {
  const patch = (next: Partial<MaterialFilterState>) => onChange({ ...state, ...next });

  return (
    <div className='flex flex-col gap-2.5'>
      <div>
        <SideRailGroup flush>section</SideRailGroup>
        <div className={columns === 2 ? 'grid grid-cols-2 gap-x-4' : undefined}>
          {counts.map((row) => (
            <SideRailItem
              key={row.value || 'all'}
              label={row.label}
              count={row.count}
              selected={state.section === row.value}
              onClick={() => patch({ section: row.value })}
            />
          ))}
        </div>
      </div>

      {!hideSupplier && supplierNames.length > 1 ? (
        <div>
          <SideRailGroup>supplier</SideRailGroup>
          <Select
            name='material-filter-supplier'
            value={state.supplier}
            placeholder='supplier'
            items={[
              { value: '', label: 'any' },
              ...supplierNames.map((supplier) => ({ value: supplier, label: supplier })),
            ]}
            onValueChange={(supplier) => patch({ supplier })}
            fullWidth
          />
        </div>
      ) : null}

      <div>
        <SideRailGroup>show</SideRailGroup>
        <div className={columns === 2 ? 'grid grid-cols-2 gap-2' : 'flex flex-col gap-2'}>
          <ToggleSwitch
            label='in stock'
            checked={state.inStock}
            onCheckedChange={(inStock) => patch({ inStock })}
          />
          <ToggleSwitch
            label='archived'
            checked={state.archived}
            onCheckedChange={(archived) => patch({ archived })}
          />
        </div>
      </div>

      {showSort ? (
        <div>
          <SideRailGroup>sort</SideRailGroup>
          <ViewSwitch
            label='material sort'
            value={state.sort}
            options={SORT_OPTIONS}
            onChange={(sort) => patch({ sort })}
            className='w-full [&>span]:flex-1 [&>span]:justify-center'
          />
        </div>
      ) : null}
    </div>
  );
}

export { MaterialFilters as MaterialFilterPanel };

export function MaterialFilterSheet({
  open,
  onOpenChange,
  state,
  onChange,
  counts,
  suppliers: supplierNames,
  resultCount,
  onReset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: MaterialFilterState;
  onChange: (next: MaterialFilterState) => void;
  counts: MaterialSectionCount[];
  suppliers: string[];
  resultCount: number;
  onReset: () => void;
}) {
  return (
    <Drawer
      side='bottom'
      title='filter'
      open={open}
      onOpenChange={onOpenChange}
      footer={
        <div className='grid w-full grid-cols-2 gap-1.5'>
          <Button type='button' variant='secondary' onClick={onReset}>
            reset
          </Button>
          <Button type='button' variant='main' onClick={() => onOpenChange(false)}>
            show {resultCount}
          </Button>
        </div>
      }
    >
      <MaterialFilters
        state={state}
        onChange={onChange}
        counts={counts}
        suppliers={supplierNames}
        columns={2}
        showSort
      />
    </Drawer>
  );
}

export function AppliedFilters({
  state,
  onChange,
  resultCount,
}: {
  state: MaterialFilterState;
  onChange: (next: MaterialFilterState) => void;
  resultCount: number;
}) {
  if (!activeFilterCount(state)) return null;
  const section = techCardBomSectionOptions.find((option) => option.value === state.section)?.label;
  const filters: Array<{
    key: string;
    label: string;
    patch: Partial<MaterialFilterState>;
  }> = [];
  if (section) filters.push({ key: 'section', label: section, patch: { section: '' } });
  if (state.supplier) {
    filters.push({ key: 'supplier', label: state.supplier, patch: { supplier: '' } });
  }
  if (state.inStock) filters.push({ key: 'stock', label: 'in stock', patch: { inStock: false } });
  if (state.archived) {
    filters.push({ key: 'archived', label: 'archived', patch: { archived: false } });
  }

  return (
    <div className='flex min-w-0 items-center gap-2'>
      <div className='flex min-w-0 flex-1 flex-wrap gap-2'>
        {filters.map((filter) => (
          <span key={filter.key} className='flex items-center gap-1'>
            <Text component='span' size='micro'>
              {filter.label}
            </Text>
            <Close
              size='sm'
              aria-label={`clear ${filter.label}`}
              onClick={() => onChange({ ...state, ...filter.patch })}
            />
          </span>
        ))}
      </div>
      <Text component='span' size='micro' variant='label' className='shrink-0 tabular-nums'>
        {resultCount}
      </Text>
    </div>
  );
}
