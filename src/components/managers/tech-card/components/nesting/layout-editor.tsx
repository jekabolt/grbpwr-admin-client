// Интерактивная панель раскладки (Ф5 — ручная доводка): те же полоса/линейка/детали, что
// в renderLayoutSvg, но JSX + pointer events. Перетаскивание — за деталь, поворот — R или
// кнопка тулбара; редактор только двигает Placement'ы и репортит их наверх, валидация и
// статистика живут в модалке (пересчёт на drop, не на каждый кадр). Живёт в lazy-чанке
// раскладки вместе с остальной геометрией.
import { useMemo, useRef, useState } from 'react';
import Text from 'ui/components/text';
import type { FabricDirection, NestResult, Placement, PieceDTO, RotationDeg } from 'lib/nesting/types';
import { allowedRotations } from 'lib/nesting/types';
import { type LayoutLabel, planLayoutLabels } from 'lib/nesting/render/label-fit';
import { rotatedBounds } from 'lib/nesting/geom/clearance';

const FILL = '#f2f2f2';
const FILL_SELECTED = '#e4e9f2';
const STROKE = '#8a8a8a';
const INK = '#111111';
const RULE = '#cccccc';
const TARGET = '#c22222';
const BAD = '#c22222';

export function LayoutEditor({
  pieces,
  placements,
  widthCm,
  usedLengthCm,
  targetCm,
  marginCm,
  allowCrossGrain,
  fabricDirection,
  editable,
  violating,
  onChange,
}: {
  pieces: readonly PieceDTO[];
  placements: readonly Placement[];
  widthCm: number;
  usedLengthCm: number;
  targetCm?: number;
  marginCm: number;
  allowCrossGrain: boolean;
  // Направление НАСТОЯЩЕЙ ткани этой раскладки — и у сохранённого маркера тоже (MarkersSection
  // резолвит скоуп его строки BOM). Раньше в режиме просмотра сюда подставлялось 'unknown', и это
  // была не осторожность, а дыра: редактор ПРЕДЛАГАЛ поставить деталь на 180° на ворсовой ткани,
  // а сервер такую правку старой строки принимал по помилованию — и строка оставалась помилованной
  // навсегда. Сохранённые повороты при этом ничего не теряют: rotsFor ниже всегда держит ТЕКУЩИЙ
  // поворот детали в цикле, поэтому 180° легаси-маркера остаётся выбранным и выбираемым.
  fabricDirection: FabricDirection;
  editable: boolean;
  // Placement indices that violate clearances — painted red.
  violating: ReadonlySet<number>;
  // Fired on drop / rotate with the full new placement array.
  onChange: (next: Placement[]) => void;
}) {
  const byId = useMemo(() => new Map(pieces.map((p) => [p.id, p])), [pieces]);
  // ТОТ ЖЕ планировщик подписей, что у SVG-экспорта и плоттерного DXF.
  //
  // Это ГЛАВНЫЙ экран: потоковое превью показывается только пока идёт прогон, а готовый прогон,
  // сохранённый маркер и ручная правка рисуются здесь — и именно отсюда жмут «скачать DXF».
  // Пока редактор рисовал подпись по-своему (горизонтально, одним кеглем, в центре повёрнутого
  // ГАБАРИТА), картинка после окончания прогона возвращалась к разъезжающимся именам, а усечение,
  // которое уедет на резак, на экране не показывалось вообще — проверить его было негде.
  //
  // Пересчёт привязан к ЗАФИКСИРОВАННЫМ размещениям: во время перетаскивания план не трогаем, у
  // тянущейся детали подпись едет за ней по-старому, а на pointerup всё пересобирается. Иначе
  // каждый кадр перетаскивания стоил бы полного планирования.
  const labelPlans = useMemo(
    () =>
      planLayoutLabels(
        { placements: [...placements], usedLengthCm } as unknown as NestResult,
        pieces,
        widthCm,
      ),
    [placements, pieces, widthCm, usedLengthCm],
  );
  const planByKey = useMemo(() => {
    const m = new Map<string, LayoutLabel>();
    for (const l of labelPlans) m.set(`${l.placement.pieceId}|${l.placement.instance}`, l);
    return m;
  }, [labelPlans]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  // Live drag: index + current translation override (committed on pointerup).
  const [drag, setDrag] = useState<{ index: number; x: number; y: number } | null>(null);
  const dragStart = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  // ТА ЖЕ функция, что применяет движок. Направление ткани решает переворот на 180°, и решать
  // его здесь отдельным выражением значило бы завести вторую копию политики, которая разойдётся
  // с первой молча: рука предложила бы поворот, которого поиск не рассматривал, и маркер на
  // ворсовой ткани уехал бы на резак с деталями против ворса.
  const rots: RotationDeg[] = allowedRotations(fabricDirection, allowCrossGrain);
  const usableWidth = Math.max(0, widthCm - 2 * marginCm);

  // Поворот предлагается только в тех положениях, где деталь помещается по ширине —
  // то же правило, что у движка (nest/index.ts). Текущий поворот всегда остаётся в
  // цикле: сохранённый маркер может нести 90° при allowCrossGrain=false, и кнопка не
  // должна молча уводить деталь на 0°.
  //
  // Зеркало передаётся насквозь: у отражённого варианта габариты те же по РАЗМЕРУ, но другие по
  // положению ([0,w] переезжает в [−w,0]), а «влезает ли по ширине» — вопрос про размер. Считать
  // его по незеркальному контуру было бы верно по числу и неверно по смыслу; передаём флаг, чтобы
  // здесь и в clamp ниже мерялась одна и та же деталь.
  const rotsFor = (piece: PieceDTO, current: RotationDeg, flipped?: boolean): RotationDeg[] => {
    const fitting = rots.filter((r) => {
      const b = rotatedBounds(piece, r, flipped);
      return b.maxY - b.minY <= usableWidth + 1e-9;
    });
    if (!fitting.includes(current)) fitting.unshift(current);
    return fitting.length > 0 ? fitting : [current];
  };

  const W = widthCm;
  const L = Math.max(usedLengthCm, targetCm ?? 0, 10);
  const pad = Math.max(4, W * 0.04);

  // Static per-piece point strings — dragging only changes the group transform.
  const pointsById = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of pieces)
      m.set(p.id, p.poly.map((pt) => `${pt.x.toFixed(2)},${pt.y.toFixed(2)}`).join(' '));
    return m;
  }, [pieces]);

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const loc = pt.matrixTransform(m.inverse());
    return { x: loc.x, y: loc.y };
  };

  const clamp = (index: number, x: number, y: number, rot: RotationDeg) => {
    const pl = placements[index];
    const piece = byId.get(pl.pieceId);
    if (!piece) return { x, y };
    // ЗЕРКАЛО обязано попасть в габариты: у отражённой детали собственный bbox лежит в [−w, 0],
    // а не в [0, w]. Зажим по незеркальным границам разрешил бы утащить её на целую ширину за
    // кромку — и это не «немного неточно», а деталь, которой на полотне нет.
    const rb = rotatedBounds(piece, rot, pl.flipped);
    // Полоса физически ограничена поперёк и слева; вправо длина открыта.
    const minY = marginCm - rb.minY;
    const maxY = W - marginCm - rb.maxY;
    const minX = marginCm - rb.minX;
    return {
      x: Math.max(minX, x),
      y: maxY >= minY ? Math.min(Math.max(minY, y), maxY) : y,
    };
  };

  const startDrag = (index: number, e: React.PointerEvent<SVGGElement>) => {
    if (!editable) return;
    e.stopPropagation();
    setSelected(index);
    const pl = placements[index];
    const p = toSvg(e);
    dragStart.current = { px: p.x, py: p.y, x: pl.x, y: pl.y };
    setDrag({ index, x: pl.x, y: pl.y });
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const moveDrag = (e: React.PointerEvent<SVGGElement>) => {
    const st = dragStart.current;
    if (!st || !drag) return;
    const p = toSvg(e);
    const next = clamp(
      drag.index,
      st.x + (p.x - st.px),
      st.y + (p.y - st.py),
      placements[drag.index].rot,
    );
    setDrag({ index: drag.index, x: next.x, y: next.y });
  };

  const endDrag = () => {
    if (!drag) return;
    const { index, x, y } = drag;
    setDrag(null);
    dragStart.current = null;
    const pl = placements[index];
    if (Math.abs(pl.x - x) > 1e-6 || Math.abs(pl.y - y) > 1e-6) {
      const next = placements.map((q, i) => (i === index ? { ...q, x, y } : q));
      onChange(next);
    }
  };

  const rotateSelected = () => {
    if (!editable || selected == null) return;
    const pl = placements[selected];
    const piece = byId.get(pl.pieceId);
    if (!piece) return;
    const list = rotsFor(piece, pl.rot, pl.flipped);
    const rot = list[(list.indexOf(pl.rot) + 1) % list.length];
    if (rot === pl.rot) return; // единственное допустимое положение — вращать некуда
    // Держим центр повёрнутого bbox на месте, чтобы деталь не «прыгала». Зеркальность у обоих
    // габаритов ОДНА И ТА ЖЕ: поворот её не меняет (M применяется до R), кнопка «повернуть»
    // зеркало не снимает и не наводит.
    const rb0 = rotatedBounds(piece, pl.rot, pl.flipped);
    const rb1 = rotatedBounds(piece, rot, pl.flipped);
    const cx = pl.x + (rb0.minX + rb0.maxX) / 2;
    const cy = pl.y + (rb0.minY + rb0.maxY) / 2;
    const raw = { x: cx - (rb1.minX + rb1.maxX) / 2, y: cy - (rb1.minY + rb1.maxY) / 2 };
    const c = clamp(selected, raw.x, raw.y, rot);
    onChange(placements.map((q, i) => (i === selected ? { ...q, rot, x: c.x, y: c.y } : q)));
  };

  const selPiece = selected != null ? byId.get(placements[selected]?.pieceId) : undefined;

  // Пометки размещения тем же словарём, что и планировщик подписей (render/label-fit.ts): поворот
  // и «зеркало». Левая и правая полочки на маркере отличаются ТОЛЬКО хиральностью — если её нигде
  // не написать, человек, сверяющий раскладку с комплектом кроя, различить их не сможет.
  const marksOf = (pl: Placement): string => {
    const m = [pl.rot ? `${pl.rot}°` : '', pl.flipped ? 'mirror' : ''].filter(Boolean);
    return m.length > 0 ? ` (${m.join(', ')})` : '';
  };

  return (
    <div className='space-y-1'>
      {editable && (
        <div className='flex flex-wrap items-center gap-2'>
          <Text size='nano' variant='label' component='span'>
            {selected != null && selPiece
              ? `selected: ${selPiece.name}${marksOf(placements[selected])}`
              : 'drag a piece · click — select · R — rotate'}
          </Text>
          {selected != null &&
            selPiece &&
            rotsFor(selPiece, placements[selected].rot, placements[selected].flipped).length > 1 && (
              <button
                type='button'
                className='text-nano uppercase underline hover:opacity-70'
                onClick={rotateSelected}
              >
                rotate (R)
              </button>
            )}
        </div>
      )}
      <div
        className='max-h-[56vh] w-full overflow-auto border border-borderColor bg-bgColor outline-none'
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') && editable) {
            e.preventDefault();
            rotateSelected();
          }
        }}
      >
        <svg
          ref={svgRef}
          xmlns='http://www.w3.org/2000/svg'
          viewBox={`${-pad} ${-pad} ${L + 2 * pad} ${W + 2 * pad}`}
          fontFamily='monospace'
          className='h-auto w-full'
          onPointerDown={() => setSelected(null)}
        >
          <rect
            x={0}
            y={0}
            width={L}
            height={W}
            fill='#ffffff'
            stroke={RULE}
            strokeWidth={W / 300}
          />
          {marginCm > 0 && (
            <rect
              x={marginCm}
              y={marginCm}
              width={Math.max(0, L - marginCm)}
              height={Math.max(0, W - 2 * marginCm)}
              fill='none'
              stroke={RULE}
              strokeWidth={W / 600}
              strokeDasharray={`${W / 90} ${W / 120}`}
            />
          )}
          {Array.from({ length: Math.floor(L / 10) + 1 }, (_, k) => k * 10).map((x) => (
            <g key={x}>
              <line x1={x} y1={W} x2={x} y2={W + W / 60} stroke={RULE} strokeWidth={W / 500} />
              {x % 50 === 0 && x > 0 && (
                <text x={x} y={W + W / 20} fontSize={W / 30} fill={STROKE} textAnchor='middle'>
                  {x}
                </text>
              )}
            </g>
          ))}

          {placements.map((pl, index) => {
            const piece = byId.get(pl.pieceId);
            if (!piece) return null;
            const live = drag?.index === index ? drag : pl;
            const bad = violating.has(index);
            const rb = rotatedBounds(piece, pl.rot, pl.flipped);
            const lx = live.x + (rb.minX + rb.maxX) / 2;
            const ly = live.y + (rb.minY + rb.maxY) / 2;
            const label = pl.instance > 0 ? `${piece.name} ×${pl.instance + 1}` : piece.name;
            return (
              <g key={index}>
                {/* ДОГОВОР О РАЗМЕЩЕНИИ, выраженный матрицами SVG (lib/nesting/types.ts):
                        placed(p) = R(rot) · M^flipped · p + (x, y),   M: (x, y) ↦ (−x, y)
                    Список transform'ов SVG перемножается СЛЕВА НАПРАВО, а к точке применяется
                    справа налево — то есть `translate rotate scale(-1 1)` это ровно T·R·M, и
                    зеркало срабатывает ПЕРВЫМ, в собственных координатах детали. Порядок здесь
                    не косметика: M·R(θ) = R(−θ)·M, поэтому «scale перед rotate» разошёлся бы с
                    движком на 2θ — то есть НЕ РАЗОШЁЛСЯ БЫ ВОВСЕ на 0° и 180° и разъехался бы на
                    180° у детали на 90°. Экран показывал бы деталь, которой в файле для резака
                    нет, и никакой признак этого не выдал бы: контур остаётся контуром.
                    Ось тоже часть договора — scale(-1 1), а не scale(1 -1): вторая нарисовала бы
                    столь же правдоподобную деталь ровно в полуобороте от нужного места. */}
                <g
                  transform={`translate(${live.x} ${live.y}) rotate(${pl.rot})${pl.flipped ? ' scale(-1 1)' : ''}`}
                  className={editable ? 'cursor-move' : undefined}
                  onPointerDown={(e) => startDrag(index, e)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                >
                  <polygon
                    points={pointsById.get(pl.pieceId) ?? ''}
                    fill={selected === index ? FILL_SELECTED : FILL}
                    stroke={bad ? BAD : selected === index ? INK : STROKE}
                    strokeWidth={bad || selected === index ? W / 250 : W / 400}
                  />
                  {/* Чертёж детали внутри контура: линия шва, надсечки, свёрла, вытачки. Едут
                      тем же transform'ом, что и контур, поэтому остаются на своих местах при
                      любом повороте и перетаскивании. Раскройщик режет по маркеру — маркер без
                      надсечек неполон. */}
                  {(piece.inner ?? []).map((c, k) => {
                    const pts = c.pts
                      .map((pt) => `${pt.x.toFixed(2)},${pt.y.toFixed(2)}`)
                      .join(' ');
                    return c.closed ? (
                      <polygon
                        key={k}
                        points={pts}
                        fill='none'
                        stroke={STROKE}
                        strokeWidth={W / 700}
                      />
                    ) : (
                      <polyline
                        key={k}
                        points={pts}
                        fill='none'
                        stroke={STROKE}
                        strokeWidth={W / 700}
                      />
                    );
                  })}
                </g>
                {(() => {
                  const planned = planByKey.get(`${pl.pieceId}|${pl.instance}`);
                  // Во время перетаскивания план устарел по координатам — показываем старую
                  // простую подпись, она едет вместе с деталью; на pointerup план пересоберётся.
                  if (!planned || drag?.index === index) {
                    return (
                      <text
                        x={lx}
                        y={ly}
                        fontSize={W / 40}
                        fill={bad ? BAD : INK}
                        textAnchor='middle'
                        pointerEvents='none'
                      >
                        {label}
                        {marksOf(pl)}
                      </text>
                    );
                  }
                  const { plan } = planned;
                  return (
                    <g pointerEvents='none'>
                      {plan.leader && (
                        <>
                          <circle
                            cx={plan.leader.dotX}
                            cy={plan.leader.dotY}
                            r={plan.fontCm * 0.22}
                            fill={bad ? BAD : INK}
                          />
                          <line
                            x1={plan.leader.dotX}
                            y1={plan.leader.dotY}
                            x2={plan.leader.toX}
                            y2={plan.leader.toY}
                            stroke={bad ? BAD : INK}
                            strokeWidth={W / 900}
                          />
                        </>
                      )}
                      <text
                        x={plan.box.cx}
                        y={plan.box.cy}
                        fontSize={plan.fontCm}
                        fill={bad ? BAD : INK}
                        textAnchor='middle'
                        dominantBaseline='central'
                        fontFamily='monospace'
                        transform={`rotate(${plan.box.angleDeg} ${plan.box.cx} ${plan.box.cy})`}
                      >
                        {plan.text}
                        {plan.truncated && <title>{label}</title>}
                      </text>
                    </g>
                  );
                })()}
              </g>
            );
          })}

          <line
            x1={usedLengthCm}
            y1={0}
            x2={usedLengthCm}
            y2={W}
            stroke={INK}
            strokeWidth={W / 300}
          />
          {targetCm != null && targetCm > 0 && (
            <line
              x1={targetCm}
              y1={0}
              x2={targetCm}
              y2={W}
              stroke={TARGET}
              strokeWidth={W / 300}
              strokeDasharray={`${W / 60} ${W / 90}`}
            />
          )}
        </svg>
      </div>
    </div>
  );
}
