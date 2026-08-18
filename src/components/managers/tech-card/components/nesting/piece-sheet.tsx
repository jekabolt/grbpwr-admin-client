// Лист DXF как он есть: детали в СВОИХ координатах чертежа, кликабельные (Ф10.1).
//
// Почему это существует. Сопоставление блока с деталью кроя раньше делалось по таблице имён, а
// имя в файле — это то, что придумал экспортёр («PERED_S», «Block_17»). Понять, о какой детали
// речь, по такому имени нельзя: человек ориентируется по форме и по тому, где деталь лежит
// среди соседей. Поэтому единственный честный носитель вопроса «что это за деталь» — сам лист.
//
// Рисуем СВОИ разобранные контуры, а не файл через WebGL-вьювер: это ровно та геометрия, по
// которой считается раскладка и заводятся детали, так что показанное и сопоставляемое не могут
// разойтись. Вьювер красивее, но он ничего не знает про детали.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PieceDTO, Pt } from 'lib/nesting/types';
import { LabelSpace, planLabel, type LabelPlan } from 'lib/nesting/render/label-fit';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';

// Состояние блока на листе. Серо-чернильная палитра — та же, что у редактора раскладки;
// красный оставлен ровно за одним смыслом: связь снимается.
export type PieceMark = 'open' | 'staged' | 'mapped' | 'dropped' | 'unnamed';

const STYLE: Record<PieceMark, { fill: string; stroke: string; dash: boolean }> = {
  // не сопоставлена — пустая, пунктиром: это то, что ещё просит ответа
  open: { fill: '#ffffff', stroke: '#8a8a8a', dash: true },
  // выбор сделан в этой сессии, но карточка не сохранена
  staged: { fill: '#ececec', stroke: '#111111', dash: true },
  // связь уже лежит на сервере
  mapped: { fill: '#f2f2f2', stroke: '#111111', dash: false },
  // помечена «снять» — связь уйдёт при сохранении
  dropped: { fill: '#ffffff', stroke: '#c22222', dash: true },
  // в файле у контура нет имени блока, привязать не к чему
  unnamed: { fill: '#fafafa', stroke: '#d5d5d5', dash: false },
};

type Box = { x: number; y: number; w: number; h: number };

// Чертёжные координаты → экранные. DXF считает Y вверх, SVG — вниз, поэтому Y инвертируется
// ЗДЕСЬ, в числах, а не групповым transform='scale(1,-1)': под таким transform зеркалятся и
// подписи, и их пришлось бы разворачивать обратно на каждой детали.
const vy = (y: number) => -y;

// Сдвиг курсора, ниже которого жест считается кликом, а не протяжкой (экранные пиксели).
const DRAG_SLOP = 4;

// Угол долевой ДЛЯ ПОДПИСИ. Подпись, положенная вдоль долевой, ложится вдоль детали — так её и
// ждут в лекальном цеху. Требование «ровно один отрезок» то же, что у ориентации (см.
// geom/grain-orient.ts): два кандидата — значит непонятно, какой из них долевая. Деталь без
// блока пропускаем: в файле-россыпи кандидаты общие на весь чертёж, и один случайный отрезок
// развернул бы подписи всего листа.
function grainAngleForLabel(p: PieceDTO, layer: string): number | null {
  if (!p.blockName) return null;
  const all = p.grain ?? [];
  const hits = layer ? all.filter((c) => c.layer === layer) : all;
  return hits.length === 1 ? hits[0].angleDeg : null;
}

