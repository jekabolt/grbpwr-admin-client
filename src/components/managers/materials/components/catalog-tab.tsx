import { common_Material } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { techCardBomSectionOptions } from 'constants/filter';
import { SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';
import { MaterialModal } from './material-modal';
import { MaterialPricesModal } from './material-prices-modal';
import { useArchiveMaterial, useMaterials } from './useMaterials';

const sectionLabel = (v?: string) =>
  techCardBomSectionOptions.find((o) => o.value === v)?.label ?? '—';

const cell = 'border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize';

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

  const { data, isLoading } = useMaterials(section, includeArchived);
  const archive = useArchiveMaterial();
  const materials = data?.materials ?? [];

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
          <label className='flex items-center gap-2'>
            <input
              type='checkbox'
              checked={includeArchived}
              onChange={(e) => patch({ archived: e.target.checked })}
            />
            <Text size='small'>include archived</Text>
          </label>
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
          {materials.map((m) => (
            <div
              key={m.id}
              className='flex flex-wrap items-center justify-between gap-2 border border-textInactiveColor p-2'
            >
              <div className='flex flex-col'>
                <Text size='small'>
                  {m.code ? `${m.code} · ` : ''}
                  {m.name}
                  {m.archived ? ' · archived' : ''}
                </Text>
                <Text variant='inactive' size='small'>
                  {sectionLabel(m.section)}
                  {m.supplier ? ` · ${m.supplier}` : ''}
                  {m.unit ? ` · ${m.unit}` : ''}
                  {canReadCosting && m.latestPrice?.price?.value
                    ? ` · ${decimalToInput(m.latestPrice.price)} ${m.latestPrice.currency || ''}`
                    : ''}
                </Text>
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
          ))}
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
