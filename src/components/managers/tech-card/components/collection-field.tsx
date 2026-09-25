import { adminService } from 'api/api';
import { ACCESS, accessSatisfies } from 'components/managers/accounts/utils/hooks';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useId, useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Select from 'ui/components/select';
import Text from 'ui/components/text';
import { FormLabel } from 'ui/form';
import { fieldErrorSummary } from 'utils/field-errors';
import { TechCardFormData } from './schema';

// THE LIST'S VALUES ARE A NAMESPACE OF THEIR OWN (Codex m3). Every collection is `name:<name>`;
// «no collection» and the create door are bare words that no `name:` value can equal — a collection
// really called «__none__» or «new» is just a name here, never «clear» or «open the dialog».
// (Radix forbids an empty-string item value, which is why «no collection» is a word at all.)
const NONE = 'none';
// The last item of the list is a DOOR, not a value: picking it opens the create dialog and writes
// nothing into the form. Never stored — the value handler turns it away before `setValue`.
const NEW = 'new';
const NAME = 'name:';
const nameItem = (name: string) => `${NAME}${name}`;
const nameOfItem = (item: string) => (item.startsWith(NAME) ? item.slice(NAME.length) : '');

// CreateCollection is `dictionaries:write` on the server (rbac.go: `"CreateCollection":
// wr(SectionDictionaries)`, «создание Collection — отдельное право словарей»), and `dictionaries`
// is a section the backend publishes in its catalog — so it is THE key, not `settings` (the key the
// dictionaries PAGE happens to be filed under in the nav: `settings` is storefront configuration,
// and an account holding only that would be offered a create the server refuses).
const DICTIONARIES = 'dictionaries';

// The style's collection, picked from the COLLECTIONS dictionary rather than typed free-hand: a
// hand-typed string that differs from the dictionary entry by a character silently splits the
// collection across the catalogue's filters. `collection` is stored as the NAME (not the id), which
// is what the wire contract and every downstream filter already use.
//
// ONE DOOR TO A NEW COLLECTION (wave 2026-09-25, T06 / D-06): the list's last item
// `+ new collection…` opens a small dialog, CreateCollection runs, the dictionary is re-read and
// the created name is selected on this card. No second button beside the select — the list is the
// one control for «which collection», including «one that does not exist yet». The item is absent
// for an account without `dictionaries:write`, whose create would only be refused.
//
// THE DOOR FAILS CLOSED (Codex M1). `canWrite` opens every section while the account is loading or
// has failed to load, and for a key the catalog does not list — right for the sidebar, wrong for a
// door whose only outcome for the wrong account is a refusal. So the item is offered on a
// DEFINITIVE answer only: a super account, or an explicit write grant on `dictionaries`.
export function CollectionField({ readOnly }: { readOnly?: boolean }) {
  const { setValue } = useFormContext<TechCardFormData>();
  const { dictionary } = useDictionary();
  const { resolved, isSuper, account } = usePermissions();
  const collection = (useWatch({ name: 'collection' }) as string | undefined) ?? '';
  const [creating, setCreating] = useState(false);
  const grant = account?.permissions?.find((p) => p.section === DICTIONARIES)?.access;
  const canCreate = !readOnly && resolved && (isSuper || accessSatisfies(grant, ACCESS.WRITE));

  const items = useMemo(() => {
    const names = (dictionary?.collections ?? [])
      .filter((c) => c.name && !c.archived)
      .map((c) => c.name as string);
    // A card saved against a collection that has since been archived (or that predates the
    // dictionary) keeps its value selectable — otherwise opening the card would silently blank a
    // field the user never touched, and the full-replace save would persist that blank. The same
    // rule carries a JUST-CREATED name through the moment before the dictionary re-read lands.
    if (collection && !names.includes(collection)) names.unshift(collection);
    const out: { value: string; label: string }[] = [
      { value: NONE, label: '— none —' },
      ...names.map((n) => ({ value: nameItem(n), label: n })),
    ];
    if (canCreate) out.push({ value: NEW, label: '+ new collection…' });
    return out;
  }, [dictionary?.collections, collection, canCreate]);

  return (
    // `data-field` — the anchor `revealField('collection')` resolves (a server violation on the
    // collection lands here); `FormItem` stamps it by itself, this cell draws its own wrapper.
    <div className='space-y-px' data-field='collection'>
      <FormLabel>collection</FormLabel>
      <Select
        name='collection'
        items={items}
        value={collection ? nameItem(collection) : NONE}
        readOnly={readOnly}
        onValueChange={(v?: string) => {
          if (v === NEW) {
            // Opened on the next frame: the list is still closing and hands focus back to its
            // trigger; the dialog must take focus AFTER that, not race it.
            window.setTimeout(() => setCreating(true), 0);
            return;
          }
          setValue('collection', nameOfItem(v ?? ''), { shouldDirty: true });
        }}
      />
      {canCreate && (
        <NewCollectionDialog
          open={creating}
          onOpenChange={setCreating}
          onCreated={(name) => setValue('collection', name, { shouldDirty: true })}
        />
      )}
    </div>
  );
}

/**
 * The create dialog: ONE field. The server derives the collection's code from the name
 * (`NormalizeDictSlug`), so there is nothing else to ask. The dictionary write is immediate and
 * shared — it does not wait for the card's save and is not undone by leaving the card — and the
 * dialog says so in one line. A refusal (a duplicate name, a name with no letters) keeps the dialog
 * open with what was typed and names the reason in the snackbar.
 */
function NewCollectionDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (name: string) => void;
}) {
  const { refetch } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const inputId = useId();

  useEffect(() => {
    if (open) setName('');
  }, [open]);

  const trimmed = name.trim();

  const create = async () => {
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const res = await adminService.CreateCollection({ name: trimmed, expectedVersion: 0 });
      const created = res.collection?.name?.trim() || trimmed;
      onCreated(created);
      onOpenChange(false);
      showMessage(`collection ${created} created`, 'success');
      // Re-read so the new name is a dictionary entry, not only the card's own value. The field
      // shows it either way (see `items`), so a slow or failed re-read costs nothing visible.
      void refetch();
    } catch (e) {
      showMessage(fieldErrorSummary(e, 'could not create the collection'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
      onConfirm={create}
      title='new collection'
      confirmLabel={busy ? 'creating…' : 'create'}
      confirmDisabled={!trimmed || busy}
      closeOnConfirm={false}
      width='sm'
    >
      <div className='space-y-2.5' data-new-collection=''>
        <div className='space-y-px'>
          <label htmlFor={inputId} className='flex min-h-[19px] items-center leading-none'>
            <Text size='micro' variant='label' tracking='label' className='leading-none uppercase'>
              name
            </Text>
          </label>
          <Input
            id={inputId}
            name='new-collection-name'
            value={name}
            autoFocus
            autoComplete='off'
            maxLength={255}
            placeholder='SS27 DROP 1'
            disabled={busy}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              // `isComposing`: an IME confirming a word presses Enter too — that is not «create».
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void create();
              }
            }}
          />
        </div>
        <Text size='micro' variant='label'>
          added to the shared collections dictionary right away, not with the card’s save
        </Text>
      </div>
    </ConfirmationModal>
  );
}
