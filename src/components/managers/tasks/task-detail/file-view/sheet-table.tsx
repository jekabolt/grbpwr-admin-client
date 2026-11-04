import { memo, useLayoutEffect, useRef, type MouseEvent } from 'react';
import { Input, Text } from 'ui';
import { columnLabel, looksNumeric, type TableCell } from './file-view';
import { inkOn, type Sheet } from './sheet';
import { addressOf, parseAddress, type SheetBook } from './sheet-edit';

const CELL = 'border-b border-r border-borderColor px-1.5 py-0.5';
// Отступ прокрутки: ячейка не должна встать под закреплённые шапку и номер строки.
const CELL_ACTIVE = 'scroll-ml-8 scroll-mt-12 border-b border-r border-borderColor p-0';
const EDGE = `${CELL} sticky bg-pageBg text-labelColor`;

type Overlay = { text: string; changed: boolean };

export type SheetEditing = {
  book: SheetBook;
  bookIndex: number;
  draft: Record<string, string>;
  totals: ReadonlyMap<string, number>;
  sel: string | null;
  /** Поле ввода, если оно у этой таблицы. */
  active: string | null;
  press: (addr: string) => void;
  setCell: (addr: string, text: string) => void;
  revertCell: () => void;
  move: (dx: number, dy: number) => void;
};

/**
 * Первая строка закреплена, как шапка в Excel. Top 24 = высота строки с буквами колонок.
 *
 * Строки мемоизированы: на клавишу в таблице на 5000 строк перерисовывается только строка ячейки и
 * строки с пересчитанным итогом.
 */
