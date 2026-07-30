import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_TechCardListItem } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Media from 'ui/components/media';
import { Pill } from 'ui/components/pill';
import { Placeholder } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';
import { Toolbar } from 'ui/components/toolbar';
import { decimalToInput } from 'utils/decimal';

// Shared building blocks for the LABELS & PKG tab (assembly-field + packaging-recipe-field): the
// auxiliary-card catalog query + labels, a url-based square thumbnail, the aux card -> output
// material stock read, and the aux-card picker DIALOG. Kept here (not in assembly-field) so both
// fields import from one place without a cycle.

// The common "ships in a fabric dust bag (пыльник)" auxiliary sub-type — the dust-bag affordance
// pre-filters the picker to this.
export const DUST_BAG_SUBTYPE = 'TECH_CARD_AUX_SUBTYPE_DUST_BAG';

// Strip the enum prefix for a compact human label (e.g. TECH_CARD_AUX_SUBTYPE_DUST_BAG -> "dust bag").
export function auxSubtypeLabel(subtype?: string): string {
  if (!subtype || subtype === 'TECH_CARD_AUX_SUBTYPE_UNKNOWN') return '';
  return subtype.replace('TECH_CARD_AUX_SUBTYPE_', '').replace(/_/g, ' ').toLowerCase();
}

// Auxiliary cards only (WS7): the components an assembly line can point at / whose output a
// packaging-recipe row can resolve, mirroring the output-material picker's purpose filter on the
// tech-card header. One shared query/cache key so the two fields (same tab) never double-fetch.
export function useAuxTechCards() {
  return useQuery({
    queryKey: ['techCardAuxCards'],
    queryFn: () =>
      adminService.ListTechCards({
        purpose: 'auxiliary',
        limit: 200,
        offset: 0,
        orderFactor: 'ORDER_FACTOR_DESC',
        stage: 'TECH_CARD_STAGE_UNKNOWN',
        gender: 'GENDER_ENUM_UNKNOWN',
        brand: '',
        name: '',
        productId: 0,
        skuSeason: undefined,
        categoryIds: undefined,
      }),
    staleTime: 5 * 60 * 1000,
  });
}

