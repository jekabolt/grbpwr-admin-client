import {
  common_Material,
  common_MaterialClass,
  common_MaterialPurpose,
} from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { formatCompositionEntries } from 'components/managers/tech-card/components/composition-entries';
import { techCardBomSectionOptions } from 'constants/filter';
import { SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';
import { MaterialModal } from './material-modal';
import { MaterialPricesModal } from './material-prices-modal';
import { MaterialThumb } from './material-thumb';
import { materialPurposeFilterOptions, materialPurposeLabel } from './purpose-options';
import { useArchiveMaterial, useMaterials } from './useMaterials';

const sectionLabel = (v?: string) =>
  techCardBomSectionOptions.find((o) => o.value === v)?.label ?? '—';

const classLabel = (c?: common_MaterialClass) =>
  c && c !== 'MATERIAL_CLASS_UNKNOWN' ? c.replace('MATERIAL_CLASS_', '').toLowerCase() : '';

const cell = 'border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize';
const chip = 'border border-textInactiveColor px-1.5 py-0.5 text-small uppercase';

// #17: catalog is a card list (not a table) — sort is a control, not clickable headers.
type SortKey = 'name' | 'code' | 'section' | 'supplier' | 'price';
const sortOptions: Array<{ value: SortKey; label: string }> = [
  { value: 'name', label: 'name' },
  { value: 'code', label: 'code' },
  { value: 'section', label: 'section' },
  { value: 'supplier', label: 'supplier' },
  { value: 'price', label: 'price' },
];

// The material nomenclature (catalog). Unchanged from the pre-tabs /materials page — descriptive
// articles + price history; balances live on the stock tab.
export function CatalogTab() {
  const { canWrite, canReadCosting } = usePermissions();
  const { showMessage } = useSnackBarStore();
  const canEdit = canWrite(SECTION.techCards);
  // Filters live in the URL (R-1) like the stock/movements tabs, so a filtered catalog is shareable.
  const [params, setParams] = useSearchParams();
  const section = params.get('section') ?? '';
  const includeArchived = params.get('archived') === '1';
  // #4: purpose filter (sample / production / both / all). Absent from the URL, same as UNKNOWN,
  // means "all" — the server applies no purpose filter.
  const purpose = (params.get('purpose') as common_MaterialPurpose) || 'MATERIAL_PURPOSE_UNKNOWN';
  const patch = (next: Record<string, string | boolean>) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        Object.entries(next).forEach(([k, v]) => {
          if (v === '' || v === false) p.delete(k);
          else p.set(k, v === true ? '1' : String(v));
        });
        return p;
      },
      { replace: true },
    );
  const [editing, setEditing] = useState<common_Material | undefined>();
  const [editOpen, setEditOpen] = useState(false);
  const [pricesOf, setPricesOf] = useState<common_Material | undefined>();

  const { data, isLoading } = useMaterials(section, includeArchived, true, purpose);
  const archive = useArchiveMaterial();
  const materials = useMemo(() => data?.materials ?? [], [data]);

  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const sortedMaterials = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const val = (m: common_Material): string | number => {
      switch (sortKey) {
        case 'code':
          return (m.code ?? '').toLowerCase();
        case 'section':
          return sectionLabel(m.section).toLowerCase();
        case 'supplier':
          return (m.supplier ?? '').toLowerCase();
        case 'price': {
          const n = Number(m.latestPrice?.price?.value);
          return Number.isFinite(n) ? n : -Infinity;
        }
        default:
          return (m.name ?? '').toLowerCase();
      }
    };
    return [...materials].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [materials, sortKey, sortDir]);

  const toggleArchived = (m: common_Material) => {
    if (!m.id) return;
    const restoring = !!m.archived;
    archive.mutate(
      { id: m.id, archived: !m.archived },
      {
        onSuccess: () =>
          showMessage(restoring ? 'Material restored' : 'Material archived', 'success'),
        onError: (e) =>
          showMessage(
            e instanceof Error ? e.message : `Failed to ${restoring ? 'restore' : 'archive'}`,
            'error',
          ),
      },
    );
  };

  const openCreate = () => {
    setEditing(undefined);
    setEditOpen(true);
  };
  const openEdit = (m: common_Material) => {
    setEditing(m);
    setEditOpen(true);
  };

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex flex-wrap items-center gap-3'>
          <select
            className={cell}
            value={section}
            onChange={(e) => patch({ section: e.target.value })}
          >
            <option value=''>all sections</option>
            {techCardBomSectionOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {/* #4: sample / production / both / all — UNKNOWN (default) applies no purpose filter. */}
          <select
            className={cell}
            value={purpose}
            onChange={(e) => patch({ purpose: e.target.value })}
          >
            {materialPurposeFilterOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <label className='flex items-center gap-2'>
            <input
              type='checkbox'
              checked={includeArchived}
              onChange={(e) => patch({ archived: e.target.checked })}
            />
            <Text size='small'>include archived</Text>
          </label>
          <div className='flex items-center gap-1'>
            <Text variant='inactive' size='small'>
              sort
            </Text>
            <select
              className={cell}
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
            >
              {sortOptions
                .filter((o) => o.value !== 'price' || canReadCosting)
                .map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
            </select>
            <button
              type='button'
              className={`${cell} uppercase`}
              aria-label='toggle sort direction'
              title={sortDir === 'asc' ? 'ascending' : 'descending'}
              onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            >
              {sortDir === 'asc' ? '▲' : '▼'}
            </button>
          </div>
        </div>
        {canEdit && (
          <Button size='lg' variant='main' className='uppercase' onClick={openCreate}>
            new material
          </Button>
        )}
      </div>

      {isLoading ? (
        <Text size='small'>loading…</Text>
      ) : materials.length === 0 ? (
        <Text variant='inactive' size='small'>
          no materials
        </Text>
      ) : (
        <div className='flex flex-col gap-1'>
          {sortedMaterials.map((m) => {
            const composition = formatCompositionEntries(m.compositionEntries);
            return (
              <div
                key={m.id}
                className='flex flex-wrap items-center justify-between gap-2 border border-textInactiveColor p-2'
              >
                <div className='flex min-w-0 items-center gap-3'>
                  <MaterialThumb material={m} />
                  <div className='flex min-w-0 flex-col gap-1'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <Text size='small'>
                        {m.code ? `${m.code} · ` : ''}
                        {m.name}
                      </Text>
                      {classLabel(m.materialClass) ? (
                        <span className={chip}>{classLabel(m.materialClass)}</span>
                      ) : null}
                      <span className={chip}>{materialPurposeLabel(m.purpose)}</span>
                      {m.archived ? (
                        <span className={`${chip} text-textInactiveColor`}>archived</span>
                      ) : null}
                    </div>
                    <Text variant='inactive' size='small'>
                      {sectionLabel(m.section)}
                      {m.supplier ? ` · ${m.supplier}` : ''}
                      {m.unit ? ` · ${m.unit}` : ''}
                      {canReadCosting && m.latestPrice?.price?.value
                        ? ` · ${decimalToInput(m.latestPrice.price)} ${m.latestPrice.currency || ''}`
                        : ''}
                    </Text>
                    {composition ? (
                      <Text variant='label' size='small'>
                        {composition}
                      </Text>
                    ) : null}
                    {m.color || m.pantone ? (
                      <Text variant='inactive' size='small'>
                        {[m.color, m.pantone].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                  </div>
                </div>
                <div className='flex items-center gap-2'>
                  {canReadCosting && (
                    <Button
                      type='button'
                      variant='secondary'
                      size='lg'
                      className='uppercase'
                      onClick={() => setPricesOf(m)}
                    >
                      prices
                    </Button>
                  )}
                  {canEdit && (
                    <>
                      <Button
                        type='button'
                        variant='secondary'
                        size='lg'
                        className='uppercase'
                        onClick={() => openEdit(m)}
                      >
                        edit
                      </Button>
                      <Button
                        type='button'
                        variant='secondary'
                        size='lg'
                        className='uppercase'
                        disabled={archive.isPending}
                        onClick={() => toggleArchived(m)}
                      >
                        {m.archived ? 'restore' : 'archive'}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <MaterialModal open={editOpen} onOpenChange={setEditOpen} material={editing} />
      <MaterialPricesModal
        open={pricesOf != null}
        onOpenChange={(v) => !v && setPricesOf(undefined)}
        material={pricesOf}
      />
    </div>
  );
}