export function SheetTable({ sheet, editing }: { sheet: Sheet; editing?: SheetEditing }) {
  const rows = sheet.rows;
  const originRow = sheet.originRow ?? 0;
  const originCol = sheet.originCol ?? 0;
  const width = rows.reduce((max, r) => Math.max(max, r.length), 0);

  const overlays = new Map<number, Map<number, Overlay>>();
  if (editing) {
    const put = (addr: string, overlay: Overlay) => {
      const at = parseAddress(addr);
      if (!at) return;
      const row = overlays.get(at.r - originRow) ?? new Map<number, Overlay>();
      row.set(at.c - originCol, overlay);
      overlays.set(at.r - originRow, row);
    };
    for (const [addr, text] of Object.entries(editing.draft)) put(addr, { text, changed: true });
    for (const [addr, value] of editing.totals) {
      const text = String(value);
      if (text !== editing.book.cell(editing.bookIndex, addr).input) {
        put(addr, { text, changed: false });
      }
    }
  }

  const sel = editing ? parseAddress(editing.sel ?? '') : null;
  const active = editing ? parseAddress(editing.active ?? '') : null;

  const pressed = (event: MouseEvent<HTMLTableSectionElement>) => {
    if (!editing || !(event.target instanceof Element)) return;
    if (event.target.closest('input')) return;
    const addr = event.target.closest('td')?.getAttribute('data-a');
    if (!addr) return;
    // Иначе фокус уходит из поля раньше, чем откроется следующее, и прокрутка прыгает.
    event.preventDefault();
    editing.press(addr);
  };

  return (
    <table className='min-w-full border-separate border-spacing-0 text-textBaseSize'>
      <thead>
        <tr>
          <th className={`${EDGE} left-0 top-0 z-[3] h-6`} />
          {Array.from({ length: width }, (_, c) => (
            <th key={c} className={`${EDGE} top-0 z-[2] h-6 text-center font-normal`}>
              {columnLabel(c + originCol)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody onMouseDown={editing ? pressed : undefined}>
        {rows.map((row, r) => {
          const overlay = overlays.get(r);
          return (
            <SheetRow
              key={r}
              row={row}
              r={r}
              width={width}
              originRow={originRow}
              originCol={originCol}
              overlay={overlay}
              signature={overlay ? JSON.stringify([...overlay]) : ''}
              selCol={sel && sel.r - originRow === r ? sel.c - originCol : -1}
              activeCol={active && active.r - originRow === r ? active.c - originCol : -1}
              book={editing?.book}
              bookIndex={editing?.bookIndex ?? -1}
              editing={editing}
            />
          );
        })}
      </tbody>
    </table>
  );
}

type RowProps = {
  row: TableCell[];
  r: number;
  width: number;
  originRow: number;
  originCol: number;
  overlay: Map<number, Overlay> | undefined;
  signature: string;
  selCol: number;
  activeCol: number;
  book: SheetBook | undefined;
  bookIndex: number;
  editing: SheetEditing | undefined;
};

const SheetRow = memo(
  function SheetRow({
    row,
    r,
    width,
    originRow,
    originCol,
    overlay,
    selCol,
    activeCol,
    book,
    bookIndex,
    editing,
  }: RowProps) {
    return (
      <tr>
        <th
          className={`${EDGE} left-0 text-right font-normal ${r === 0 ? 'top-6 z-[3]' : 'z-[1]'}`}
        >
          {r + originRow + 1}
        </th>
        {Array.from({ length: width }, (_, c) => {
          const cell = row[c];
          const addr = addressOf(r + originRow, c + originCol);
          const over = overlay?.get(c);
          const text = over ? over.text : cell?.text;
          const numeric = over ? looksNumeric(over.text) : cell?.numeric;
          const locked = !!book && book.cell(bookIndex, addr).locked;
          const isActive = activeCol === c;
          const paint = cell?.fill && !over?.changed;
          return (
            <td
              key={c}
              data-a={addr}
              style={
                paint && cell.fill
                  ? { backgroundColor: `#${cell.fill}`, color: inkOn(cell.fill) }
                  : undefined
              }
              className={[
                isActive ? CELL_ACTIVE : CELL,
                'whitespace-nowrap',
                over?.changed ? 'bg-changed text-textColor' : 'bg-bgColor',
                numeric ? 'text-right tabular-nums' : 'text-left',
                r === 0 ? 'sticky top-6 z-[1]' : '',
                book && locked ? 'sheet-locked' : '',
                book && !locked ? 'cursor-cell' : '',
                over?.changed && !isActive && selCol !== c
                  ? 'outline outline-1 -outline-offset-1 outline-textColor'
                  : '',
                isActive || selCol === c
                  ? 'outline outline-2 -outline-offset-2 outline-textColor'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {isActive && editing ? (
                <CellInput
                  addr={addr}
                  value={editing.draft[addr] ?? editing.book.cell(bookIndex, addr).input}
                  editing={editing}
                  alignRight={!!numeric}
                />
              ) : (
                text
              )}
            </td>
          );
        })}
      </tr>
    );
  },
  (a, b) =>
    a.row === b.row &&
    a.r === b.r &&
    a.width === b.width &&
    a.originRow === b.originRow &&
    a.originCol === b.originCol &&
    a.signature === b.signature &&
    a.selCol === b.selCol &&
    a.activeCol === b.activeCol &&
    a.book === b.book &&
    a.bookIndex === b.bookIndex &&
    // Ячейка с полем ввода зовёт свежие обработчики, остальным они не нужны.
    (a.activeCol < 0 || a.editing === b.editing),
);

function CellInput({
  addr,
  value,
  editing,
  alignRight,
}: {
  addr: string;
  value: string;
  editing: SheetEditing;
  alignRight: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);

  // Только при открытии ячейки: `select()` на каждой клавише стирал бы набранное следующей.
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    input.select();
    input.closest('td')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [addr]);

  return (
    <Input
      ref={ref}
      size={1}
      autoComplete='off'
      aria-label={addr}
      value={value}
      className={`h-[1.1875rem] min-h-0 min-w-[6ch] border-0 bg-bgColor px-1.5 py-0 text-textBaseSize text-textColor ${
        alignRight ? 'text-right' : 'text-left'
      }`}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
        editing.setCell(addr, event.target.value)
      }
      onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          editing.move(0, event.shiftKey ? -1 : 1);
        } else if (event.key === 'Tab') {
          event.preventDefault();
          editing.move(event.shiftKey ? -1 : 1, 0);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          editing.revertCell();
        }
      }}
    />
  );
}

export function Centered({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className='flex h-full flex-col items-center justify-center gap-2 p-4'>
      <Text size='micro' variant='label' component='span'>
        {label}
      </Text>
      {children}
    </div>
  );
}
