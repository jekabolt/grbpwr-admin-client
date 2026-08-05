import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_Material, common_TechCardOutputVariant } from 'api/proto-http/admin';
import { MaterialPickerDialog } from 'components/managers/materials/components/material-picker';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { techCardErrorMessage } from 'components/managers/tech-cards/components/utils';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useEffect, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';

// 0252 — colour variants of an AUXILIARY card's warehouse output. An aux card sewn in several
// colours (a кофр in black and in bone) needs one stock bucket PER COLOUR — its own on-hand, its own
// moving average — instead of the single tech_card.output_material_id.
//
// Everything here is an IMMEDIATE write through its own RPC, deliberately outside the card's form
// and its Save: a variant owns warehouse stock, and the card save is a full replace, so letting the
// form carry these rows would make a stale tab able to re-mint or drop a bucket that holds goods.
// That is the same reasoning that keeps the colourway recipes and the assembly bill on their own
// RPCs — but here the stakes are stock, not spec, so it is not even negotiable.
//
// ZERO variants is legacy single-output mode and behaves exactly as it always did; the first variant
// switches the card over, and deleting the last one switches it back.

// The field-level metrics used by the locally-managed controls in this panel — identical to <Input>,
// so a control here is indistinguishable from an RHF-bound one elsewhere (see colorway-recipe).
const cell =
  'block min-h-[22px] w-full appearance-none border border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize focus:border-textColor focus:outline-none disabled:bg-bgZebra disabled:text-labelColor';

// A pale dye vanishes into the page without the outline, so the swatch keeps its 1px ink box.
function Swatch({ hex, title }: { hex?: string; title?: string }) {
  return (
    <span
      aria-hidden
      title={title ?? hex ?? undefined}
      className='inline-block size-3 shrink-0 border border-textColor'
      style={hex ? { backgroundColor: hex } : undefined}
    />
  );
}

/**
 * ACTIVE colour variants. The gate that matters everywhere else keys off this and not the raw
 * length: a card whose colours are all RETIRED is back in legacy single-output mode and is
 * plannable again, while a card with one live colour is not.
 */
export function activeVariantCount(variants?: common_TechCardOutputVariant[]): number {
  return (variants ?? []).filter((v) => v.active).length;
}

/** The server refuses a per-variant run until the next backend phase — say it in the operator's words. */
export const VARIANT_RUN_BLOCKED_REASON =
  'runs by colour variant are coming in the next release — plan runs only on single-output cards for now';

// Every field of the wire type has to be present (they are `T | undefined`, not optional keys), and
// the read-only ones (color_name, material_name, on_hand, unit) are ignored server-side. Spelling
// them out here keeps the call sites down to the three facts a caller actually decides.
function variantPayload(v: {
  id?: number;
  techCardId: number;
  colorCode?: string;
  // 0 = auto-create the bucket on CREATE, and "keep the current bucket" on UPDATE. Moving a colour
  // to a different bucket is the only case that has to name a target.
  materialId?: number;
  active?: boolean;
}): common_TechCardOutputVariant {
  return {
    id: v.id ?? 0,
    techCardId: v.techCardId,
    colorCode: v.colorCode,
    colorName: undefined,
    materialId: v.materialId ?? 0,
    materialName: undefined,
    onHand: undefined,
    unit: undefined,
    active: v.active,
  };
}

// Both writes invalidate the card detail AND the lists: the list row carries outputVariantCount /
// outputVariantsOnHand (the "3 colours · 820 on hand" badge and the aux picker's stock line), so a
// write that skipped the lists would leave those reading the pre-write world. The pipeline board
// follows the same rule as every other tech-card mutation — a variant changes what the card can
// produce, which is exactly what that board summarises.
function useVariantInvalidation(techCardId: number) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) });
    queryClient.invalidateQueries({ queryKey: techCardKeys.lists() });
    queryClient.invalidateQueries({ queryKey: techCardKeys.pipeline() });
  };
}

