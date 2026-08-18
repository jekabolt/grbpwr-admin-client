import {
  common_ProductionRunLayCoverageCell,
  common_ProductionRunLayPieceYield,
} from 'api/proto-http/admin';
import { useMemo } from 'react';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import GenericPopover from 'ui/components/popover';
import Text from 'ui/components/text';
import { LayVerdict, VERDICT_GLYPH, VERDICT_TEXT, layVerdict } from './useLays';

// Матрица покрытия (Ф4.5): колорвей × размер, «сколько изделий этой клетки настилы РЕАЛЬНО кроят»
// против «сколько запланировано». Считает сервер — по РАЗМЕЩЕНИЯМ в блобах маркеров, минимумом по
// всем деталям всех тканей колорвея, — а таблица его только читает.
//
// Клетка трёхзначна, и это главное, что она обязана донести:
//   ✓ 20/20   покрыто            — настилы кроят весь план
//   ✗ 8/20    НЕХВАТКА           — честный ноль/недобор: ткань не раскроена (красный)
//   ⚠ 20/20   перекрой           — измеренный факт, требующий решения человека (синий)
//   ? 8/20    НЕ ПРОВЕРЕНО       — деталь неатрибутируема, симметрия не размечена, слот не
//                                  резолвится (§6.3). Это НЕ «покрыто» и НЕ «нехватка» (серый)
//
// Разница между двумя нижними — не косметика. «Не проверено» на легаси-маркере (схема < 3, где
// `flipped` ещё не существовало) означает, что счёт зеркальных пар был бы ложной тревогой; красная
// клетка там сказала бы «ткани не хватает», чего никто не измерял.
export function LayCoverageTable({
  cells,
  pieceYields,
  colorwayIds,
  sizeIds,
  colorwayLabel,
  slotSummary,
  sizeLabel,
}: {
  cells: common_ProductionRunLayCoverageCell[];
  pieceYields: common_ProductionRunLayPieceYield[];
  /** Строки матрицы, в порядке показа. */
  colorwayIds: number[];
  /** Колонки — градация карточки, плюс любой размер, встретившийся в клетках. */
  sizeIds: number[];
  colorwayLabel: (colorwayId: number) => string;
  /** «основная ткань + подкладка» — какие слоты этот колорвей обязан раскроить. */
  slotSummary: (colorwayId: number) => string;
  sizeLabel: (sizeId: number) => string;
}) {
  const byCell = useMemo(() => {
    const m = new Map<string, common_ProductionRunLayCoverageCell>();
    for (const c of cells) m.set(`${c.colorwayId ?? 0}:${c.sizeId ?? 0}`, c);
    return m;
  }, [cells]);

  const yieldsByCell = useMemo(() => {
    const m = new Map<string, common_ProductionRunLayPieceYield[]>();
    for (const y of pieceYields) {
      const k = `${y.colorwayId ?? 0}:${y.sizeId ?? 0}`;
      const list = m.get(k);
      if (list) list.push(y);
      else m.set(k, [y]);
    }
    return m;
  }, [pieceYields]);

  if (colorwayIds.length === 0 || sizeIds.length === 0) return null;

  return (
    <div className='flex flex-col gap-1'>
      <DataTable variant='grid'>
        <thead>
          <tr>
            <th>colourway · fabrics</th>
            {sizeIds.map((s) => (
              <th key={s}>{sizeLabel(s)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {colorwayIds.map((cw) => (
            <tr key={cw}>
              <td>
                {colorwayLabel(cw)}
                <Text size='micro' variant='label' component='span' className='block'>
                  {slotSummary(cw) || '—'}
                </Text>
              </td>
              {sizeIds.map((s) => {
                const cell = byCell.get(`${cw}:${s}`);
                // Пары, которой прогон не планирует вовсе, в матрице нет — и она рисуется точкой,
                // а не нулём: ноль здесь читался бы как «запланировали и не покрыли».
                if (!cell) {
                  return (
                    <td key={s}>
                      <EmptyCell>·</EmptyCell>
                    </td>
                  );
                }
                return (
                  <td key={s}>
                    <CoverageCell cell={cell} yields={yieldsByCell.get(`${cw}:${s}`) ?? []} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </DataTable>

      {/* Легенда — потому что четыре состояния, различимые только цветом, не переживают ни печать,
          ни дальтонизм. Каждому вердикту здесь дано СЛОВО, и «не проверено» стоит отдельной
          строкой, а не в скобках у «покрыто». */}
      <div className='flex flex-wrap gap-x-4 gap-y-0.5'>
        <LegendItem verdict='ok' word='covered' />
        <LegendItem verdict='blocker' word="shortfall — the fabric isn't cut" />
        <LegendItem verdict='warning' word='overcut — a human decides' />
        <LegendItem verdict='unknown' word="not checked — not 'covered'" />
      </div>
    </div>
  );
}

function LegendItem({ verdict, word }: { verdict: LayVerdict; word: string }) {
  return (
    <Text size='micro' variant='label' component='span' className={VERDICT_TEXT[verdict]}>
      {VERDICT_GLYPH[verdict]} {word}
    </Text>
  );
}

// Одна клетка. Поповер открывается только тогда, когда есть что объяснить: у покрытой клетки без
// находок объяснять нечего, и кликабельность там была бы обещанием, за которым пусто.
function CoverageCell({
  cell,
  yields,
}: {
  cell: common_ProductionRunLayCoverageCell;
  yields: common_ProductionRunLayPieceYield[];
}) {
  const verdict = layVerdict(cell.status);
  const planned = cell.plannedQty ?? 0;
  const covered = cell.coveredQty ?? 0;
  const unknownPieces = cell.unknownPieceCount ?? 0;
  const blocking = cell.blockingPieceNames ?? [];

  const body = (
    <span className={`${VERDICT_TEXT[verdict]} ${verdict === 'blocker' ? 'font-bold' : ''}`}>
      {VERDICT_GLYPH[verdict]} {covered}/{planned}
    </span>
  );

  const explainable = verdict !== 'ok' || yields.length > 0;
  if (!explainable) return body;

  return (
    <GenericPopover
      title={`${covered} of ${planned}`}
      openElement={<span className='cursor-pointer underline decoration-dotted'>{body}</span>}
      triggerProps={{ 'aria-label': 'why the coverage is what it is' }}
    >
      <div className='flex flex-col gap-1'>
        {verdict === 'unknown' ? (
          <Text size='micro' variant='label'>
            the coverage of this cell COULD NOT BE COMPUTED
            {unknownPieces > 0
              ? ` — ${unknownPieces} ${unknownPieces === 1 ? 'piece' : 'pieces'} with no answer.`
              : '.'}{' '}
            this is neither “covered” nor “shortfall”: what is listed below has to be marked up,
            and then the cell will get a verdict.
          </Text>
        ) : null}

        {blocking.length > 0 ? (
          <Text size='micro' variant='label'>
            the minimum comes from: {blocking.join(', ')}
          </Text>
        ) : null}

        {yields.length === 0 ? (
          <Text size='small' variant='inactive'>
            the server sent no per-piece breakdown
          </Text>
        ) : (
          yields.map((y, i) => {
            const yv = layVerdict(y.status);
            return (
              <div key={`${y.pieceLineKey || 'piece'}-${i}`} className='flex flex-col'>
                <Text size='small' className={VERDICT_TEXT[yv]}>
                  {VERDICT_GLYPH[yv]} {y.pieceName || y.pieceLineKey || 'piece'}:{' '}
                  {/* «сколько изделий даёт эта деталь» — та самая цифра, из которой берётся
                      минимум по клетке. У UNKNOWN-детали её не печатаем: 0 прочиталось бы как
                      «выкроено ноль». */}
                  {yv === 'unknown' ? 'not computed' : `${y.garmentYield ?? 0} garments`}
                  {(y.requiredPerGarment ?? 0) > 0
                    ? ` · needs ${y.requiredPerGarment} per garment`
                    : ''}
                </Text>
                {(y.overcutQty ?? 0) > 0 ? (
                  <Text size='micro' variant='label' className='text-warning'>
                    overcut {y.overcutQty} pcs — the piece isn't part of a mirrored pair, it's cut
                    with a surplus
                  </Text>
                ) : null}
                {y.detail ? (
                  <Text size='micro' variant='label'>
                    {y.detail}
                  </Text>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </GenericPopover>
  );
}
