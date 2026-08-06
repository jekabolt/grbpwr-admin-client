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

function pointInPolygon(pt: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

// Куда ставить подпись. Центр bbox у вогнутой детали (обтачка, «Г»-образная планка) попадает в
// её собственный вырез — а подписи рисуются поверх ВСЕХ контуров, так что имя оказалось бы над
// соседней деталью и читалось бы как её. Поэтому центроид по площади, с откатом на центр bbox,
// если и он вне контура (бывает у подковообразных).
function labelAnchor(poly: readonly Pt[], bboxW: number, bboxH: number): Pt {
  const mid = { x: bboxW / 2, y: bboxH / 2 };
  if (poly.length < 3) return mid;
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const cross = p.x * q.y - q.x * p.y;
    a2 += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a2) < 1e-9) return mid;
  const c = { x: cx / (3 * a2), y: cy / (3 * a2) };
  if (pointInPolygon(c, poly)) return c;
  return pointInPolygon(mid, poly) ? mid : c;
}

export function PieceSheet({
  pieces,
  markOf,
  labelOf,
  selectedKey,
  keyOf,
  onPick,
}: {
  pieces: readonly PieceDTO[];
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
      setView({ x: at.x - (at.x - b.x) * scale, y: at.y - (at.y - b.y) * scale, w, h: b.h * scale });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [fit]);

  if (!fit || !box) {
    return (
      <div className='flex h-[46vh] w-full items-center justify-center border border-borderColor bg-bgColor'>
        <Text size='micro' variant='label'>
          в файле не нашлось контуров, которые можно показать
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
              />
            );
          })}

          {/* Подписи — отдельным проходом поверх ВСЕХ контуров: иначе имя крупной детали
              оказывалось бы под мелкой, лежащей на ней сверху. pointerEvents='none', чтобы
              текст не перехватывал клик у своей же детали. */}
          {ordered.map((p) => {
            const label = labelOf(p);
            if (!label) return null;
            const fs = box.w / 55;
            // Мельче трёх кеглей подпись всё равно нечитаема и превращается в грязь; на
            // приближении она вернётся сама, потому что кегль считается от окна.
            if (p.bboxW < fs * 3) return null;
            const a = labelAnchor(p.poly, p.bboxW, p.bboxH);
            return (
              <text
                key={`t${p.id}`}
                x={p.originX! + a.x}
                y={vy(p.originY! + a.y)}
                fontSize={fs}
                fill='#111111'
                textAnchor='middle'
                dominantBaseline='middle'
                pointerEvents='none'
              >
                {label}
              </text>
            );
          })}
        </svg>
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        <Text size='nano' variant='label' component='span'>
          клик по детали — выбрать · колесо — масштаб · тянуть — двигать
        </Text>
        <Button type='button' variant='secondary' size='xs' onClick={() => setView(null)}>
          весь лист
        </Button>
        {hidden > 0 && (
          <Text size='nano' component='span' className='text-error'>
            не показано деталей: {hidden} (нет координат в разборе)
          </Text>
        )}
      </div>
    </div>
  );
}