export function useUpsertOutputVariant(techCardId: number) {
  const invalidate = useVariantInvalidation(techCardId);
  return useMutation({
    mutationFn: (variant: common_TechCardOutputVariant) =>
      adminService.UpsertTechCardOutputVariant({ techCardId, variant }),
    onSuccess: invalidate,
  });
}

export function useDeleteOutputVariant(techCardId: number) {
  const invalidate = useVariantInvalidation(techCardId);
  return useMutation({
    mutationFn: (id: number) => adminService.DeleteTechCardOutputVariant({ id }),
    onSuccess: invalidate,
  });
}

/**
 * Sequential seed used by the sellable→auxiliary convert: register one colour variant per archived
 * colourway, each auto-creating its bucket. Sequential and NOT atomic — there is no server RPC that
 * does the batch — so it reports per-colour instead of collapsing to one verdict: the card is
 * already auxiliary by the time this runs, which makes every failure retryable from the panel below
 * rather than something the operator has to undo.
 */
export async function seedColourVariants(
  techCardId: number,
  colorCodes: string[],
): Promise<{ created: string[]; failed: { code: string; message: string }[] }> {
  const created: string[] = [];
  const failed: { code: string; message: string }[] = [];
  for (const code of colorCodes) {
    try {
      await adminService.UpsertTechCardOutputVariant({
        techCardId,
        // A new colour is ALWAYS created active (the server forces it); materialId 0 auto-creates
        // the bucket as "<card> — <colour>".
        variant: variantPayload({ techCardId, colorCode: code, materialId: 0, active: true }),
      });
      created.push(code);
    } catch (error) {
      failed.push({ code, message: techCardErrorMessage(error, 'unknown error') });
    }
  }
  return { created, failed };
}

