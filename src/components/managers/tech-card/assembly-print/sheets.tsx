// ДВА ЛИСТА СХЕМЫ СБОРКИ — ROUTE (ведомость с дорожками узлов) и MAP (дерево карточек).
//
// Оба рисуют ОДНУ модель (model.ts) и меряют DOM: высота строки зависит от шрифта и от того, стоят
// ли в ней силуэты, поэтому полосы и провода считаются в useLayoutEffect ПОСЛЕ вставки текста, а
// не из констант. Геометрия при этом чистая (layout.ts) — компонент только снимает числа с DOM.
//
// ФИЗИКА ПЕЧАТИ (разбор SCHEME-UNFOLDED.pdf): на тонкой бумаге лазер и струйник теряют серый
// текст, тинты и линии тоньше ~0,25 мм, а заливки-хэйрлайны не защищает RIP. Поэтому здесь только
// 100 % K, ничего мельче 10 pt, линейки 0,3 мм / 1 pt / 1,5 pt, дорожки 0,3 мм штрихом (не заливкой) и
// мерная линейка 50 мм в подвале — против «вписать в страницу» в драйвере.
import type { PieceDTO } from 'lib/nesting/types';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  mapCrossings,
  mapLayout,
  routeCrossings,
  routeGeometry,
  type RouteGeometry,
  type Wire,
} from './layout';
import type { PrintModel, PrintRow } from './model';
import { PaperShape } from './paper-shape';

export type SheetMeta = {
  code: string;
  name: string;
  season: string;
  revision: string;
  /** Баннер «не для производства»: у карточки нет ни одного релиза. */
  unreleased: boolean;
  /** Что НЕ доехало к моменту печати (гейт отпустил кнопку по таймауту или отказу) — на бумагу. */
  warnings: string[];
  printedOn: string;
};

/** Контур по ключу детали; `null` целиком — силуэты выключены. */
export type ShapeLookup = ((pieceKey: string) => PieceDTO | null) | null;

export type SheetReport = {
  form: 'route' | 'map';
  sheetW: number;
  sheetH: number;
  crossings: number;
  overWidth: boolean;
  /** ROUTE: сколько полос и с каким шагом, мм. */
  lanes?: number;
  pitch?: number;
  /** MAP: сколько колонок и какой ширины, мм. */
  cols?: number;
  colW?: number;
};

