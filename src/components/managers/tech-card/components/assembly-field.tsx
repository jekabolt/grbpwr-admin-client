import { StyleAssemblyItem, StyleAssemblyLine } from 'api/proto-http/admin';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { decimalToInput, inputToDecimal, parseDecimalNumber, sanitizeDecimal } from 'utils/decimal';
import { ulid } from 'utils/ulid';
import {
  AuxCardTilePicker,
  Thumb,
  auxCardThumbUrl,
  auxSubtypeLabel,
  useAuxTechCards,
} from './labels-pkg-shared';
import { useStyleAssembly, useUpsertStyleAssembly } from './useAssemblyPacking';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';

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

  return (
    <div className='space-y-3 border border-textInactiveColor p-3'>
      <div className='flex items-center justify-between'>
        <Text variant='uppercase' size='small'>
          line {index + 1}
        </Text>
        {canEdit && (
          <Button
            type='button'
            variant='secondary'
            aria-label='remove assembly line'
            onClick={onRemove}
          >
            ✕
          </Button>
        )}
      </div>

      {/* component (aux card) — a scannable square-card pick (#70), thumbnail + name + sub-type,
          instead of the old search-box + native <select>. */}
      <div className='space-y-2'>
        <Text size='small' variant='label'>
          component (auxiliary card)
        </Text>
        {row.componentTechCardId > 0 ? (
          <div className='flex items-center gap-3 border border-textInactiveColor p-2'>
            <Thumb
              url={auxCardThumbUrl(selectedCard)}
              alt={row.componentName || 'aux card'}
              className='h-16 w-16'
              placeholder='no image'
            />
            <div className='min-w-0 flex-1 space-y-0.5'>
              <Text size='small' className='truncate'>
                {row.componentName || `#${row.componentTechCardId}`}
              </Text>
              {resolvedSubtype ? (
                <span className='inline-block border border-textInactiveColor px-1 text-textBaseSize uppercase leading-tight text-labelColor'>
                  {resolvedSubtype}
                </span>
              ) : null}
              {row.outputMaterialName ? (
                <Text variant='inactive' size='small' className='truncate'>
                  → {row.outputMaterialName}
                </Text>
              ) : null}
            </div>
            {canEdit && (
              <Button type='button' variant='secondary' onClick={() => setPickerOpen((o) => !o)}>
                {pickerOpen ? 'close' : 'change'}
              </Button>
            )}
          </div>
        ) : canEdit ? (
          <Button
            type='button'
            variant='secondary'
            size='lg'
            className='w-full uppercase'
            onClick={() => setPickerOpen(true)}
          >
            + pick component
          </Button>
        ) : (
          <Text variant='inactive' size='small'>
            —
          </Text>
        )}
        {pickerOpen && canEdit && (
          <AuxCardTilePicker
            selectedId={row.componentTechCardId}
            title='pick the on-garment auxiliary item'
            onCancel={() => setPickerOpen(false)}
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

      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
        <div className='space-y-1'>
          <Text size='small' variant='label'>
            size
          </Text>
          <select
            className={cell}
            value={row.sizeId || 0}
            disabled={!canEdit}
            onChange={(e) => onPatch({ sizeId: Number(e.target.value) || 0 })}
          >
            <option value={0}>all sizes</option>
            {sizeOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
            {!knownSize && <option value={row.sizeId}>{row.sizeName || `#${row.sizeId}`}</option>}
          </select>
        </div>

        <div className='space-y-1'>
          <Text size='small' variant='label'>
            qty
          </Text>
          <input
            className={cell}
            inputMode='decimal'
            value={row.qty}
            disabled={!canEdit}
            onChange={(e) => onPatch({ qty: sanitizeDecimal(e.target.value) })}
          />
        </div>
      </div>

      <div className='grid grid-cols-1 gap-3 lg:grid-cols-2'>
        <div className='space-y-1'>
          <Text size='small' variant='label'>
            print note
          </Text>
          <input
            className={cell}
            value={row.printNote}
            disabled={!canEdit}
            onChange={(e) => onPatch({ printNote: e.target.value })}
          />
        </div>
        <div className='space-y-1'>
          <Text size='small' variant='label'>
            position note
          </Text>
          <input
            className={cell}
            value={row.positionNote}
            disabled={!canEdit}
            onChange={(e) => onPatch({ positionNote: e.target.value })}
          />
        </div>
      </div>

      <label className='flex items-center gap-2'>
        <input
          type='checkbox'
          checked={row.active}
          disabled={!canEdit}
          onChange={(e) => onPatch({ active: e.target.checked })}
        />
        <Text size='small'>active</Text>
      </label>
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
      <Text variant='inactive' size='small'>
        save this tech card first, then you can define its assembly bill
      </Text>
    );
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Text variant='inactive' size='small'>
          auxiliary items (labels/tags) attached on or into the garment — per size, or all sizes.
          {dirty ? <span className='ml-2 text-labelColor'>· unsaved</span> : null}
        </Text>
        {canEdit && (
          <div className='flex items-center gap-2'>
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className='uppercase'
              onClick={addRow}
            >
              + line
            </Button>
            {/* Distinct from the main card's header Save (variant='main') — this button persists
                to UpsertStyleAssembly, a separate RPC the header Save does NOT cover. secondary +
                an explicit label (mirrors style-facts-field.tsx's own sub-panel save) so it's
                never mistaken for "save the whole tech card". */}
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className='uppercase'
              disabled={upsert.isPending || !dirty}
              onClick={save}
            >
              {upsert.isPending ? 'saving…' : 'save assembly bill'}
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <Text variant='inactive' size='small'>
          loading…
        </Text>
      ) : isError ? (
        <div className='flex items-center gap-3'>
          <Text variant='error' size='small'>
            failed to load assembly bill
          </Text>
          <button
            type='button'
            className='text-textBaseSize uppercase underline'
            onClick={() => refetch()}
          >
            retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <Text variant='inactive' size='small'>
          no assembly lines yet{canEdit ? ' — add one to define what ships on this garment' : ''}
        </Text>
      ) : (
        <div className='space-y-3'>
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