// The colour + bucket question, asked the same way whether a brand-new colour is being registered or
// the legacy single output is being adopted under one. Adoption differs ONLY in what it opens with
// (the card's existing bucket, preselected) — the RPC and every refusal behind it are identical, so
// there is one dialog rather than two that drift.
function AddColourDialog({
  open,
  onOpenChange,
  techCardId,
  usedCodes,
  seedMaterialId = 0,
  title,
  confirmLabel,
  note,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  techCardId: number;
  /** Colours already on this card — a colour is unique per card server-side. */
  usedCodes: Set<string>;
  /** Preselects "use an existing material" with this bucket (the adopt path). 0 = ask fresh. */
  seedMaterialId?: number;
  title: string;
  confirmLabel: string;
  note?: React.ReactNode;
}) {
  const { dictionary } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const upsert = useUpsertOutputVariant(techCardId);
  const [colorCode, setColorCode] = useState('');
  const [mode, setMode] = useState<'auto' | 'existing'>('auto');
  const [materialId, setMaterialId] = useState(0);
  const [materialName, setMaterialName] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  // Reset on every OPEN, not on close: a dialog reopened after a refusal must not silently re-submit
  // the previous answer, and a stale seedMaterialId would adopt the wrong bucket.
  useEffect(() => {
    if (!open) return;
    setColorCode('');
    setMode(seedMaterialId > 0 ? 'existing' : 'auto');
    setMaterialId(seedMaterialId);
    setMaterialName('');
    setPickerOpen(false);
  }, [open, seedMaterialId]);

  const availableColors = useMemo(
    () => (dictionary?.colors ?? []).filter((c) => !c.archived && c.code),
    [dictionary?.colors],
  );
  const picked = availableColors.find((c) => c.code === colorCode);
  const chosenMaterialId = mode === 'auto' ? 0 : materialId;
  const ready = !!colorCode && (mode === 'auto' || chosenMaterialId > 0);

  const submit = () => {
    if (!ready) {
      showMessage(colorCode ? 'pick a material' : 'pick a colour', 'error');
      return;
    }
    upsert.mutate(
      variantPayload({
        techCardId,
        colorCode,
        materialId: chosenMaterialId,
        // The server forces a new colour active; sending it keeps the request honest about intent.
        active: true,
      }),
      {
        onSuccess: () => {
          showMessage(`colour ${colorCode} registered`, 'success');
          onOpenChange(false);
        },
        // Every refusal behind this RPC (duplicate colour, a bucket another card already claims, a
        // unit that disagrees with the sibling colours, a unitless or archived material, a sellable
        // or released card) arrives as a 400 with readable text — pass it through verbatim.
        onError: (error) =>
          showMessage(techCardErrorMessage(error, 'could not register the colour'), 'error'),
      },
    );
  };

  return (
    <>
      <ConfirmationModal
        open={open}
        // Dismissal is NOT blocked while the write is in flight: a hung request would otherwise trap
        // the operator in a modal with no exit. Confirm stays disabled (no double-submit), and a
        // request that settles after the close still runs its invalidation, which is harmless.
        onOpenChange={(next) => !next && onOpenChange(false)}
        title={title}
        width='sm'
        confirmLabel={confirmLabel}
        cancelLabel='cancel'
        confirmDisabled={!ready || upsert.isPending}
        // The handler closes it on success only — a refusal has to keep the answers on screen or the
        // operator retypes them blind.
        closeOnConfirm={false}
        onConfirm={submit}
      >
        {note}
        {availableColors.length === 0 ? (
          <CalloutBox tone='note'>
            <Text size='micro' component='span'>
              no colours in the dictionary yet — add them under <b>settings › colors</b>
            </Text>
          </CalloutBox>
        ) : (
          <div className='flex flex-col gap-2'>
            <label className='flex flex-col gap-1'>
              <Text size='micro' variant='label' component='span' className='uppercase'>
                colour
              </Text>
              <span className='flex items-center gap-2'>
                <Swatch hex={picked?.hex} title={picked?.name ?? undefined} />
                <select
                  className={cn(cell, 'w-full')}
                  value={colorCode}
                  disabled={upsert.isPending}
                  onChange={(e) => setColorCode(e.target.value)}
                >
                  <option value=''>— select colour —</option>
                  {availableColors.map((c) => (
                    <option key={c.code} value={c.code} disabled={usedCodes.has(c.code ?? '')}>
                      {c.code} · {c.name}
                      {usedCodes.has(c.code ?? '') ? ' (already on this card)' : ''}
                    </option>
                  ))}
                </select>
              </span>
            </label>

            <div className='flex flex-col gap-1'>
              <Text size='micro' variant='label' component='span' className='uppercase'>
                stock bucket
              </Text>
              <label className='flex items-center gap-1.5'>
                <input
                  type='checkbox'
                  checked={mode === 'auto'}
                  disabled={upsert.isPending}
                  onChange={(e) => setMode(e.target.checked ? 'auto' : 'existing')}
                />
                <Text size='micro' variant='label' component='span'>
                  create automatically («card — colour»)
                </Text>
              </label>
              {mode === 'existing' && (
                <div className='flex items-center gap-2'>
                  <Button
                    type='button'
                    variant='secondary'
                    size='sm'
                    disabled={upsert.isPending}
                    onClick={() => setPickerOpen(true)}
                  >
                    {materialId > 0 ? 'change material' : 'pick material'}
                  </Button>
                  <Text size='micro' variant='label' component='span' className='min-w-0 truncate'>
                    {materialId > 0
                      ? materialName || `material #${materialId}`
                      : 'no material chosen'}
                  </Text>
                </div>
              )}
            </div>
            <Text size='micro' variant='label'>
              A variant is not restricted to packaging — any material can be the bucket. The server
              checks it is unitless-free, un-archived, and claimed by no other card, and that its
              unit agrees with the colours already registered here.
            </Text>
          </div>
        )}
      </ConfirmationModal>

      {/* Portals to body over the dialog, like the BOM's staged role modal does over its picker. */}
      <MaterialPickerDialog
        open={pickerOpen}
        value={materialId}
        title='bucket for this colour'
        confirmLabel='use this material'
        onPick={(m?: common_Material) => {
          setMaterialId(m?.id ?? 0);
          setMaterialName(m?.name ?? '');
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}

/**
 * The card's registered colours, replacing the single output-material picker once at least one
 * exists. Edit-mode only — every row here is a write that already happened, so there is nothing to
 * show (and no id to write against) on an unsaved card.
 */
export function OutputVariantsPanel({
  techCardId,
  variants,
  canEdit,
}: {
  techCardId: number;
  variants: common_TechCardOutputVariant[];
  canEdit: boolean;
}) {
  const { dictionary } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const upsert = useUpsertOutputVariant(techCardId);
  const del = useDeleteOutputVariant(techCardId);
  const [addOpen, setAddOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<common_TechCardOutputVariant | null>(null);

  const hexByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of dictionary?.colors ?? []) if (c.code && c.hex) m.set(c.code, c.hex);
    return m;
  }, [dictionary?.colors]);
  const usedCodes = useMemo(
    () => new Set(variants.map((v) => v.colorCode ?? '').filter(Boolean)),
    [variants],
  );
  const liveCount = activeVariantCount(variants);

  const toggleActive = (v: common_TechCardOutputVariant) => {
    upsert.mutate(
      // materialId 0 on an update means "keep the current bucket" — retiring a colour must never
      // move its stock.
      variantPayload({
        id: v.id,
        techCardId,
        colorCode: v.colorCode,
        materialId: 0,
        active: !v.active,
      }),
      {
        onSuccess: () =>
          showMessage(
            `${v.colorCode ?? 'colour'} ${v.active ? 'retired' : 'reactivated'}`,
            'success',
          ),
        onError: (error) =>
          showMessage(techCardErrorMessage(error, 'could not update the colour'), 'error'),
      },
    );
  };

  const confirmDelete = () => {
    const v = pendingDelete;
    // An id-less row cannot be deleted, and sending 0 only buys a raw gateway complaint about a
    // missing required field. Every row here comes back from the server with an id, so this is a
    // guard against a shape we do not expect rather than a case with a story.
    if (!v?.id) return;
    del.mutate(v.id, {
      onSuccess: () => {
        showMessage(`${v.colorCode ?? 'colour'} deleted`, 'success');
        setPendingDelete(null);
      },
      onError: (error) =>
        showMessage(techCardErrorMessage(error, 'could not delete the colour'), 'error'),
    });
  };

  const busy = upsert.isPending || del.isPending;

  return (
    <div className='flex flex-col gap-2'>
      <Text variant='inactive' size='small'>
        this card produces one warehouse bucket per colour — each colour has its own on-hand and its
        own moving average. The single output material no longer applies while any colour is
        registered.
      </Text>

      {/* The server refuses to plan or receive a run on a card with a live colour, so the panel says
          so where the colours are, not only where the button is greyed out. */}
      {liveCount > 0 && (
        <CalloutBox tone='note'>
          <Text size='micro' component='span'>
            {VARIANT_RUN_BLOCKED_REASON}. Retire every colour to plan a single-output run again.
          </Text>
        </CalloutBox>
      )}

      <GroupLabel>
        colour variants · {variants.length} ({liveCount} active)
      </GroupLabel>
      {variants.map((v) => {
        // '—' is not '0': UNSET means the bucket has no stock row at all, which is a different
        // statement from "none left" (mirrors StockLine in the aux picker).
        const onHand = decimalToInput(v.onHand);
        return (
          <Row
            key={v.id}
            label={
              <span className='flex min-w-0 items-center gap-2'>
                <Swatch hex={hexByCode.get(v.colorCode ?? '')} title={v.colorName ?? undefined} />
                <span className='uppercase'>{v.colorCode || '—'}</span>
                <Text size='micro' variant='label' component='span' className='truncate'>
                  {v.colorName || ''}
                  {v.materialName ? ` · ${v.materialName}` : ''}
                </Text>
                {!v.active && <Pill tone='mut'>retired</Pill>}
              </span>
            }
            value={
              <span className='flex items-center gap-2'>
                <span>
                  {onHand || '—'}
                  {v.unit ? ` ${v.unit}` : ''}
                </span>
                {canEdit && (
                  <>
                    <Button
                      type='button'
                      variant='secondary'
                      size='xs'
                      disabled={busy}
                      onClick={() => toggleActive(v)}
                    >
                      {v.active ? 'retire' : 'reactivate'}
                    </Button>
                    <Button
                      type='button'
                      variant='secondary'
                      size='xs'
                      aria-label={`delete colour ${v.colorCode ?? ''}`}
                      disabled={busy}
                      onClick={() => setPendingDelete(v)}
                    >
                      ✕
                    </Button>
                  </>
                )}
              </span>
            }
          />
        );
      })}

      {canEdit && (
        <div>
          <Button
            type='button'
            variant='secondary'
            size='lg'
            className='uppercase'
            disabled={busy}
            onClick={() => setAddOpen(true)}
          >
            + add colour
          </Button>
        </div>
      )}

      <AddColourDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        techCardId={techCardId}
        usedCodes={usedCodes}
        title='register a colour'
        confirmLabel='register'
      />

      {pendingDelete && (
        <ConfirmationModal
          open
          width='sm'
          // Closable mid-flight for the same reason as the add dialog — see there.
          onOpenChange={(next) => !next && setPendingDelete(null)}
          title={`delete ${pendingDelete.colorCode || 'colour'}?`}
          confirmLabel='delete'
          cancelLabel='cancel'
          confirmDisabled={del.isPending}
          closeOnConfirm={false}
          onConfirm={confirmDelete}
        >
          <Row label='colour' value={pendingDelete.colorCode || '—'} />
          <Row label='bucket' value={pendingDelete.materialName || '—'} />
          <Row label='on hand' value={decimalToInput(pendingDelete.onHand) || '—'} />
          <Text size='micro' variant='label' className='mt-2'>
            Deleting unhooks the colour from this card. The material keeps its stock and its history
            — nothing is written off and no movement is recorded. To stop planning a colour without
            unhooking it, retire it instead.
          </Text>
          {variants.length === 1 && (
            <Text size='micro' variant='label' className='mt-2'>
              This is the last colour: deleting it returns the card to single-output mode and
              un-pins the auxiliary purpose — a registered colour is what pins it.
            </Text>
          )}
        </ConfirmationModal>
      )}
    </div>
  );
}

/**
 * The zero-variant escape hatch: adopt the card's EXISTING output material as its first colour,
 * instead of auto-creating a second bucket beside a bucket that already holds stock. The server
 * allows this self-adoption precisely so the switch to per-colour does not strand the legacy
 * balance. Once it lands the section switches to the variants list on refetch.
 */
export function AdoptLegacyOutputButton({
  techCardId,
  materialId,
  canEdit,
}: {
  techCardId: number;
  materialId: number;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!canEdit || materialId <= 0) return null;
  return (
    <div>
      <Button
        type='button'
        variant='secondary'
        size='lg'
        className='uppercase'
        onClick={() => setOpen(true)}
      >
        adopt as colour…
      </Button>
      <AddColourDialog
        open={open}
        onOpenChange={setOpen}
        techCardId={techCardId}
        usedCodes={new Set<string>()}
        seedMaterialId={materialId}
        title='adopt the output material as a colour'
        confirmLabel='adopt'
        note={
          <Text size='micro' variant='label' className='mb-2'>
            Name the colour this card has been producing all along. The material below keeps every
            unit of stock and its whole history — this only files it under a colour, after which the
            card switches to per-colour buckets and new colours get their own.
          </Text>
        }
      />
    </div>
  );
}
