import { common_Material, common_MaterialStockRow } from 'api/proto-http/admin';
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
  Chip,
  ChipRow,
  GroupLabel,
  Input,
  Media,
  Pill,
  Placeholder,
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
import { useMaterials } from './useMaterials';
import { useMaterialStock } from './useWarehouse';

const sectionLabel = (value?: string) =>
  techCardBomSectionOptions.find((option) => option.value === value)?.label ?? '—';

const catalogSectionOptions = techCardBomSectionOptions.filter((option) =>
  [
    'TECH_CARD_BOM_SECTION_FABRIC',
    'TECH_CARD_BOM_SECTION_HARDWARE',
    'TECH_CARD_BOM_SECTION_THREAD',
  ].includes(option.value),
);

type SortKey = 'name-asc' | 'name-desc' | 'code-asc' | 'stock-low';

const sortOptions: Array<{ value: SortKey; label: string }> = [
  { value: 'name-asc', label: 'name a–z' },
  { value: 'name-desc', label: 'name z–a' },
  { value: 'code-asc', label: 'code a–z' },
  { value: 'stock-low', label: 'stock low' },
];

// The kit Chip uppercases; this screen is lowercase throughout.
const filterChipClass = 'min-h-11 normal-case md:min-h-10';

function CatalogToolbar({
  query,
  onQueryChange,
  section,
  onSectionChange,
  includeArchived,
  onArchivedChange,
  sort,
  onSortChange,
  canCreate,
  onCreate,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  section: string;
  onSectionChange: (value: string) => void;
  includeArchived: boolean;
  onArchivedChange: (value: boolean) => void;
  sort: SortKey;
  onSortChange: (value: SortKey) => void;
  canCreate: boolean;
  onCreate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeCount = Number(Boolean(section)) + Number(includeArchived);

  useEffect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('keydown', closeOnEscape, true);
    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => {
      document.removeEventListener('keydown', closeOnEscape, true);
      document.removeEventListener('pointerdown', closeOnOutsidePress);
    };
  }, [open]);

  return (
    <div ref={rootRef} className='relative min-w-0'>
      <Toolbar className='h-11 flex-nowrap gap-1 border-0 bg-transparent p-0 md:h-10'>
        <Input
          name='material-search'
          aria-label='search materials'
          placeholder='search'
          value={query}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            onQueryChange(event.target.value)
          }
          className='h-11 min-w-0 flex-1 placeholder:text-labelColor md:h-10'
        />
        <Button
          type='button'
          variant='secondary'
          aria-expanded={open}
          className='h-11 shrink-0 px-2.5 normal-case md:h-10'
          onClick={() => setOpen((current) => !current)}
        >
          filter{activeCount ? ` ${activeCount}` : ''}
        </Button>
        {canCreate ? (
          <Button
            type='button'
            variant='main'
            aria-label='new material'
            className='h-11 w-11 shrink-0 p-0 normal-case md:h-10 md:w-auto md:px-3'
            onClick={onCreate}
          >
            <span className='md:hidden'>+</span>
            <span className='hidden md:inline'>new</span>
          </Button>
        ) : null}
      </Toolbar>

      {open ? (
        <div className='mt-1 flex flex-col gap-2 border border-borderColor bg-bgColor p-2'>
          <div className='flex items-center gap-3'>
            <Text size='micro' variant='label' className='w-16 shrink-0'>
              section
            </Text>
            <ChipRow className='min-w-0 flex-1 flex-nowrap overflow-x-auto'>
              <Chip
                className={filterChipClass}
                selected={!section}
                pressed={!section}
                onClick={() => onSectionChange('')}
              >
                all
              </Chip>
              {catalogSectionOptions.map((option) => (
                <Chip
                  key={option.value}
                  className={filterChipClass}
                  selected={section === option.value}
                  pressed={section === option.value}
                  onClick={() => onSectionChange(option.value)}
                >
                  {option.label}
                </Chip>
              ))}
              <Chip
                className={filterChipClass}
                selected={includeArchived}
                pressed={includeArchived}
                onClick={() => onArchivedChange(!includeArchived)}
              >
                archived
              </Chip>
            </ChipRow>
          </div>

          <div className='flex items-center gap-3'>
            <Text size='micro' variant='label' className='w-16 shrink-0'>
              sort
            </Text>
            <ChipRow className='min-w-0 flex-1 flex-nowrap overflow-x-auto'>
              {sortOptions.map((option) => (
                <Chip
                  key={option.value}
                  className={filterChipClass}
                  selected={sort === option.value}
                  pressed={sort === option.value}
                  onClick={() => onSortChange(option.value)}
                >
                  {option.label}
                </Chip>
              ))}
            </ChipRow>
          </div>
        </div>
      ) : activeCount ? (
        <ChipRow className='pt-1'>
          {section ? (
            <Chip className={filterChipClass} selected onRemove={() => onSectionChange('')}>
              {sectionLabel(section)}
            </Chip>
          ) : null}
          {includeArchived ? (
            <Chip className={filterChipClass} selected onRemove={() => onArchivedChange(false)}>
              archived
            </Chip>
          ) : null}
        </ChipRow>
      ) : null}
    </div>
  );
}

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
        {material.name || `#${id}`}
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
  const section = params.get('section') ?? '';
  const includeArchived = params.get('archived') === '1';
  const openId = Number(params.get('material')) || 0;
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('name-asc');
  const [creating, setCreating] = useState(false);
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

  const { data, isLoading } = useMaterials(section, includeArchived, true);
  const { data: stockData, isLoading: stockLoading } = useMaterialStock({ section });
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
  const updateSection = (value: string) => {
    if (value === section) return;
    runGuard(() => patch({ section: value }));
  };
  const updateArchived = (value: boolean) => {
    if (value === includeArchived) return;
    runGuard(() => patch({ archived: value }));
  };
  const openMaterial = (material: common_Material) => {
    const id = Number(material.id);
    const next = id === openId ? '' : String(id);
    runGuard(() => patch({ material: next }));
  };
  const closeMaterial = () => patch({ material: '' });

  const filteredMaterials = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return materials;
    return materials.filter((material) =>
      [composeArticleFromMaterial(material, true), material.name, material.supplier, material.spec]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [materials, query]);

  const sortedMaterials = useMemo(() => {
    const stockValue = (material: common_Material) => {
      const value = decimalToInput(stockByMaterial.get(Number(material.id))?.onHand);
      const number = Number(value || 0);
      return Number.isFinite(number) ? number : 0;
    };
    const byName = (material: common_Material) => (material.name ?? '').toLowerCase();
    const byCode = (material: common_Material) =>
      composeArticleFromMaterial(material, true).toLowerCase();

    return [...filteredMaterials].sort((a, b) => {
      if (sort === 'stock-low') {
        return stockValue(a) - stockValue(b) || byName(a).localeCompare(byName(b));
      }
      if (sort === 'code-asc') return byCode(a).localeCompare(byCode(b));
      const compared = byName(a).localeCompare(byName(b));
      return sort === 'name-desc' ? -compared : compared;
    });
  }, [filteredMaterials, sort, stockByMaterial]);

  const groups = useMemo(() => {
    const grouped = new Map<string, common_Material[]>();
    sortedMaterials.forEach((material) => {
      const key = material.section ?? '';
      const items = grouped.get(key);
      if (items) items.push(material);
      else grouped.set(key, [material]);
    });
    return Array.from(grouped, ([groupSection, items]) => ({ section: groupSection, items }));
  }, [sortedMaterials]);

  return (
    <div className='flex flex-col gap-4'>
      <CatalogToolbar
        query={query}
        onQueryChange={updateQuery}
        section={section}
        onSectionChange={updateSection}
        includeArchived={includeArchived}
        onArchivedChange={updateArchived}
        sort={sort}
        onSortChange={setSort}
        canCreate={canEdit}
        onCreate={() => setCreating(true)}
      />

      {isLoading ? (
        <Text size='small'>loading…</Text>
      ) : filteredMaterials.length === 0 ? (
        <Text variant='label' size='small'>
          no materials
        </Text>
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
      )}

      <MaterialModal
        open={creating}
        onOpenChange={(open) => {
          if (!open) setCreating(false);
        }}
      />
    </div>
  );
}
