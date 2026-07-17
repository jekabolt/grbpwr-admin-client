import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { FC, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import {
  archiveCollection,
  archiveColor,
  archiveTag,
  setCountryActive,
} from './dictionary-adapters';

// R9 — controlled dictionaries (colors / collections / tags / countries). This is the admin surface
// for the versioned, archive-not-delete reference data. Lists come from DictionaryProvider (the read
// models); the create/archive/set-active actions call the real CRUD RPCs through the adapter seam in
// ./dictionary-adapters.

type TabKey = 'colors' | 'collections' | 'tags' | 'countries';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'colors', label: 'colors' },
  { key: 'collections', label: 'collections' },
  { key: 'tags', label: 'tags' },
  { key: 'countries', label: 'countries' },
];

const th = 'border border-textInactiveColor px-2 py-1 text-left uppercase';
const td = 'border border-textInactiveColor px-2 py-1';

export const Dictionaries: FC = () => {
  const { dictionary, loading, refetch } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const { canWrite } = usePermissions();
  const [tab, setTab] = useState<TabKey>('colors');
  const [busy, setBusy] = useState(false);
  const writable = canWrite(SECTION.settings);

  // Run an adapter mutation (returns the new dictionary revision, which we ignore here and just
  // refetch the whole dictionary to reconcile).
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      showMessage('Saved', 'success');
      await refetch();
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Action failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const colors = dictionary?.colors ?? [];
  const collections = dictionary?.collections ?? [];
  const tags = dictionary?.tags ?? [];
  const countries = dictionary?.countries ?? [];

  return (
    <div className='flex flex-col gap-6 px-2 pt-2 pb-24 lg:px-6'>
      <div className='flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor pb-3'>
        <Text variant='uppercase' size='large'>
          dictionaries
        </Text>
        {dictionary?.skuContractVersion && (
          <span className='border border-textInactiveColor px-1.5 py-0.5'>
            <Text variant='inactive' size='small'>
              sku contract {dictionary.skuContractVersion}
            </Text>
          </span>
        )}
      </div>

      <div className='flex flex-wrap gap-2'>
        {TABS.map((t) => (
          <Button
            key={t.key}
            type='button'
            size='lg'
            variant={tab === t.key ? 'main' : 'secondary'}
            className='uppercase'
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      <Text variant='inactive' size='small'>
        controlled, versioned reference data — archive, never delete (FK RESTRICT). Lists are live
        from the dictionary; archive / activate act immediately.
      </Text>

      {loading && <Text variant='inactive'>loading…</Text>}

      {tab === 'colors' && (
        <Table
          headers={['code', 'name', 'hex', 'status', '']}
          rows={colors.map((c) => ({
            key: c.code ?? String(c.id),
            archived: !!c.archived,
            cells: [
              <Text variant='uppercase'>{c.code}</Text>,
              <Text>{c.name}</Text>,
              <span className='flex items-center gap-2'>
                {c.hex && (
                  <span
                    className='inline-block h-4 w-4 border border-textInactiveColor'
                    style={{ backgroundColor: c.hex }}
                  />
                )}
                <Text variant='inactive' size='small'>
                  {c.hex}
                </Text>
              </span>,
              <StatusCell archived={!!c.archived} />,
              <RowAction
                disabled={!writable || busy || !!c.archived}
                label='archive'
                onClick={() => run(() => archiveColor(c.code ?? ''))}
              />,
            ],
          }))}
        />
      )}

      {tab === 'collections' && (
        <Table
          headers={['code', 'name', 'men', 'women', 'status', '']}
          rows={collections.map((c) => ({
            key: c.code ?? c.name ?? '',
            archived: !!c.archived,
            cells: [
              <Text variant='uppercase'>{c.code || '—'}</Text>,
              <Text>{c.name}</Text>,
              <Text variant='inactive'>{c.countMen ?? 0}</Text>,
              <Text variant='inactive'>{c.countWomen ?? 0}</Text>,
              <StatusCell archived={!!c.archived} />,
              <RowAction
                disabled={!writable || busy || !!c.archived}
                label='archive'
                onClick={() => run(() => archiveCollection(c.id ?? 0))}
              />,
            ],
          }))}
        />
      )}

      {tab === 'tags' && (
        <Table
          headers={['code', 'name', 'status', '']}
          rows={tags.map((t) => ({
            key: t.code ?? String(t.id),
            archived: !!t.archived,
            cells: [
              <Text variant='uppercase'>{t.code}</Text>,
              <Text>{t.name}</Text>,
              <StatusCell archived={!!t.archived} />,
              <RowAction
                disabled={!writable || busy || !!t.archived}
                label='archive'
                onClick={() => run(() => archiveTag(t.id ?? 0))}
              />,
            ],
          }))}
        />
      )}

      {tab === 'countries' && (
        <Table
          headers={['code', 'name', 'active', '']}
          rows={countries.map((c) => ({
            key: c.code ?? '',
            archived: !c.active,
            cells: [
              <Text variant='uppercase'>{c.code}</Text>,
              <Text>{c.name}</Text>,
              <StatusCell active={!!c.active} />,
              <RowAction
                disabled={!writable || busy}
                label={c.active ? 'deactivate' : 'activate'}
                onClick={() => run(() => setCountryActive(c.code ?? '', !c.active))}
              />,
            ],
          }))}
        />
      )}
    </div>
  );
};

function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: { key: string; archived?: boolean; cells: React.ReactNode[] }[];
}) {
  if (!rows.length) {
    return (
      <Text variant='inactive' size='small'>
        nothing here yet.
      </Text>
    );
  }
  return (
    <div className='overflow-x-auto'>
      <table className='w-full border-collapse text-textBaseSize'>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className={th}>
                <Text variant='uppercase' size='small'>
                  {h}
                </Text>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={cn({ 'opacity-50': r.archived })}>
              {r.cells.map((cell, i) => (
                <td key={i} className={td}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusCell({ archived, active }: { archived?: boolean; active?: boolean }) {
  if (active !== undefined) {
    return (
      <Text variant='inactive' size='small' className={active ? '!text-green-600' : undefined}>
        {active ? 'active' : 'inactive'}
      </Text>
    );
  }
  return (
    <Text variant='inactive' size='small' className={archived ? '!text-red-600' : undefined}>
      {archived ? 'archived' : 'active'}
    </Text>
  );
}

function RowAction({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button type='button' size='sm' variant='secondary' className='uppercase' disabled={disabled} onClick={onClick}>
      {label}
    </Button>
  );
}
