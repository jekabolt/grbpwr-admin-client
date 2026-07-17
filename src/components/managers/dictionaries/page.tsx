import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { FC, useState } from 'react';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import {
  archiveCollection,
  archiveColor,
  archiveTag,
  createCollection,
  createColor,
  createTag,
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
const inputCls =
  'w-full border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize disabled:opacity-50';

export const Dictionaries: FC = () => {
  const { dictionary, loading, refetch } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const { canWrite } = usePermissions();
  const [tab, setTab] = useState<TabKey>('colors');
  const [busy, setBusy] = useState(false);
  const writable = canWrite(SECTION.settings);

  // Run an adapter mutation (returns the new dictionary revision, which we ignore here and just
  // refetch the whole dictionary to reconcile). Returns whether it succeeded so the create-form
  // modal can decide whether to close/reset (success) or stay open for correction (failure).
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      showMessage('Saved', 'success');
      await refetch();
      return true;
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Action failed', 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  // Create-color/collection/tag forms. One shared modal whose fields switch on the active tab (only
  // one of the three is ever open at a time); state stays separate per shape so switching tabs never
  // clobbers another tab's in-progress input. Fibers and countries are out of scope here — fibers
  // ship in a separate backend wave, countries are seeded (never created from the UI).
  const [createOpen, setCreateOpen] = useState(false);
  const [colorForm, setColorForm] = useState({ code: '', name: '', hex: '#000000' });
  const [collectionForm, setCollectionForm] = useState({ name: '' });
  const [tagForm, setTagForm] = useState({ name: '' });

  const openCreate = () => {
    setColorForm({ code: '', name: '', hex: '#000000' });
    setCollectionForm({ name: '' });
    setTagForm({ name: '' });
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (tab === 'colors') {
      const code = colorForm.code.trim();
      const name = colorForm.name.trim();
      const hex = colorForm.hex.trim();
      if (!code || !name || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
        showMessage('Code, name and a valid #hex are required', 'error');
        return;
      }
      if (await run(() => createColor({ code, name, hex }))) setCreateOpen(false);
      return;
    }
    if (tab === 'collections') {
      const name = collectionForm.name.trim();
      if (!name) {
        showMessage('Name is required', 'error');
        return;
      }
      if (await run(() => createCollection({ name }))) setCreateOpen(false);
      return;
    }
    if (tab === 'tags') {
      const name = tagForm.name.trim();
      if (!name) {
        showMessage('Name is required', 'error');
        return;
      }
      if (await run(() => createTag({ name }))) setCreateOpen(false);
    }
  };

  const createNoun = tab === 'colors' ? 'color' : tab === 'collections' ? 'collection' : 'tag';

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
        <>
          <div className='flex justify-end'>
            <Button
              type='button'
              size='lg'
              variant='main'
              className='uppercase'
              disabled={!writable || busy}
              onClick={openCreate}
            >
              + add color
            </Button>
          </div>
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
        </>
      )}

      {tab === 'collections' && (
        <>
          <div className='flex justify-end'>
            <Button
              type='button'
              size='lg'
              variant='main'
              className='uppercase'
              disabled={!writable || busy}
              onClick={openCreate}
            >
              + add collection
            </Button>
          </div>
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
        </>
      )}

      {tab === 'tags' && (
        <>
          <div className='flex justify-end'>
            <Button
              type='button'
              size='lg'
              variant='main'
              className='uppercase'
              disabled={!writable || busy}
              onClick={openCreate}
            >
              + add tag
            </Button>
          </div>
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
        </>
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

      <ConfirmationModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onConfirm={handleCreate}
        title={`add ${createNoun}`}
        confirmLabel={busy ? 'saving…' : 'create'}
        confirmDisabled={busy}
        closeOnConfirm={false}
      >
        <div className='flex min-w-[min(90vw,24rem)] flex-col gap-3'>
          {tab === 'colors' && (
            <>
              <Field label='code'>
                <input
                  className={inputCls}
                  maxLength={16}
                  placeholder='BLK'
                  disabled={busy}
                  value={colorForm.code}
                  onChange={(e) => setColorForm((f) => ({ ...f, code: e.target.value }))}
                />
              </Field>
              <Field label='name'>
                <input
                  className={inputCls}
                  placeholder='black'
                  disabled={busy}
                  value={colorForm.name}
                  onChange={(e) => setColorForm((f) => ({ ...f, name: e.target.value }))}
                />
              </Field>
              <Field label='hex'>
                <div className='flex items-center gap-2'>
                  <input
                    type='color'
                    className='h-8 w-10 shrink-0 cursor-pointer border border-textInactiveColor bg-bgColor disabled:opacity-50'
                    disabled={busy}
                    value={/^#[0-9a-fA-F]{6}$/.test(colorForm.hex) ? colorForm.hex : '#000000'}
                    onChange={(e) => setColorForm((f) => ({ ...f, hex: e.target.value }))}
                  />
                  <input
                    className={inputCls}
                    placeholder='#000000'
                    disabled={busy}
                    value={colorForm.hex}
                    onChange={(e) => setColorForm((f) => ({ ...f, hex: e.target.value }))}
                  />
                </div>
              </Field>
            </>
          )}
          {tab === 'collections' && (
            <Field label='name'>
              <input
                className={inputCls}
                placeholder='core'
                disabled={busy}
                value={collectionForm.name}
                onChange={(e) => setCollectionForm({ name: e.target.value })}
              />
            </Field>
          )}
          {tab === 'tags' && (
            <Field label='name'>
              <input
                className={inputCls}
                placeholder='new-arrival'
                disabled={busy}
                value={tagForm.name}
                onChange={(e) => setTagForm({ name: e.target.value })}
              />
            </Field>
          )}
        </div>
      </ConfirmationModal>
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
    <Button
      type='button'
      size='sm'
      variant='secondary'
      className='uppercase'
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className='flex flex-col gap-1'>
      <Text variant='inactive' size='small' className='uppercase'>
        {label}
      </Text>
      {children}
    </label>
  );
}