export function auxCardLabel(c: common_TechCardListItem): string {
  const subtype = auxSubtypeLabel(c.auxSubtype);
  return `${c.styleNumber ? `${c.styleNumber} · ` : ''}${c.name || `#${c.id}`}${
    subtype ? ` · ${subtype}` : ''
  }`;
}

// Server-resolved gallery thumbnail (previewUrl); empty when the card carries no media.
export const auxCardThumbUrl = (c?: common_TechCardListItem): string | undefined =>
  c?.previewUrl || undefined;

// What the picker can say about one aux card's stock before you pick it. There is no loading state:
// the figures ride in on the list row itself.
//   none     — the card has no output material set (so it can never be resolved into a row)
//   unknown  — it HAS an output material, but the server reported no on-hand for it
//              (output_material_on_hand absent) — a missing figure, not a missing material
//   value    — a real on-hand figure (a decimal string, "0" included)
export type AuxStock =
  | { state: 'none' }
  | { state: 'unknown'; materialId: number; materialName: string }
  | { state: 'value'; materialId: number; materialName: string; onHand: string };

// Read straight off the list row: ListTechCards now resolves the auxiliary output material and its
// warehouse balance server-side, which replaced a capped N+1 (one GetTechCard per card plus a
// shared warehouse read) that could only ever cover the first 40 cards.
export function auxOutputStock(card: common_TechCardListItem): AuxStock {
  const materialId = Number(card.outputMaterialId) || 0;
  if (!materialId) return { state: 'none' };
  const materialName = card.outputMaterialName ?? '';
  const onHand = decimalToInput(card.outputMaterialOnHand);
  return onHand
    ? { state: 'value', materialId, materialName, onHand }
    : { state: 'unknown', materialId, materialName };
}

// A url-based square thumbnail — the twin of MaterialThumb (which takes a common_Material) for
// entities that only expose a plain image URL (aux cards). With no image it IS a Placeholder (the
// striped "slot" surface), so an aux card without a photo reads as an empty slot rather than a
// broken <img> or a suspicious white box.
export function Thumb({
  url,
  alt,
  className,
  placeholder = '—',
}: {
  url?: string;
  alt: string;
  className?: string;
  placeholder?: ReactNode;
}) {
  if (!url)
    return <Placeholder label={placeholder} className={cn('shrink-0 text-center', className)} />;
  return (
    <div className={cn('shrink-0 overflow-hidden border border-borderColor bg-bgColor', className)}>
      <Media src={url} alt={alt} aspectRatio='1/1' fit='cover' />
    </div>
  );
}

// A raw (non-RHF) control wearing the reference's field grammar: a 10px uppercase label above a
// boxed control. GAP: everything in `ui/form/fields/*` is bound to react-hook-form, and there is no
// unbound field primitive in `src/ui` — but the assembly bill and the packaging recipe hold their
// own local state (each has its own RPC, outside the card's form), so they cannot use those.
export function Field({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', className)}>
      <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
        {label}
      </Text>
      {children}
    </div>
  );
}

// The stock line under a tile: the whole point of promoting the picker to a dialog is that you see
// what you are about to commit to BEFORE you commit. Zero (and "no output material at all") are
// blocking facts, so they read red; everything else is quiet grey.
function StockLine({ stock, busy }: { stock: AuxStock; busy?: boolean }) {
  if (busy)
    return (
      <Text size='micro' variant='label'>
        resolving…
      </Text>
    );
  if (stock.state === 'none') return <Pill tone='warn'>no output material</Pill>;
  // The material name only ever rides as a tooltip: a 140px tile has no room for it, and the
  // number is what the decision turns on.
  if (stock.state === 'unknown')
    return (
      <Text size='micro' variant='label' title={stock.materialName || undefined}>
        no stock figure
      </Text>
    );
  return Number(stock.onHand) === 0 ? (
    <Pill tone='warn' title={stock.materialName || undefined}>
      0 on hand
    </Pill>
  ) : (
    <Text size='micro' variant='label' title={stock.materialName || undefined}>
      {stock.onHand} on hand
    </Text>
  );
}

// Expressive aux-card picker (#43/#70) as a DIALOG: search, sub-type chips, a grid of square cards
// big enough to recognise, each carrying its output material's warehouse balance. Two-step by
// design — click a tile to select, "use this" to commit — so the stock figure is readable before
// the pick lands on a row. Shared by the assembly component pick, the packaging-recipe "from an aux
// card's output" pick and the dust-bag action (initialSubtype).
export function AuxCardPickerModal({
  open,
  onOpenChange,
  onPick,
  initialSubtype,
  busyId,
  selectedId,
  title = 'pick an auxiliary item',
  hint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (card: common_TechCardListItem) => void;
  initialSubtype?: string;
  /** The card whose output material is being resolved right now (keeps the `resolving…` state). */
  busyId?: number | null;
  /** The card the calling row already holds, pre-selected on open. */
  selectedId?: number;
  title?: string;
  hint?: ReactNode;
}) {
  const { data, isLoading } = useAuxTechCards();
  const cards = useMemo(() => data?.techCards ?? [], [data]);
  const [q, setQ] = useState('');
  const [subtype, setSubtype] = useState<string>(initialSubtype ?? 'all');
  const [pending, setPending] = useState<number>(selectedId ?? 0);

  // Re-arm on every opening: the filter starts at the caller's sub-type and the selection at
  // whatever the calling row already holds, never at the previous opening's leftovers.
  useEffect(() => {
    if (!open) return;
    setQ('');
    setSubtype(initialSubtype ?? 'all');
    setPending(selectedId ?? 0);
  }, [open, initialSubtype, selectedId]);

  const subtypes = useMemo(() => {
    const set = new Set<string>();
    for (const c of cards)
      if (c.auxSubtype && c.auxSubtype !== 'TECH_CARD_AUX_SUBTYPE_UNKNOWN') set.add(c.auxSubtype);
    // Keep the requested initial sub-type reachable even if no card currently carries it.
    if (initialSubtype && initialSubtype !== 'all') set.add(initialSubtype);
    return Array.from(set);
  }, [cards, initialSubtype]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return cards.filter((c) => {
      if (subtype !== 'all' && c.auxSubtype !== subtype) return false;
      if (!needle) return true;
      return (
        (c.styleNumber ?? '').toLowerCase().includes(needle) ||
        (c.name ?? '').toLowerCase().includes(needle)
      );
    });
  }, [cards, q, subtype]);

  const busy = busyId != null;

  const confirm = () => {
    const card = cards.find((c) => Number(c.id) === pending);
    if (card) onPick(card);
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={confirm}
      title={title}
      confirmLabel={busy ? 'resolving…' : 'use this'}
      confirmDisabled={!pending || busy}
      width='lg'
      // The caller closes the dialog once its own resolve/patch succeeded — auto-closing here would
      // dismiss it while the aux card -> output material lookup is still in flight.
      closeOnConfirm={false}
    >
      <div className='flex flex-col gap-2'>
        {hint ? (
          <Text size='micro' variant='label'>
            {hint}
          </Text>
        ) : null}

        <Toolbar>
          <Input
            name='aux-card-search'
            placeholder='search style № / name'
            value={q}
            autoComplete='off'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
            className='min-w-40 flex-1'
          />
          <ChipRow>
            <Chip
              selected={subtype === 'all'}
              pressed={subtype === 'all'}
              onClick={() => setSubtype('all')}
            >
              all
            </Chip>
            {subtypes.map((s) => (
              <Chip
                key={s}
                selected={subtype === s}
                pressed={subtype === s}
                onClick={() => setSubtype(s)}
              >
                {auxSubtypeLabel(s)}
              </Chip>
            ))}
          </ChipRow>
        </Toolbar>

        {isLoading ? (
          <Text size='micro' variant='label'>
            loading…
          </Text>
        ) : filtered.length === 0 ? (
          <CalloutBox tone='note'>
            <Text size='micro' component='span'>
              <b>no auxiliary cards</b>
              {subtype !== 'all' ? ` of type “${auxSubtypeLabel(subtype)}”` : ''} found — create one
              as an auxiliary tech card (purpose = auxiliary) with an output material set.
            </Text>
          </CalloutBox>
        ) : (
          <Tiles min={140} className='max-h-[52vh] overflow-y-auto'>
            {filtered.map((c) => {
              const id = Number(c.id) || 0;
              return (
                <Tile
                  key={id}
                  selected={pending === id}
                  onClick={() => setPending(id)}
                  media={
                    <Thumb
                      url={auxCardThumbUrl(c)}
                      alt={c.name || 'aux card'}
                      className='aspect-square w-full'
                      placeholder='no image'
                    />
                  }
                  name={c.name || `#${id}`}
                  sub={[c.styleNumber, auxSubtypeLabel(c.auxSubtype)].filter(Boolean).join(' · ')}
                >
                  <StockLine stock={auxOutputStock(c)} busy={busyId === id} />
                </Tile>
              );
            })}
          </Tiles>
        )}
      </div>
    </ConfirmationModal>
  );
}

