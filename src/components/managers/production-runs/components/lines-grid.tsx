import { common_ProductionRun, common_ProductionRunLine } from 'api/proto-http/admin';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { ROUTES } from 'constants/routes';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { useUpdateRunSection } from './useProductionRuns';

const cell = 'border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize';
const key = (productId: number, sizeId: number) => `${productId}:${sizeId}`;

type Row = { productId: number; label: string };

// Editable colour-model × size grid (NF-06). Rows are the run's products/colourways, columns the
// tech card's size grade; each cell is a planned quantity. Saved via read-modify-write so it never
// clobbers the marker / costs sections. A colourway that isn't published as a product yet is a
// single "unassigned" row — the contract keys lines by (product_id, size_id), so receive later
// needs a product on every counted line (guarded in W2.6).
export function LinesGrid({
  run,
  canEdit,
  locked,
}: {
  run: common_ProductionRun;
  canEdit: boolean;
  locked: boolean;
}) {
  const { dictionary } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const { pathname, search } = useLocation();
  const update = useUpdateRunSection();
  const editable = canEdit && !locked;

  const { data: techCard } = useTechCard(run.run?.techCardId ? run.run.techCardId : undefined);
  const colorways = useMemo(() => techCard?.techCard?.colorways ?? [], [techCard]);
  const cardSizeIds = useMemo(() => techCard?.techCard?.sizeIds ?? [], [techCard]);
  const sizeQuantities = useMemo(() => techCard?.techCard?.sizeQuantities ?? [], [techCard]);

  const lines = useMemo(() => run.run?.lines ?? [], [run]);

  // Columns: the card's size grade, plus any size already on a line that isn't in the grade.
  const columns = useMemo(() => {
    const extra = lines.map((l) => l.sizeId ?? 0).filter((s) => s > 0 && !cardSizeIds.includes(s));
    return [...cardSizeIds, ...Array.from(new Set(extra))];
  }, [cardSizeIds, lines]);

  const labelFor = useMemo(
    () => (productId: number) => {
      const cw = colorways.find((c) => (c.productId ?? 0) === productId && productId > 0);
      if (cw) return `${cw.code ? `${cw.code} · ` : ''}${cw.name ?? `#${productId}`}`;
      return productId > 0 ? `#${productId}` : '(unassigned)';
    },
    [colorways],
  );

  const [rows, setRows] = useState<Row[]>([]);
  const [qty, setQty] = useState<Record<string, string>>({});

  // Load the grid from the run's lines (distinct products, in first-seen order).
  useEffect(() => {
    const seen: number[] = [];
    const q: Record<string, string> = {};
    for (const l of lines) {
      const pid = l.productId ?? 0;
      if (!seen.includes(pid)) seen.push(pid);
      q[key(pid, l.sizeId ?? 0)] = String(l.plannedQty ?? 0);
    }
    setRows(seen.map((pid) => ({ productId: pid, label: labelFor(pid) })));
    setQty(q);
  }, [lines, labelFor]);

  const addable = colorways.filter((c) => {
    const pid = c.productId ?? 0;
    return pid > 0 ? !rows.some((r) => r.productId === pid) : !rows.some((r) => r.productId === 0);
  });

  const addRow = (colorwayIndex: number) => {
    const c = colorways[colorwayIndex];
    if (!c) return;
    const pid = c.productId ?? 0;
    if (rows.some((r) => r.productId === pid)) return;
    setRows((prev) => [
      ...prev,
      { productId: pid, label: `${c.code ? `${c.code} · ` : ''}${c.name ?? '(unassigned)'}` },
    ]);
  };

  const removeRow = (productId: number) => {
    setRows((prev) => prev.filter((r) => r.productId !== productId));
    setQty((prev) => {
      const next = { ...prev };
      columns.forEach((s) => delete next[key(productId, s)]);
      return next;
    });
  };

  // Stamp the card's per-size order quantities onto every current row (R-3). Each colourway gets
  // the whole size run; the planner splits it by hand afterwards.
  const prefillFromSizeRun = () => {
    if (rows.length === 0) {
      showMessage('Add a colour-model first, then prefill', 'error');
      return;
    }
    setQty(() => {
      const q: Record<string, string> = {};
      rows.forEach((r) =>
        sizeQuantities.forEach((sq) => {
          if (sq.sizeId && sq.orderQty) q[key(r.productId, sq.sizeId)] = String(sq.orderQty);
        }),
      );
      return q;
    });
  };

  const rowTotal = (productId: number) =>
    columns.reduce((sum, s) => sum + (Number(qty[key(productId, s)]) || 0), 0);
  const colTotal = (sizeId: number) =>
    rows.reduce((sum, r) => sum + (Number(qty[key(r.productId, sizeId)]) || 0), 0);
  const grandTotal = rows.reduce((sum, r) => sum + rowTotal(r.productId), 0);

  const save = async () => {
    const next: common_ProductionRunLine[] = [];
    for (const r of rows) {
      for (const s of columns) {
        const raw = qty[key(r.productId, s)];
        const planned = Number(raw);
        if (!raw?.trim() || !Number.isFinite(planned) || planned <= 0) continue;
        const prev = lines.find((l) => (l.productId ?? 0) === r.productId && l.sizeId === s);
        next.push({
          productId: r.productId,
          sizeId: s,
          plannedQty: planned,
          receivedQty: prev?.receivedQty,
          defectQty: prev?.defectQty,
        });
      }
    }
    try {
      await update.mutateAsync({ id: run.id!, patch: { lines: next } });
      showMessage('Lines saved', 'success');
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Failed to save lines', 'error');
    }
  };

  const setCell = (productId: number, sizeId: number, v: string) =>
    setQty((prev) => ({ ...prev, [key(productId, sizeId)]: v.replace(/[^0-9]/g, '') }));

  const returnTo = encodeURIComponent(pathname + search);

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <Text variant='uppercase' size='small'>
          lines (colour-model × size)
        </Text>
        {editable && (
          <div className='flex items-center gap-2'>
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className='uppercase'
              disabled={sizeQuantities.length === 0}
              onClick={prefillFromSizeRun}
            >
              prefill from size run
            </Button>
            <Button
              type='button'
              variant='main'
              size='lg'
              className='uppercase'
              disabled={update.isPending}
              onClick={save}
            >
              {update.isPending ? 'saving…' : 'save lines'}
            </Button>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <Text variant='inactive' size='small'>
          no lines — add a colour-model to plan quantities
        </Text>
      ) : (
        <div className='overflow-x-auto'>
          <table className='border-collapse'>
            <thead>
              <tr>
                <th className={`${cell} text-left uppercase`}>colour-model</th>
                {columns.map((s) => (
                  <th key={s} className={`${cell} text-right uppercase`}>
                    {findInDictionary(dictionary, s, 'size') || s}
                  </th>
                ))}
                <th className={`${cell} text-right uppercase`}>Σ</th>
                {editable ? <th className={cell} /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.productId}>
                  <td className={cell}>
                    {r.label}
                    {r.productId === 0 ? (
                      <>
                        {' '}
                        <Text variant='inactive' size='small'>
                          ! no product yet ·{' '}
                          <Link
                            to={`${ROUTES.addProduct}?returnTo=${returnTo}`}
                            className='underline'
                          >
                            create product
                          </Link>
                        </Text>
                      </>
                    ) : null}
                  </td>
                  {columns.map((s) => (
                    <td key={s} className={`${cell} text-right`}>
                      {editable ? (
                        <input
                          className='w-14 border border-textInactiveColor bg-bgColor px-1 text-right text-textBaseSize'
                          inputMode='numeric'
                          value={qty[key(r.productId, s)] ?? ''}
                          onChange={(e) => setCell(r.productId, s, e.target.value)}
                        />
                      ) : (
                        qty[key(r.productId, s)] || '—'
                      )}
                    </td>
                  ))}
                  <td className={`${cell} text-right`}>{rowTotal(r.productId)}</td>
                  {editable ? (
                    <td className={cell}>
                      <Button
                        type='button'
                        variant='secondary'
                        aria-label='remove colour-model'
                        onClick={() => removeRow(r.productId)}
                      >
                        ✕
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
              <tr>
                <td className={`${cell} text-right uppercase`}>Σ</td>
                {columns.map((s) => (
                  <td key={s} className={`${cell} text-right`}>
                    {colTotal(s)}
                  </td>
                ))}
                <td className={`${cell} text-right font-bold`}>{grandTotal}</td>
                {editable ? <td className={cell} /> : null}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {editable && addable.length > 0 ? (
        <div className='flex items-center gap-2'>
          <select
            className={cell}
            value=''
            onChange={(e) => {
              if (e.target.value !== '') addRow(Number(e.target.value));
            }}
          >
            <option value=''>+ colour-model…</option>
            {colorways.map((c, i) =>
              addable.includes(c) ? (
                <option key={i} value={i}>
                  {c.code ? `${c.code} · ` : ''}
                  {c.name ?? 'untitled'}
                  {c.productId ? ` · #${c.productId}` : ' · no product'}
                </option>
              ) : null,
            )}
          </select>
        </div>
      ) : null}
    </div>
  );
}
