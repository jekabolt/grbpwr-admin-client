import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_TechCardListItem } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { ReactNode, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import Text from 'ui/components/text';

// Shared building blocks for the LABELS & PKG tab (assembly-field + packaging-recipe-field): the
// auxiliary-card catalog query + labels, a url-based square thumbnail, and the square-card aux
// picker. Kept here (not in assembly-field) so both fields import from one place without a cycle.

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';

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

// A url-based square thumbnail — the twin of MaterialThumb (which takes a common_Material) for
// entities that only expose a plain image URL (aux cards). Falls back to a placeholder box so a
// card with no photo reads as "no image" instead of a broken <img>.
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
  return (
    <div
      className={cn(
        'shrink-0 overflow-hidden border border-textInactiveColor bg-bgColor',
        className,
      )}
    >
      {url ? (
        <Media src={url} alt={alt} aspectRatio='1/1' fit='cover' />
      ) : (
        <div className='flex h-full w-full items-center justify-center p-1 text-center'>
          <Text variant='inactive' size='small'>
            {placeholder}
          </Text>
        </div>
      )}
    </div>
  );
}

function SubtypeChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={cn(
        'border px-2 py-0.5 text-textBaseSize uppercase transition-colors',
        active
          ? 'border-textColor bg-textColor text-bgColor'
          : 'border-textInactiveColor text-textColor hover:border-textColor',
      )}
    >
      {children}
    </button>
  );
}

// One selectable aux card as a square card: big thumbnail + name + style № + sub-type badge.
function AuxCardTile({
  card,
  selected,
  busy,
  onPick,
}: {
  card: common_TechCardListItem;
  selected?: boolean;
  busy?: boolean;
  onPick: () => void;
}) {
  const subtype = auxSubtypeLabel(card.auxSubtype);
  return (
    <button
      type='button'
      disabled={busy}
      onClick={onPick}
      className={cn(
        'flex flex-col gap-1.5 border p-2 text-left transition-colors disabled:opacity-60',
        selected
          ? 'border-textColor bg-textColor/5'
          : 'border-textInactiveColor hover:border-textColor hover:bg-textColor/5',
      )}
    >
      <Thumb
        url={auxCardThumbUrl(card)}
        alt={card.name || 'aux card'}
        className='aspect-square w-full'
        placeholder='no image'
      />
      <div className='min-w-0 space-y-0.5'>
        <Text size='small' className='truncate'>
          {card.name || `#${card.id}`}
        </Text>
        <div className='flex flex-wrap items-center gap-1'>
          {card.styleNumber ? (
            <Text variant='inactive' size='small' className='truncate'>
              {card.styleNumber}
            </Text>
          ) : null}
          {subtype ? (
            <span className='border border-textInactiveColor px-1 text-textBaseSize uppercase leading-tight text-labelColor'>
              {subtype}
            </span>
          ) : null}
        </div>
        {busy ? (
          <Text variant='inactive' size='small'>
            resolving…
          </Text>
        ) : null}
      </div>
    </button>
  );
}

// Expressive aux-card picker (#43/#70): a searchable, sub-type-filterable grid of square cards
// (thumbnail + name) instead of a native <select>. Shared by the assembly component pick, the
// packaging-recipe "from an aux card's output" pick and the dust-bag action (initialSubtype).
export function AuxCardTilePicker({
  onPick,
  onCancel,
  initialSubtype,
  busyId,
  selectedId,
  title = 'pick an auxiliary card',
  hint,
}: {
  onPick: (card: common_TechCardListItem) => void;
  onCancel?: () => void;
  initialSubtype?: string;
  busyId?: number | null;
  selectedId?: number;
  title?: string;
  hint?: ReactNode;
}) {
  const { data, isLoading } = useAuxTechCards();
  const cards = useMemo(() => data?.techCards ?? [], [data]);
  const [q, setQ] = useState('');
  const [subtype, setSubtype] = useState<string>(initialSubtype ?? 'all');

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

  return (
    <div className='space-y-3 border border-textColor bg-textColor/5 p-3'>
      <div className='flex items-center justify-between gap-2'>
        <Text variant='uppercase' size='small'>
          {title}
        </Text>
        {onCancel && (
          <Button type='button' variant='secondary' onClick={onCancel}>
            close
          </Button>
        )}
      </div>
      {hint ? (
        <Text variant='inactive' size='small'>
          {hint}
        </Text>
      ) : null}
      <input
        className={cell}
        placeholder='search style № / name'
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      {subtypes.length > 0 && (
        <div className='flex flex-wrap gap-1'>
          <SubtypeChip active={subtype === 'all'} onClick={() => setSubtype('all')}>
            all
          </SubtypeChip>
          {subtypes.map((s) => (
            <SubtypeChip key={s} active={subtype === s} onClick={() => setSubtype(s)}>
              {auxSubtypeLabel(s)}
            </SubtypeChip>
          ))}
        </div>
      )}
      {isLoading ? (
        <Text variant='inactive' size='small'>
          loading…
        </Text>
      ) : filtered.length === 0 ? (
        <Text variant='inactive' size='small'>
          no auxiliary cards
          {subtype !== 'all' ? ` of type “${auxSubtypeLabel(subtype)}”` : ''} found — create one as
          an auxiliary tech card (purpose = auxiliary) with an output material set.
        </Text>
      ) : (
        <div className='grid max-h-80 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4'>
          {filtered.map((c) => (
            <AuxCardTile
              key={c.id}
              card={c}
              selected={selectedId === c.id}
              busy={busyId === c.id}
              onPick={() => onPick(c)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
