import {
  common_Material,
  common_MaterialStockRow,
  common_TechCardBomSection,
} from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { techCardBomSectionOptions } from 'constants/filter';
import { SECTION } from 'constants/routes';
import {
  type MutableRefObject,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  GroupLabel,
  Input,
  Media,
  Pill,
  Placeholder,
  Select,
  SideRail,
  SideRailLayout,
  Text,
  Tile,
  Tiles,
  Toolbar,
} from 'ui';
import { decimalToInput } from 'utils/decimal';
import { composeArticleFromMaterial, materialSpec } from './material-code';
import { type ExpandGuard, MaterialExpand } from './material-expand';
import { MaterialModal } from './material-modal';
import { isPurchasePrice } from './material-price';
import { materialPriceLabel } from './material-picker';
import { materialImageUrl } from './material-thumb';
import {
  AppliedFilters,
  DEFAULT_MATERIAL_FILTERS,
  MaterialFilterPanel,
  MaterialFilterSheet,
  activeFilterCount,
  applyMaterialFilters,
  normalizeMaterialSort,
  sectionCounts,
  suppliers,
  type MaterialFilterState,
} from './material-filters';
import { useMaterials } from './useMaterials';
import { useMaterialStock } from './useWarehouse';

const sectionLabel = (value?: string) =>
  techCardBomSectionOptions.find((option) => option.value === value)?.label ?? '—';

const quietCode = (code: string): string => {
  const parts = code
    .split('·')
    .map((part) => part.trim())
    .filter(Boolean);
  return (parts.length > 2 ? parts[1] : parts.join('')).slice(0, 4);
};

function MaterialTile({
  material,
  selected,
  canReadCosting,
  stock,
  stockLoading,
  onClick,
}: {
  material: common_Material;
  selected: boolean;
  canReadCosting: boolean;
  stock?: common_MaterialStockRow;
  stockLoading: boolean;
  onClick: () => void;
}) {
  const id = Number(material.id);
  const url = materialImageUrl(material);
  const code = composeArticleFromMaterial(material, true);
  const spec = materialSpec(material);
  const price =
    canReadCosting && isPurchasePrice(material.latestPrice)
      ? materialPriceLabel(material).toLowerCase()
      : '';
  const stockValue = stock ? decimalToInput(stock.onHand) || '0' : stockLoading ? '…' : '0';
  const stockLabel = `${stockValue}${material.unit ? ` ${material.unit}` : ''}`;
  const outOfStock = !stockLoading && Number(stockValue) === 0;

  return (
    <Tile
      selected={selected}
      title={material.name}
      onClick={onClick}
      media={
        url ? (
          <Media src={url} alt={material.name || 'material'} aspectRatio='1/1' fit='cover' />
        ) : (
          <Placeholder aspect='square' label={quietCode(code)} />
        )
      }
    >
      <Text
        component='span'
        size='control'
        className='mt-1 block truncate font-mono font-bold tabular-nums'
      >
        {code}
      </Text>
      <Text component='span' size='micro' className='block truncate'>
        {material.name || 'unnamed'}
      </Text>
      {spec ? (
        <Text component='span' size='micro' variant='label' className='block truncate'>
          {spec}
        </Text>
      ) : null}
      <span className='mt-1 flex items-baseline justify-between gap-1'>
        {price ? (
          <Text
            component='span'
            size='micro'
            variant='label'
            className='min-w-0 truncate tabular-nums'
          >
            {price}
          </Text>
        ) : (
          <span />
        )}
        <Text
          component='span'
          size='micro'
          className={`shrink-0 tabular-nums ${outOfStock ? 'text-error' : ''}`}
        >
          {stockLabel}
        </Text>
      </span>
      {material.archived ? (
        <span className='mt-1 flex flex-wrap gap-1'>
          <Pill>archived</Pill>
        </span>
      ) : null}
    </Tile>
  );
}

