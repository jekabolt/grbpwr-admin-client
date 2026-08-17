import { cn } from 'lib/utility';
import { useMemo, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { Chip, ChipRow } from 'ui/components/chip';
import GenericPopover from 'ui/components/popover';
import Text from 'ui/components/text';
import { PieceShape, type FoundPiece } from './nesting/dxf-geometry';

// A cut piece a norm or an operation can point at. `lineKey` is the stable client-minted ULID the
// server resolves to the real tech_card_piece FK, so a reference survives reordering and renaming —
// unlike the free-text part name it replaced.
//
// Кратности «×N на изделие» здесь нет НАМЕРЕННО: число считается по чертежу (модалка сопоставления
// DXF), спрашивать о нём человека не о чем — а показанное в списке ВЫБОРА оно только приглашает
// спорить с чертежом. На бумаге (тех-пак, наряд, кат-лист) число остаётся: по нему кроят.
export type PieceRef = { lineKey: string; name: string };

export const normalizePieceName = (name: string) => name.trim().toLowerCase();

// The card's cut pieces, live from form state (not the server) so a piece added seconds ago on the
// PATTERNS tab is immediately selectable everywhere, without a save round-trip. Only pieces carrying
// a lineKey are offered: a reference to a piece with no stable identity cannot be resolved
// server-side, so offering one would silently drop the link on save.
export function useFormPieces(): PieceRef[] {
  const raw = (useWatch({ name: 'pieces' }) ?? []) as {
    name?: string;
    lineKey?: string;
  }[];
  return useMemo(
    () =>
      raw
        .filter((p) => !!p.lineKey?.trim())
        .map((p) => ({
          lineKey: p.lineKey as string,
          name: p.name?.trim() || 'unnamed',
        })),
    [raw],
  );
}

// Phase-02 field metrics — the picker's search box and its trigger must be indistinguishable from
// any other control on the card (1px box, 3px/7px padding, 22px min height).
const searchCls =
  'block min-h-[22px] w-full appearance-none border border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize placeholder:text-textInactiveColor focus:border-textColor focus:outline-none';

// The picker body: search + the card's pieces as a selectable list. Shared by the single and multi
// variants so выбор детали ведёт себя одинаково везде. Width and chrome belong to the popover
// shell — this renders content only.
//
// ЗАВЕСТИ деталь отсюда нельзя ни в одном варианте: деталь кроя заводит только модалка
// сопоставления DXF («↔ детали кроя» на вкладке patterns) — иначе в карточке появлялась бы деталь,
// которой нет ни в одном чертеже.
//
// Экспортируется ради карточки ткани в рецепте колорвея («назначить детали»): там выбор — тот же
// набор деталей той же карточки, и вторая реализация списка разошлась бы с этой первой же правкой
// (поиск, отметка выбранного, «деталей ещё нет»).
export function PieceList({
  pieces,
  selected,
  onToggle,
  multiple,
  shapeOf,
}: {
  pieces: PieceRef[];
  selected: string[];
  onToggle: (lineKey: string) => void;
  multiple: boolean;
  /**
   * КОНТУР ДЕТАЛИ ИЗ ЧЕРТЕЖА — включает ВИЗУАЛЬНЫЙ режим выбора (плитки вместо строк).
   *
   * Функцией, а не картой: правило свёртки ключа (`pieceRefKey`) живёт у того, кто карту собрал, и
   * вторая копия этого правила здесь однажды разошлась бы с первой — деталь просто перестала бы
   * находиться, молча и только у части имён.
   *
   * Опущено — прежний текстовый список, слово в слово. Он остаётся не «запасным вариантом», а
   * правильным ответом там, где чертежа нет вовсе (операции сборки, холодная карточка): сетка из
   * пустых рамок читалась бы как «деталей нет», а не как «контуров не загружено».
   */
  shapeOf?: (lineKey: string) => FoundPiece | null;
}) {
  const [query, setQuery] = useState('');
  const q = normalizePieceName(query);
  const matches = q ? pieces.filter((p) => normalizePieceName(p.name).includes(q)) : pieces;
  // ПЛИТКИ ТОЛЬКО ТАМ, ГДЕ ЕСТЬ ЧТО ПОКАЗАТЬ. Разбор DXF может быть холодным (рецепт его никогда не
  // запускает сам) или на карточке может не быть ни одной связи блок→деталь — тогда `shapeOf`
  // отдаёт null на всё, и сетка выродилась бы в двадцать одинаковых пустых квадратов: хуже списка
  // по всем статьям. Считается по ВСЕМ деталям, а не по отфильтрованным: режим выбора не должен
  // переключаться на середине набора символов в поиске.
  const visual = useMemo(
    () => !!shapeOf && pieces.some((p) => !!shapeOf(p.lineKey)),
    [shapeOf, pieces],
  );

  return (
    <div className='flex flex-col gap-1.5'>
      <input
        autoFocus
        className={searchCls}
        placeholder='find a piece'
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          // Этот пикер живёт внутри <form> тех-карты: без preventDefault Enter в поиске отправляет
          // ВСЮ карточку. Делать Enter'у здесь больше нечего — деталь заводит только модалка
          // сопоставления DXF, — но гасить сабмит по-прежнему обязательно.
          if (e.key === 'Enter') e.preventDefault();
        }}
      />
      {/* The list owns the scroll, not the shell, so the search field stays pinned above it. */}
      <div
        className={cn(
          'overflow-y-auto',
          visual
            ? 'grid max-h-72 grid-cols-[repeat(auto-fill,minmax(78px,1fr))] gap-1'
            : 'flex max-h-56 flex-col',
        )}
      >
        {matches.length === 0 && (
          <Text size='micro' variant='label' className={visual ? 'col-span-full' : undefined}>
            {/* Куда идти за деталью, этот попап не подсказывает намеренно: он всплывает и над
                рецептом колорвея, где вкладки patterns под рукой нет. */}
            {pieces.length === 0 ? 'no pieces yet' : 'nothing found'}
          </Text>
        )}
        {matches.map((p) => {
          const on = selected.includes(p.lineKey);
          if (!visual) {
            return (
              <button
                key={p.lineKey}
                type='button'
                aria-pressed={on}
                onClick={() => onToggle(p.lineKey)}
                className={cn(
                  'flex items-center gap-2 border-b border-hairline py-1 text-left text-textBaseSize last:border-b-0 hover:bg-bgZebra',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
                  on ? 'text-textColor' : 'text-labelColor',
                )}
              >
                <span aria-hidden className='w-3 shrink-0'>
                  {on ? (multiple ? '☑' : '●') : multiple ? '☐' : '○'}
                </span>
                <span className='truncate uppercase'>{p.name}</span>
              </button>
            );
          }
          const found = shapeOf?.(p.lineKey) ?? null;
          return (
            // ПЛИТКА: контур сверху, имя внизу полосой. Выбранная — ИНК-рамка и полоса имени,
            // залитая ink'ом с белым текстом: ровно тот же контракт «выбранного», что у Chip, и
            // читается он без цвета, одним весом. Галочки здесь нет намеренно — она дублировала бы
            // заливку и отъедала бы место у имени, которое и так короткое.
            <button
              key={p.lineKey}
              type='button'
              aria-pressed={on}
              title={`${p.name}${found ? '' : ' · not in the patterns'}`}
              onClick={() => onToggle(p.lineKey)}
              className={cn(
                'flex min-w-0 flex-col border text-left transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
                on ? 'border-textColor' : 'border-borderColor hover:border-textColor',
              )}
            >
              <span className='flex h-12 w-full items-center justify-center bg-bgColor p-1'>
                {found ? (
                  <PieceShape piece={found.piece} grainLayer='' outlineOnly />
                ) : (
                  // ДЕТАЛЬ БЕЗ КОНТУРА НАЗЫВАЕТСЯ ТАК ВСЛУХ, и это не косметика: пока она
                  // назначена этой ткани, расчёт «по выкройкам» ОТКАЗЫВАЕТ целиком (площадь
                  // изделия вышла бы неполной). Узнать это в момент выбора дешевле, чем из отказа
                  // диалога через два экрана.
                  <Text size='nano' variant='label' component='span' className='text-center'>
                    not
                    <br />in the patterns
                  </Text>
                )}
              </span>
              <span
                className={cn(
                  'block truncate border-t px-1 py-0.5 text-nano tracking-label uppercase',
                  on
                    ? 'border-textColor bg-textColor text-bgColor'
                    : 'border-hairline text-labelColor',
                )}
              >
                {p.name}
              </span>
            </button>
          );
        })}
      </div>
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
  label,
  hint,
}: {
  pieces: PieceRef[];
  value: string[];
  onChange: (next: string[]) => void;
  label?: string;
  hint?: string;
}) {
  const byKey = useMemo(() => new Map(pieces.map((p) => [p.lineKey, p])), [pieces]);
  const chosen = value.filter((k) => byKey.has(k));
  // A key that no longer resolves (its piece was deleted on the PATTERNS tab) is surfaced rather than
  // silently dropped — the save would unlink it and nobody would know which operation lost a part.
  const dangling = value.filter((k) => !byKey.has(k));

  const toggle = (lineKey: string) =>
    onChange(value.includes(lineKey) ? value.filter((k) => k !== lineKey) : [...value, lineKey]);

  const summary = chosen.map((k) => byKey.get(k)?.name).join(' + ');

  return (
    <div className='flex flex-col gap-1'>
      {label && (
        <Text size='micro' variant='label' component='span' className='uppercase'>
          {label}
        </Text>
      )}
      <ChipRow>
        {chosen.map((k) => (
          <Chip key={k} selected onRemove={() => toggle(k)}>
            {byKey.get(k)?.name}
          </Chip>
        ))}
        <GenericPopover
          title='pieces'
          className='w-64'
          triggerProps={{ className: 'flex items-center' }}
          openElement={<Chip dashed>{chosen.length === 0 ? '+ pick pieces' : '+ more'}</Chip>}
        >
          <PieceList pieces={pieces} selected={value} onToggle={toggle} multiple />
        </GenericPopover>
      </ChipRow>
      {dangling.length > 0 && (
        <Text size='micro' className='text-error'>
          {dangling.length} {dangling.length === 1 ? 'piece' : 'pieces'} deleted on the PATTERNS
          tab — pick again
        </Text>
      )}
      {hint && (
        <Text size='micro' variant='label'>
          {chosen.length > 1 ? `joins: ${summary}` : hint}
        </Text>
      )}
    </div>
  );
}

