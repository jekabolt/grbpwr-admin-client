import {
  common_AdminColorwayRef,
  common_TechCard,
  common_TechCardColorwayUsage,
} from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { decimalToInput, inputToDecimal, sanitizeDecimal } from 'utils/decimal';
import { recipeSaveErrorMessage, useUpdateColorwayRecipe } from './useColorwayRecipe';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize';

type BomLine = { id?: number; lineKey?: string; name?: string; section?: string };

type UsageDraft = {
  bomLineKey: string;
  placement: string;
  color: string;
  pantone: string;
  consumption: string;
  quantity: string;
  // preserved verbatim across the full-replace so a save never drops per-size grading / piece links.
  sizeConsumptions: { sizeId?: number; consumption?: string }[];
  pieceLineKey: string;
  // display-only (server-computed, stripped without costing:read).
  lineTotal: string;
  sizeRunTotal: string;
};

// Resolve a stored usage into a draft. bom_line_key is the durable ref; fall back to resolving the
// server bom_item_id against the saved BOM lines so a legacy usage still points at the right line.
function fromRead(u: common_TechCardColorwayUsage, bomItems: BomLine[]): UsageDraft {
  const byId = u.bomItemId ? bomItems.find((b) => b.id === u.bomItemId)?.lineKey : undefined;
  return {
    bomLineKey: u.bomLineKey || byId || '',
    placement: u.placement || '',
    color: u.color || '',
    pantone: u.pantone || '',
    consumption: decimalToInput(u.consumption),
    quantity: decimalToInput(u.quantity),
    sizeConsumptions: (u.sizeConsumptions ?? []).map((s) => ({
      sizeId: s.sizeId,
      consumption: decimalToInput(s.consumption),
    })),
    pieceLineKey: u.pieceLineKey || '',
    lineTotal: decimalToInput(u.lineTotal),
    sizeRunTotal: decimalToInput(u.sizeRunTotal),
  };
}

function toWire(d: UsageDraft): common_TechCardColorwayUsage {
  return {
    // durable ref (§2.3); the server resolves it to the real FK — positional index/id not sent.
    bomLineKey: d.bomLineKey || '',
    bomItemIndex: undefined,
    bomItemId: undefined,
    placement: d.placement.trim(),
    color: d.color.trim(),
    pantone: d.pantone.trim(),
    consumption: inputToDecimal(d.consumption),
    quantity: inputToDecimal(d.quantity),
    sizeConsumptions: (d.sizeConsumptions ?? [])
      .filter((s) => s.sizeId)
      .map((s) => ({ sizeId: s.sizeId, consumption: inputToDecimal(s.consumption) })),
    pieceLineKey: d.pieceLineKey || '',
    pieceId: undefined,
    pieceIndex: undefined,
    // output-only — never sent
    lineTotal: undefined,
    sizeRunTotal: undefined,
  };
}

