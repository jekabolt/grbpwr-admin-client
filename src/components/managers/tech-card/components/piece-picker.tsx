import * as Popover from '@radix-ui/react-popover';
import { cn } from 'lib/utility';
import { useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import Text from 'ui/components/text';
import { ulid } from 'utils/ulid';
import { TechCardFormData } from './schema';

// A cut piece a norm or an operation can point at. `lineKey` is the stable client-minted ULID the
// server resolves to the real tech_card_piece FK, so a reference survives reordering and renaming —
// unlike the free-text part name it replaced.
export type PieceRef = { lineKey: string; name: string };

export const normalizePieceName = (name: string) => name.trim().toLowerCase();

// The card's cut pieces, live from form state (not the server) so a piece added seconds ago on the
// PIECES tab — or inline from a picker below — is immediately selectable everywhere, without a save
// round-trip. Only pieces carrying a lineKey are offered: a reference to a piece with no stable
// identity cannot be resolved server-side, so offering one would silently drop the link on save.
export function useFormPieces(): PieceRef[] {
  const raw = (useWatch({ name: 'pieces' }) ?? []) as { name?: string; lineKey?: string }[];
  return useMemo(
    () =>
      raw
        .filter((p) => !!p.lineKey?.trim())
        .map((p) => ({ lineKey: p.lineKey as string, name: p.name?.trim() || 'без названия' })),
    [raw],
  );
}

// Creates a cut piece from a picker without leaving the tab it's on, and returns its lineKey.
// Discovering a part you forgot to declare is exactly what happens while writing an operation or a
// norm; making that a trip to the PIECES tab loses the thought.
//
// A name that already exists is NEVER created a second time — the existing piece's key comes back
// instead. Two pieces sharing a name make every reference to "полочка" ambiguous to the human
// reading the factory sheet, and the server rejects the save for the same reason.
export function useCreatePiece(): (name: string) => string {
  const { getValues, setValue } = useFormContext<TechCardFormData>();
  return (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return '';
    const pieces = (getValues('pieces') ?? []) as { name?: string; lineKey?: string }[];
    const existing = pieces.find(
      (p) => normalizePieceName(p.name ?? '') === normalizePieceName(trimmed) && p.lineKey?.trim(),
    );
    if (existing?.lineKey) return existing.lineKey;
    const lineKey = ulid();
    setValue(
      'pieces',
      ([
        ...((pieces as unknown) as Record<string, unknown>[]),
        {
          name: trimmed,
          lineKey,
          piecesPerGarment: 1,
          mirrored: false,
          grainline: '',
          fused: false,
          calloutNumber: 0,
          note: '',
          materials: [],
        },
      ] as unknown) as TechCardFormData['pieces'],
      { shouldDirty: true },
    );
    return lineKey;
  };
}

const inputCls =
  'w-full border border-textInactiveColor bg-transparent px-2 py-1 text-textBaseSize outline-none';

// The picker body: search + the card's pieces as a selectable list + a create row for a name that
// isn't there yet. Shared by the single and multi variants so "выбрать или создать" behaves
// identically everywhere a piece is chosen.
function PieceList({
  pieces,
  selected,
  onToggle,
  allowCreate,
  onCreate,
  multiple,
}: {
  pieces: PieceRef[];
  selected: string[];
  onToggle: (lineKey: string) => void;
  allowCreate: boolean;
  onCreate: (name: string) => void;
  multiple: boolean;
}) {
  const [query, setQuery] = useState('');
  const q = normalizePieceName(query);
  const matches = q ? pieces.filter((p) => normalizePieceName(p.name).includes(q)) : pieces;
  const exact = pieces.some((p) => normalizePieceName(p.name) === q);
  const canCreate = allowCreate && !!q && !exact;

  const create = () => {
    if (!canCreate) return;
    onCreate(query.trim());
    setQuery('');
  };

  return (
    <div className='flex w-64 flex-col gap-2'>
      <input
        autoFocus
        className={inputCls}
        placeholder='найти или создать деталь'
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          // This picker lives inside the tech-card <form>: without preventDefault, Enter submits
          // the whole card instead of creating the piece.
          if (e.key === 'Enter') {
            e.preventDefault();
            create();
          }
        }}
      />
      <div className='flex max-h-56 flex-col overflow-y-auto'>
        {matches.length === 0 && !canCreate && (
          <Text variant='inactive' size='small'>
            {pieces.length === 0 ? 'деталей ещё нет — введите название выше' : 'ничего не найдено'}
          </Text>
        )}
        {matches.map((p) => {
          const on = selected.includes(p.lineKey);
          return (
            <button
              key={p.lineKey}
              type='button'
              aria-pressed={on}
              onClick={() => onToggle(p.lineKey)}
              className={cn(
                'flex items-center gap-2 px-1 py-1 text-left text-textBaseSize hover:bg-textInactiveColor/20',
                on ? 'text-text' : 'text-labelColor',
              )}
            >
              <span className='w-4 shrink-0'>{on ? (multiple ? '☑' : '●') : multiple ? '☐' : '○'}</span>
              <span className='truncate uppercase'>{p.name}</span>
            </button>
          );
        })}
      </div>
      {canCreate && (
        <button
          type='button'
          onClick={create}
          className='border border-textInactiveColor px-2 py-1 text-left text-textBaseSize uppercase hover:bg-textInactiveColor/20'
        >
          + создать «{query.trim()}»
        </button>
      )}
    </div>
  );
}

