// МАТРИЦА ЛИНИЙ — колорвей × размер, плановые количества изделий.
//
// Единственный источник тиража во всём наряде: кат-лист и настилы ниже считаются от него. Ни
// выпущенного, ни брака здесь нет и быть не может — наряд это задание на партию, а не отчёт по ней.
import { DataTable, EmptyCell, TotalRow } from 'ui/components/data-table';
import Text from 'ui/components/text';
import { lineKeyOf, lineLabelOf } from './labels';
import { RpLine, RpSize } from './manifest';
import { DESC_CELL, RUNPACK_GRID } from './table';

const sizeHead = (s: RpSize): string =>
  (s.name ?? '').trim() || ((s.id ?? 0) > 0 ? `#${s.id}` : 'no size');

export function LinesMatrix({
  lines,
  axis,
  total,
  lineTotal,
}: {
  lines: RpLine[];
  axis: RpSize[];
  total: number;
  lineTotal: (key: string) => number;
}) {
  if (lines.length === 0 || axis.length === 0) {
    return (
      <Text component='p'>
        the selected subset has no “colourway × size” cell at all. until it has one, there is nothing
        for the cut list below to be counted from.
      </Text>
    );
  }

  const colTotal = (id: number) =>
    lines.reduce(
      (a, l) => a + ((l.by_size ?? []).find((c) => (c.size_id ?? 0) === id)?.planned_qty ?? 0),
      0,
    );

  return (
    <DataTable variant='grid' className={RUNPACK_GRID}>
      <thead>
        <tr>
          <th>colourway</th>
          {axis.map((s) => (
            <th key={s.id}>{sizeHead(s)}</th>
          ))}
          <th>Σ</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => {
          const key = lineKeyOf(l);
          const cells = new Map((l.by_size ?? []).map((c) => [c.size_id ?? 0, c.planned_qty ?? 0]));
          return (
            <tr key={key}>
              <td className={`${DESC_CELL} font-medium`}>{lineLabelOf(l)}</td>
              {axis.map((s) => {
                const v = cells.get(s.id ?? 0);
                return (
                  <td key={s.id}>
                    {/* «·» — клетки в плане нет. Нолём её печатать нельзя: «не запланировано» и
                        «запланировано ноль» — разные утверждения, и второе есть указание не шить. */}
                    {v === undefined ? (
                      <EmptyCell>·</EmptyCell>
                    ) : (
                      <Text size='stat' component='span'>
                        {v}
                      </Text>
                    )}
                  </td>
                );
              })}
              <td className='font-bold'>{lineTotal(key)}</td>
            </tr>
          );
        })}
        <TotalRow>
          <td className='uppercase'>Σ</td>
          {axis.map((s) => (
            <td key={s.id}>{colTotal(s.id ?? 0) || <EmptyCell>·</EmptyCell>}</td>
          ))}
          <td>{total}</td>
        </TotalRow>
      </tbody>
    </DataTable>
  );
}
