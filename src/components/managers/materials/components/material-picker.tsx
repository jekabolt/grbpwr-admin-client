import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_Material } from 'api/proto-http/admin';
import { techCardBomSectionOptions } from 'constants/filter';
import { cn } from 'lib/utility';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Media from 'ui/components/media';
import { Placeholder } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';
import { decimalToInput } from 'utils/decimal';
import { materialSpec } from './material-code';
import { MaterialThumb, materialImageUrl } from './material-thumb';
import { useMaterials } from './useMaterials';

const sectionLabel = (v?: string): string =>
  techCardBomSectionOptions.find((o) => o.value === v)?.label ?? '';

// The one-word section name. The dictionary labels carry operator-facing parentheticals
// ("hardware (пуговицы / молнии / кнопки)") that don't belong in a dialog title or on a chip.
const sectionShortLabel = (v?: string): string =>
  v ? v.replace('TECH_CARD_BOM_SECTION_', '').toLowerCase() : '';

// Material.id is int64 → grpc-gateway sends it as a STRING even though the generated type says
// `number`, so a raw `m.id === value` comparison never matches a numeric form value. Everything in
// here compares through this instead (same rule as the tech-card form's `wireInt`).
const numId = (v: unknown): number => Number(v) || 0;

// The picked material's one-line identity: "CODE · Name" (code dropped when absent).
const materialLabel = (m: common_Material): string =>
  `${m.code ? `${m.code} · ` : ''}${m.name ?? `#${m.id}`}`;

// On-hand balance per material id, for the swatch grid's "€8.00 · 41 m" caption and its "in stock"
// filter. Lazy (`enabled`) because the combobox variant — which is on almost every screen — must not
// pull the warehouse ledger. Key + args mirror useWarehouse's `useMaterialStock({})` verbatim so the
// two share ONE react-query cache entry rather than double-fetching.
export function useMaterialOnHand(enabled = true) {
  const { data } = useQuery({
    queryKey: ['warehouse', 'stock', {}],
    queryFn: () =>
      adminService.ListMaterialStock({
        section: '',
        q: '',
        withStockOnly: false,
        belowMinOnly: false,
      }),
    enabled,
  });
  return useMemo(() => {
    const map = new Map<number, string>();
    (data?.rows ?? []).forEach((r) => {
      const id = numId(r.material?.id);
      if (id) map.set(id, decimalToInput(r.onHand));
    });
    return map;
  }, [data]);
}

// "8.00 EUR / m" — the catalog price as one readable fact. latest_price is costing-gated, so this is
// simply absent (not zero) for an account without costing:read.
export function materialPriceLabel(m?: common_Material): string {
  const price = m?.latestPrice?.price?.value?.trim();
  if (!price) return '';
  const currency = m?.latestPrice?.currency?.trim();
  const unit = m?.unit?.trim();
  return `${price}${currency ? ` ${currency}` : ''}${unit ? ` / ${unit}` : ''}`;
}

// A fixed-position box under (or flipped above) the trigger, clamped to the viewport. The menu
// renders in a body portal as position:fixed so it escapes any overflow-hidden/auto ancestor —
// the movement modals, run detail, and the BOM tile all clip an absolutely-positioned menu, which
// is why the picker can't use a normal in-flow dropdown.
type Anchor = { left: number; width: number; maxHeight: number; top?: number; bottom?: number };
function computeAnchor(el: HTMLElement): Anchor {
  const r = el.getBoundingClientRect();
  const gap = 4;
  const margin = 8;
  const width = Math.min(Math.max(r.width, 280), window.innerWidth - margin * 2);
  const spaceBelow = window.innerHeight - r.bottom - gap - margin;
  const spaceAbove = r.top - gap - margin;
  const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
  const maxHeight = Math.min(360, Math.max(160, openUp ? spaceAbove : spaceBelow));
  const left = Math.max(margin, Math.min(r.left, window.innerWidth - margin - width));
  return openUp
    ? { left, width, maxHeight, bottom: window.innerHeight - r.top + gap }
    : { left, width, maxHeight, top: r.bottom + gap };
}