// Multi-select piece picker — the shape an assembly operation needs: one operation JOINS several
// pieces (a shoulder seam takes the front and the back), so the selection is a set, shown as
// «полочка + спинка» to read the way the operation actually works.
export function PieceMultiPicker({
  pieces,
  value,
  onChange,
  onCreate,
  label,
  hint,
}: {
  pieces: PieceRef[];
  value: string[];
  onChange: (next: string[]) => void;
  // Omitted where pieces aren't editable from this screen (the colourway recipe edits through its
  // own RPC and can't author a piece) — the picker then only selects.
  onCreate?: (name: string) => string;
  label?: string;
  hint?: string;
}) {
  const byKey = useMemo(() => new Map(pieces.map((p) => [p.lineKey, p])), [pieces]);
  const chosen = value.filter((k) => byKey.has(k));
  // A key that no longer resolves (its piece was deleted on the PIECES tab) is surfaced rather than
  // silently dropped — the save would unlink it and nobody would know which operation lost a part.
  const dangling = value.filter((k) => !byKey.has(k));

  const toggle = (lineKey: string) =>
    onChange(
      value.includes(lineKey) ? value.filter((k) => k !== lineKey) : [...value, lineKey],
    );

  const summary = chosen.map((k) => byKey.get(k)?.name).join(' + ');

  return (
    <div className='flex flex-col gap-1'>
      {label && (
        <Text variant='label' size='small'>
          {label}
        </Text>
      )}
      <div className='flex flex-wrap items-center gap-1.5'>
        {chosen.map((k) => (
          <span
            key={k}
            className='flex items-center gap-1 border border-textColor bg-textColor px-2 py-0.5 text-textBaseSize uppercase text-bgColor'
          >
            {byKey.get(k)?.name}
            <button
              type='button'
              aria-label={`убрать ${byKey.get(k)?.name}`}
              onClick={() => toggle(k)}
              className='leading-none'
            >
              ✕
            </button>
          </span>
        ))}
        <Popover.Root>
          <Popover.Trigger className='border border-textInactiveColor px-2 py-0.5 text-textBaseSize uppercase text-labelColor hover:text-text'>
            {chosen.length === 0 ? '+ выбрать детали' : '+ ещё'}
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              side='bottom'
              align='start'
              sideOffset={4}
              className='z-30 border border-textInactiveColor bg-bgColor p-2'
            >
              <PieceList
                pieces={pieces}
                selected={value}
                onToggle={toggle}
                allowCreate={!!onCreate}
                multiple
                onCreate={(name) => {
                  const key = onCreate?.(name);
                  if (key && !value.includes(key)) onChange([...value, key]);
                }}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
      {dangling.length > 0 && (
        <Text size='small' className='text-error'>
          {dangling.length} деталь(и) удалены с вкладки PIECES — выберите заново
        </Text>
      )}
      {hint && (
        <Text variant='inactive' size='small'>
          {chosen.length > 1 ? `соединяет: ${summary}` : hint}
        </Text>
      )}
    </div>
  );
}

// Single-select piece picker — the shape a consumption norm needs: a norm is about exactly one
// piece (1:1, unlike an operation), so this replaces the selection instead of adding to it.
export function PieceSinglePicker({
  pieces,
  value,
  onChange,
  onCreate,
  placeholder = '— деталь —',
  disabled,
}: {
  pieces: PieceRef[];
  value: string;
  onChange: (lineKey: string, piece?: PieceRef) => void;
  onCreate?: (name: string) => string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = pieces.find((p) => p.lineKey === value);

  const pick = (lineKey: string) => {
    // Clicking the current selection clears it — the norm goes back to "whole garment".
    const next = lineKey === value ? '' : lineKey;
    onChange(next, pieces.find((p) => p.lineKey === next));
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        disabled={disabled}
        className={cn(
          'w-full border border-textInactiveColor px-2 py-1 text-left text-textBaseSize uppercase',
          current ? 'text-text' : 'text-labelColor',
          disabled && 'opacity-50',
        )}
      >
        {current?.name ?? (value ? 'деталь удалена — выберите заново' : placeholder)}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side='bottom'
          align='start'
          sideOffset={4}
          className='z-30 border border-textInactiveColor bg-bgColor p-2'
        >
          <PieceList
            pieces={pieces}
            selected={value ? [value] : []}
            onToggle={pick}
            allowCreate={!!onCreate}
            multiple={false}
            onCreate={(name) => {
              const key = onCreate?.(name);
              if (key) pick(key);
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