function ColorwayRecipeEditor({
  colorway,
  bomItems,
  lockVersion,
  techCardId,
  canEdit,
}: {
  colorway: common_AdminColorwayRef;
  bomItems: BomLine[];
  lockVersion: number;
  techCardId: number;
  canEdit: boolean;
}) {
  const { showMessage } = useSnackBarStore();
  const save = useUpdateColorwayRecipe(techCardId);
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  // CRITICAL (full-replace): initialise from the LIVE read (colorway.usages), never from empty. Re-sync
  // when the read changes (after a save's refetch) unless the user has unsaved edits.
  const [usages, setUsages] = useState<UsageDraft[]>(() =>
    (colorway.usages ?? []).map((u) => fromRead(u, bomItems)),
  );
  useEffect(() => {
    if (dirty) return;
    setUsages((colorway.usages ?? []).map((u) => fromRead(u, bomItems)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorway.usages, dirty]);

  const setRow = (i: number, patch: Partial<UsageDraft>) => {
    setDirty(true);
    setUsages((prev) => prev.map((u, idx) => (idx === i ? { ...u, ...patch } : u)));
  };
  const addRow = () => {
    setDirty(true);
    setUsages((prev) => [
      ...prev,
      {
        bomLineKey: '',
        placement: '',
        color: '',
        pantone: '',
        consumption: '',
        quantity: '',
        sizeConsumptions: [],
        pieceLineKey: '',
        lineTotal: '',
        sizeRunTotal: '',
      },
    ]);
  };
  const removeRow = (i: number) => {
    setDirty(true);
    setUsages((prev) => prev.filter((_, idx) => idx !== i));
  };

  const submit = () => {
    save.mutate(
      {
        colorwayId: colorway.colorwayId ?? 0,
        expectedColorwayVersion: lockVersion,
        usages: usages.filter((u) => u.bomLineKey).map(toWire),
      },
      {
        onSuccess: () => {
          setDirty(false);
          showMessage('Recipe saved', 'success');
        },
        onError: (e) => showMessage(recipeSaveErrorMessage(e), 'error'),
      },
    );
  };

  const title = `${colorway.colorCode?.trim() || colorway.baseSku?.trim() || `#${colorway.colorwayId}`}`;

  return (
    <div className='border border-textInactiveColor'>
      <button
        type='button'
        className='flex w-full items-center justify-between gap-2 p-3 text-left'
        onClick={() => setOpen((o) => !o)}
      >
        <Text variant='uppercase' size='small'>
          {open ? '▾' : '▸'} {title}
          {colorway.baseSku ? ` · ${colorway.baseSku}` : ''}
        </Text>
        <Text variant='inactive' size='small'>
          {usages.length} material{usages.length === 1 ? '' : 's'}
          {dirty ? ' · unsaved' : ''}
        </Text>
      </button>

      {open && (
        <div className='flex flex-col gap-3 border-t border-textInactiveColor p-3'>
          {usages.length === 0 ? (
            <Text variant='inactive' size='small'>
              no materials in this colourway’s recipe yet
            </Text>
          ) : (
            usages.map((u, i) => (
              <div key={i} className='flex flex-col gap-2 border border-textInactiveColor p-2'>
                <div className='flex items-center justify-between'>
                  <Text variant='uppercase' size='small'>
                    material {i + 1}
                  </Text>
                  {canEdit && (
                    <Button
                      type='button'
                      variant='secondary'
                      aria-label='remove material'
                      onClick={() => removeRow(i)}
                    >
                      ✕
                    </Button>
                  )}
                </div>
                <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
                  <label className='flex flex-col gap-1'>
                    <Text size='small'>BOM article</Text>
                    <select
                      className={cell}
                      disabled={!canEdit}
                      value={u.bomLineKey}
                      onChange={(e) => setRow(i, { bomLineKey: e.target.value })}
                    >
                      <option value=''>— select article —</option>
                      {/* keep an unknown stored key selectable so a save never silently drops it */}
                      {u.bomLineKey && !bomItems.some((b) => b.lineKey === u.bomLineKey) ? (
                        <option value={u.bomLineKey}>(unknown / removed article)</option>
                      ) : null}
                      {bomItems.map((b, bi) => (
                        <option key={b.lineKey} value={b.lineKey}>
                          {bi + 1}. {b.name?.trim() || 'unnamed'}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className='flex flex-col gap-1'>
                    <Text size='small'>placement (part)</Text>
                    <input
                      className={cell}
                      disabled={!canEdit}
                      placeholder='outer / lining / collar…'
                      value={u.placement}
                      onChange={(e) => setRow(i, { placement: e.target.value })}
                    />
                  </label>
                </div>
                <div className='grid grid-cols-1 gap-2 sm:grid-cols-4'>
                  <label className='flex flex-col gap-1'>
                    <Text size='small'>colour (here)</Text>
                    <input
                      className={cell}
                      disabled={!canEdit}
                      value={u.color}
                      onChange={(e) => setRow(i, { color: e.target.value })}
                    />
                  </label>
                  <label className='flex flex-col gap-1'>
                    <Text size='small'>pantone</Text>
                    <input
                      className={cell}
                      disabled={!canEdit}
                      value={u.pantone}
                      onChange={(e) => setRow(i, { pantone: e.target.value })}
                    />
                  </label>
                  <label className='flex flex-col gap-1'>
                    <Text size='small'>consumption</Text>
                    <input
                      className={cell}
                      inputMode='decimal'
                      disabled={!canEdit}
                      value={u.consumption}
                      onChange={(e) => setRow(i, { consumption: sanitizeDecimal(e.target.value) })}
                    />
                  </label>
                  <label className='flex flex-col gap-1'>
                    <Text size='small'>quantity</Text>
                    <input
                      className={cell}
                      inputMode='decimal'
                      disabled={!canEdit}
                      value={u.quantity}
                      onChange={(e) => setRow(i, { quantity: sanitizeDecimal(e.target.value) })}
                    />
                  </label>
                </div>
                {/* server-computed spend — present only with costing:read (stripped otherwise) */}
                {(u.lineTotal || u.sizeRunTotal || u.sizeConsumptions.length > 0) && (
                  <Text variant='inactive' size='small'>
                    {u.sizeConsumptions.length > 0 ? `per-size grading kept · ` : ''}
                    {u.lineTotal ? `per garment ${u.lineTotal}` : ''}
                    {u.lineTotal && u.sizeRunTotal ? ' · ' : ''}
                    {u.sizeRunTotal ? `run ${u.sizeRunTotal}` : ''}
                  </Text>
                )}
              </div>
            ))
          )}

          {canEdit && (
            <div className='flex items-center justify-between'>
              <Button
                type='button'
                variant='secondary'
                className='uppercase'
                disabled={bomItems.length === 0}
                onClick={addRow}
              >
                + material
              </Button>
              <Button
                type='button'
                variant='main'
                size='lg'
                className='uppercase'
                disabled={save.isPending || !dirty}
                loading={save.isPending}
                onClick={submit}
              >
                save recipe
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Colourway recipes (H1/§2.3): the constructor view of each colourway's material recipe, now that the
// read-path surfaces usages. Edited per colourway and saved via UpdateColorwayRecipe (full-replace).
export function ColorwayRecipes({
  techCard,
  techCardId,
  canEdit,
}: {
  techCard?: common_TechCard;
  techCardId: number;
  canEdit: boolean;
}) {
  const colorways = techCard?.colorways ?? [];
  const bomItems = (techCard?.techCard?.bomItems ?? []).filter((b) => !!b.lineKey);
  const lockVersion = techCard?.lockVersion ?? 0;

  if (colorways.length === 0) {
    return (
      <Text variant='inactive' size='small'>
        no colourways yet — a colourway is a product; create it in the product manager, then its
        material recipe is edited here.
      </Text>
    );
  }

  return (
    <div className='flex flex-col gap-3'>
      <Text variant='inactive' size='small'>
        Which catalog article goes on which part, in what colour and at what consumption — per
        colourway. Saved independently (does not ride the tech-card save).
      </Text>
      {colorways.map((cw) => (
        <ColorwayRecipeEditor
          key={cw.colorwayId}
          colorway={cw}
          bomItems={bomItems}
          lockVersion={lockVersion}
          techCardId={techCardId}
          canEdit={canEdit}
        />
      ))}
    </div>
  );
}
