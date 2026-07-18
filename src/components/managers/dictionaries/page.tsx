import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { FC, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import {
  archiveCollection,
  archiveColor,
  archiveFiber,
  archiveTag,
  ColorRow,
  CollectionRow,
  createCollection,
  createColor,
  createFiber,
  createTag,
  setCountryActive,
  TagRow,
  updateCollection,
  updateColor,
  updateTag,
} from './dictionary-adapters';

// R9 — controlled dictionaries (colors / collections / tags / fibers / countries). This is the admin
// surface for the versioned, archive-not-delete reference data. Lists come from DictionaryProvider (the
// read models); the create/edit/archive/set-active actions call the real CRUD RPCs through the adapter
// seam in ./dictionary-adapters.

type TabKey = 'colors' | 'collections' | 'tags' | 'fibers' | 'countries';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'colors', label: 'colors' },
  { key: 'collections', label: 'collections' },
  { key: 'tags', label: 'tags' },
  { key: 'fibers', label: 'fibers' },
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

  // Create-color/collection/tag/fiber forms. One shared modal whose fields switch on the active tab
  // (only one of the four is ever open at a time); state stays separate per shape so switching tabs
  // never clobbers another tab's in-progress input. Countries are out of scope here — the ISO set is
  // seeded (never created from the UI).
  const [createOpen, setCreateOpen] = useState(false);
  const [colorForm, setColorForm] = useState({ code: '', name: '', hex: '#000000' });
  const [collectionForm, setCollectionForm] = useState({ name: '' });
  const [tagForm, setTagForm] = useState({ name: '' });
  const [fiberForm, setFiberForm] = useState({ code: '', name: '' });

  const openCreate = () => {
    setColorForm({ code: '', name: '', hex: '#000000' });
    setCollectionForm({ name: '' });
    setTagForm({ name: '' });
    setFiberForm({ code: '', name: '' });
    // Only one modal is ever meaningful at a time — close any in-flight edit/archive prompt so two
    // ConfirmationModals can never end up stacked from a stray double-click.
    setEditState(null);
    setArchiveTarget(null);
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
      return;
    }
    if (tab === 'fibers') {
      const code = fiberForm.code.trim();
      const name = fiberForm.name.trim();
      if (!code || !name) {
        showMessage('Code and name are required', 'error');
        return;
      }
      if (await run(() => createFiber({ code, name }))) setCreateOpen(false);
    }
  };

  const createNoun =
    tab === 'colors'
      ? 'color'
      : tab === 'collections'
        ? 'collection'
        : tab === 'tags'
          ? 'tag'
          : 'fiber';

  // Edit-color/collection/tag. Fibers have no UpdateFiber RPC in the contract yet (create/archive
  // only), so there is no edit action on that tab — see the report for that gap.
  type EditState =
    | { tab: 'colors'; code: string; name: string; hex: string }
    | { tab: 'collections'; id: number; name: string }
    | { tab: 'tags'; id: number; name: string };
  const [editState, setEditState] = useState<EditState | null>(null);

  const openEditColor = (c: ColorRow) => {
    setCreateOpen(false);
    setArchiveTarget(null);
    setEditState({
      tab: 'colors',
      code: c.code ?? '',
      name: c.name ?? '',
      hex: c.hex ?? '#000000',
    });
  };
  const openEditCollection = (c: CollectionRow) => {
    setCreateOpen(false);
    setArchiveTarget(null);
    setEditState({ tab: 'collections', id: c.id ?? 0, name: c.name ?? '' });
  };
  const openEditTag = (t: TagRow) => {
    setCreateOpen(false);
    setArchiveTarget(null);
    setEditState({ tab: 'tags', id: t.id ?? 0, name: t.name ?? '' });
  };

  const editNoun =
    editState?.tab === 'colors' ? 'color' : editState?.tab === 'collections' ? 'collection' : 'tag';

  const handleEditSave = async () => {
    if (!editState) return;
    if (editState.tab === 'colors') {
      const name = editState.name.trim();
      const hex = editState.hex.trim();
      if (!name || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
        showMessage('Name and a valid #hex are required', 'error');
        return;
      }
      if (await run(() => updateColor({ code: editState.code, name, hex }))) setEditState(null);
      return;
    }
    if (editState.tab === 'collections') {
      const name = editState.name.trim();
      if (!name) {
        showMessage('Name is required', 'error');
        return;
      }
      if (await run(() => updateCollection({ id: editState.id, name }))) setEditState(null);
      return;
    }
    const name = editState.name.trim();
    if (!name) {
      showMessage('Name is required', 'error');
      return;
    }
    if (await run(() => updateTag({ id: editState.id, name }))) setEditState(null);
  };

  // Archive confirmation — gates the previously single-click, no-recovery archive action (#81 P0)
  // behind the shared ConfirmationModal. There is no unarchive/restore RPC for colors/collections/
  // tags/fibers (unlike countries, which merely toggle active/inactive), so this is prevention, not
  // undo — see the report for that gap.
  type ArchiveTarget =
    | { tab: 'colors'; key: string; label: string }
    | { tab: 'collections'; key: number; label: string }
    | { tab: 'tags'; key: number; label: string }
    | { tab: 'fibers'; key: string; label: string };
  const [archiveTarget, setArchiveTarget] = useState<ArchiveTarget | null>(null);

  const askArchive = (target: ArchiveTarget) => {
    setCreateOpen(false);
    setEditState(null);
    setArchiveTarget(target);
  };

  const handleArchiveConfirm = async () => {
    if (!archiveTarget) return;
    const ok = await run(() => {
      if (archiveTarget.tab === 'colors') return archiveColor(archiveTarget.key);
      if (archiveTarget.tab === 'collections') return archiveCollection(archiveTarget.key);
      if (archiveTarget.tab === 'tags') return archiveTag(archiveTarget.key);
      return archiveFiber(archiveTarget.key);
    });
    if (ok) setArchiveTarget(null);
  };

  const colors = dictionary?.colors ?? [];
  const collections = dictionary?.collections ?? [];
  const tags = dictionary?.tags ?? [];
  const fibers = dictionary?.fibers ?? [];
  const countries = dictionary?.countries ?? [];

  // #81 P3 — the seeded ISO list is ~250 rows with no way to narrow it; filter client-side by code or
  // name (the only two visible columns), case-insensitively.
  const [countryQuery, setCountryQuery] = useState('');
  const filteredCountries = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter(
      (c) => (c.code ?? '').toLowerCase().includes(q) || (c.name ?? '').toLowerCase().includes(q),
    );
  }, [countries, countryQuery]);

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
                <RowActions>
                  <RowAction
                    disabled={!writable || busy}
                    label='edit'
                    onClick={() => openEditColor(c)}
                  />
                  <RowAction
                    disabled={!writable || busy || !!c.archived}
                    label='archive'
                    onClick={() =>
                      askArchive({
                        tab: 'colors',
                        key: c.code ?? '',
                        label: c.name || c.code || '',
                      })
                    }
                  />
                </RowActions>,
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
                <RowActions>
                  <RowAction
                    disabled={!writable || busy}
                    label='edit'
                    onClick={() => openEditCollection(c)}
                  />
                  <RowAction
                    disabled={!writable || busy || !!c.archived}
                    label='archive'
                    onClick={() =>
                      askArchive({ tab: 'collections', key: c.id ?? 0, label: c.name ?? '' })
                    }
                  />
                </RowActions>,
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
                <RowActions>
                  <RowAction
                    disabled={!writable || busy}
                    label='edit'
                    onClick={() => openEditTag(t)}
                  />
                  <RowAction
                    disabled={!writable || busy || !!t.archived}
                    label='archive'
                    onClick={() => askArchive({ tab: 'tags', key: t.id ?? 0, label: t.name ?? '' })}
                  />
                </RowActions>,
              ],
            }))}
          />
        </>
      )}

      {tab === 'fibers' && (
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
              + add fiber
            </Button>
          </div>
          <Text variant='inactive' size='small'>
            feeds material composition (a style's composition is derived from its shell-fabric
            materials' fibres) and label generation. No edit action — the contract only ships
            create/archive for fibers.
          </Text>
          <Table
            headers={['code', 'name', 'status', '']}
            rows={fibers.map((f) => ({
              key: f.code ?? '',
              archived: !!f.archived,
              cells: [
                <Text variant='uppercase'>{f.code}</Text>,
                <Text>{f.name}</Text>,
                <StatusCell archived={!!f.archived} />,
                <RowActions>
                  <RowAction
                    disabled={!writable || busy || !!f.archived}
                    label='archive'
                    onClick={() =>
                      askArchive({
                        tab: 'fibers',
                        key: f.code ?? '',
                        label: f.name || f.code || '',
                      })
                    }
                  />
                </RowActions>,
              ],
            }))}
          />
        </>
      )}

      {tab === 'countries' && (
        <>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <input
              className={cn(inputCls, 'max-w-xs')}
              placeholder='search by code or name…'
              value={countryQuery}
              onChange={(e) => setCountryQuery(e.target.value)}
            />
            <Text variant='inactive' size='small'>
              {filteredCountries.length} of {countries.length}
            </Text>
          </div>
          <Table
            headers={['code', 'name', 'active', '']}
            emptyMessage={countryQuery ? 'no countries match your search.' : 'nothing here yet.'}
            rows={filteredCountries.map((c) => ({
              key: c.code ?? '',
              archived: !c.active,
              cells: [
                <Text variant='uppercase'>{c.code}</Text>,
                <Text>{c.name}</Text>,
                <StatusCell active={!!c.active} />,
                <RowActions>
                  <RowAction
                    disabled={!writable || busy}
                    label={c.active ? 'deactivate' : 'activate'}
                    onClick={() => run(() => setCountryActive(c.code ?? '', !c.active))}
                  />
                </RowActions>,
              ],
            }))}
          />
        </>
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
          {tab === 'fibers' && (
            <>
              <Field label='code'>
                <input
                  className={inputCls}
                  maxLength={16}
                  placeholder='COT'
                  disabled={busy}
                  value={fiberForm.code}
                  onChange={(e) => setFiberForm((f) => ({ ...f, code: e.target.value }))}
                />
              </Field>
              <Field label='name'>
                <input
                  className={inputCls}
                  placeholder='cotton'
                  disabled={busy}
                  value={fiberForm.name}
                  onChange={(e) => setFiberForm((f) => ({ ...f, name: e.target.value }))}
                />
              </Field>
            </>
          )}
        </div>
      </ConfirmationModal>

      {/* #81 P0 — edit action for colors/collections/tags via the previously-unused Update{Color,
          Collection,Tag} RPCs. A separate modal instance from create/archive so it can never overlap
          them (each is also defensively closed by the others' open-handlers above). */}
      <ConfirmationModal
        open={editState !== null}
        onOpenChange={(open) => {
          if (!open) setEditState(null);
        }}
        onConfirm={handleEditSave}
        title={`edit ${editNoun}`}
        confirmLabel={busy ? 'saving…' : 'save'}
        confirmDisabled={busy}
        closeOnConfirm={false}
      >
        <div className='flex min-w-[min(90vw,24rem)] flex-col gap-3'>
          {editState?.tab === 'colors' && (
            <>
              <Field label='code'>
                <input className={inputCls} disabled value={editState.code} />
              </Field>
              <Field label='name'>
                <input
                  className={inputCls}
                  disabled={busy}
                  value={editState.name}
                  onChange={(e) => setEditState({ ...editState, name: e.target.value })}
                />
              </Field>
              <Field label='hex'>
                <div className='flex items-center gap-2'>
                  <input
                    type='color'
                    className='h-8 w-10 shrink-0 cursor-pointer border border-textInactiveColor bg-bgColor disabled:opacity-50'
                    disabled={busy}
                    value={/^#[0-9a-fA-F]{6}$/.test(editState.hex) ? editState.hex : '#000000'}
                    onChange={(e) => setEditState({ ...editState, hex: e.target.value })}
                  />
                  <input
                    className={inputCls}
                    placeholder='#000000'
                    disabled={busy}
                    value={editState.hex}
                    onChange={(e) => setEditState({ ...editState, hex: e.target.value })}
                  />
                </div>
              </Field>
            </>
          )}
          {editState?.tab === 'collections' && (
            <Field label='name'>
              <input
                className={inputCls}
                disabled={busy}
                value={editState.name}
                onChange={(e) => setEditState({ ...editState, name: e.target.value })}
              />
            </Field>
          )}
          {editState?.tab === 'tags' && (
            <Field label='name'>
              <input
                className={inputCls}
                disabled={busy}
                value={editState.name}
                onChange={(e) => setEditState({ ...editState, name: e.target.value })}
              />
            </Field>
          )}
        </div>
      </ConfirmationModal>

      {/* #81 P0 — archive now requires an explicit confirm (previously a single, unconfirmed click).
          There is no unarchive RPC for colors/collections/tags/fibers, so this dialog spells out that
          the action is not reversible from the UI instead of offering an "undo" that doesn't exist. */}
      <ConfirmationModal
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        onConfirm={handleArchiveConfirm}
        title='archive?'
        confirmLabel={busy ? 'archiving…' : 'archive'}
        confirmDisabled={busy}
        closeOnConfirm={false}
      >
        <Text className='min-w-[min(90vw,22rem)]'>
          Archive <strong>{archiveTarget?.label || 'this entry'}</strong>? It stops appearing in
          pickers for new use but is kept (never deleted) so existing references stay valid. There
          is no unarchive action — this cannot be undone from the UI.
        </Text>
      </ConfirmationModal>
    </div>
  );
};

function Table({
  headers,
  rows,
  emptyMessage = 'nothing here yet.',
}: {
  headers: string[];
  rows: { key: string; archived?: boolean; cells: React.ReactNode[] }[];
  emptyMessage?: string;
}) {
  if (!rows.length) {
    return (
      <Text variant='inactive' size='small'>
        {emptyMessage}
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

// Wraps multiple row-level actions (e.g. edit + archive) so they lay out consistently now that a row
// can have more than the single action the table was originally built for.
function RowActions({ children }: { children: React.ReactNode }) {
  return <div className='flex flex-wrap justify-end gap-2'>{children}</div>;
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
