import {
  common_Material,
  common_MaterialClass,
  common_MaterialPurpose,
  googletype_Decimal,
} from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { techCardBomSectionOptions } from 'constants/filter';
import { SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import { Pill } from 'ui/components/pill';
import { Placeholder } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';
import { decimalToInput } from 'utils/decimal';
import { composeArticleFromMaterial, materialSpec } from './material-code';
import { MaterialModal } from './material-modal';
import { materialPriceLabel } from './material-picker';
import { MaterialPricesModal } from './material-prices-modal';
import { MaterialThumb, materialImageUrl } from './material-thumb';
import { materialPurposeFilterOptions, materialPurposeLabel } from './purpose-options';
import { useArchiveMaterial, useMaterials } from './useMaterials';

const sectionLabel = (v?: string) =>
  techCardBomSectionOptions.find((o) => o.value === v)?.label ?? '—';

const classLabel = (c?: common_MaterialClass) =>
  c && c !== 'MATERIAL_CLASS_UNKNOWN' ? c.replace('MATERIAL_CLASS_', '').toLowerCase() : '';

const cell = 'border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize';

// A decimal as a clean string, treating undefined / 0 as absent (so "0 g/m²" never shows) — the
// same rule the shared materialSpec uses, kept local so the spec tab can render one row per field.
const decStr = (d?: googletype_Decimal): string => {
  const s = decimalToInput(d);
  return s && s !== '0' ? s : '';
};

// #17: catalog is a card list (not a table) — sort is a control, not clickable headers.
type SortKey = 'name' | 'code' | 'section' | 'supplier' | 'price';
const sortOptions: Array<{ value: SortKey; label: string }> = [
  { value: 'name', label: 'name' },
  { value: 'code', label: 'code' },
  { value: 'section', label: 'section' },
  { value: 'supplier', label: 'supplier' },
  { value: 'price', label: 'price' },
];

// artDetail=v3: the open article becomes a tabbed card. Only spec + pricing read from data this
// page already holds (attributes/composition and latest_price); stock + movements have no fetch
// wired here (balances live on the stock tab, the ledger on the movements tab), so they show a
// short pointer instead of inventing a request.
type DetailTab = 'spec' | 'pricing' | 'stock' | 'movements';
const detailTabs: DetailTab[] = ['spec', 'pricing', 'stock', 'movements'];

type SpecRow = { k: string; v: string };
// The class-typed attribute rows for the spec tab — the same fields the shared materialSpec folds
// into one line, here broken out into readable key/value rows.
function buildSpecRows(m: common_Material): SpecRow[] {
  const rows: SpecRow[] = [];
  const push = (k: string, v?: string) => {
    if (v && v.trim()) rows.push({ k, v: v.trim() });
  };
  push('section', sectionLabel(m.section));
  switch (m.materialClass) {
    case 'MATERIAL_CLASS_FABRIC': {
      const w = decStr(m.fabricAttrs?.widthCm) || decStr(m.fabricWidth);
      const g = decStr(m.fabricAttrs?.weightGsm) || decStr(m.fabricWeightGsm);
      if (w) push('width', `${w} cm`);
      if (g) push('weight', `${g} g/m²`);
      push('direction', m.fabricAttrs?.fabricDirection);
      const sh = decStr(m.fabricAttrs?.shrinkagePct);
      if (sh) push('shrinkage', `${sh} %`);
      const rl = decStr(m.fabricAttrs?.rollLengthM);
      if (rl) push('roll length', `${rl} m`);
      break;
    }
    case 'MATERIAL_CLASS_HARDWARE': {
      push('finish', m.hardwareAttrs?.finish);
      const d = decStr(m.hardwareAttrs?.diameterMm);
      if (d) push('diameter', `Ø${d} mm`);
      push('dimensions', m.hardwareAttrs?.dimensions);
      push('base material', m.hardwareAttrs?.baseMaterial);
      const wg = decStr(m.hardwareAttrs?.weightG);
      if (wg) push('weight', `${wg} g`);
      break;
    }
    case 'MATERIAL_CLASS_THREAD': {
      if (m.threadAttrs?.ticketTex?.trim()) push('tex', m.threadAttrs.ticketTex.trim());
      const lc = decStr(m.threadAttrs?.lengthPerConeM);
      if (lc) push('length / cone', `${lc} m`);
      push('needle', m.threadAttrs?.needleReco);
      break;
    }
    case 'MATERIAL_CLASS_PACKAGING': {
      push('substrate', m.packagingAttrs?.substrate);
      const g = decStr(m.packagingAttrs?.gsm);
      if (g) push('gsm', `${g} g/m²`);
      push('dimensions', m.packagingAttrs?.dimensions);
      push('print method', m.packagingAttrs?.printMethod);
      break;
    }
    default: {
      const g = decStr(m.fabricWeightGsm);
      const w = decStr(m.fabricWidth);
      if (g) push('weight', `${g} g/m²`);
      if (w) push('width', `${w} cm`);
    }
  }
  push('spec', m.spec);
  push('color', m.color);
  push('pantone', m.pantone);
  push('unit', m.unit);
  push('supplier', m.supplier);
  push('supplier ref', m.supplierRef);
  push('notes', m.notes);
  return rows;
}

function DetailRow({ k, v }: { k: string; v: string }) {
  return (
    <div className='flex items-center justify-between gap-4 border-b border-borderColor py-1'>
      <Text size='small' variant='label'>
        {k}
      </Text>
      <Text size='small' className='text-right tabular-nums'>
        {v}
      </Text>
    </div>
  );
}

// The tabbed article detail (artDetail=v3). Keyed by material id in the parent so the active tab
// resets when a different article is opened. Actions (edit / + price / archive / close) sit in the
// header row; edit and prices reuse the existing modals, archive the existing mutation.
function MaterialDetail({
  material,
  canEdit,
  canReadCosting,
  archivePending,
  onEdit,
  onPrices,
  onArchive,
  onClose,
}: {
  material: common_Material;
  canEdit: boolean;
  canReadCosting: boolean;
  archivePending: boolean;
  onEdit: () => void;
  onPrices: () => void;
  onArchive: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>('spec');
  const m = material;
  const code = composeArticleFromMaterial(m, true);
  const cls = classLabel(m.materialClass);
  const specRows = useMemo(() => buildSpecRows(m), [m]);
  const composition = (m.compositionEntries ?? []).filter(
    (e) => e.fiberCode?.trim() || e.name?.trim(),
  );
  const price = m.latestPrice;
  const noPrice = canReadCosting && !m.archived && !m.latestPrice?.price?.value;

  const trailBtn = (t: DetailTab) =>
    `-mb-px border-b-2 px-2.5 py-1.5 text-control uppercase tracking-label whitespace-nowrap transition-colors ${
      tab === t
        ? 'border-textColor font-bold text-textColor'
        : 'border-transparent text-labelColor hover:text-textColor'
    }`;

  return (
    <div className='flex flex-col border border-borderColor bg-bgColor'>
      <div className='flex flex-wrap items-center gap-3 border-b border-borderColor px-2.5 py-2'>
        <MaterialThumb material={m} size='sm' />
        <div className='flex min-w-0 flex-col'>
          <Text className='truncate font-bold'>{m.name || `#${m.id}`}</Text>
          <Text size='micro' variant='label' className='truncate font-mono tabular-nums'>
            {code}
          </Text>
        </div>
        <div className='flex flex-wrap items-center gap-1'>
          {cls ? <Pill tone='ink'>{cls}</Pill> : null}
          <Pill>{materialPurposeLabel(m.purpose)}</Pill>
          {m.archived ? <Pill>archived</Pill> : null}
          {noPrice ? (
            <Pill
              tone='attention'
              title='no purchase price — add one via + price; BOM costing and COGS depend on it'
            >
              no price
            </Pill>
          ) : null}
        </div>
        <div className='ml-auto flex flex-wrap items-center gap-2'>
          {canReadCosting ? (
            <Button type='button' variant='secondary' size='sm' onClick={onPrices}>
              + price
            </Button>
          ) : null}
          {canEdit ? (
            <>
              <Button type='button' variant='main' size='sm' onClick={onEdit}>
                edit
              </Button>
              <Button
                type='button'
                variant='secondary'
                size='sm'
                disabled={archivePending}
                onClick={onArchive}
              >
                {m.archived ? 'restore' : 'archive'}
              </Button>
            </>
          ) : null}
          <Button type='button' variant='secondary' size='sm' onClick={onClose}>
            close
          </Button>
        </div>
      </div>

      <div className='flex flex-wrap items-center gap-1 border-b border-borderColor px-1.5'>
        {detailTabs.map((t) => (
          <button
            key={t}
            type='button'
            aria-current={tab === t ? 'page' : undefined}
            onClick={() => setTab(t)}
            className={trailBtn(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className='flex flex-col gap-2 p-3'>
        {tab === 'spec' ? (
          specRows.length === 0 && composition.length === 0 ? (
            <Text variant='label' size='small'>
              no attributes recorded
            </Text>
          ) : (
            <>
              {specRows.map((r) => (
                <DetailRow key={r.k} k={r.k} v={r.v} />
              ))}
              {composition.length > 0 ? (
                <div className='flex flex-col gap-1 pt-1'>
                  <Text variant='label' size='micro'>
                    fibre composition
                  </Text>
                  <div className='flex flex-wrap gap-1'>
                    {composition.map((e, i) => {
                      const pct = decimalToInput(e.percent);
                      return (
                        <Pill key={i} tone='ink'>
                          {`${pct ? `${pct}% ` : ''}${e.name?.trim() || e.fiberCode?.trim()}`}
                        </Pill>
                      );
                    })}
                  </div>
                </div>
              ) : m.composition?.trim() ? (
                <DetailRow k='composition' v={m.composition.trim()} />
              ) : null}
            </>
          )
        ) : null}

        {tab === 'pricing' ? (
          !canReadCosting ? (
            <Text variant='label' size='small'>
              pricing is hidden (requires costing access)
            </Text>
          ) : !price?.price?.value ? (
            <Text variant='label' size='small'>
              no price yet — add one with the + price action.
            </Text>
          ) : (
            <>
              <div className='flex items-baseline justify-between gap-4 border-b border-textColor pb-1'>
                <Text size='small' variant='label'>
                  latest
                </Text>
                <Text className='font-bold tabular-nums'>
                  {materialPriceLabel(m) || `${decimalToInput(price.price)} ${price.currency ?? ''}`}
                </Text>
              </div>
              <DetailRow k='valid from' v={price.validFrom ? price.validFrom.slice(0, 10) : '—'} />
              <DetailRow k='source' v={price.source || 'manual'} />
              {price.note?.trim() ? <DetailRow k='note' v={price.note.trim()} /> : null}
              <Text variant='label' size='micro'>
                full price history lives behind the + price action.
              </Text>
            </>
          )
        ) : null}

        {tab === 'stock' ? (
          <Text variant='label' size='small'>
            on-hand balances and min-stock live on the Stock tab.
          </Text>
        ) : null}

        {tab === 'movements' ? (
          <Text variant='label' size='small'>
            the movement ledger for this article lives on the Movements tab.
          </Text>
        ) : null}
      </div>
    </div>
  );
}

// The material nomenclature (catalog). bomList=v3: a section-grouped swatch-tile grid — choosing a
// fabric is a visual decision. Descriptive articles + latest price; balances live on the stock tab.
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
  // ?material=<id> IS the open state of the article card (R-1), not a mirror of it — so the tech
  // card's BOM plate ("open →") and any pasted link land on the material itself, cold load included.
  // Creating has no id yet, so that one stays local.
  const openId = Number(params.get('material')) || 0;
  const [creating, setCreating] = useState(false);
  // Editing an already-open article: the tabbed detail card is the default view for ?material=, and
  // the edit MODAL only opens on demand — so closing the modal returns to the card, not the list.
  const [editing, setEditing] = useState(false);
  const [pricesOf, setPricesOf] = useState<common_Material | undefined>();

  const { data, isLoading } = useMaterials(section, includeArchived, true, purpose);
  const archive = useArchiveMaterial();
  const materials = useMemo(() => data?.materials ?? [], [data]);
  // Material.id is int64 -> arrives as a STRING from grpc-gateway despite the generated `number`.
  // An id that matches nothing here — deleted, or archived/filtered out of the list this page asked
  // for — resolves to undefined and the detail simply never opens: the plain catalog stays on screen
  // instead of a spinner or a blank form. The stale param is left in the URL on purpose, because the
  // movements tab reads the same key as its ledger filter and index.tsx carries it across tabs.
  const opened = openId ? materials.find((m) => Number(m.id) === openId) : undefined;

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

  // bomList=v3: group the sorted list by section, preserving the sort as the order groups first
  // appear in (so sorting by section reorders the groups, sorting by name reorders tiles within).
  const groups = useMemo(() => {
    const map = new Map<string, common_Material[]>();
    sortedMaterials.forEach((m) => {
      const key = m.section ?? '';
      const arr = map.get(key);
      if (arr) arr.push(m);
      else map.set(key, [m]);
    });
    return Array.from(map, ([sec, items]) => ({ sec, items }));
  }, [sortedMaterials]);

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

  const openCreate = () => setCreating(true);
  // Opening/closing goes through the URL (replace, like every other filter here — this must not
  // stack a history entry per card opened) so the address bar always names what is on screen.
  const openDetail = (m: common_Material) => patch({ material: String(m.id ?? '') });
  const closeDetail = () => {
    setCreating(false);
    setEditing(false);
    patch({ material: '' });
  };

  return (
    <div className='flex flex-col gap-4'>
      <Toolbar>
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
        <ToolbarSpacer />
        {canEdit && (
          <Button size='lg' variant='main' className='uppercase' onClick={openCreate}>
            new material
          </Button>
        )}
      </Toolbar>

      {opened && !creating ? (
        <MaterialDetail
          key={openId}
          material={opened}
          canEdit={canEdit}
          canReadCosting={canReadCosting}
          archivePending={archive.isPending}
          onEdit={() => setEditing(true)}
          onPrices={() => setPricesOf(opened)}
          onArchive={() => toggleArchived(opened)}
          onClose={closeDetail}
        />
      ) : isLoading ? (
        <Text size='small'>loading…</Text>
      ) : materials.length === 0 ? (
        <Text variant='inactive' size='small'>
          no materials
        </Text>
      ) : (
        <div className='flex flex-col gap-5'>
          {groups.map(({ sec, items }) => (
            <div key={sec || 'none'} className='flex flex-col gap-2'>
              <div className='flex items-baseline gap-2 border-b border-borderColor pb-0.5'>
                <Text size='micro' variant='label' tracking='group' className='font-bold uppercase'>
                  {sectionLabel(sec)}
                </Text>
                <Text size='micro' variant='label'>
                  {items.length}
                </Text>
              </div>
              <Tiles min={140}>
                {items.map((m) => {
                  const id = Number(m.id);
                  const url = materialImageUrl(m);
                  const code = composeArticleFromMaterial(m, true);
                  const spec = materialSpec(m);
                  const price = canReadCosting ? materialPriceLabel(m) : '';
                  const noPrice = canReadCosting && !m.archived && !m.latestPrice?.price?.value;
                  return (
                    <Tile
                      key={id}
                      onClick={() => openDetail(m)}
                      media={
                        url ? (
                          <Media src={url} alt={m.name || 'material'} aspectRatio='1/1' fit='cover' />
                        ) : (
                          <Placeholder aspect='square' label='no image' />
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
                        {m.name || `#${id}`}
                      </Text>
                      {spec ? (
                        <Text
                          component='span'
                          size='micro'
                          variant='label'
                          className='block truncate'
                        >
                          {spec}
                        </Text>
                      ) : null}
                      <span className='mt-1 flex flex-wrap items-center gap-1'>
                        {price ? (
                          <Text
                            component='span'
                            size='micro'
                            variant='label'
                            className='tabular-nums'
                          >
                            {price}
                          </Text>
                        ) : null}
                        {noPrice ? <Pill tone='attention'>no price</Pill> : null}
                        {m.archived ? <Pill>archived</Pill> : null}
                      </span>
                    </Tile>
                  );
                })}
              </Tiles>
            </div>
          ))}
        </div>
      )}

      <MaterialModal
        open={creating || editing}
        onOpenChange={(v) => {
          if (v) return;
          setEditing(false);
          if (creating) closeDetail();
        }}
        material={creating ? undefined : opened}
      />
      <MaterialPricesModal
        open={pricesOf != null}
        onOpenChange={(v) => !v && setPricesOf(undefined)}
        material={pricesOf}
      />
    </div>
  );
}