// The MULTI-select twin of AuxCardPickerModal: same look (search + sub-type chips + a grid of square
// tiles), but a tile TOGGLES membership in a selection instead of committing on click, so several
// aux cards land on the assembly bill in one pass. There is no per-card stock "resolving" step —
// the output material resolves on save — so the confirm commits every selected card at once.
export function AuxCardMultiPickerModal({
  open,
  onOpenChange,
  onPick,
  alreadyAddedIds = [],
  title = 'pick auxiliary items',
  hint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Commits every selected card at once. */
  onPick: (cards: common_TechCardListItem[]) => void;
  /** Cards already on the bill — still shown, but marked and not selectable (no re-adding). */
  alreadyAddedIds?: number[];
  title?: string;
  hint?: ReactNode;
}) {
  const { data, isLoading } = useAuxTechCards();
  const cards = useMemo(() => data?.techCards ?? [], [data]);
  const [q, setQ] = useState('');
  const [subtype, setSubtype] = useState<string>('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const added = useMemo(() => new Set(alreadyAddedIds), [alreadyAddedIds]);

  // Re-arm on every opening: no selection, no search, all sub-types — never the last run's leftovers.
  useEffect(() => {
    if (!open) return;
    setQ('');
    setSubtype('all');
    setSelected(new Set());
  }, [open]);

  const subtypes = useMemo(() => {
    const set = new Set<string>();
    for (const c of cards)
      if (c.auxSubtype && c.auxSubtype !== 'TECH_CARD_AUX_SUBTYPE_UNKNOWN') set.add(c.auxSubtype);
    return Array.from(set);
  }, [cards]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return cards.filter((c) => {
      if (subtype !== 'all' && c.auxSubtype !== subtype) return false;
      if (!needle) return true;
      return (
        (c.styleNumber ?? '').toLowerCase().includes(needle) ||
        (c.name ?? '').toLowerCase().includes(needle)
      );
    });
  }, [cards, q, subtype]);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirm = () => {
    if (selected.size === 0) return;
    onPick(cards.filter((c) => selected.has(Number(c.id) || 0)));
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={confirm}
      title={title}
      confirmLabel={selected.size ? `add ${selected.size}` : 'add'}
      confirmDisabled={selected.size === 0}
      width='lg'
    >
      <div className='flex flex-col gap-2'>
        {hint ? (
          <Text size='micro' variant='label'>
            {hint}
          </Text>
        ) : null}

        <Toolbar>
          <Input
            name='aux-card-multi-search'
            placeholder='search style № / name'
            value={q}
            autoComplete='off'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
            className='min-w-40 flex-1'
          />
          <ChipRow>
            <Chip
              selected={subtype === 'all'}
              pressed={subtype === 'all'}
              onClick={() => setSubtype('all')}
            >
              all
            </Chip>
            {subtypes.map((s) => (
              <Chip
                key={s}
                selected={subtype === s}
                pressed={subtype === s}
                onClick={() => setSubtype(s)}
              >
                {auxSubtypeLabel(s)}
              </Chip>
            ))}
          </ChipRow>
        </Toolbar>

        {isLoading ? (
          <Text size='micro' variant='label'>
            loading…
          </Text>
        ) : filtered.length === 0 ? (
          <CalloutBox tone='note'>
            <Text size='micro' component='span'>
              <b>no auxiliary cards</b>
              {subtype !== 'all' ? ` of type “${auxSubtypeLabel(subtype)}”` : ''} found — create one
              as an auxiliary tech card (purpose = auxiliary) with an output material set.
            </Text>
          </CalloutBox>
        ) : (
          <Tiles min={140} className='max-h-[52vh] overflow-y-auto'>
            {filtered.map((c) => {
              const id = Number(c.id) || 0;
              const isAdded = added.has(id);
              const isSelected = selected.has(id);
              return (
                <Tile
                  key={id}
                  selected={isSelected}
                  // An already-added card is a plain (non-toggling) tile — clicking it must not queue
                  // a duplicate the bill would only drop again.
                  onClick={isAdded ? undefined : () => toggle(id)}
                  media={
                    <Thumb
                      url={auxCardThumbUrl(c)}
                      alt={c.name || 'aux card'}
                      className='aspect-square w-full'
                      placeholder='no image'
                    />
                  }
                  name={c.name || `#${id}`}
                  sub={[c.styleNumber, auxSubtypeLabel(c.auxSubtype)].filter(Boolean).join(' · ')}
                >
                  {isAdded ? (
                    <Pill tone='mut'>on bill</Pill>
                  ) : isSelected ? (
                    <Pill tone='ok'>selected</Pill>
                  ) : null}
                </Tile>
              );
            })}
          </Tiles>
        )}
      </div>
    </ConfirmationModal>
  );
}
