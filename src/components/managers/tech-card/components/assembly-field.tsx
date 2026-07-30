import { StyleAssemblyItem, StyleAssemblyLine, common_TechCardListItem } from 'api/proto-http/admin';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import { useEffect, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import GenericPopover from 'ui/components/popover';
import Select from 'ui/components/select';
import Text from 'ui/components/text';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';
import { decimalToInput, inputToDecimal, parseDecimalNumber, sanitizeDecimal } from 'utils/decimal';
import { ulid } from 'utils/ulid';
import {
  AuxCardMultiPickerModal,
  AuxCardPickerModal,
  Field,
  Thumb,
  auxCardThumbUrl,
  auxSubtypeLabel,
  useAuxTechCards,
} from './labels-pkg-shared';
import { useStyleAssembly, useUpsertStyleAssembly } from './useAssemblyPacking';
import { COMMIT_ORDER, useTechCardStaging } from './useTechCardStaging';

// One bill per style, so one staging key.
const STAGING_KEY = 'assembly';

// Radix Select forbids an empty item value, so "all sizes" rides on the sentinel '0' — which is
// also exactly what the wire means by size_id = 0.
const ALL_SIZES = '0';

type Row = {
  key: string; // client-only stable id (ulid) — add/remove never remaps another row's inputs
  id: number; // server line id; 0 for a new (unsaved) line
  componentTechCardId: number;
  componentName: string; // resolved server-side; refreshed locally on pick, stale until re-save
  componentAuxSubtype: string;
  outputMaterialName: string; // resolved server-side; unknown for a not-yet-saved pick
  sizeId: number; // 0 = all sizes
  sizeName: string; // server-resolved label, kept so an out-of-range size still reads
  qty: string;
  printNote: string;
  positionNote: string;
  active: boolean;
};

const rowFrom = (l: StyleAssemblyLine): Row => ({
  key: ulid(),
  id: l.id ?? 0,
  componentTechCardId: l.componentTechCardId ?? 0,
  componentName: l.componentName ?? '',
  componentAuxSubtype: l.componentAuxSubtype ?? 'TECH_CARD_AUX_SUBTYPE_UNKNOWN',
  outputMaterialName: l.outputMaterialName ?? '',
  sizeId: l.sizeId ?? 0,
  sizeName: l.sizeName ?? '',
  qty: decimalToInput(l.qty),
  printNote: l.printNote ?? '',
  positionNote: l.positionNote ?? '',
  active: l.active ?? true,
});

const newRow = (): Row => ({
  key: ulid(),
  id: 0,
  componentTechCardId: 0,
  componentName: '',
  componentAuxSubtype: 'TECH_CARD_AUX_SUBTYPE_UNKNOWN',
  outputMaterialName: '',
  sizeId: 0,
  sizeName: '',
  qty: '1',
  printNote: '',
  positionNote: '',
  active: true,
});

// A picked aux card -> a new "all sizes" line. Everything else stays at the newRow() default; the
// output material name is unknown until this line is saved and reloaded.
const rowFromCard = (card: common_TechCardListItem): Row => ({
  ...newRow(),
  componentTechCardId: card.id ?? 0,
  componentName: card.name ?? '',
  componentAuxSubtype: card.auxSubtype ?? 'TECH_CARD_AUX_SUBTYPE_UNKNOWN',
});

// What would make this bill unsavable, in the operator's words — or null when it is fine. Computed
// from the rows rather than checked inside the save, because the panel no longer owns a button that
// could report it on click: it is shown next to the staged pill AND thrown from the commit, so the
// header's partial-failure banner names the same problem.
function assemblyProblem(rows: Row[]): string | null {
  for (const r of rows) {
    if (!r.componentTechCardId) return 'Every line needs a component (or remove it)';
    const n = parseDecimalNumber(r.qty);
    if (!r.qty.trim() || !Number.isFinite(n) || n <= 0) return 'Qty must be greater than zero';
  }
  const dupKey = (r: Row) => `${r.componentTechCardId}:${r.sizeId || 0}`;
  if (new Set(rows.map(dupKey)).size !== rows.length)
    return 'The same component/size combination appears twice — merge the lines';
  return null;
}

// One assembly line as a square, photo-forward TILE (mirroring the BOM article tile): the picked
// component's photo over its sub-type + name, with a compact size · qty summary. Editing happens in a
// POPOVER anchored to the tile — so the per-line editor never enlarges the tile or reflows the grid
// (a col-span-full expander used to yank the whole grid around). Fixed-size tiles, stable grid.
function AssemblyTile({
  row,
  sizeOptions,
  onPatch,
  onRemove,
  canEdit,
}: {
  row: Row;
  sizeOptions: { id: number; name: string }[];
  onPatch: (patch: Partial<Row>) => void;
  onRemove: () => void;
  canEdit: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const knownSize = row.sizeId === 0 || sizeOptions.some((o) => o.id === row.sizeId);
  const resolvedSubtype = auxSubtypeLabel(row.componentAuxSubtype);
  const { data: auxData } = useAuxTechCards();
  const selectedCard = useMemo(
    () => (auxData?.techCards ?? []).find((c) => c.id === row.componentTechCardId),
    [auxData, row.componentTechCardId],
  );

  // A line is unsavable with no component or a non-positive qty (mirrors assemblyProblem, per row) —
  // the tile borders red so an invalid line is visible without opening its editor.
  const qtyNum = parseDecimalNumber(row.qty);
  const rowInvalid =
    !row.componentTechCardId || !row.qty.trim() || !Number.isFinite(qtyNum) || qtyNum <= 0;

  const sizeLabel =
    row.sizeId === 0
      ? 'all sizes'
      : sizeOptions.find((o) => o.id === row.sizeId)?.name || row.sizeName || `#${row.sizeId}`;

  const sizeItems = useMemo(() => {
    const items = [
      { value: ALL_SIZES, label: 'all sizes' },
      ...sizeOptions.map((o) => ({ value: String(o.id), label: o.name })),
    ];
    // An out-of-range size (the card's size run changed after this line was saved) still has to
    // read as itself rather than silently snapping back to "all sizes".
    if (!knownSize)
      items.push({ value: String(row.sizeId), label: row.sizeName || `#${row.sizeId}` });
    return items;
  }, [sizeOptions, knownSize, row.sizeId, row.sizeName]);

  // The fixed-size tile face — the popover TRIGGER. Not a <button> (GenericPopover already renders a
  // Popover.Trigger button; a button-in-button would be invalid), so the whole face opens the editor.
  const face = (
    <div className='flex w-full flex-col gap-1 p-1.5 text-left'>
      <Thumb
        url={auxCardThumbUrl(selectedCard)}
        alt={row.componentName || 'aux card'}
        className='aspect-square w-full'
        placeholder='no image'
      />
      <div className='flex flex-wrap items-center gap-1'>
        {resolvedSubtype ? <Pill tone='mut'>{resolvedSubtype}</Pill> : null}
        {!row.active && <Pill tone='mut'>inactive</Pill>}
      </div>
      <Text component='span' className='min-w-0 truncate font-bold uppercase'>
        {row.componentName || `#${row.componentTechCardId}`}
      </Text>
      {row.outputMaterialName ? (
        <Text component='span' variant='label' size='micro' className='min-w-0 truncate'>
          → {row.outputMaterialName}
        </Text>
      ) : null}
      <div className='mt-0.5 flex min-w-0 items-center gap-1'>
        <Text component='span' variant='label' size='micro' className='min-w-0 flex-1 truncate'>
          {sizeLabel} · ×{row.qty.trim() || '—'}
        </Text>
        {canEdit && (
          <Text component='span' variant='inactive' className='ml-auto shrink-0'>
            {editOpen ? '▴' : '✎'}
          </Text>
        )}
      </div>
    </div>
  );

  // The per-line editor, stacked to fit a ~280px popover (no wide four-column grid).
  const editor = (
    <div className='flex flex-col gap-2'>
      <Field label='size'>
        <Select
          name={`assembly-size-${row.key}`}
          placeholder='all sizes'
          items={sizeItems}
          fullWidth
          readOnly={!canEdit}
          value={String(row.sizeId || 0)}
          onValueChange={(v: string) => onPatch({ sizeId: Number(v) || 0 })}
        />
      </Field>
      <Field label='qty'>
        <Input
          name={`assembly-qty-${row.key}`}
          inputMode='decimal'
          value={row.qty}
          disabled={!canEdit}
          className='text-right'
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onPatch({ qty: sanitizeDecimal(e.target.value) })
          }
        />
      </Field>
      <Field label='print note'>
        <Input
          name={`assembly-print-${row.key}`}
          value={row.printNote}
          disabled={!canEdit}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onPatch({ printNote: e.target.value })}
        />
      </Field>
      <Field label='position note'>
        <Input
          name={`assembly-position-${row.key}`}
          value={row.positionNote}
          disabled={!canEdit}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onPatch({ positionNote: e.target.value })
          }
        />
      </Field>
      <div className='flex flex-wrap items-center gap-2'>
        <label className='flex items-center gap-1.5'>
          <input
            type='checkbox'
            checked={row.active}
            disabled={!canEdit}
            onChange={(e) => onPatch({ active: e.target.checked })}
          />
          <Text size='micro' variant='label' component='span' className='uppercase'>
            active
          </Text>
        </label>
        {canEdit && (
          <Button
            type='button'
            variant='secondary'
            size='xs'
            className='ml-auto'
            onClick={() => {
              setEditOpen(false);
              setPickerOpen(true);
            }}
          >
            change
          </Button>
        )}
      </div>
    </div>
  );

  return (
    // relative so the remove ✕ sits at the top-right OUTSIDE the popover trigger.
    <div className={cn('relative border bg-bgColor', rowInvalid ? 'border-error' : 'border-borderColor')}>
      {canEdit && (
        <Button
          type='button'
          size='xs'
          variant='secondary'
          aria-label='remove assembly line'
          onClick={onRemove}
          className='absolute right-1 top-1 z-10'
        >
          ✕
        </Button>
      )}

      {canEdit ? (
        <GenericPopover
          open={editOpen}
          onOpenChange={setEditOpen}
          title='assembly line'
          className='w-[280px]'
          triggerProps={{ 'aria-label': 'edit assembly line', className: 'block w-full text-left' }}
          openElement={face}
        >
          {editor}
        </GenericPopover>
      ) : (
        face
      )}

      {/* Mounted only while open. Single-select — swapping the component of ONE line, not adding more. */}
      {canEdit && pickerOpen && (
        <AuxCardPickerModal
          open
          onOpenChange={setPickerOpen}
          selectedId={row.componentTechCardId}
          title='change the on-garment auxiliary item'
          hint='labels, tags and any other auxiliary card that ships attached to the garment'
          onPick={(card) => {
            onPatch({
              componentTechCardId: card.id ?? 0,
              componentName: card.name ?? '',
              componentAuxSubtype: card.auxSubtype ?? 'TECH_CARD_AUX_SUBTYPE_UNKNOWN',
              outputMaterialName: '', // unknown until saved + reloaded
            });
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

// Style assembly bill (WS7, §2.8): the auxiliary items (labels/tags) attached on/into the garment
// — which aux card, on which size (or all), how many, plus print/position notes for the maker.
// UpsertStyleAssembly is a full replace, so the editor holds the whole bill in local state and
// submits every line at once — not per-keystroke. Phase 19: that submit is STAGED into the card's
// one save instead of firing from a button of its own, so editing the bill and pressing the header
// Save no longer drops it.
export function AssemblyField({
  styleId,
  sizeIds,
  canEdit,
}: {
  styleId: number;
  sizeIds: number[];
  canEdit: boolean;
}) {
  const { data, isLoading, isError, refetch } = useStyleAssembly(styleId);
  const upsert = useUpsertStyleAssembly();
  const { dictionary } = useDictionary();
  const staging = useTechCardStaging();

  const sizeById = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of dictionary?.sizes ?? []) if (s.id != null) m.set(s.id, s.name ?? `#${s.id}`);
    return m;
  }, [dictionary?.sizes]);
  const sizeOptions = useMemo(
    () => sizeIds.map((id) => ({ id, name: formatSizeName(sizeById.get(id) ?? `#${id}`) })),
    [sizeIds, sizeById],
  );

  const [rows, setRows] = useState<Row[]>([]);
  // A background refetch (e.g. right after save) must not clobber unsaved edits mid-flow.
  const [dirty, setDirty] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => {
    if (dirty) return;
    setRows((data?.items ?? []).map(rowFrom));
  }, [data, dirty]);

  const patch = (i: number, p: Partial<Row>) => {
    setDirty(true);
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  };
  // The multi-pick lands one "all sizes" line per chosen card that isn't already on the bill at that
  // size — the same (component, size 0) key newRow() creates, so re-picking a card the bill already
  // carries at all-sizes is a no-op rather than a duplicate the commit would reject.
  const addCards = (cards: common_TechCardListItem[]) => {
    setDirty(true);
    setRows((prev) => {
      const existing = new Set(
        prev.filter((r) => r.sizeId === 0).map((r) => r.componentTechCardId),
      );
      const additions: Row[] = [];
      for (const c of cards) {
        const id = c.id ?? 0;
        if (id <= 0 || existing.has(id)) continue;
        existing.add(id);
        additions.push(rowFromCard(c));
      }
      return additions.length ? [...prev, ...additions] : prev;
    });
  };
  const removeRow = (i: number) => {
    setDirty(true);
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  };

  // What the multi-picker greys out: the components already on the bill at all-sizes, i.e. exactly
  // the ones addCards would skip. A component used only at a specific size stays pickable (adding it
  // at all-sizes is a distinct line).
  const alreadyAddedIds = useMemo(
    () =>
      rows.filter((r) => r.sizeId === 0 && r.componentTechCardId > 0).map((r) => r.componentTechCardId),
    [rows],
  );

  const problem = assemblyProblem(rows);

  // The panel's mutation, unwrapped: it THROWS on failure instead of toasting, because the header's
  // one save is what reports the outcome now — it needs the rejection to name this panel in a
  // partial-failure banner and keep everything after it staged (19.3). A bill that would be rejected
  // fails the same way, before the request goes out.
  const commitAssembly = async () => {
    if (problem) throw new Error(problem);
    const items: StyleAssemblyItem[] = rows.map((r) => ({
      componentTechCardId: r.componentTechCardId,
      sizeId: r.sizeId || 0,
      qty: inputToDecimal(r.qty),
      printNote: r.printNote,
      positionNote: r.positionNote,
      active: r.active,
    }));
    await upsert.mutateAsync({ styleId, items });
  };

  // Hand the mutation to the card's one save. Re-staged on EVERY edit because `commit` closes over
  // this render's rows — a stale closure would write the bill as it stood one keystroke ago.
  // Unstaged the moment the bill is pristine again, so the header count never claims work that is
  // not there. A card with no id yet never stages: its lines have nothing to hang off (the parent
  // shows the "save this card first" prompt instead).
  useEffect(() => {
    if (!staging || !styleId || !canEdit) return;
    if (!dirty) {
      staging.unstage(STAGING_KEY);
      return;
    }
    staging.stage({
      key: STAGING_KEY,
      // UpsertStyleAssembly full-replaces, so the count of lines going over the wire IS what this
      // change does — including the honest "cleared" when every line was removed.
      label:
        rows.length === 0
          ? 'assembly bill — cleared'
          : `assembly bill — ${rows.length} ${rows.length === 1 ? 'line' : 'lines'}`,
      order: COMMIT_ORDER.assembly,
      commit: commitAssembly,
      // Dropping dirty re-arms the load effect, so the committed bill reloads from the server (with
      // the line ids and resolved output-material names the local rows cannot know).
      settle: () => setDirty(false),
    });
    // commitAssembly is redefined every render by design (it reads current rows); depending on it
    // here would restage twice per keystroke for no gain, so the state it reads is the dep list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staging, styleId, canEdit, dirty, rows]);

  if (!styleId) {
    return (
      <Text size='micro' variant='label'>
        save this tech card first, then you can define its assembly bill
      </Text>
    );
  }

  return (
    <div className='flex flex-col gap-2'>
      <Toolbar>
        <Text size='micro' variant='label' component='span'>
          auxiliary items attached on or into the garment — per size, or all sizes
        </Text>
        <ToolbarSpacer />
        {canEdit && (
          <Button type='button' variant='main' size='sm' onClick={() => setPickerOpen(true)}>
            + pick items
          </Button>
        )}
      </Toolbar>

      {isLoading ? (
        <Text size='micro' variant='label'>
          loading…
        </Text>
      ) : isError ? (
        <CalloutBox tone='error'>
          <div className='flex flex-wrap items-center gap-2'>
            <Text size='micro' component='span'>
              <b>failed to load the assembly bill</b>
            </Text>
            <Button type='button' variant='secondary' size='xs' onClick={() => refetch()}>
              retry
            </Button>
          </div>
        </CalloutBox>
      ) : rows.length === 0 ? (
        <Text size='micro' variant='label'>
          no assembly lines yet
          {canEdit ? ' — pick the auxiliary items that ship on this garment' : ''}
        </Text>
      ) : (
        <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4'>
          {rows.map((row, i) => (
            <AssemblyTile
              key={row.key}
              row={row}
              sizeOptions={sizeOptions}
              canEdit={canEdit}
              onPatch={(p) => patch(i, p)}
              onRemove={() => removeRow(i)}
            />
          ))}
        </div>
      )}

      {canEdit && dirty && (
        <div className='flex flex-wrap items-center gap-2'>
          <Pill tone='attention'>{upsert.isPending ? 'saving…' : 'staged for save'}</Pill>
          {/* Named here as well as thrown from the commit: the save button that used to report it
              on click is gone, and finding out at save time only would be a worse trade. */}
          {problem && (
            <Text size='micro' variant='error' component='span'>
              {problem}
            </Text>
          )}
          <Text size='micro' variant='label' component='span' className='ml-auto'>
            included in the card’s Save
          </Text>
        </div>
      )}

      {/* Mounted only while open. Multi-select — several aux cards land on the bill in one pass. */}
      {canEdit && pickerOpen && (
        <AuxCardMultiPickerModal
          open
          onOpenChange={setPickerOpen}
          alreadyAddedIds={alreadyAddedIds}
          title='pick the on-garment auxiliary items'
          hint='labels, tags and any other auxiliary card that ships attached to the garment'
          onPick={(cards) => {
            addCards(cards);
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}
