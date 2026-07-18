import { common_Material } from 'api/proto-http/admin';
import { techCardBomSectionOptions } from 'constants/filter';
import { cn } from 'lib/utility';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Text from 'ui/components/text';
import { MaterialThumb } from './material-thumb';
import { useMaterials } from './useMaterials';

const sectionLabel = (v?: string): string =>
  techCardBomSectionOptions.find((o) => o.value === v)?.label ?? '';

// The picked material's one-line identity: "CODE · Name" (code dropped when absent).
const materialLabel = (m: common_Material): string =>
  `${m.code ? `${m.code} · ` : ''}${m.name ?? `#${m.id}`}`;

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

// Reusable material chooser: a searchable combobox over the (non-archived) catalog. Each option
// carries the material's thumbnail + name + code + section, so the operator recognises the article
// by its photo, not just a code. Shared by the warehouse movement modals (W1.5), aux output
// material (W4) and anywhere a BOM line links a catalog Material. Props are unchanged from the
// former native <select> so every call site keeps working.
export function MaterialPicker({
  value,
  onChange,
  section = '',
  disabled,
  placeholder = 'link a material',
  includeArchived = false,
}: {
  value: number;
  onChange: (materialId: number, material?: common_Material) => void;
  section?: string; // UI enum constant to pre-narrow the catalog (e.g. packaging for aux output)
  disabled?: boolean;
  placeholder?: string;
  // Filter contexts (e.g. the movements ledger) set this so a URL pointing at an archived
  // material still shows as the active selection instead of a blank placeholder.
  includeArchived?: boolean;
}) {
  const { data, isLoading } = useMaterials(section, includeArchived);
  const materials = useMemo(() => data?.materials ?? [], [data]);
  const selected = useMemo(() => materials.find((m) => m.id === value), [materials, value]);

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
        m.id === value ||
        (m.name ?? '').toLowerCase().includes(needle) ||
        (m.code ?? '').toLowerCase().includes(needle) ||
        (m.supplierRef ?? '').toLowerCase().includes(needle),
    );
  }, [materials, q, value]);

  const openMenu = () => {
    if (disabled) return;
    if (triggerRef.current) setAnchor(computeAnchor(triggerRef.current));
    setOpen(true);
  };
  const closeMenu = (focusTrigger = true) => {
    setOpen(false);
    if (focusTrigger) requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const choose = (m?: common_Material) => {
    onChange(m?.id ?? 0, m);
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
    if (!open) return;
    const sel = filtered.findIndex((m) => m.id === value);
    setActiveIndex(sel >= 0 ? sel : 0);
    const raf1 = requestAnimationFrame(() => setEntered(true));
    const raf2 = requestAnimationFrame(() => searchRef.current?.focus());
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A new query re-filters from the top.
  useEffect(() => setActiveIndex(0), [q]);

  // Track the trigger through scroll/resize (the picker often sits inside a scrollable modal body).
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => triggerRef.current && setAnchor(computeAnchor(triggerRef.current));
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  // Close on an outside pointer / focus (Tab-away) — Escape and selection close from the keyboard.
  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  // Keep the highlighted option scrolled into view during keyboard nav.
  useEffect(() => {
    if (open) document.getElementById(optId(activeIndex))?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, open]);

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
        aria-haspopup='listbox'
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-2 border-b border-textInactiveColor bg-bgColor py-1 text-left text-textBaseSize transition-colors',
          'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        {selected ? <MaterialThumb material={selected} size='sm' /> : null}
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
        <Text component='span' variant='inactive' className='shrink-0 px-1'>
          {open ? '▴' : '▾'}
        </Text>
      </button>

      {!isLoading && materials.length === 0 ? (
        <Text variant='label' size='small'>
          no materials in catalog
        </Text>
      ) : null}

      {open && anchor
        ? createPortal(
            <div
              ref={popRef}
              className={cn(
                'fixed z-[var(--z-popover)] flex flex-col overflow-hidden border border-textInactiveColor bg-bgColor',
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
              <div className='border-b border-textInactiveColor p-1.5'>
                <input
                  ref={searchRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={onSearchKeyDown}
                  placeholder='search name / code…'
                  role='combobox'
                  aria-expanded={open}
                  aria-controls={listId}
                  aria-activedescendant={activeDescendant}
                  className='w-full bg-bgColor px-1 py-1 text-textBaseSize placeholder:text-labelColor focus:outline-none'
                />
              </div>

              <div id={listId} role='listbox' className='min-h-0 flex-1 overflow-auto'>
                {value > 0 ? (
                  <button
                    type='button'
                    onClick={() => choose(undefined)}
                    className='flex w-full items-center gap-2 px-2 py-1.5 text-left text-labelColor hover:bg-[rgba(0,0,0,0.06)]'
                  >
                    <span className='flex h-8 w-8 shrink-0 items-center justify-center'>✕</span>
                    <Text component='span' variant='label' size='small'>
                      clear selection
                    </Text>
                  </button>
                ) : null}

                {filtered.length === 0 ? (
                  <div className='px-2 py-3'>
                    <Text variant='label' size='small'>
                      {q.trim() ? 'no matches' : 'no materials'}
                    </Text>
                  </div>
                ) : (
                  filtered.map((m, idx) => {
                    const isSelected = m.id === value;
                    const meta = [m.code, sectionLabel(m.section), m.archived ? 'archived' : '']
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <button
                        key={m.id}
                        id={optId(idx)}
                        type='button'
                        role='option'
                        aria-selected={isSelected}
                        onMouseMove={() => setActiveIndex(idx)}
                        onClick={() => choose(m)}
                        className={cn(
                          'flex w-full items-center gap-2.5 px-2 py-1.5 text-left',
                          idx === activeIndex && 'bg-[rgba(0,0,0,0.08)]',
                        )}
                      >
                        <MaterialThumb material={m} size='sm' />
                        <span className='min-w-0 flex-1'>
                          <Text size='small' className='truncate'>
                            {m.name || `#${m.id}`}
                          </Text>
                          <Text variant='label' size='small' className='truncate'>
                            {meta || '—'}
                          </Text>
                        </span>
                        {isSelected ? (
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