// Reusable material chooser over the (non-archived) catalog.
//
//   variant="combo" (default) — a portalled searchable combobox. Fast, keyboard-first, 280px. This
//     is what the packaging recipe, the aux output material, sample write-offs, substitutions and
//     the movements ledger use: you already know the code and you want speed.
//   variant="grid" — the same catalog as a swatch DIALOG with filters. Used by the BOM's link
//     action only, because choosing a fabric is a visual decision and choosing a zip by code is not.
//
// Props are otherwise unchanged from the former native <select> so every call site keeps working.
export function MaterialPicker({
  value,
  onChange,
  section = '',
  disabled,
  placeholder = 'link a material',
  includeArchived = false,
  variant = 'combo',
  onCreate,
}: {
  value: number;
  onChange: (materialId: number, material?: common_Material) => void;
  section?: string; // UI enum constant to pre-narrow the catalog (e.g. packaging for aux output)
  disabled?: boolean;
  placeholder?: string;
  // Filter contexts (e.g. the movements ledger) set this so a URL pointing at an archived
  // material still shows as the active selection instead of a blank placeholder.
  includeArchived?: boolean;
  variant?: 'combo' | 'grid';
  // grid only: renders the "+ create" tile. The dialog closes first so the create modal is never
  // stacked on top of it; the caller's own onCreated then auto-selects the new material.
  onCreate?: () => void;
}) {
  const { data, isLoading } = useMaterials(section, includeArchived);
  const materials = useMemo(() => data?.materials ?? [], [data]);
  const isCurrent = useMemo(() => {
    const target = numId(value);
    return (m: common_Material) => target > 0 && numId(m.id) === target;
  }, [value]);
  const selected = useMemo(() => materials.find(isCurrent), [materials, isCurrent]);
  const isGrid = variant === 'grid';

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [entered, setEntered] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const rid = useId().replace(/:/g, '');
  const listId = `mp-list-${rid}`;
  const optId = (i: number) => `mp-opt-${rid}-${i}`;

  // Keep the current pick selectable even when the query would hide it, so typing never silently
  // drops the active choice.
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return materials;
    return materials.filter(
      (m) =>
        isCurrent(m) ||
        (m.name ?? '').toLowerCase().includes(needle) ||
        (m.code ?? '').toLowerCase().includes(needle) ||
        (m.supplierRef ?? '').toLowerCase().includes(needle),
    );
  }, [materials, q, isCurrent]);

  const openMenu = () => {
    if (disabled) return;
    if (!isGrid && triggerRef.current) setAnchor(computeAnchor(triggerRef.current));
    setOpen(true);
  };
  const closeMenu = (focusTrigger = true) => {
    setOpen(false);
    if (focusTrigger) requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const choose = (m?: common_Material) => {
    // numId, not the raw m.id: Material.id is int64, so grpc-gateway sends it as a STRING while the
    // generated type says `number`. This file has coerced on every INTERNAL comparison since it was
    // written (see numId's own comment) — but handed the raw value OUT, so every caller received
    // "42" typed as 42. Callers that re-wrapped in wireInt were fine; the rest silently broke on a
    // === against a number, a Set/Map keyed by id, or a z.number() that rejected the string and
    // blocked the save. Coerce at the boundary so no caller has to know.
    onChange(numId(m?.id), m);
    closeMenu();
  };

  // Reset transient state each time the menu closes so it reopens fresh at the current selection.
  useEffect(() => {
    if (open) return;
    setQ('');
    setEntered(false);
  }, [open]);

  // Point the highlight at the current selection (or the top) on open, and autofocus the search.
  useEffect(() => {
    if (!open || isGrid) return;
    const sel = filtered.findIndex(isCurrent);
    setActiveIndex(sel >= 0 ? sel : 0);
    const raf1 = requestAnimationFrame(() => setEntered(true));
    const raf2 = requestAnimationFrame(() => searchRef.current?.focus());
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isGrid]);

  // A new query re-filters from the top.
  useEffect(() => setActiveIndex(0), [q]);

  // Track the trigger through scroll/resize (the picker often sits inside a scrollable modal body).
  useLayoutEffect(() => {
    if (!open || isGrid) return;
    const update = () => triggerRef.current && setAnchor(computeAnchor(triggerRef.current));
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, isGrid]);

  // Close on an outside pointer / focus (Tab-away) — Escape and selection close from the keyboard.
  // The dialog variant owns its own dismissal (Radix), so this only guards the popover.
  useEffect(() => {
    if (!open || isGrid) return;
    const outside = (t: EventTarget | null) =>
      !triggerRef.current?.contains(t as Node) && !popRef.current?.contains(t as Node);
    const onPointerDown = (e: PointerEvent) => outside(e.target) && setOpen(false);
    const onFocusIn = (e: FocusEvent) => outside(e.target) && setOpen(false);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [open, isGrid]);

  // Keep the highlighted option scrolled into view during keyboard nav.
  useEffect(() => {
    if (open && !isGrid)
      document.getElementById(optId(activeIndex))?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, open, isGrid]);

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(filtered.length - 1);
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[activeIndex]) choose(filtered[activeIndex]);
        break;
      case 'Escape':
        e.preventDefault();
        closeMenu();
        break;
    }
  };

  const activeDescendant = filtered[activeIndex] ? optId(activeIndex) : undefined;

  return (
    <div className='flex flex-col gap-1'>
      <button
        ref={triggerRef}
        type='button'
        disabled={disabled}
        onClick={() => (open ? closeMenu(false) : openMenu())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
            e.preventDefault();
            openMenu();
          }
        }}
        aria-haspopup={isGrid ? 'dialog' : 'listbox'}
        aria-expanded={open}
        className={cn(
          // Same box as <Input> / <Select> — a picker must read as a field, not as an underline.
          'flex min-h-[22px] w-full items-center gap-2 border border-borderColor bg-bgColor px-[7px] py-[3px] text-left text-textBaseSize transition-colors',
          'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor',
          'disabled:cursor-not-allowed disabled:bg-bgZebra disabled:text-labelColor',
        )}
      >
        {selected ? <MaterialThumb material={selected} size='sm' className='h-5 w-5' /> : null}
        <span className='min-w-0 flex-1 truncate'>
          {selected ? (
            <Text component='span' className='truncate'>
              {materialLabel(selected)}
            </Text>
          ) : (
            <Text component='span' variant='label' className='truncate'>
              {isLoading ? 'loading…' : placeholder}
            </Text>
          )}
        </span>
        <Text component='span' variant='inactive' className='shrink-0'>
          {open ? '▴' : '▾'}
        </Text>
      </button>

      {!isLoading && materials.length === 0 ? (
        <Text variant='label' size='micro'>
          no materials in catalog
        </Text>
      ) : null}

      {isGrid && open ? (
        <MaterialGridDialog
          materials={materials}
          value={value}
          section={section}
          onPick={choose}
          onClose={() => closeMenu()}
          onCreate={
            onCreate
              ? () => {
                  setOpen(false);
                  onCreate();
                }
              : undefined
          }
        />
      ) : null}

      {!isGrid && open && anchor
        ? createPortal(
            <div
              ref={popRef}
              className={cn(
                'fixed z-[var(--z-popover)] flex flex-col overflow-hidden border border-textColor bg-bgColor shadow-[var(--shadow-popover)]',
                'transition-[opacity,transform] duration-150 ease-out',
                'motion-reduce:transition-none motion-reduce:transform-none',
                entered ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0',
              )}
              style={{
                left: anchor.left,
                top: anchor.top,
                bottom: anchor.bottom,
                width: anchor.width,
                maxHeight: anchor.maxHeight,
              }}
            >
              <div className='border-b border-borderColor p-1'>
                <Input
                  ref={searchRef}
                  name={`${listId}-q`}
                  value={q}
                  autoComplete='off'
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
                  onKeyDown={onSearchKeyDown}
                  placeholder='search name / code…'
                  role='combobox'
                  aria-expanded={open}
                  aria-controls={listId}
                  aria-activedescendant={activeDescendant}
                  className='border-0'
                />
              </div>

              <div id={listId} role='listbox' className='min-h-0 flex-1 overflow-auto'>
                {numId(value) > 0 ? (
                  <button
                    type='button'
                    onClick={() => choose(undefined)}
                    className='flex w-full items-center gap-2 border-b border-hairline px-2 py-1 text-left text-labelColor hover:bg-bgZebra'
                  >
                    <span className='flex h-6 w-6 shrink-0 items-center justify-center'>✕</span>
                    <Text component='span' variant='label' size='micro'>
                      clear selection
                    </Text>
                  </button>
                ) : null}

                {filtered.length === 0 ? (
                  <div className='px-2 py-2.5'>
                    <Text variant='label' size='micro'>
                      {q.trim() ? 'no matches' : 'no materials'}
                    </Text>
                  </div>
                ) : (
                  filtered.map((m, idx) => {
                    const current = isCurrent(m);
                    const spec = materialSpec(m);
                    const meta = [m.code, sectionLabel(m.section), m.archived ? 'archived' : '']
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <button
                        key={m.id}
                        id={optId(idx)}
                        type='button'
                        role='option'
                        aria-selected={current}
                        onMouseMove={() => setActiveIndex(idx)}
                        onClick={() => choose(m)}
                        className={cn(
                          'flex w-full items-center gap-2 border-b border-hairline px-2 py-1 text-left',
                          idx === activeIndex && 'bg-bgZebra',
                        )}
                      >
                        <MaterialThumb material={m} size='sm' className='h-6 w-6' />
                        <span className='min-w-0 flex-1'>
                          <Text className='truncate'>{m.name || `#${m.id}`}</Text>
                          {spec ? (
                            <Text variant='label' size='micro' className='truncate'>
                              {spec}
                            </Text>
                          ) : null}
                          <Text variant='label' size='micro' className='truncate'>
                            {meta || '—'}
                          </Text>
                        </span>
                        {current ? (
                          <Text component='span' variant='inactive' className='shrink-0'>
                            ✓
                          </Text>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

// The same swatch dialog on its own, opened by the CALLER's own button instead of by a trigger
// field. The BOM's "add BOM article" opens this: an article is chosen from the catalog first and
// the line is created already linked, rather than appending a blank line the operator then has to
// find the link control inside.
export function MaterialPickerDialog({
  open,
  section = '',
  value = 0,
  includeArchived = false,
  title,
  confirmLabel,
  onPick,
  onClose,
  onCreate,
}: {
  open: boolean;
  section?: string;
  value?: number;
  includeArchived?: boolean;
  title?: string;
  confirmLabel?: string;
  onPick: (material?: common_Material) => void;
  onClose: () => void;
  onCreate?: () => void;
}) {
  // Only fetched while open — the caller mounts this permanently next to its button.
  const { data } = useMaterials(section, includeArchived, open);
  if (!open) return null;
  return (
    <MaterialGridDialog
      materials={data?.materials ?? []}
      value={value}
      section={section}
      title={title}
      confirmLabel={confirmLabel}
      onPick={onPick}
      onClose={onClose}
      onCreate={onCreate}
    />
  );
}

// The BOM's link dialog (11.3): the same catalog, but as swatches you can actually read a fabric
// off. Selection is STAGED — a tile click only arms the pick, "link" commits it — so a mis-click in
// a grid never silently rewrites a BOM line.
function MaterialGridDialog({
  materials,
  value,
  section,
  title,
  confirmLabel,
  onPick,
  onClose,
  onCreate,
}: {
  materials: common_Material[];
  value: number;
  section: string;
  title?: string;
  // Overrides the link/unlink commit label — the "add BOM article" flow creates a line rather than
  // relinking one, so "unlink" is not a thing it can mean.
  confirmLabel?: string;
  onPick: (m?: common_Material) => void;
  onClose: () => void;
  onCreate?: () => void;
}) {
  const [q, setQ] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [supplier, setSupplier] = useState('');
  const [pending, setPending] = useState(numId(value));
  const onHand = useMaterialOnHand();

  const suppliers = useMemo(
    () =>
      Array.from(
        new Set(materials.map((m) => m.supplier?.trim()).filter((s): s is string => !!s)),
      ).sort(),
    [materials],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return materials.filter((m) => {
      if (supplier && (m.supplier ?? '').trim() !== supplier) return false;
      if (inStockOnly && !(Number(onHand.get(numId(m.id))) > 0)) return false;
      if (!needle) return true;
      return (
        (m.name ?? '').toLowerCase().includes(needle) ||
        (m.code ?? '').toLowerCase().includes(needle) ||
        (m.supplierRef ?? '').toLowerCase().includes(needle)
      );
    });
  }, [materials, q, supplier, inStockOnly, onHand]);

  const commit = () => onPick(materials.find((m) => numId(m.id) === pending));

  return (
    <ConfirmationModal
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      onConfirm={commit}
      closeOnConfirm={false}
      width='lg'
      title={`${title ?? 'link a material'}${section ? ` · ${sectionShortLabel(section)}` : ''}`}
      confirmLabel={confirmLabel ?? (pending ? 'link' : 'unlink')}
      confirmDisabled={pending === numId(value)}
    >
      <div className='flex flex-col gap-2.5'>
        <div className='flex flex-wrap items-center gap-2'>
          <div className='min-w-[10rem] flex-1'>
            <Input
              name='material-grid-q'
              value={q}
              autoComplete='off'
              placeholder='search name / code…'
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
            />
          </div>
          <ChipRow>
            {/* The section is fixed by the BOM line this dialog was opened from — the catalog query
                itself is already scoped to it, so it reads as state, not as a toggle. */}
            {section ? <Chip selected>{sectionShortLabel(section)}</Chip> : null}
            <Chip
              selected={inStockOnly}
              pressed={inStockOnly}
              onClick={() => setInStockOnly((v) => !v)}
            >
              in stock
            </Chip>
            {suppliers.map((s) => (
              <Chip
                key={s}
                selected={supplier === s}
                pressed={supplier === s}
                onClick={() => setSupplier((cur) => (cur === s ? '' : s))}
              >
                {s}
              </Chip>
            ))}
          </ChipRow>
          {numId(value) > 0 ? (
            <Button type='button' size='xs' variant='secondary' onClick={() => setPending(0)}>
              clear selection
            </Button>
          ) : null}
        </div>

        {filtered.length === 0 ? (
          <Text variant='label' size='micro'>
            no material matches these filters
          </Text>
        ) : null}

        {filtered.length === 0 && !onCreate ? (
          <Placeholder label='nothing to show' className='h-20' />
        ) : (
          <Tiles min={110}>
            {filtered.map((m) => {
              const id = numId(m.id);
              const url = materialImageUrl(m);
              const stock = onHand.get(id);
              const sub = [
                materialSpec(m),
                materialPriceLabel(m),
                stock ? `${stock}${m.unit?.trim() ? ` ${m.unit.trim()}` : ''}` : '',
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <Tile
                  key={id}
                  selected={pending === id}
                  onClick={() => setPending(id)}
                  media={
                    url ? (
                      <Media src={url} alt={m.name || 'material'} aspectRatio='1/1' fit='cover' />
                    ) : (
                      <Placeholder aspect='square' label='no image' />
                    )
                  }
                  name={m.name || `#${id}`}
                  sub={sub || m.code || '—'}
                />
              );
            })}
            {onCreate ? (
              <Tile
                dashed
                onClick={onCreate}
                className='flex min-h-[96px] flex-col items-center justify-center'
              >
                <Text size='micro' variant='label' className='uppercase'>
                  + create
                </Text>
              </Tile>
            ) : null}
          </Tiles>
        )}
      </div>
    </ConfirmationModal>
  );
}