// Single-select piece picker — the shape a consumption norm needs: a norm is about exactly one
// piece (1:1, unlike an operation), so this replaces the selection instead of adding to it.
/**
 * ПИКЕР ДЕТАЛИ ЧИПОМ — для рядов, где выбранное уже показано чипами и не хватает только «добавить».
 *
 * Отличается от `PieceSinglePicker` ровно триггером: там поле во всю ширину, здесь пунктирный чип
 * в одном ряду с выбранными. Список внутри тот же, с теми же силуэтами: деталь на одном экране
 * обязана выбираться одинаково, иначе одна и та же деталь называется в двух местах по-разному.
 */
export function PieceAddChip({
  pieces,
  selected,
  onPick,
  shapeOf,
  label = '＋ piece',
}: {
  pieces: PieceRef[];
  selected: string[];
  onPick: (lineKey: string) => void;
  shapeOf?: (lineKey: string) => FoundPiece | null;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  if (pieces.length === 0) return null;
  return (
    <GenericPopover
      open={open}
      onOpenChange={setOpen}
      noTail
      className='w-64'
      triggerProps={{
        className:
          'inline-flex items-center gap-1 whitespace-nowrap border border-dashed border-borderColor bg-bgColor px-[7px] py-px text-micro uppercase tracking-pill text-labelColor transition-colors hover:text-textColor focus:border-textColor focus:outline-none',
      }}
      openElement={<span>{label}</span>}
    >
      <PieceList
        pieces={pieces}
        selected={selected}
        onToggle={(lineKey) => {
          onPick(lineKey);
          setOpen(false);
        }}
        multiple
        shapeOf={shapeOf}
      />
    </GenericPopover>
  );
}

export function PieceSinglePicker({
  pieces,
  value,
  onChange,
  placeholder = '— piece —',
  disabled,
  shapeOf,
}: {
  pieces: PieceRef[];
  value: string;
  onChange: (lineKey: string, piece?: PieceRef) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Контур из чертежа — включает выбор ПЛИТКАМИ. См. шапку PieceList: без контуров сетка пустых
   *  квадратов хуже списка, поэтому режим выбирается по наличию хотя бы одного силуэта. */
  shapeOf?: (lineKey: string) => FoundPiece | null;
}) {
  const [open, setOpen] = useState(false);
  const current = pieces.find((p) => p.lineKey === value);

  const pick = (lineKey: string) => {
    // Clicking the current selection clears it — the norm goes back to "whole garment".
    const next = lineKey === value ? '' : lineKey;
    onChange(
      next,
      pieces.find((p) => p.lineKey === next),
    );
    setOpen(false);
  };

  return (
    <GenericPopover
      open={open}
      onOpenChange={setOpen}
      // A combobox anchored flush under its own field: a tail there reads as a mistake.
      noTail
      className='w-64'
      triggerProps={{
        disabled,
        className: cn(
          'flex min-h-[22px] w-full items-center justify-between gap-2 border border-borderColor bg-bgColor px-[7px] py-[3px] text-left text-textBaseSize uppercase transition-colors focus:border-textColor focus:outline-none',
          current ? 'text-textColor' : 'text-labelColor',
          disabled && 'bg-bgZebra text-labelColor',
          !current && !!value && 'border-error text-error',
        ),
      }}
      openElement={
        <>
          <span className='truncate'>
            {current?.name ?? (value ? 'the piece was deleted — pick again' : placeholder)}
          </span>
          <span aria-hidden className='shrink-0 text-labelColor'>
            ▾
          </span>
        </>
      }
    >
      <PieceList
        pieces={pieces}
        selected={value ? [value] : []}
        onToggle={pick}
        multiple={false}
        shapeOf={shapeOf}
      />
    </GenericPopover>
  );
}
