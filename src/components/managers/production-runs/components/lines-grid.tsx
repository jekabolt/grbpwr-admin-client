import { common_ProductionRun, common_ProductionRunLine } from 'api/proto-http/admin';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { ROUTES } from 'constants/routes';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { ulid } from 'utils/ulid';
import { runDate } from './options';
import { updateRunErrorMessage, useProductionRuns, useUpdateRunSection } from './useProductionRuns';

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
  onDirtyChange,
}: {
  run: common_ProductionRun;
  canEdit: boolean;
  locked: boolean;
  /**
   * Reports the unsaved-draft flag upwards. The "· unsaved" marker used to sit in this panel's
   * own heading; it now lives on the run conveyor, where all four of the page's save buttons are
   * accounted for in one place. Pass a STABLE callback — this fires from an effect.
   */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { dictionary } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const update = useUpdateRunSection();
  const editable = canEdit && !locked;

  const { data: techCard } = useTechCard(run.run?.techCardId ? run.run.techCardId : undefined);
  // Colour-model rows/options are the run's tech-card colourways (R1: a colourway is a product;
  // techCardId === styleId). useTechCard already reads the live AdminColorwayRef[] — the same
  // source construction-tab.tsx uses — so no separate GetColorwaysPaged call is needed. Name
  // resolves from dictionary.colors by colour code.
  const colorways = useMemo(
    () =>
      (techCard?.colorways ?? []).map((cw) => {
        const dc = dictionary?.colors?.find((c) => c.code === cw.colorCode);
        return {
          productId: cw.colorwayId ?? 0,
          code: cw.colorCode ?? '',
          name: dc?.name ?? cw.colorCode ?? '',
          id: cw.colorwayId ?? 0,
        };
      }),
    [techCard?.colorways, dictionary?.colors],
  );
  const cardSizeIds = useMemo(() => techCard?.techCard?.sizeIds ?? [], [techCard]);

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
  // Sibling saves (marker, costs, an issue from the plan) refetch the run — without a dirty
  // guard that refetch rebuilt the grid from server state and silently discarded typed cells.
  const [dirty, setDirty] = useState(false);
  // The cleanup is load-bearing, not symmetry: an unmounted grid has no draft left to save, and
  // without it the conveyor would keep promising an unsaved plan that died with the component.
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  // Load the grid from the run's lines (distinct products, in first-seen order) — but never
  // over unsaved edits.
  useEffect(() => {
    if (dirty) return;
    const seen: number[] = [];
    const q: Record<string, string> = {};
    for (const l of lines) {
      const pid = l.productId ?? 0;
      if (!seen.includes(pid)) seen.push(pid);
      q[key(pid, l.sizeId ?? 0)] = String(l.plannedQty ?? 0);
    }
    setRows(seen.map((pid) => ({ productId: pid, label: labelFor(pid) })));
    setQty(q);
  }, [lines, labelFor, dirty]);

  const addable = colorways.filter((c) => {
    const pid = c.productId ?? 0;
    return pid > 0 ? !rows.some((r) => r.productId === pid) : !rows.some((r) => r.productId === 0);
  });

  const addRow = (colorwayIndex: number) => {
    const c = colorways[colorwayIndex];
    if (!c) return;
    const pid = c.productId ?? 0;
    if (rows.some((r) => r.productId === pid)) return;
    setDirty(true);
    setRows((prev) => [
      ...prev,
      { productId: pid, label: `${c.code ? `${c.code} · ` : ''}${c.name ?? '(unassigned)'}` },
    ]);
  };

  const removeRow = (productId: number) => {
    // A row whose lines carry counted quantities can't be casually dropped — saving without
    // it would erase the received/defect record.
    const counted = lines.some(
      (l) =>
        (l.productId ?? 0) === productId && ((l.receivedQty ?? 0) > 0 || (l.defectQty ?? 0) > 0),
    );
    if (counted) {
      showMessage('This colour-model has received/defect counts — it cannot be removed', 'error');
      return;
    }
    setDirty(true);
    setRows((prev) => prev.filter((r) => r.productId !== productId));
    setQty((prev) => {
      const next = { ...prev };
      columns.forEach((s) => delete next[key(productId, s)]);
      return next;
    });
  };

  // Здесь была кнопка «prefill from size run»: она штамповала в сетку типовой калькуляционный
  // тираж карты. Тираж удалён с карточки целиком, и обратно он не вернётся: у стиля нет «своей»
  // партии, а подсказка из «типового» микса подменяла собой знание человека о ТЕКУЩЕМ заказе.
  // Ниже — замена от честного источника: ПРОШЛЫЙ ПРОГОН этого же стиля. Он ничего не нормирует и
  // ничего не предписывает — это просто то, что уже шили в прошлый раз, и снекбар говорит об этом
  // вслух, с номером прогона, чтобы цифру нельзя было принять за норму или за заказ.
  const techCardId = run.run?.techCardId ?? 0;
  // Фильтр по карточке СЕРВЕРНЫЙ (ListProductionRunsRequest.tech_card_id) — «весь мир» сюда не
  // едет. Страница у хука одна и жёсткая (limit 200), и ключ запроса совпадает с ключом вкладки
  // «производство» на самой карточке, так что React Query отдаёт обеим один ответ вместо двух
  // запросов. 200 партий ОДНОГО стиля — это годы работы; если их когда-нибудь станет больше,
  // худшее, что случится, — кнопка предложит не самый свежий прогон из загруженной страницы.
  // Запрос включён только для редактируемой сетки: у read-only прогона кнопки нет, и тянуть под
  // неё список незачем.
  const { data: runsData, isFetching: runsFetching } = useProductionRuns(
    techCardId,
    '',
    0,
    false,
    editable && techCardId > 0,
  );

  // Последний по времени прогон ЭТОГО стиля, кроме текущего и кроме отменённых: отменённый — это
  // решение «так шить не будем», копировать из него нечего. Сортируем сами по created_at (id как
  // тай-брейк): порядок ответа списка не документирован, а «последний» — ровно то слово, которым
  // кнопка себя называет, и оно должно быть правдой, а не совпадением с порядком выдачи.
  const sourceRun = useMemo(() => {
    const candidates = (runsData?.runs ?? []).filter(
      (r) =>
        (r.id ?? 0) > 0 &&
        r.id !== run.id &&
        r.run?.status !== 'PRODUCTION_RUN_STATUS_CANCELLED' &&
        (r.run?.lines ?? []).some((l) => (l.plannedQty ?? 0) > 0),
    );
    const at = (t?: string) => {
      const ms = Date.parse(t ?? '');
      return Number.isFinite(ms) ? ms : 0;
    };
    return [...candidates].sort(
      (a, b) => at(b.createdAt) - at(a.createdAt) || (b.id ?? 0) - (a.id ?? 0),
    )[0];
  }, [runsData?.runs, run.id]);

  // Копирование количеств (колор-модель × размер) из прошлого прогона в ПУСТЫЕ клетки.
  //
  // Только пустые — намеренно, и это НЕ то, что делал старый префилл: тот собирал карту заново
  // (`setQty(() => ({...}))`) и стирал всё набранное руками. «Дозаполнить» не должно быть способом
  // потерять свои же цифры, поэтому клетка с любым значением остаётся как есть.
  //
  // СТРОКИ СЕТКИ НЕ СОЗДАЁМ. Колор-модель, которой в гриде нет, — это решение «что шьём в этот
  // раз», а не заполнение клетки: дописать её молча значило бы расширить план партии кнопкой
  // «дозаполнить», и человек узнал бы об этом уже из сохранённых линий. Такие колор-модели (и
  // размеры вне колонок сетки) пропускаем и называем числом в снекбаре — строка добавляется
  // вручную через «+ colour-model…», после чего кнопку можно нажать ещё раз: повтор безопасен
  // именно потому, что заполняются только пустые клетки.
  const copyFromPreviousRun = () => {
    if (!sourceRun) return;
    const rowIds = new Set(rows.map((r) => r.productId));
    const cols = new Set(columns);
    const next = { ...qty };
    let filledCells = 0;
    let copiedQty = 0;
    const skippedColorways = new Set<number>();
    let skippedSizes = 0;
    for (const l of sourceRun.run?.lines ?? []) {
      const pid = l.productId ?? 0;
      const sid = l.sizeId ?? 0;
      const planned = l.plannedQty ?? 0;
      if (planned <= 0 || sid <= 0) continue;
      if (!rowIds.has(pid)) {
        skippedColorways.add(pid);
        continue;
      }
      if (!cols.has(sid)) {
        skippedSizes += 1;
        continue;
      }
      const k = key(pid, sid);
      if (next[k]?.trim()) continue;
      next[k] = String(planned);
      filledCells += 1;
      copiedQty += planned;
    }
    const skipped = [
      skippedColorways.size > 0 ? `colour-models outside the grid — ${skippedColorways.size}` : '',
      skippedSizes > 0 ? `cells with a size outside the columns — ${skippedSizes}` : '',
    ].filter(Boolean);
    const from = `PR-${sourceRun.id}${runDate(sourceRun.createdAt) ? ` dated ${runDate(sourceRun.createdAt)}` : ''}`;
    if (filledCells === 0) {
      // Ничего не заполнено — это ответ, а не сбой, и он обязан назвать причину: пустых клеток,
      // которые прошлый прогон умеет закрыть, просто не осталось.
      showMessage(
        `nothing to copy from ${from}: there are no empty cells for its quantities${
          skipped.length ? ` (not carried over: ${skipped.join(', ')})` : ''
        }`,
        'error',
      );
      return;
    }
    setDirty(true);
    setQty(next);
    showMessage(
      `copied from ${from}: ${copiedQty} pcs into ${filledCells} empty ${
        filledCells === 1 ? 'cell' : 'cells'
      }${
        skipped.length ? `; not carried over: ${skipped.join(', ')}` : ''
      }. check it — this is a past run, not a norm`,
      'success',
    );
  };

  // Почему кнопка неактивна — одной строкой, тем же текстом в title и на экране: title у disabled
  // кнопки в части браузеров не всплывает вовсе, а исчезнувшая без объяснения помощь читается как
  // поломка. Пустая сетка объясняется своим собственным пустым состоянием ниже, второй раз это не
  // повторяем — но в title причина есть всегда.
  const copyBlockedReason =
    rows.length === 0
      ? 'add a colour-model first — copying fills rows that are already in the grid'
      : runsFetching && !sourceRun
        ? 'looking for past runs of this style…'
        : !sourceRun
          ? "this style has no past runs with quantities (cancelled ones don't count) — the grid is filled in by hand"
          : undefined;

  const rowTotal = (productId: number) =>
    columns.reduce((sum, s) => sum + (Number(qty[key(productId, s)]) || 0), 0);
  const colTotal = (sizeId: number) =>
    rows.reduce((sum, r) => sum + (Number(qty[key(r.productId, sizeId)]) || 0), 0);
  const grandTotal = rows.reduce((sum, r) => sum + rowTotal(r.productId), 0);

  const save = async () => {
    const next: common_ProductionRunLine[] = [];
    // Stored "(unassigned)" lines whose row is gone from the grid. The one edit that legitimately
    // MOVES a line to a new (product, size) slot is attaching the colour-model that was still
    // unpublished at planning time — in this grid that is "remove the unassigned row, add the real
    // product's row". Re-deriving identity purely by slot would mint fresh keys there and retire
    // the stored rows (the very churn line_key exists to prevent), so a product cell with no line
    // of its own adopts the orphan of its size and the backend updates that row in place.
    const orphans = rows.some((r) => r.productId === 0)
      ? []
      : lines.filter((l) => !(l.productId ?? 0));
    const usedKeys = new Set<string>();
    for (const r of rows) {
      for (const s of columns) {
        const raw = qty[key(r.productId, s)];
        const planned = Number(raw);
        const prev = lines.find((l) => (l.productId ?? 0) === r.productId && l.sizeId === s);
        const hasCounts = (prev?.receivedQty ?? 0) > 0 || (prev?.defectQty ?? 0) > 0;
        if (!raw?.trim() || !Number.isFinite(planned) || planned <= 0) {
          // A blanked cell normally drops the line — but never one that already carries
          // counted received/defect quantities; keep it with plan 0 instead.
          if (hasCounts && prev) {
            if (prev.lineKey) usedKeys.add(prev.lineKey);
            next.push({ ...prev, plannedQty: 0 });
          }
          continue;
        }
        const carrier =
          prev ??
          (r.productId > 0
            ? orphans.find((l) => l.sizeId === s && !!l.lineKey && !usedKeys.has(l.lineKey))
            : undefined);
        if (carrier?.lineKey) usedKeys.add(carrier.lineKey);
        next.push({
          productId: r.productId,
          sizeId: s,
          plannedQty: planned,
          receivedQty: carrier?.receivedQty,
          defectQty: carrier?.defectQty,
          // Sellable lines never carry a colour variant (aux-only, 0253).
          outputVariantId: undefined,
          // The line's stable identity. Carried over from the stored line so the backend UPDATEs
          // that row in place (its id is what receipt lines will reference) instead of dropping and
          // reinserting it; minted only for a cell that has no line yet. Never regenerate a key that
          // came from the server — that would silently retire the row it names.
          lineKey: carrier?.lineKey || ulid(),
        });
      }
    }
    try {
      await update.mutateAsync({
        id: run.id!,
        lockVersion: run.lockVersion ?? 0,
        patch: { lines: next },
      });
      setDirty(false);
      showMessage('Lines saved', 'success');
    } catch (e) {
      showMessage(updateRunErrorMessage(e), 'error');
    }
  };

  const setCell = (productId: number, sizeId: number, v: string) => {
    setDirty(true);
    setQty((prev) => ({ ...prev, [key(productId, sizeId)]: v.replace(/[^0-9]/g, '') }));
  };

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <Text variant='uppercase' size='small'>
          lines (colour-model × size)
        </Text>
        {editable && (
          <div className='flex items-center gap-2'>
            {/* Источник назван прямо на кнопке: «скопировать» без имени — это доверие вслепую, а
                номер прогона видно ещё до нажатия. */}
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className='uppercase'
              disabled={!!copyBlockedReason || update.isPending}
              title={copyBlockedReason ?? `quantities from the past run PR-${sourceRun?.id}`}
              onClick={copyFromPreviousRun}
            >
              {sourceRun ? `copy from PR-${sourceRun.id}` : 'copy from previous run'}
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

      {editable && copyBlockedReason && rows.length > 0 ? (
        <Text variant='inactive' size='small'>
          {copyBlockedReason}
        </Text>
      ) : null}

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
                          {/* New tab: navigating away would silently discard the grid draft,
                              and nothing in the product flow leads back here. */}
                          <Link
                            to={ROUTES.addProduct}
                            target='_blank'
                            rel='noreferrer'
                            className='underline'
                          >
                            create product ↗
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