const PX_PER_MM = 96 / 25.4;
const mm = (px: number) => px / PX_PER_MM;
/** Рамка карточки MAP, мм: offsetTop потомков считается от padding-edge, провод — от border-edge. */
const CARD_BORDER_MM = 0.3;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 'S'}`;

// Плитка силуэта в строке: 28 × 16 мм, контур 0,5 мм. 16 мм высоты хватает, чтобы отличить планку
// от обтачки; строка с деталями становится выше — честная цена за узнаваемость.
const TILE = { w: 28, h: 16, line: 0.5 };

function PieceTiles({
  pieces,
  shapeOf,
}: {
  pieces: { key: string; name: string }[];
  shapeOf: NonNullable<ShapeLookup>;
}) {
  return (
    <div className='ap-tiles'>
      {pieces.map((p) => {
        const piece = shapeOf(p.key);
        return (
          <div key={p.key} className='ap-pt'>
            {piece ? (
              <PaperShape piece={piece} boxW={TILE.w} boxH={TILE.h} lineMm={TILE.line} />
            ) : (
              // Пустая рамка того же размера, а не пропуск: контур этой детали в чертежах не найден
              // (диагностика — на вкладке деталей кроя), и на бумаге это должно быть видно как
              // «нет картинки», а не как «эта деталь другая».
              <div
                className='ap-pt-empty'
                style={{ width: `${TILE.w}mm`, height: `${TILE.h}mm` }}
              />
            )}
            <div className='ap-tn'>{p.name}</div>
          </div>
        );
      })}
    </div>
  );
}

function Exceptions({ M }: { M: PrintModel }) {
  if (M.complete) return null;
  // На неразмеченной карточке «все детали не использованы» — не исключение, а само её состояние
  // (шапка его уже назвала); отказы движка печатаются всегда.
  const openUnits = M.configured ? M.openUnits : [];
  const freePieces = M.configured ? M.freePieces : [];
  const tailRows = M.configured ? M.tailRows : [];
  if (!openUnits.length && !freePieces.length && !tailRows.length && !M.violations.length)
    return null;
  return (
    <div className='ap-exceptions'>
      {M.violations.length > 0 && (
        <div>
          <b>REJECTED BY THE ASSEMBLY RULES — FIX IN THE EDITOR:</b>{' '}
          {M.violations
            .map((v) => `${v.stepNumber == null ? 'CARD' : `STEP ${v.stepNumber}`}: ${v.message}`)
            .join(' · ')}
        </div>
      )}
      {openUnits.length > 0 && (
        <div>
          <b>OPEN UNITS, NOT JOINED INTO ANYTHING:</b>{' '}
          {openUnits.map((u) => `${u.name} (FROM STEP ${u.bornNumber})`).join(' · ')}
        </div>
      )}
      {freePieces.length > 0 && (
        <div>
          <b>CUT PIECES NEVER USED:</b> {freePieces.map((p) => p.name).join(' · ')}
        </div>
      )}
      {tailRows.length > 0 && (
        <div>
          <b>STEPS OUTSIDE ANY UNIT:</b>{' '}
          {tailRows.map((r) => `${r.number} ${r.verb}${r.zone ? ` · ${r.zone}` : ''}`).join(' · ')}
        </div>
      )}
    </div>
  );
}

function SheetHead({ M, meta, legend }: { M: PrintModel; meta: SheetMeta; legend: ReactNode }) {
  const check = !M.configured
    ? `ASSEMBLY CHECK: NOT CONFIGURED — NO STEP MAKES A UNIT${
        M.violations.length ? ` · ${plural(M.violations.length, 'RULE VIOLATION')}` : ''
      }`
    : M.complete
      ? `ASSEMBLY CHECK: COMPLETE · GARMENT: ${M.garment?.name ?? ''}`
      : `ASSEMBLY CHECK: INCOMPLETE · ${[
          M.violations.length ? plural(M.violations.length, 'RULE VIOLATION') : '',
          M.openUnits.length ? plural(M.openUnits.length, 'OPEN UNIT') : '',
          M.freePieces.length ? plural(M.freePieces.length, 'UNUSED PIECE') : '',
          M.tailRows.length ? plural(M.tailRows.length, 'UNASSIGNED STEP') : '',
        ]
          .filter(Boolean)
          .join(' · ')}`;
  return (
    <>
      <div className='ap-head'>
        <div className='ap-title'>
          {[meta.code, meta.name].filter(Boolean).join(' · ')}
          <small>
            {['ASSEMBLY ORDER', meta.season, meta.revision].filter(Boolean).join(' · ')}
          </small>
        </div>
        <div className='ap-meta'>
          <div>
            {plural(M.stats.steps, 'OPERATION')} · {plural(M.stats.pieces, 'CUT PIECE')} ·{' '}
            {plural(M.stats.units, 'UNIT')}
          </div>
          <div>{check}</div>
          <div>PRINTED {meta.printedOn}</div>
          <div className='ap-legend'>{legend}</div>
        </div>
      </div>
      {meta.unreleased && <div className='ap-banner'>Unreleased card — not for production</div>}
      {meta.warnings.length > 0 && (
        <div className='ap-banner'>
          Warning: some data had not arrived when this was printed — {meta.warnings.join(', ')}
        </div>
      )}
      <Exceptions M={M} />
    </>
  );
}

function SheetFoot({ meta, w, h }: { meta: SheetMeta; w: number; h: number }) {
  return (
    <div className='ap-foot'>
      <span>
        {[meta.code, meta.revision].filter(Boolean).join(' · ')} · SHEET {w} × {h} MM · PRINT AT 100
        % · BLACK ONLY
      </span>
      <span className='ap-calib'>
        50 MM <i />
      </span>
      <span>SHEET 1 OF 1</span>
    </div>
  );
}

// Строка шага в карточке узла: с кем шаг соединил (или что обработал) — кроме самого узла
// карточки, он и так назван в её шапке; обработка на детали — «ON PIECE».
function WithLine({ r, ownKey }: { r: PrintRow; ownKey: string }) {
  const others = r.unitInputNames.filter((_, j) => r.unitInputs[j] !== ownKey);
  if (r.rejected) return <div className='ap-with'>NOT APPLIED — SEE ASSEMBLY CHECK</div>;
  const pieces = r.kind === 'process' ? r.pieceInputNames : [];
  return (
    <>
      {others.length > 0 && (
        <div className='ap-with'>
          WITH <b>{others.join(' + ')}</b>
        </div>
      )}
      {pieces.length > 0 && (
        <div className='ap-with'>
          ON PIECE{pieces.length > 1 ? 'S' : ''} <b>{pieces.join(' + ')}</b>
        </div>
      )}
    </>
  );
}

// ======================= ROUTE: ledger + lanes =======================

// 420 мм — A2 по короткой стороне (на A3 — три листа альбомно), длина по содержимому. Колонки в
// мм; при силуэтах TAKES шире (три плитки в ряд) за счёт OPERATION.
const R = {
  W: 420,
  MARGIN: 12,
  COLS_TEXT: { step: 16, op: 116, takes: 96, unit: 92 },
  COLS_TILES: { step: 16, op: 104, takes: 110, unit: 92 },
  PITCH_MAX: 5,
  PITCH_MIN: 3.2,
};

type SheetProps = {
  M: PrintModel;
  meta: SheetMeta;
  shapeOf: ShapeLookup;
  /** Шрифт листа загружен — строки нужно перемерить: до него таблица стояла в фолбэке. */
  fontsReady: boolean;
  onReport: (r: SheetReport) => void;
};

export function RouteSheet({ M, meta, shapeOf, fontsReady, onReport }: SheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const reportRef = useRef(onReport);
  reportRef.current = onReport;
  const [geo, setGeo] = useState<{ g: RouteGeometry; H: number } | null>(null);
  const W = R.W;
  const COLS = shapeOf ? R.COLS_TILES : R.COLS_TEXT;
  const routeW = W - 2 * R.MARGIN - COLS.step - COLS.op - COLS.takes - COLS.unit;

  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    const table = tableRef.current;
    const routeTh = table?.querySelector<HTMLElement>('th:last-child');
    if (!sheet || !table || !routeTh) return;
    // offsetTop у <tr> считается от ТАБЛИЦЫ, а не от листа — добавляем смещение самой таблицы.
    const x0 = mm(table.offsetLeft + routeTh.offsetLeft) + 4;
    const usable = routeW - 8;
    const n = Math.max(1, M.lanes.length);
    const pitch = Math.max(R.PITCH_MIN, Math.min(R.PITCH_MAX, usable / n));
    const overWidth = M.lanes.length * pitch > usable + 0.01;
    const laneX = (key: string) => x0 + ((M.laneOf.get(key) ?? 0) + 0.5) * pitch;
    const rowY = (i: number) => {
      const tr = table.querySelector<HTMLElement>(`tr[data-step="${i}"]`);
      return tr ? mm(table.offsetTop + tr.offsetTop + tr.offsetHeight / 2) : 0;
    };
    const g = routeGeometry(M, laneX, rowY);
    // Полосы лежат абсолютно и высоты не меняют; подвал уже стоит — высота листа окончательная.
    const H = Math.ceil(mm(sheet.offsetHeight));
    setGeo({ g, H });
    reportRef.current({
      form: 'route',
      sheetW: W,
      sheetH: H,
      crossings: routeCrossings(g),
      overWidth,
      lanes: M.lanes.length,
      pitch: Math.round(pitch * 10) / 10,
    });
    // `meta` — потому что шапка (баннеры релиза и деградации) приезжает позже таблицы и двигает
    // её: полосы, промеренные до баннера, легли бы между строк.
  }, [M, shapeOf, fontsReady, routeW, W, meta]);

  // Узел, чьи строки возобновляются после чужих (поздняя утюжка раннего узла), печатается на своём
  // месте по времени с пометкой CONTINUED — порядок номеров важнее целостности блока.
  const seenBlocks = new Set<string>();
  const rows = M.rows.map((r, i) => {
    const prev = M.rows[i - 1];
    const groupStart = !prev || prev.block !== r.block || r.kind === 'makes';
    const continued = groupStart && !!r.block && r.kind !== 'makes' && seenBlocks.has(r.block);
    if (r.block) seenBlocks.add(r.block);
    const wp = r.workpiece;
    const unit = r.rejected ? (
      <>
        <small>NOT APPLIED</small>
        <span className='ap-plain'>SEE ASSEMBLY CHECK</span>
      </>
    ) : wp ? (
      <>
        <small>{r.kind === 'makes' ? 'MAKES' : 'ADDS TO'}</small>
        {wp.name}
      </>
    ) : r.unitInputNames.length ? (
      // Обработка: ВСЕ принятые предметы — узлы и, если есть, детали рядом с ними.
      <>
        {continued && <small>CONTINUED</small>}
        {r.unitInputNames.join(' + ')}
        {r.pieceInputNames.length > 0 && (
          <>
            <small>+ PIECE{r.pieceInputNames.length > 1 ? 'S' : ''}</small>
            {r.pieceInputNames.join(' + ')}
          </>
        )}
      </>
    ) : r.pieceInputNames.length ? (
      <>
        <small>ON PIECE{r.pieceInputNames.length > 1 ? 'S' : ''}</small>
        {r.pieceInputNames.join(' + ')}
      </>
    ) : (
      <span className='ap-plain'>—</span>
    );
    const pieces = r.pieceInputs.map((k, j) => ({ key: k, name: r.pieceInputNames[j] }));
    return (
      <tr key={r.index} className={groupStart ? 'ap-group-start' : undefined} data-step={r.index}>
        <td className='ap-step'>{r.number}</td>
        <td className='ap-op'>
          <span className='ap-verb'>{r.verb}</span>
          {r.zone && <span className='ap-zone'> · {r.zone}</span>}
        </td>
        <td className='ap-takes'>
          {r.kind !== 'process' && (
            <>
              {r.unitInputNames.map((n, j) => (
                <div key={j} className='ap-u'>
                  {n}
                </div>
              ))}
              {pieces.length > 0 &&
                (shapeOf ? (
                  <PieceTiles pieces={pieces} shapeOf={shapeOf} />
                ) : (
                  pieces.map((p) => <div key={p.key}>{p.name}</div>)
                ))}
            </>
          )}
        </td>
        <td className='ap-unit'>{unit}</td>
        <td className='ap-route' />
      </tr>
    );
  });

  return (
    <div ref={sheetRef} className='ap-sheet' style={{ width: `${W}mm`, padding: `${R.MARGIN}mm` }}>
      {geo && <style>{`@page { size: ${W}mm ${geo.H}mm; margin: 0; }`}</style>}
      <SheetHead
        M={M}
        meta={meta}
        legend={
          <>
            <div>READ DOWN · STEP NUMBERS ALWAYS ASCEND</div>
            <div>
              <b>│</b> ONE WORKPIECE, ALIVE FROM THE STEP THAT MAKES IT TO THE STEP THAT JOINS IT
            </div>
            <div>
              <b>■</b> MAKES OR ADDS TO IT · <b>─</b> WORK ON IT · <b>●</b> FINISHED GARMENT ·{' '}
              <b>○</b> LEFT UNJOINED
            </div>
            <div>EMPTY TAKES = NOTHING NEW ENTERS THE WORKPIECE</div>
          </>
        }
      />
      <table ref={tableRef} className='ap-ledger'>
        <colgroup>
          <col style={{ width: `${COLS.step}mm` }} />
          <col style={{ width: `${COLS.op}mm` }} />
          <col style={{ width: `${COLS.takes}mm` }} />
          <col style={{ width: `${COLS.unit}mm` }} />
          <col style={{ width: `${routeW}mm` }} />
        </colgroup>
        <thead>
          <tr>
            <th>STEP</th>
            <th>OPERATION · ZONE</th>
            <th>TAKES</th>
            <th>WORKPIECE</th>
            <th>ASSEMBLY ROUTE · TOP → BOTTOM</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
      <div className='ap-cutlist'>
        <h3>CUT LIST — {plural(M.cutList.length, 'PIECE')} · WHICH STEP TAKES EACH PIECE</h3>
        <div className='ap-grid'>
          {M.cutList.map((p) => (
            <div key={p.key}>
              <span>{p.name}</span>
              <span>
                {p.step == null ? (
                  <b>NOT USED</b>
                ) : (
                  <>
                    → <b>{p.step}</b>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
      {geo && (
        <svg
          className='ap-lanes'
          style={{ width: `${W}mm`, height: `${geo.H}mm` }}
          viewBox={`0 0 ${W} ${geo.H}`}
          aria-hidden='true'
        >
          {geo.g.lanes.map((l) => (
            <line key={l.key} x1={l.x} y1={l.y1} x2={l.x} y2={l.y2} />
          ))}
          {geo.g.collectors.map((c, i) => (
            <line key={`c${i}`} x1={c.x1} y1={c.y} x2={c.x2} y2={c.y} />
          ))}
          {geo.g.marks.map((p, i) => (
            <rect
              key={`m${i}`}
              className='ap-mark'
              x={p.x - 1.1}
              y={p.y - 1.1}
              width={2.2}
              height={2.2}
            />
          ))}
          {geo.g.bars.map((p, i) => (
            <line key={`b${i}`} x1={p.x - 1.6} y1={p.y} x2={p.x + 1.6} y2={p.y} />
          ))}
          {geo.g.ends.map((e) =>
            e.kind === 'garment' ? (
              <g key={e.key}>
                <circle className='ap-end' cx={e.x} cy={e.y} r={1.6} />
                <text x={e.x + 3} y={e.y + 1.2}>
                  GARMENT
                </text>
              </g>
            ) : (
              // Хвост 3 мм и кольцо ниже квадрата рождения — иначе метка «open» ложится на ■.
              <g key={e.key}>
                <line x1={e.x} y1={e.y} x2={e.x} y2={e.y + 3} />
                <circle className='ap-open' cx={e.x} cy={e.y + 4.2} r={1.6} />
                <text x={e.x + 3} y={e.y + 5.4}>
                  OPEN
                </text>
              </g>
            ),
          )}
        </svg>
      )}
      <SheetFoot meta={meta} w={W} h={geo?.H ?? 0} />
    </div>
  );
}

// ======================= MAP: tree of cards =======================

// 841 мм — A0 по короткой стороне. Колонка 110 мм, при большем числе колонок сжимается до 80.
const T = { W: 841, MARGIN: 14, GUTTER: 20, COL_W: 110, COL_MIN: 80, GAP_Y: 7, FOOT_H: 14 };

export function MapSheet({ M, meta, shapeOf, fontsReady, onReport }: SheetProps) {
  const headRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const reportRef = useRef(onReport);
  reportRef.current = onReport;
  const [lay, setLay] = useState<{
    pos: Map<string, { x: number; y: number; h: number }>;
    wires: Wire[];
    sheetH: number;
  } | null>(null);
  const W = T.W;
  const cols = Math.max(1, M.maxHeight + 1);
  const need = (c: number, cw: number) => T.MARGIN * 2 + c * cw + (c - 1) * T.GUTTER;
  const colW =
    need(cols, T.COL_W) > W
      ? Math.max(T.COL_MIN, (W - T.MARGIN * 2 - (cols - 1) * T.GUTTER) / cols)
      : T.COL_W;
  const overWidth = need(cols, colW) > W + 0.01;

  useLayoutEffect(() => {
    const head = headRef.current;
    if (!head) return;
    const top = T.MARGIN + mm(head.offsetHeight) + 6;
    const measureOf = (key: string) => {
      const el = cardRefs.current.get(key);
      const hd = el?.querySelector<HTMLElement>('.ap-card-head');
      if (!el || !hd) return { h: 0, headY: 0, rowOf: () => null };
      return {
        h: mm(el.offsetHeight),
        headY: mm(hd.offsetTop + hd.offsetHeight / 2) + CARD_BORDER_MM,
        rowOf: (step: number) => {
          const row = el.querySelector<HTMLElement>(`.ap-row[data-step="${step}"]`);
          return row ? { top: mm(row.offsetTop) + CARD_BORDER_MM, h: mm(row.offsetHeight) } : null;
        },
      };
    };
    const L = mapLayout(
      M,
      { left: T.MARGIN, gutter: T.GUTTER, colW, gapY: T.GAP_Y, top },
      measureOf,
    );
    const sheetH = Math.ceil(L.bottom + T.FOOT_H + T.MARGIN);
    setLay({ pos: L.pos, wires: L.wires, sheetH });
    reportRef.current({
      form: 'map',
      sheetW: W,
      sheetH,
      crossings: mapCrossings(L.wires),
      overWidth,
      cols,
      colW: Math.round(colW * 10) / 10,
    });
  }, [M, shapeOf, fontsReady, colW, cols, overWidth, W, meta]);

  return (
    <div
      className='ap-sheet'
      style={{
        width: `${W}mm`,
        padding: `${T.MARGIN}mm`,
        height: lay ? `${lay.sheetH}mm` : undefined,
      }}
    >
      {lay && <style>{`@page { size: ${W}mm ${lay.sheetH}mm; margin: 0; }`}</style>}
      <div ref={headRef}>
        <SheetHead
          M={M}
          meta={meta}
          legend={
            <>
              <div>READ LEFT → RIGHT · A UNIT FEEDS THE STEP ITS ARROW POINTS AT</div>
              <div>
                <b>STEPS 10 – 20</b> = STEPS THAT BUILD THE UNIT · <b>WITH</b> = UNITS THE STEP
                JOINS
              </div>
            </>
          }
        />
      </div>
      {M.units.map((u) => {
        const p = lay?.pos.get(u.key);
        const range =
          u.bornNumber === u.lastNumber
            ? `STEP ${u.bornNumber}`
            : `STEPS ${u.bornNumber} – ${u.lastNumber}`;
        const tag = u.terminal ? '● GARMENT' : u.open ? 'OPEN · NOT JOINED' : range;
        return (
          <div
            key={u.key}
            ref={(el) => {
              if (el) cardRefs.current.set(u.key, el);
              else cardRefs.current.delete(u.key);
            }}
            className={`ap-card${u.open ? ' ap-open-unit' : ''}`}
            style={{
              width: `${colW}mm`,
              left: `${p?.x ?? T.MARGIN}mm`,
              top: `${p?.y ?? 0}mm`,
              visibility: p ? undefined : 'hidden',
            }}
          >
            <div className='ap-card-head'>
              <div className='ap-card-name'>{u.name}</div>
              <div className='ap-card-range'>
                {tag}
                {(u.terminal || u.open) && (
                  <>
                    <br />
                    {range}
                  </>
                )}
              </div>
            </div>
            {u.pieces.length > 0 && (
              <div className='ap-card-pieces'>
                <b>CUT PIECES:</b>{' '}
                {shapeOf ? (
                  <PieceTiles pieces={u.pieces} shapeOf={shapeOf} />
                ) : (
                  <span className='ap-list'>{u.pieces.map((x) => x.name).join(' · ')}</span>
                )}
              </div>
            )}
            <div className='ap-card-steps'>
              {u.rows.map((r) => (
                <div key={r.index} className='ap-row' data-step={r.index}>
                  <span className='ap-num'>{r.number}</span>
                  <span>
                    <span className='ap-verb'>{r.verb}</span>
                    {r.zone && <span className='ap-zone'> · {r.zone}</span>}
                    <WithLine r={r} ownKey={u.key} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {lay && (
        <svg
          className='ap-wires'
          style={{ width: `${W}mm`, height: `${lay.sheetH}mm` }}
          viewBox={`0 0 ${W} ${lay.sheetH}`}
          aria-hidden='true'
        >
          {lay.wires.map((w) => (
            <g key={w.from}>
              <path d={w.d} />
              <path className='ap-arrow' d={`M${w.x2},${w.y2} l-2.2,-0.9 v1.8 z`} />
            </g>
          ))}
        </svg>
      )}
      {lay && (
        <div
          className='ap-map-foot'
          style={{ left: `${T.MARGIN}mm`, right: `${T.MARGIN}mm`, bottom: `${T.MARGIN}mm` }}
        >
          <SheetFoot meta={meta} w={W} h={lay.sheetH} />
        </div>
      )}
    </div>
  );
}

// ЛИСТ — ЭТО ТО, ЧТО ИДЁТ НА БУМАГУ. Никакого Tailwind внутри `.ap-sheet`: размеры в мм и pt, цвет
// один — #000, шрифт тот же FeatureMono, что и в приложении (global.css), с фолбэком на Inter.
export const ASSEMBLY_PRINT_CSS = `
.ap-sheet { position: relative; background: #fff; color: #000; box-shadow: 0 0 0 1px #ccc; font-family: FeatureMono, 'Inter', 'Helvetica Neue', Arial, sans-serif; font-size: 10pt; line-height: 1.25; box-sizing: border-box; }
.ap-sheet *, .ap-sheet *::before, .ap-sheet *::after { box-sizing: border-box; }
.ap-sheet b { font-weight: 700; }
.ap-head { display: grid; grid-template-columns: 1fr auto; gap: 10mm; align-items: end; padding-bottom: 3mm; border-bottom: 1.5pt solid #000; }
.ap-banner { margin-top: 3mm; border: 1.5pt solid #000; padding: 2mm 3mm; font-size: 14pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
.ap-title { font-size: 18pt; font-weight: 700; text-transform: uppercase; line-height: 1.1; overflow-wrap: anywhere; }
.ap-title small { display: block; font-size: 11pt; font-weight: 700; margin-top: 1.5mm; letter-spacing: 0.04em; }
.ap-meta { text-align: right; font-size: 10pt; line-height: 1.5; text-transform: uppercase; }
.ap-legend { margin-top: 1mm; }
.ap-legend div { white-space: nowrap; }
.ap-foot { display: flex; justify-content: space-between; align-items: center; gap: 8mm; margin-top: 4mm; padding-top: 2mm; border-top: 1.5pt solid #000; font-size: 10pt; text-transform: uppercase; }
.ap-map-foot { position: absolute; }
.ap-calib { display: inline-flex; align-items: center; gap: 2mm; }
.ap-calib i { display: inline-block; width: 50mm; height: 0; border-top: 0.3mm solid #000; position: relative; }
.ap-calib i::before, .ap-calib i::after { content: ''; position: absolute; top: -1.5mm; width: 0; height: 3mm; border-left: 0.3mm solid #000; }
.ap-calib i::before { left: 0; } .ap-calib i::after { right: 0; }
.ap-exceptions { margin-top: 3mm; border: 1pt solid #000; padding: 2mm 3mm; font-size: 10pt; text-transform: uppercase; }
.ap-exceptions div + div { margin-top: 1mm; }

.ap-ledger { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 3mm; }
.ap-ledger th { text-align: left; font-size: 10pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 1.5mm 2mm; border-bottom: 1.5pt solid #000; vertical-align: bottom; }
.ap-ledger td { padding: 1.8mm 2mm; vertical-align: top; border-bottom: 0.3mm solid #000; }
.ap-ledger tr.ap-group-start td { border-top: 1pt solid #000; }
.ap-ledger td.ap-step { font-size: 12pt; font-weight: 700; text-align: right; padding-right: 3mm; }
.ap-ledger td.ap-op .ap-verb { font-size: 11pt; font-weight: 700; text-transform: uppercase; }
.ap-ledger td.ap-op .ap-zone { text-transform: uppercase; font-size: 10pt; }
.ap-ledger td.ap-takes { font-size: 10pt; text-transform: uppercase; overflow-wrap: anywhere; }
.ap-ledger td.ap-takes div + div { margin-top: 0.4mm; }
.ap-ledger td.ap-takes .ap-u { font-weight: 700; }
.ap-ledger td.ap-unit { text-transform: uppercase; font-size: 11pt; font-weight: 700; overflow-wrap: anywhere; }
.ap-ledger td.ap-unit small { display: block; font-size: 10pt; font-weight: 700; letter-spacing: 0.04em; margin-bottom: 0.4mm; }
.ap-ledger td.ap-unit .ap-plain { font-weight: 400; }
.ap-ledger td.ap-route { padding: 0; }
.ap-lanes { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
.ap-lanes line { fill: none; stroke: #000; stroke-width: 0.3; }
.ap-lanes .ap-mark, .ap-lanes .ap-end { fill: #000; stroke: none; }
.ap-lanes .ap-open { fill: #fff; stroke: #000; stroke-width: 0.3; }
.ap-lanes text { font-family: FeatureMono, monospace; font-size: 3.6px; font-weight: 700; fill: #000; }
.ap-cutlist { margin-top: 4mm; border-top: 1pt solid #000; padding-top: 2mm; font-size: 10pt; text-transform: uppercase; }
.ap-cutlist h3 { margin: 0 0 1.5mm; font-size: 10pt; font-weight: 700; letter-spacing: 0.04em; }
.ap-cutlist .ap-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.6mm 4mm; }
.ap-cutlist .ap-grid div { border-bottom: 0.3mm solid #000; padding: 0.4mm 0; display: flex; justify-content: space-between; gap: 2mm; overflow-wrap: anywhere; }

.ap-shape { display: block; }
.ap-tiles { display: flex; flex-wrap: wrap; gap: 2mm 3mm; margin-top: 0.6mm; }
.ap-pt { width: 30mm; }
.ap-pt .ap-shape, .ap-pt .ap-pt-empty { margin-bottom: 0.8mm; }
.ap-pt-empty { border: 0.3mm dashed #000; }
.ap-pt .ap-tn { font-size: 10pt; font-weight: 700; overflow-wrap: anywhere; line-height: 1.15; }

.ap-card { position: absolute; border: 0.3mm solid #000; background: #fff; }
.ap-card.ap-open-unit { border-width: 1pt; }
.ap-card-head { padding: 2mm 3mm 1.8mm; border-bottom: 0.3mm solid #000; display: grid; grid-template-columns: 1fr auto; gap: 3mm; align-items: start; }
.ap-card-name { font-size: 12pt; font-weight: 700; text-transform: uppercase; line-height: 1.15; overflow-wrap: anywhere; }
.ap-card-range { font-size: 10pt; font-weight: 700; white-space: nowrap; letter-spacing: 0.04em; text-transform: uppercase; padding-top: 0.6mm; text-align: right; }
.ap-card-pieces { padding: 1.4mm 3mm 1.6mm; border-bottom: 0.3mm solid #000; font-size: 10pt; text-transform: uppercase; }
.ap-card-pieces .ap-list { overflow-wrap: anywhere; }
.ap-card-pieces .ap-tiles { margin-top: 1mm; }
.ap-card-steps { padding: 0.6mm 3mm 1mm; }
.ap-row { display: grid; grid-template-columns: 10mm 1fr; column-gap: 2mm; align-items: baseline; padding: 0.9mm 0; }
.ap-row + .ap-row { border-top: 0.3mm solid #000; }
.ap-row .ap-num { text-align: right; font-size: 11pt; font-weight: 700; }
.ap-row .ap-verb { font-size: 11pt; font-weight: 700; text-transform: uppercase; }
.ap-row .ap-zone { text-transform: uppercase; font-size: 10pt; }
.ap-with { font-size: 10pt; text-transform: uppercase; margin-top: 0.4mm; }
.ap-wires { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
.ap-wires path { fill: none; stroke: #000; stroke-width: 0.3; stroke-linecap: round; }
.ap-wires .ap-arrow { fill: #000; stroke: none; }

@media print {
  html, body { background: #fff !important; margin: 0; }
  .ap-toolbar { display: none !important; }
  .ap-stage-wrap { padding: 0 !important; height: auto !important; }
  .ap-stage { transform: none !important; }
  .ap-sheet { box-shadow: none; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
`;