function MaterialGrid({
  items,
  opened,
  openId,
  canReadCosting,
  stockByMaterial,
  stockLoading,
  guardRef,
  onOpen,
  onClose,
}: {
  items: common_Material[];
  opened?: common_Material;
  openId: number;
  canReadCosting: boolean;
  stockByMaterial: Map<number, common_MaterialStockRow>;
  stockLoading: boolean;
  guardRef: MutableRefObject<ExpandGuard | null>;
  onOpen: (material: common_Material) => void;
  onClose: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(1);

  useLayoutEffect(() => {
    const grid = hostRef.current?.firstElementChild;
    if (!(grid instanceof HTMLElement)) return;

    const measure = () => {
      const tracks = window.getComputedStyle(grid).gridTemplateColumns.trim();
      setColumns(tracks && tracks !== 'none' ? tracks.split(/\s+/).length : 1);
    };

    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  const openIndex = items.findIndex((material) => Number(material.id) === openId);
  const insertAfter =
    openIndex < 0
      ? -1
      : Math.min(items.length - 1, Math.ceil((openIndex + 1) / columns) * columns - 1);

  return (
    <div ref={hostRef}>
      <Tiles min={156}>
        {items.flatMap((material, index) => {
          const id = Number(material.id);
          const nodes: ReactNode[] = [
            <MaterialTile
              key={`material-${id}`}
              material={material}
              selected={id === openId}
              canReadCosting={canReadCosting}
              stock={stockByMaterial.get(id)}
              stockLoading={stockLoading}
              onClick={() => onOpen(material)}
            />,
          ];

          if (index === insertAfter && opened) {
            nodes.push(
              <div key={`expand-${opened.id}`} className='col-span-full'>
                <MaterialExpand material={opened} onClose={onClose} guardRef={guardRef} />
              </div>,
            );
          }

          return nodes;
        })}
      </Tiles>
    </div>
  );
}

export function CatalogTab() {
  const { canWrite, canReadCosting } = usePermissions();
  const canEdit = canWrite(SECTION.techCards);
  const [params, setParams] = useSearchParams();
  const state: MaterialFilterState = {
    section: params.get('section') ?? '',
    supplier: params.get('supplier') ?? '',
    inStock: params.get('stock') === '1',
    archived: params.get('archived') === '1',
    sort: normalizeMaterialSort(params.get('sort')),
  };
  const openId = Number(params.get('material')) || 0;
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const guardRef = useRef<ExpandGuard | null>(null);

  const patch = (next: Record<string, string | boolean>) =>
    setParams(
      (previous) => {
        const updated = new URLSearchParams(previous);
        updated.delete('purpose');
        Object.entries(next).forEach(([key, value]) => {
          if (value === '' || value === false) updated.delete(key);
          else updated.set(key, value === true ? '1' : String(value));
        });
        return updated;
      },
      { replace: true },
    );

  useEffect(() => {
    if (!params.has('purpose')) return;
    setParams(
      (previous) => {
        const updated = new URLSearchParams(previous);
        updated.delete('purpose');
        return updated;
      },
      { replace: true },
    );
  }, [params, setParams]);

  const { data, isLoading } = useMaterials('', state.archived, true);
  const { data: stockData, isLoading: stockLoading } = useMaterialStock({});
  const materials = useMemo(() => data?.materials ?? [], [data]);
  const opened = openId ? materials.find((material) => Number(material.id) === openId) : undefined;
  const stockByMaterial = useMemo(
    () =>
      new Map(
        (stockData?.rows ?? []).flatMap((row) => {
          const id = Number(row.material?.id);
          return id ? [[id, row] as const] : [];
        }),
      ),
    [stockData],
  );

  const runGuard = (proceed: () => void) => {
    const guard = guardRef.current;
    if (guard) guard(proceed);
    else proceed();
  };

  const updateQuery = (value: string) => {
    if (value === query) return;
    runGuard(() => setQuery(value));
  };
  const updateFilters = (next: MaterialFilterState) => {
    runGuard(() =>
      patch({
        section: next.section,
        supplier: next.supplier,
        stock: next.inStock,
        archived: next.archived,
        sort: next.sort === DEFAULT_MATERIAL_FILTERS.sort ? '' : next.sort,
      }),
    );
  };
  const openMaterial = (material: common_Material) => {
    const id = Number(material.id);
    const next = id === openId ? '' : String(id);
    runGuard(() => patch({ material: next }));
  };
  const closeMaterial = () => patch({ material: '' });

  const filteredMaterials = useMemo(
    () => applyMaterialFilters(materials, state, { q: query, stockById: stockByMaterial }),
    [materials, query, state, stockByMaterial],
  );
  const counts = useMemo(
    () => sectionCounts(materials, state, { q: query, stockById: stockByMaterial }),
    [materials, query, state, stockByMaterial],
  );
  const supplierNames = useMemo(() => suppliers(materials), [materials]);

  const groups = useMemo(() => {
    const grouped = new Map<string, common_Material[]>();
    filteredMaterials.forEach((material) => {
      const key = material.section ?? '';
      const items = grouped.get(key);
      if (items) items.push(material);
      else grouped.set(key, [material]);
    });
    const ordered: Array<{ section: string; items: common_Material[] }> =
      techCardBomSectionOptions.flatMap((option) => {
        const items = grouped.get(option.value);
        return items ? [{ section: option.value, items }] : [];
      });
    const known = new Set(techCardBomSectionOptions.map((option) => option.value));
    grouped.forEach((items, groupSection) => {
      if (!known.has(groupSection as (typeof techCardBomSectionOptions)[number]['value'])) {
        ordered.push({ section: groupSection, items });
      }
    });
    return ordered;
  }, [filteredMaterials]);

  const toolbarSearch = (
    <Input
      name='material-search'
      aria-label='search materials'
      placeholder='search'
      value={query}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateQuery(event.target.value)}
      className='min-w-0 flex-1'
    />
  );

  const grid = isLoading ? (
    <Text>loading…</Text>
  ) : filteredMaterials.length === 0 ? (
    <Text variant='label'>no materials</Text>
  ) : state.section ? (
    <MaterialGrid
      items={filteredMaterials}
      opened={opened}
      openId={openId}
      canReadCosting={canReadCosting}
      stockByMaterial={stockByMaterial}
      stockLoading={stockLoading}
      guardRef={guardRef}
      onOpen={openMaterial}
      onClose={closeMaterial}
    />
  ) : (
    <div className='flex flex-col gap-5'>
      {groups.map(({ section: groupSection, items }) => (
        <div key={groupSection || 'none'} className='flex scroll-mt-24 flex-col gap-2'>
          <GroupLabel
            flush
            action={
              <Text size='micro' variant='label'>
                {items.length}
              </Text>
            }
          >
            <span className='normal-case'>{sectionLabel(groupSection)}</span>
          </GroupLabel>
          <MaterialGrid
            items={items}
            opened={opened}
            openId={openId}
            canReadCosting={canReadCosting}
            stockByMaterial={stockByMaterial}
            stockLoading={stockLoading}
            guardRef={guardRef}
            onOpen={openMaterial}
            onClose={closeMaterial}
          />
        </div>
      ))}
    </div>
  );

  return (
    <>
      <SideRailLayout
        rail={
          <SideRail width={190} className='hidden lg:block'>
            <MaterialFilterPanel
              state={state}
              onChange={updateFilters}
              counts={counts}
              suppliers={supplierNames}
              hideSupplier
            />
          </SideRail>
        }
      >
        <div className='flex flex-col gap-4'>
          <Toolbar className='hidden flex-nowrap lg:flex'>
            {toolbarSearch}
            <div className='w-48 shrink-0'>
              <Select
                name='catalog-supplier'
                value={state.supplier}
                placeholder='supplier'
                items={[
                  { value: '', label: 'any' },
                  ...supplierNames.map((supplier) => ({ value: supplier, label: supplier })),
                ]}
                onValueChange={(supplier) => updateFilters({ ...state, supplier })}
                fullWidth
              />
            </div>
            <div className='w-36 shrink-0'>
              <Select
                name='catalog-sort'
                value={state.sort}
                placeholder='sort'
                items={[
                  { value: 'name', label: 'name a–z' },
                  { value: 'code', label: 'code a–z' },
                  { value: 'stock', label: 'stock low' },
                ]}
                onValueChange={(sort) =>
                  updateFilters({ ...state, sort: normalizeMaterialSort(sort) })
                }
                fullWidth
              />
            </div>
            {canEdit ? (
              <Button
                type='button'
                variant='main'
                className='shrink-0 px-4'
                onClick={() => setCreating(true)}
              >
                new
              </Button>
            ) : null}
          </Toolbar>

          <Toolbar className='flex-nowrap lg:hidden'>
            {toolbarSearch}
            <Button
              type='button'
              variant='secondary'
              className='shrink-0 normal-case'
              onClick={() => setFilterOpen(true)}
            >
              filter{activeFilterCount(state) ? ` ${activeFilterCount(state)}` : ''}
            </Button>
            {canEdit ? (
              <Button
                type='button'
                variant='main'
                className='shrink-0 normal-case'
                onClick={() => setCreating(true)}
              >
                new
              </Button>
            ) : null}
          </Toolbar>
          <div className='lg:hidden'>
            <AppliedFilters
              state={state}
              onChange={updateFilters}
              resultCount={filteredMaterials.length}
            />
          </div>
          {grid}
        </div>
      </SideRailLayout>

      <MaterialFilterSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        state={state}
        onChange={updateFilters}
        counts={counts}
        suppliers={supplierNames}
        resultCount={filteredMaterials.length}
        onReset={() => updateFilters(DEFAULT_MATERIAL_FILTERS)}
      />

      <MaterialModal
        open={creating}
        onOpenChange={(open) => {
          if (!open) setCreating(false);
        }}
        defaultSection={(state.section as common_TechCardBomSection) || undefined}
      />
    </>
  );
}
