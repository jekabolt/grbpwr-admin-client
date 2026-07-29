import { StyleAssemblyItem, StyleAssemblyLine } from 'api/proto-http/admin';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import Select from 'ui/components/select';
import Text from 'ui/components/text';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';
import { decimalToInput, inputToDecimal, parseDecimalNumber, sanitizeDecimal } from 'utils/decimal';
import { ulid } from 'utils/ulid';
import {
  AuxCardPickerModal,
  Field,
  Thumb,
  auxCardThumbUrl,
  auxSubtypeLabel,
  useAuxTechCards,
} from './labels-pkg-shared';
import { useStyleAssembly, useUpsertStyleAssembly } from './useAssemblyPacking';

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

// One assembly line as a card: the picked component reads as a 28px thumbnail + name + sub-type +
// "→ output material", then the four things that vary per line (size, qty, print note, position
// note) sit side by side, then active + remove.
function AssemblyRow({
  row,
  index,
  sizeOptions,
  onPatch,
  onRemove,
  canEdit,
}: {
  row: Row;
  index: number;
  sizeOptions: { id: number; name: string }[];
  onPatch: (patch: Partial<Row>) => void;
  onRemove: () => void;
  canEdit: boolean;
}) {
  const knownSize = row.sizeId === 0 || sizeOptions.some((o) => o.id === row.sizeId);
  const resolvedSubtype = auxSubtypeLabel(row.componentAuxSubtype);
  const { data: auxData } = useAuxTechCards();
  const selectedCard = useMemo(
    () => (auxData?.techCards ?? []).find((c) => c.id === row.componentTechCardId),
    [auxData, row.componentTechCardId],
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const picked = row.componentTechCardId > 0;

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

  return (
    <div className='border border-borderColor p-2'>
      <div className='flex items-center gap-2'>
        <Thumb
          url={auxCardThumbUrl(selectedCard)}
          alt={row.componentName || 'aux card'}
          className='size-7'
          placeholder='—'
        />
        <div className='min-w-0 flex-1'>
          {picked ? (
            <>
              <Text size='control' component='span' className='block truncate font-bold uppercase'>
                {row.componentName || `#${row.componentTechCardId}`}
              </Text>
              <Text size='micro' variant='label' className='truncate'>
                {[resolvedSubtype, row.outputMaterialName ? `→ ${row.outputMaterialName}` : '']
                  .filter(Boolean)
                  .join(' · ') || 'output material resolves on save'}
              </Text>
            </>
          ) : (
            <Text size='micro' variant='label'>
              line {index + 1} — no component picked
            </Text>
          )}
        </div>
        {!row.active && <Pill tone='mut'>inactive</Pill>}
        {canEdit && (
          <Button type='button' variant='secondary' size='xs' onClick={() => setPickerOpen(true)}>
            {picked ? 'change' : '+ pick component'}
          </Button>
        )}
        {canEdit && (
          <Button
            type='button'
            variant='secondary'
            size='xs'
            aria-label='remove assembly line'
            onClick={onRemove}
          >
            ✕
          </Button>
        )}
      </div>

      <div className='mt-1.5 grid grid-cols-2 gap-2 lg:grid-cols-4'>
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
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onPatch({ printNote: e.target.value })
            }
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
      </div>

      <label className='mt-1.5 flex items-center gap-1.5'>
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

      {/* Mounted only while open: one dialog per line would otherwise sit in the tree of every
          row at once. */}
      {canEdit && pickerOpen && (
        <AuxCardPickerModal
          open
          onOpenChange={setPickerOpen}
          selectedId={row.componentTechCardId}
          title='pick the on-garment auxiliary item'
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
// submits every line at once on Save — not per-keystroke.
export function AssemblyField({
  styleId,
  sizeIds,
  canEdit,
}: {
  styleId: number;
  sizeIds: number[];
  canEdit: boolean;
}) {
  const { showMessage } = useSnackBarStore();
  const { data, isLoading, isError, refetch } = useStyleAssembly(styleId);
  const upsert = useUpsertStyleAssembly();
  const { dictionary } = useDictionary();

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
  useEffect(() => {
    if (dirty) return;
    setRows((data?.items ?? []).map(rowFrom));
  }, [data, dirty]);

  const patch = (i: number, p: Partial<Row>) => {
    setDirty(true);
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  };
  const addRow = () => {
    setDirty(true);
    setRows((prev) => [...prev, newRow()]);
  };
  const removeRow = (i: number) => {
    setDirty(true);
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  };

  const save = async () => {
    for (const r of rows) {
      if (!r.componentTechCardId) {
        showMessage('Every line needs a component (or remove it)', 'error');
        return;
      }
      const n = parseDecimalNumber(r.qty);
      if (!r.qty.trim() || !Number.isFinite(n) || n <= 0) {
        showMessage('Qty must be greater than zero', 'error');
        return;
      }
    }
    const dupKey = (r: Row) => `${r.componentTechCardId}:${r.sizeId || 0}`;
    if (new Set(rows.map(dupKey)).size !== rows.length) {
      showMessage('The same component/size combination appears twice — merge the lines', 'error');
      return;
    }
    const items: StyleAssemblyItem[] = rows.map((r) => ({
      componentTechCardId: r.componentTechCardId,
      sizeId: r.sizeId || 0,
      qty: inputToDecimal(r.qty),
      printNote: r.printNote,
      positionNote: r.positionNote,
      active: r.active,
    }));
    try {
      await upsert.mutateAsync({ styleId, items });
      setDirty(false);
      showMessage('Assembly bill saved', 'success');
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Failed to save assembly bill', 'error');
    }
  };

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
        {dirty && <Pill tone='attention'>unsaved</Pill>}
        <ToolbarSpacer />
        {canEdit && (
          <>
            <Button type='button' variant='secondary' size='sm' onClick={addRow}>
              + line
            </Button>
            {/* Distinct from the main card's header Save — this button persists to
                UpsertStyleAssembly, a separate RPC the header Save does NOT cover. */}
            <Button
              type='button'
              variant='main'
              size='sm'
              disabled={upsert.isPending || !dirty}
              onClick={save}
            >
              {upsert.isPending ? 'saving…' : 'save assembly bill'}
            </Button>
          </>
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
          no assembly lines yet{canEdit ? ' — add one to define what ships on this garment' : ''}
        </Text>
      ) : (
        <div className='flex flex-col gap-1.5'>
          {rows.map((row, i) => (
            <AssemblyRow
              key={row.key}
              row={row}
              index={i}
              sizeOptions={sizeOptions}
              canEdit={canEdit}
              onPatch={(p) => patch(i, p)}
              onRemove={() => removeRow(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
