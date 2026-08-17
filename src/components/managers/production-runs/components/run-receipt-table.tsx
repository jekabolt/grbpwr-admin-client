import { common_ProductionRunLine } from 'api/proto-http/admin';
import { DataTable, EmptyCell, TotalRow } from 'ui/components/data-table';
import Text from 'ui/components/text';

// What was actually counted, in the SAME orientation as the plan grid (colour-model in rows,
// sizes in columns) — until now these numbers existed only inside the receive modal, so "how much
// of this batch has landed" could not be answered without opening a dialog that posts stock.
// Read-only: the receipt itself stays a modal, because it moves stock and must be confirmed.
//
// The figures come from the same fields the receive modal reads: the plan lines'
// planned/received/defect quantities, which the server rolls up across every receipt of the run.
//
// «осталось» is therefore computed the SAME way the modal computes its remainder — clamped at zero
// PER LINE and only then summed (receive-modal.tsx `remainderAfterThis`). Clamping after the sum
// would let an over-received size absorb an undelivered one: S plan 10 / received 15 and M plan 10
// / received 0 is «осталось 10» to the modal and would be «осталось 5» to a Σ-then-clamp, i.e. two
// different remainders for one batch. `left` is accumulated, never derived from the totals.
type Cell = { planned: number; received: number; defect: number; left: number };
type Row = { key: number; label: string; cells: Map<number, Cell>; total: Cell };

const empty = (): Cell => ({ planned: 0, received: 0, defect: 0, left: 0 });
const merge = (into: Cell, c: Cell) => {
  into.planned += c.planned;
  into.received += c.received;
  into.defect += c.defect;
  into.left += c.left;
};
// received counts GOOD units only, so one line's outstanding quantity is plan − good; defects are a
// separate count and never reduce the remainder (the same convention the receive modal uses).
const add = (into: Cell, l: common_ProductionRunLine) => {
  const planned = l.plannedQty ?? 0;
  const received = l.receivedQty ?? 0;
  merge(into, {
    planned,
    received,
    defect: l.defectQty ?? 0,
    left: Math.max(0, planned - received),
  });
};

export function RunReceiptTable({
  lines,
  sizeOrder = [],
  sizeLabel,
  rowHeader,
  rowLabel,
  groupBy,
}: {
  lines: common_ProductionRunLine[];
  /** Preferred column order (the card's size grade); anything else follows in first-seen order. */
  sizeOrder?: number[];
  sizeLabel: (sizeId: number) => string;
  /** Heading of the first column — what a row IS here. */
  rowHeader: string;
  rowLabel: (id: number) => string;
  /** A sellable run groups by product; an auxiliary one by output colour (it has neither). */
  groupBy: 'product' | 'variant';
}) {
  const keyOf = (l: common_ProductionRunLine) =>
    (groupBy === 'variant' ? l.outputVariantId : l.productId) ?? 0;

  // Columns: only sizes this run actually plans. An auxiliary run has none, and the table
  // degenerates to its totals — which is exactly right, an aux line has no size.
  const seen: number[] = [];
  for (const l of lines) {
    const s = l.sizeId ?? 0;
    if (s > 0 && !seen.includes(s)) seen.push(s);
  }
  const columns = [
    ...sizeOrder.filter((s) => seen.includes(s)),
    ...seen.filter((s) => !sizeOrder.includes(s)),
  ];

  const rows: Row[] = [];
  for (const l of lines) {
    const k = keyOf(l);
    let r = rows.find((x) => x.key === k);
    if (!r) {
      r = { key: k, label: rowLabel(k), cells: new Map(), total: empty() };
      rows.push(r);
    }
    const s = l.sizeId ?? 0;
    if (!r.cells.has(s)) r.cells.set(s, empty());
    add(r.cells.get(s)!, l);
    add(r.total, l);
  }

  const colTotal = (sizeId: number): Cell => {
    const acc = empty();
    for (const r of rows) {
      const c = r.cells.get(sizeId);
      if (c) merge(acc, c);
    }
    return acc;
  };
  const grand = rows.reduce((acc, r) => {
    merge(acc, r.total);
    return acc;
  }, empty());

  if (rows.length === 0)
    return (
      <Text variant='inactive' size='small'>
        no lines — the run plan is empty
      </Text>
    );

  return (
    <DataTable variant='grid'>
      <thead>
        <tr>
          <th>{rowHeader}</th>
          {columns.map((s) => (
            <th key={s}>{sizeLabel(s)}</th>
          ))}
          <th>Σ planned</th>
          <th>received</th>
          <th>left</th>
          <th>defect</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>{r.label}</td>
            {columns.map((s) => {
              const c = r.cells.get(s);
              return (
                <td key={s}>
                  {c ? (
                    <>
                      {c.received}/{c.planned}
                      {c.defect > 0 ? (
                        <Text size='micro' variant='label' className='uppercase'>
                          defect {c.defect}
                        </Text>
                      ) : null}
                    </>
                  ) : (
                    <EmptyCell />
                  )}
                </td>
              );
            })}
            <td>{r.total.planned}</td>
            <td>{r.total.received}</td>
            <td>{r.total.left}</td>
            <td className={r.total.defect > 0 ? 'text-error' : undefined}>{r.total.defect}</td>
          </tr>
        ))}
        <TotalRow>
          <td>Σ</td>
          {columns.map((s) => {
            const c = colTotal(s);
            return <td key={s}>{`${c.received}/${c.planned}`}</td>;
          })}
          <td>{grand.planned}</td>
          <td>{grand.received}</td>
          <td>{grand.left}</td>
          <td className={grand.defect > 0 ? 'text-error' : undefined}>{grand.defect}</td>
        </TotalRow>
      </tbody>
    </DataTable>
  );
}