export function PieceSheet({
  pieces,
  markOf,
  labelOf,
  selectedKey,
  keyOf,
  onPick,
  grainLayer,
  innerLayers,
}: {
  pieces: readonly PieceDTO[];
  // Слой долевой. '' — не показывать. Рисуется поверх контуров: раскладка поворачивает деталь
  // именно по этой линии, и человек должен увидеть прочитанное ДО того, как ткань разрезана.
  grainLayer?: string;
  // Какие слои внутренней геометрии рисовать: линия шва (припуск виден как зазор до линии
  // кроя), надсечки, свёрла, вытачки. Без них деталь на экране — голый силуэт, а режут по ним.
  innerLayers?: ReadonlySet<string>;
  // Ключ, под которым деталь опознаётся снаружи (у диалога это регистронезависимое имя блока).
  // '' = у контура нет имени, кликать нечего.
  keyOf: (piece: PieceDTO) => string;
  markOf: (piece: PieceDTO) => PieceMark;
  labelOf: (piece: PieceDTO) => string;
  selectedKey: string | null;
  onPick: (key: string) => void;
}) {
  // Деталь без чертёжных координат показать негде (см. PieceDTO.originX) — такое приходит
  // только из сохранённого маркера, который на лист не кладут, но лучше отвалиться честно.
  const placed = useMemo(
    () => pieces.filter((p) => p.originX != null && p.originY != null),
    [pieces],
  );
  const hidden = pieces.length - placed.length;

  // Габарит листа по всем деталям + поля, чтобы подписи с краю не обрезались.
  const fit = useMemo<Box | null>(() => {
    if (placed.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of placed) {
      const ox = p.originX!;
      const oy = p.originY!;
      if (ox < minX) minX = ox;
      if (oy < minY) minY = oy;
      if (ox + p.bboxW > maxX) maxX = ox + p.bboxW;
      if (oy + p.bboxH > maxY) maxY = oy + p.bboxH;
    }
    const w = Math.max(maxX - minX, 1);
    const h = Math.max(maxY - minY, 1);
    const pad = Math.max(w, h) * 0.03;
    return { x: minX - pad, y: vy(maxY) - pad, w: w + 2 * pad, h: h + 2 * pad };
  }, [placed]);

  // Зум/панорама живут в viewBox. null = «как влезает».
  const [view, setView] = useState<Box | null>(null);
  const box = view ?? fit;
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Жест: одновременно кандидат на выбор детали и на протяжку — что это было, решает пройденный
  // путь. Раньше деталь съедала pointerdown через stopPropagation, и лист переставал двигаться
  // ровно там, где деталь заполняла кадр, то есть на любом полезном увеличении.
  const gesture = useRef<{ px: number; py: number; box: Box; key: string; moved: boolean } | null>(
    null,
  );
  // Кандидат, положенный деталью за мгновение до всплытия к svg. Отдельно от `gesture` и с
  // проверкой pointerId: иначе ключ от прошлого жеста, не снятого по какой-то причине, выделил
  // бы деталь при клике по пустому месту.
  const candidate = useRef<{ key: string; pointerId: number } | null>(null);
  const [panning, setPanning] = useState(false);

  // Крупные детали рисуются первыми: мелкая, лежащая в вырезе крупной, иначе оказалась бы под
  // ней и стала бы некликабельной.
  const ordered = useMemo(() => [...placed].sort((a, b) => b.areaCm2 - a.areaCm2), [placed]);

  // Подписи. Раньше имя рисовалось горизонтально одним кеглем в центроиде и у узкой или
  // диагональной детали уезжало на СОСЕДНЮЮ — на листе это читается как «вот эта деталь так и
  // называется». Теперь план (внутрь контура → поворот по долевой/длинной оси → мельче →
  // усечение → выноска) считает общий с раскладкой планировщик, см. lib/nesting/render/label-fit.
  //
  // Пересчитывается на МАСШТАБ, а не на кадр: кегль берётся от окна (box.w), а место подписи —
  // от чертежа, так что протяжка плана не меняет и платить за неё каждым кадром незачем.
  const labelTexts = ordered.map((p) => labelOf(p));
  const labelKey = labelTexts.join(' ');
  const viewW = box?.w ?? 0;
  const labelPlans = useMemo(() => {
    const out = new Map<number, LabelPlan>();
    if (!viewW || ordered.length === 0) return out;
    // Мельче этого подпись всё равно нечитаема; на приближении она вернётся сама, потому что
    // кегль считается от окна.
    const fontMax = viewW / 55;
    const fontMin = viewW / 130;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const polys = new Map<number, Pt[]>();
    for (const p of ordered) {
      const ox = p.originX!;
      const oy = p.originY!;
      polys.set(
        p.id,
        p.poly.map((pt) => ({ x: ox + pt.x, y: oy + pt.y })),
      );
      if (ox < minX) minX = ox;
      if (oy < minY) minY = oy;
      if (ox + p.bboxW > maxX) maxX = ox + p.bboxW;
      if (oy + p.bboxH > maxY) maxY = oy + p.bboxH;
    }
    // Выноска имеет право уйти чуть за габарит чертежа — лист всё равно рисуется с полями.
    const pad = fontMax * 3;
    const space = new LabelSpace({
      minX: minX - pad,
      minY: minY - pad,
      maxX: maxX + pad,
      maxY: maxY + pad,
    });
    for (const p of ordered) space.addPolygon(polys.get(p.id)!, p.id);
    ordered.forEach((p, i) => {
      const text = labelTexts[i];
      if (!text) return;
      out.set(
        p.id,
        planLabel({
          poly: polys.get(p.id)!,
          text,
          fontMaxCm: fontMax,
          fontMinCm: fontMin,
          preferredAngleDeg: grainAngleForLabel(p, grainLayer ?? ''),
          space,
          selfKey: p.id,
        }),
      );
    });
    return out;
    // labelTexts участвует через labelKey: сами функции labelOf приходят inline-стрелками и
    // меняют идентичность каждый рендер, а пересчёт плана на каждый кадр протяжки — дорого.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered, viewW, labelKey, grainLayer]);

  // Экранные пиксели на одну чертёжную единицу. SVG вписывает viewBox по УМОЛЧАНИЮ как
  // 'xMidYMid meet': масштаб единый по обеим осям, а лишнее место уходит в поля по краям.
  // Поэтому делить смещение курсора на ширину элемента нельзя — как только пропорции окна и
  // листа расходятся (а они расходятся всегда: окно фиксировано по высоте), зум под курсором и
  // протяжка уезжают тем сильнее, чем уже лист.
  const metricsOf = (b: Box) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    const scale = Math.min(r.width / b.w, r.height / b.h);
    return {
      scale,
      // Поля, которыми 'meet' центрирует вписанный лист.
      padX: (r.width - b.w * scale) / 2,
      padY: (r.height - b.h * scale) / 2,
      rect: r,
    };
  };

  // Колесо приходится вешать вручную. React регистрирует wheel корневым ПАССИВНЫМ слушателем,
  // из которого preventDefault невозможен, а тело модалки скроллится (overflow-y-auto): без
  // отмены один щелчок колеса и увеличивал лист, и уезжал с него. Держим последний viewBox в
  // ref, чтобы не переподписываться на каждый кадр зума.
  const boxRef = useRef<Box | null>(box);
  boxRef.current = box;
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      // Горизонтальный свайп по тачпаду даёт deltaY === 0 — без этого он читался бы как
      // приближение (проверка e.deltaY > 0 отправляет ноль в ветку «увеличить»).
      if (!e.deltaY) return;
      e.preventDefault();
      const b = boxRef.current;
      const m = b && metricsOf(b);
      if (!b || !m) return;
      const at = {
        x: b.x + (e.clientX - m.rect.left - m.padX) / m.scale,
        y: b.y + (e.clientY - m.rect.top - m.padY) / m.scale,
      };
      // Ограничения: дальше 40× не нужно никому, а обзор шире исходного превращает лист в точку.
      const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      const limit = fit ?? b;
      const w = Math.min(limit.w, Math.max(limit.w / 40, b.w * factor));
      const scale = w / b.w;
      setView({
        x: at.x - (at.x - b.x) * scale,
        y: at.y - (at.y - b.y) * scale,
        w,
        h: b.h * scale,
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [fit]);

  if (!fit || !box) {
    return (
      <div className='flex h-[46vh] w-full items-center justify-center border border-borderColor bg-bgColor'>
        <Text size='micro' variant='label'>
          no contours that can be shown were found in the file
        </Text>
      </div>
    );
  }

  const endGesture = () => {
    gesture.current = null;
    // Defensive: the svg's pointerdown always consumes the candidate (it bubbles there and
    // nothing stops it), but a leftover key must never be able to outlive its gesture — for a
    // mouse the pointerId is constant, so it would not be caught by the id check.
    candidate.current = null;
    setPanning(false);
  };

  return (
    <div className='space-y-1'>
      <div className='relative w-full border border-borderColor bg-bgColor'>
        <svg
          ref={svgRef}
          xmlns='http://www.w3.org/2000/svg'
          viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
          fontFamily='monospace'
          className={`h-[46vh] w-full touch-none ${panning ? 'cursor-grabbing' : 'cursor-grab'}`}
          onPointerDown={(e) => {
            // Только основная кнопка: правый клик открывает контекстное меню и никогда не
            // отдаёт pointerup, оставляя жест взведённым навсегда.
            if (e.button !== 0) return;
            const c = candidate.current;
            candidate.current = null;
            gesture.current = {
              px: e.clientX,
              py: e.clientY,
              box,
              // Деталь под курсором положила сюда свой ключ мгновением раньше (её pointerdown
              // идёт до всплытия), но НЕ гасила событие.
              key: c?.pointerId === e.pointerId ? c.key : '',
              moved: false,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const st = gesture.current;
            if (!st) return;
            const dx = e.clientX - st.px;
            const dy = e.clientY - st.py;
            if (!st.moved) {
              if (Math.abs(dx) + Math.abs(dy) < DRAG_SLOP) return;
              // Ушли дальше порога — это протяжка: выбор снимается, чтобы отпускание над
              // деталью не выделяло её «заодно».
              st.moved = true;
              st.key = '';
              setPanning(true);
            }
            const m = metricsOf(st.box);
            if (!m) return;
            // Масштаб за протяжку не меняется (двигается только начало viewBox), поэтому
            // достаточно одного пересчёта пикселей в сантиметры. Считаем от НАЧАЛА жеста, так
            // что порог не даёт скачка.
            setView({ ...st.box, x: st.box.x - dx / m.scale, y: st.box.y - dy / m.scale });
          }}
          onPointerUp={() => {
            const st = gesture.current;
            if (st && !st.moved && st.key) onPick(st.key);
            endGesture();
          }}
          onPointerCancel={endGesture}
          onLostPointerCapture={endGesture}
          onDoubleClick={() => setView(null)}
        >
          {ordered.map((p) => {
            const key = keyOf(p);
            const mark = markOf(p);
            const st = STYLE[mark];
            const on = !!key && key === selectedKey;
            const ox = p.originX!;
            const oy = p.originY!;
            const points = p.poly.map((pt) => `${ox + pt.x},${vy(oy + pt.y)}`).join(' ');
            // Толщина — от текущего окна, а не от листа: иначе на зуме обводка разъезжается
            // в кляксу.
            const sw = (on ? box.w / 280 : box.w / 520) || 0.01;
            const plan = labelPlans.get(p.id);
            return (
              <polygon
                key={p.id}
                points={points}
                fill={on ? '#e0e0e0' : st.fill}
                stroke={on ? '#111111' : st.stroke}
                strokeWidth={sw}
                strokeDasharray={st.dash ? `${box.w / 90} ${box.w / 150}` : undefined}
                className={key ? 'cursor-pointer' : undefined}
                onPointerDown={(e) => {
                  if (e.button !== 0 || !key) return;
                  // Кладём кандидата и ОТПУСКАЕМ событие дальше: панорама взводится на самом
                  // svg, а что это было — выбор или протяжка — решится по пройденному пути.
                  candidate.current = { key, pointerId: e.pointerId };
                }}
                // Двойной клик по листу возвращает обзор; по детали — не должен, иначе
                // привычный двойной щелчок по выбору выбрасывает весь зум.
                onDoubleClick={(e) => e.stopPropagation()}
              >
                {/* Усечённое имя обязано остаться восстановимым: подсказка висит на самой
                    детали, а не на подписи — та не принимает указатель, иначе перехватывала
                    бы клик у своего же контура. */}
                {plan?.truncated ? <title>{plan.full}</title> : null}
              </polygon>
            );
          })}

          {/* Внутренняя геометрия: линия шва, надсечки, свёрла, вытачки. Рисуется ПОД подписями
              и над контурами, тонко и серым — это чертёж детали, а не выделение. Замкнутые пути
              (линия шва) идут polygon'ом без заливки, открытые (надсечки, базовые) — polyline. */}
          {innerLayers && innerLayers.size > 0
            ? ordered.map((p) => {
                const paths = (p.inner ?? []).filter(
                  (c) => innerLayers.has(c.layer) && c.layer !== grainLayer,
                );
                if (paths.length === 0) return null;
                const ox = p.originX!;
                const oy = p.originY!;
                return (
                  <g key={`i${p.id}`} pointerEvents='none' fill='none' stroke='#8a8a8a'>
                    {paths.map((c, i) => {
                      const pts = c.pts.map((pt) => `${ox + pt.x},${vy(oy + pt.y)}`).join(' ');
                      const sw = box.w / 700 || 0.01;
                      return c.closed ? (
                        <polygon key={i} points={pts} strokeWidth={sw} />
                      ) : (
                        <polyline key={i} points={pts} strokeWidth={sw} />
                      );
                    })}
                  </g>
                );
              })
            : null}

          {/* Долевая: тот самый отрезок из файла, по которому раскладка разворачивает деталь.
              Отдельным проходом поверх контуров и без реакции на указатель — линия не должна
              перехватывать клик у своей же детали. */}
          {grainLayer
            ? ordered.map((p) => {
                const g = (p.grain ?? []).filter((c) => c.layer === grainLayer);
                // Ровно один отрезок = то, что ориентация считает долевой. Показываем ровно то,
                // чем она пользуется, иначе проверка проверяла бы не то.
                if (g.length !== 1) return null;
                const { a, b } = g[0];
                return (
                  <g key={`g${p.id}`} pointerEvents='none'>
                    <line
                      x1={a.x}
                      y1={vy(a.y)}
                      x2={b.x}
                      y2={vy(b.y)}
                      stroke='#c22222'
                      strokeWidth={box.w / 400 || 0.01}
                    />
                    {/* Засечки на концах: без них короткая линия читается как случайный штрих. */}
                    {[a, b].map((pt, i) => (
                      <circle
                        key={i}
                        cx={pt.x}
                        cy={vy(pt.y)}
                        r={box.w / 300 || 0.01}
                        fill='#c22222'
                      />
                    ))}
                  </g>
                );
              })
            : null}

          {/* Подписи — отдельным проходом поверх ВСЕХ контуров: иначе имя крупной детали
              оказывалось бы под мелкой, лежащей на ней сверху. pointerEvents='none', чтобы
              текст не перехватывал клик у своей же детали.

              Угол берётся со знаком минус: план считается в чертёжной системе (Y вверх), а
              лист рисуется через vy() — картинка зеркальна, и строка обязана лечь вдоль
              детали такой, какой её ВИДНО. */}
          {Array.from(labelPlans, ([id, plan]) => (
            <g key={`t${id}`} pointerEvents='none'>
              {plan.leader ? (
                <>
                  <circle
                    cx={plan.leader.dotX}
                    cy={vy(plan.leader.dotY)}
                    r={plan.fontCm * 0.22}
                    fill='#111111'
                  />
                  <line
                    x1={plan.leader.dotX}
                    y1={vy(plan.leader.dotY)}
                    x2={plan.leader.toX}
                    y2={vy(plan.leader.toY)}
                    stroke='#111111'
                    strokeWidth={box.w / 900 || 0.005}
                  />
                </>
              ) : null}
              <text
                transform={`translate(${plan.x} ${vy(plan.y)})${
                  plan.angleDeg ? ` rotate(${-plan.angleDeg})` : ''
                }`}
                fontSize={plan.fontCm}
                fill='#111111'
                textAnchor='middle'
                dominantBaseline='middle'
              >
                {plan.text}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        <Text size='nano' variant='label' component='span'>
          click a piece — select · wheel — zoom · drag — pan
        </Text>
        <Button type='button' variant='secondary' size='xs' onClick={() => setView(null)}>
          whole sheet
        </Button>
        {hidden > 0 && (
          <Text size='nano' component='span' className='text-error'>
            pieces not shown: {hidden} (no coordinates in the parse)
          </Text>
        )}
      </div>
    </div>
  );
}
