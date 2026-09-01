import { cn } from 'lib/utility';
import { useEffect, useRef, useState } from 'react';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import Select from 'ui/components/select';
import Text from 'ui/components/text';

import { SvgImportDoor } from './svg-import-door';
import type { SelectionArea } from './vector-lasso';
import { MAX_NIB, MIN_NIB } from './vector-nib';
import {
  GAUGE_PRESETS,
  MAX_GAUGE,
  MAX_STEP,
  MIN_GAUGE,
  MIN_STEP,
  STEP_PRESETS,
  STITCHES,
  hasOwnStep,
  strokeGauge,
  strokeGeometry,
  strokeStep,
  type StitchKey,
  type VectorStroke,
  GAUGE_REF,
} from './vector-strokes';

/**
 * РЕЙКА КИСТЕЙ полноэкранного векторного редактора — все органы, которые НЕ являются холстом.
 *
 * ОДНА РЕЙКА, НЕСКОЛЬКО КОНТЕКСТОВ, И ЭТО ГЛАВНОЕ РЕШЕНИЕ ФАЙЛА. Пока ничего не выбрано, рейка
 * правит КИСТЬ В РУКЕ — вид шва, размер, цвет и «строительность» СЛЕДУЮЩЕГО штриха. Как только
 * инструмент `select` взял штрих, ровно те же органы правят ВЫБРАННЫЙ штрих. А когда в руке
 * круглый ниб (ластик или штамп), орган размера правит ЕГО диаметр — третий контекст того же
 * органа. Отдельные пульты на одни и те же свойства разъехались бы первой же правкой (у одного
 * появился бы орган, которого нет у другого), а человек получил бы два места, где «вид шва»
 * отвечает по-разному. Заголовок группы всегда говорит, каким из контекстов она сейчас является.
 *
 * ОБРАЗЦЫ РИСУЕТ ТОТ ЖЕ `strokeGeometry`, ЧТО СЦЕНУ, ЭКСПОРТ И РАСТР, — и в боксе 200 юнитов,
 * то есть в масштабе обычного чертежа, БЕЗ подмены scaleRef. Прежний пикер рисовал образец
 * 44×12 и девять видов были неотличимы: волна зигзага в 44-юнитовом боксе — полтора пикселя.
 * Образец шириной в честные 200 юнитов, показанный 1:1, — это тот же штрих, каким он ляжет на
 * плату, и различимость здесь свойство геометрии, а не увеличения. ОБРАЗЕЦ ТЕПЕРЬ ОДИН — вида,
 * выбранного в списке (Y-6); довод о честном боксе этим не тронут: он о масштабе, а не о числе
 * образцов, и девять боксов по 200 юнитов уносили под нижний край всё, что крутят чаще.
 *
 * ЗДЕСЬ ЖЕ ЖИВУТ ЗНАЧКИ ИНСТРУМЕНТОВ (`TOOL_ICONS`, `ToolIcon`) — их рисует не полоса над
 * холстом, а этот файл, потому что рисующая идиома (инлайновый `<svg>` под `currentColor`) уже
 * заведена здесь `StitchSample`, и второй такой же набор в соседнем файле разошёлся бы с этим
 * первой же правкой толщины линии.
 */

/** Бокс образца, в юнитах И в пикселях разом (1:1 — см. довод в шапке). */
const SAMPLE_W = 200;

/**
 * ВЫСОТА ОБРАЗЦА РАСТЁТ ПО ТОЛЩИНЕ НИТИ — И ТОЛЬКО ПО НЕЙ, потому что поперёк линии меряет она
 * одна. Это та же граница осей, по которой построен `strokeGeometry`: ВДОЛЬ линии (период волны,
 * шаг прокола, ритм пунктира) считает длина стежка, ПОПЕРЁК (амплитуда, зазор между рядами, вылет
 * зубца) — толщина нити. Вдоль линии образец смотрит в СВОЮ ШИРИНУ, а она фиксирована в 200
 * юнитов, так что стежку в этой формуле делать нечего.
 *
 * АРИФМЕТИКА МНОЖИТЕЛЯ, А НЕ ВКУС. Самый широкий поперёк вид — зигзаг: размах ±1.8·G плюс половина
 * нити 0.5·G с каждой стороны, итого 4.6·G во всю ширь (следом идут каверстич 4.2·G и оверлок
 * ≈3.9·G). В боксе шириной 200 юнитов G = gauge × SAMPLE_W / GAUGE_REF = 0.2 × gauge, значит
 * фигура занимает 0.92 × gauge пикселей — 1.1 это тот же множитель с запасом на круглую каппу.
 *
 * 22 — ПОЛ И ПРЕЖНИЙ БОКС. На всём видимом диапазоне нити (MIN_GAUGE..MAX_GAUGE = 1..20) высота
 * так и остаётся 22: 20 × 1.1 = 22 ровно. Расти бокс начинает только на числах, которых рукой не
 * набрать, — у штриха из старого документа, где формат хранит нить до 60. Ветку не убрать: такой
 * штрих можно ВЫБРАТЬ, и тогда образец обязан показать его целиком, а не срезанным краем.
 */
/**
 * ВЫСОТА ОБРАЗЦА — ПОД САМЫЙ ШИРОКИЙ ПОПЕРЁК ШОВ В МАСШТАБЕ ЧЕРТЕЖА.
 *
 * Множитель 1.1 был посчитан для старого масштаба, где образец рисовался впятеро мельче платы.
 * Теперь он в масштабе платы (см. довод у вызова `strokeGeometry`), и самый широкий вид — зигзаг,
 * ±1.8·G плюс нить, то есть 4.6·G. Пятёрка — он же с запасом на скругление концов.
 */
const sampleH = (gauge: number) => Math.max(22, Math.round(gauge * 5));

/**
 * ОБРАЗЕЦ ГОВОРИТ О ФОРМЕ И РАЗМЕРЕ, НО НЕ О ЦВЕТЕ, и это решение, а не упущение. Цвет нити виден
 * на самой плате и в ряду плашек ниже; окрашенный образец не добавил бы к этому ничего, зато
 * белая нить сделала бы все девять образцов НЕВИДИМЫМИ — пикер машин пропал бы целиком ровно на
 * той настройке, ради которой белую нить и завели (разметка по тёмной фотографии).
 */
export function StitchSample({
  brush,
  gauge,
  step,
  dashed,
}: {
  brush: StitchKey;
  gauge: number;
  /**
   * Длина стежка. Она задаёт ритм ВДОЛЬ линии — образец обязан слушать её, иначе покажет не тот
   * шов. В ВЫСОТУ бокса она не входит вовсе: вдоль линии образец смотрит в свою ширину (`sampleH`).
   */
  step: number;
  dashed: boolean;
}) {
  // ВЫСОТА БОКСА — ПО НИТИ, СТЕЖОК СЮДА НЕ ВХОДИТ (Д-3). Прежний `sampleH(max(gauge, step))`
  // пережил свою причину: он писался, когда поперечные размеры шва считались от стежка, а с тех
  // пор их посадили на нить. На паре «нить 1, стежок 60» настоящий шов остаётся ниткой в пятую
  // долю пикселя, а бокс раздувался до 66 пикселей почти пустого места и уносил нижние органы
  // рейки за нижний край. Образец обязан быть ростом с то, что показывает.
  const h = sampleH(gauge);
  const g = strokeGeometry(
    {
      tool: 'line',
      brush,
      weight: 'thin',
      gauge,
      step,
      dashed,
      pts: [
        [0.02, 0.5],
        [0.98, 0.5],
      ],
    },
    SAMPLE_W,
    h,
    /**
     * ⚠ ОБРАЗЕЦ РИСУЕТСЯ В МАСШТАБЕ ЧЕРТЕЖА, А НЕ КОРОБКИ.
     *
     * Без этого аргумента размеры шва считались долей от ширины коробки (200), то есть впятеро
     * мельче, чем на плате (1000). Пока нить по умолчанию была 6, это ещё сходило: период зигзага
     * выходил 6 px. После того как диапазон нити похудел до умолчания 2, все признаки съехали ниже
     * двух пикселей — период зигзага 2.0, зазор двухигольной 0.8 при толщине 0.4 — и ДЕВЯТЬ РАЗНЫХ
     * МАШИН стали рисовать в пикере одну и ту же серую линию. Переключение вида перестало менять
     * хоть что-то видимое, то есть орган выбора ослеп ровно от починки соседнего.
     */
    GAUGE_REF,
  );
  return (
    <svg
      width={SAMPLE_W}
      height={h}
      viewBox={`0 0 ${SAMPLE_W} ${h}`}
      aria-hidden
      className='block max-w-full shrink-0'
    >
      {g.offsets.map((dy, k) => (
        <path
          key={k}
          d={g.d}
          transform={`translate(0 ${dy})`}
          fill='none'
          stroke='currentColor'
          strokeWidth={g.strokeWidth}
          strokeDasharray={g.dash || undefined}
          strokeLinecap='round'
          strokeLinejoin='round'
        />
      ))}
    </svg>
  );
}

/**
 * ЗНАЧКИ — ТОЙ ЖЕ ИДИОМОЙ, ЧТО `StitchSample`: инлайновый `<svg>` в этом же файле, монохром через
 * `currentColor`, никаких иконочных библиотек. Значок наследует цвет чипа, поэтому он сам собой
 * инвертируется на выбранном (чёрном) чипе и гаснет на запертом — второго набора «для тёмного
 * фона» не существует по построению.
 *
 * ОДИН БОКС 16×16 НА ВСЕ, ОДНА ТОЛЩИНА ЛИНИИ. Разные боксы у соседних значков читаются как разный
 * вес: восемь одинаковых по смыслу инструментов выглядели бы восемью разными по важности.
 */
function Glyph({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox='0 0 16 16'
      width={14}
      height={14}
      aria-hidden
      focusable='false'
      fill='none'
      stroke='currentColor'
      strokeWidth={1.3}
      strokeLinecap='round'
      strokeLinejoin='round'
      className={cn('block shrink-0', className)}
    >
      {children}
    </svg>
  );
}

/**
 * ЗНАЧКИ ИНСТРУМЕНТОВ, КЛЮЧ — СТРОКА, А НЕ ТИП `Tool`. Тип объявлен в `vector-modal.tsx`, а тот
 * импортирует эту рейку: ключевать карту им значило бы завести круг импортов ради подписи под
 * кнопкой. Ключ-строка снимает связность в одну сторону, и цена названа честно — неизвестное имя
 * даёт ПУСТОТУ (`ToolIcon` вернёт `null`), а не белый экран: чип нового инструмента появится на
 * полосе со своей подписью, просто без значка, пока значок не нарисуют здесь.
 *
 * СПИСОК ЗАКРЫТ И СВЕРЕН С `Tool` РУКАМИ: line, freehand, curve, select, clone, paint, erase,
 * stamp, lasso, pan — десять имён, десять значков, ни одного лишнего.
 *
 * `cut` УШЁЛ (Y-9) — ластик снимает оба материала одним жестом, второго ластика для линий больше
 * нет. НОВОГО ИНСТРУМЕНТА ВЗАМЕН НЕ ЗАВОДИЛИ, и это решение, а не пропуск: `paint` УЖЕ круглая
 * мягкая кисть без фактуры, и отдельный чип рядом с ним был бы двумя кнопками с одним смыслом.
 * Поэтому мёртвый значок `plain` отсюда убран: он рисовал инструмент, которого нет и не будет, а
 * само слово `plain` в этом редакторе ЗАНЯТО — это первый вид шва (`StitchKey`, «plain line»,
 * который рисует `StitchSample` выше). Одно имя о двух разных вещах в одном файле — ровно то, на
 * чём споткнётся следующий читатель.
 *
 * ЧТО ЗНАЧОК ОБЯЗАН НАРИСОВАТЬ — РАБОТУ, А НЕ АБСТРАКЦИЮ: ластик СНИМАЕТ след, кисть КЛАДЁТ, и
 * значки повторяют это различие формой, а не оттенком.
 */
export const TOOL_ICONS: Record<string, React.ReactNode> = {
  // Отрезок между двумя узлами: сама работа инструмента — две точки и прямая между ними.
  line: (
    <Glyph>
      <path d='M3.7 12.3 12.3 3.7' />
      <circle cx='3.4' cy='12.6' r='1.5' fill='currentColor' stroke='none' />
      <circle cx='12.6' cy='3.4' r='1.5' fill='currentColor' stroke='none' />
    </Glyph>
  ),
  // След руки — та же линия, но ведённая, а не построенная.
  freehand: (
    <Glyph>
      <path d='M2.2 10.8c1.4-4.6 3.1-4.9 4.2-2.6 1 2.3 2.6 2.4 3.7.3 1-1.9 2.3-2.4 3.7-1.3' />
    </Glyph>
  ),
  // PEN — перо: якоря и ручки. Рисуется НЕ пунктиром пути, а самим пером, потому что путь без
  // инструмента неотличим от `line` в боксе 16 юнитов.
  curve: (
    <Glyph>
      <path d='M8 14.6 4.4 6.4 8 1.4l3.6 5-3.6 8.2Z' />
      <circle cx='8' cy='6.4' r='1' fill='currentColor' stroke='none' />
      <path d='M8 8.6v3' />
    </Glyph>
  ),
  // Курсор-стрелка: единственный инструмент, который ничего не кладёт, а берёт.
  select: (
    <Glyph>
      <path d='M4.2 2.3v10.6l2.7-2.3 1.9 3.6 1.6-.8-1.9-3.5 3.5-.5L4.2 2.3Z' />
    </Glyph>
  ),
  // Две рамки внахлёст — универсальное «копия»: клон кладёт копию линий под руку.
  clone: (
    <Glyph>
      <path d='M10.4 2.6H2.6v7.8' />
      <rect x='5.6' y='5.6' width='7.8' height='7.8' />
    </Glyph>
  ),
  // BRUSH — кисть: круглый мягкий кончик, кладущий цвет. Нарисована именно кистью, а не кругом,
  // потому что круг на этой полосе уже занят ластиком: два круга различались бы одной заливкой.
  paint: (
    <Glyph>
      <path d='M6 7.9l5.4-5.4a1.9 1.9 0 1 1 2.7 2.7L8.7 10.6' />
      <path d='M4.7 10c-1.1 0-2 .9-2 2 0 .9-1.7 1-1.3 1.4.7.7 1.7 1.3 2.7 1.3 1.5 0 2.7-1.2 2.7-2.7 0-1.1-.9-2-2.1-2Z' />
    </Glyph>
  ),
  // Ластик на поверхности: скошенный брусок и линия, по которой он трёт.
  erase: (
    <Glyph>
      <path d='M5.4 12.2 2.4 9.2 9.4 2.2l3 3-7 7Z' />
      <path d='M8.3 9.4 5.3 6.4' />
      <path d='M5.4 13.8H14' />
    </Glyph>
  ),
  // Штамп: колодка на основании — «взял оттуда, приложил сюда».
  stamp: (
    <Glyph>
      <path d='M3.3 14.4h9.4' />
      <path d='M12.9 9.2a1.7 1.7 0 0 0-1.2-.5H4.3a1.7 1.7 0 0 0-1.6 1.6v1.1c0 .4.3.7.6.7h9.4c.4 0 .6-.3.6-.7v-1.1c0-.4-.2-.9-.4-1.1Z' />
      <path d='M9.3 8.7V5.7c0-1 .7-1 .7-2.4a2 2 0 0 0-4 0c0 1.4.7 1.4.7 2.4v3' />
    </Glyph>
  ),
  // Лассо: петля ПУНКТИРОМ — тем же «муравьиным» пунктиром, каким обведена готовая область на
  // холсте, плюс висящая верёвка. Сплошная петля в боксе 16 юнитов читалась как лупа; пунктир
  // говорит «выделение», а не «увеличение», и повторяет то, что человек увидит после жеста.
  lasso: (
    <Glyph>
      <ellipse cx='8' cy='6.4' rx='5.4' ry='4.2' strokeDasharray='1.9 1.7' />
      <path d='M4.9 9.8c-1 1.1-1.3 2.5-.4 3.3' />
      <circle cx='4.9' cy='14' r='1' fill='currentColor' stroke='none' />
    </Glyph>
  ),
  // Панорама: лист двигают во все четыре стороны. Рука в боксе 16 юнитов сминается в кляксу,
  // крест со стрелками — нет.
  pan: (
    <Glyph>
      <path d='M8 2.4v11.2M2.4 8h11.2' />
      <path d='M6.4 4 8 2.4 9.6 4M6.4 12 8 13.6 9.6 12M4 6.4 2.4 8 4 9.6M12 6.4 13.6 8 12 9.6' />
    </Glyph>
  ),
};

/**
 * Значок инструмента по имени. Неизвестное имя — ПУСТОТА, а не исключение: полосы инструментов
 * рисует соседний файл, и его новый инструмент не должен уносить весь редактор в белое до того,
 * как здесь появится значок.
 */
export function ToolIcon({ kind }: { kind: string }) {
  return <>{TOOL_ICONS[kind] ?? null}</>;
}

/**
 * ПИПЕТКА И ПАЛИТРА — ДВА РАЗНЫХ ГЛАГОЛА, И ЗНАЧКИ ОБЯЗАНЫ РАЗЛИЧАТЬСЯ СИЛУЭТОМ, а не деталью:
 * пипетка ВЗЯТЬ цвет с холста (следующий клик читает картинку), палитра НАЗНАЧИТЬ цвет (открывает
 * системный выбор). Два похожих значка рядом читались бы как одна кнопка, нажатая дважды.
 */
const EyedropperIcon = () => (
  <Glyph>
    <path d='M2.5 13.5v-2.1l6-6 2.1 2.1-6 6H2.5Z' />
    <path d='M10 2.9a1.7 1.7 0 0 1 2.4 0l.7.7a1.7 1.7 0 0 1 0 2.4l-1.2 1.2-2.4-2.4L10 2.9Z' />
  </Glyph>
);

const PaletteIcon = () => (
  <Glyph>
    <path d='M8 1.6a6.4 6.4 0 1 0 0 12.8c.9 0 1.5-.6 1.5-1.4 0-.7-.5-1.1-.5-1.7 0-.6.5-1.1 1.1-1.1h1.3A3.2 3.2 0 0 0 14.4 7c0-3-2.8-5.4-6.4-5.4Z' />
    <circle cx='5' cy='5.4' r='.95' fill='currentColor' stroke='none' />
    <circle cx='8.4' cy='4.3' r='.95' fill='currentColor' stroke='none' />
    <circle cx='4.2' cy='9' r='.95' fill='currentColor' stroke='none' />
  </Glyph>
);

/**
 * КОЛОРПИКЕР — ОТДЕЛЬНЫЙ ОРГАН-ЗНАЧОК (Y-8), а не третья плашка. Плашка означает «вот этот цвет»;
 * здесь орган означает «любой цвет», и одинаковый с плашками вид обещал бы конечный список.
 * Технически это `<input type=color>` под ярлыком: ярлык и есть кнопка, поле спрятано `sr-only` —
 * но НЕ `display:none`, иначе клик по ярлыку некуда переслать и системный выбор не открывается
 * вовсе. Стоит рядом с пипеткой и различается с ней силуэтом: пипетка ЧИТАЕТ цвет с холста,
 * палитра НАЗНАЧАЕТ его.
 *
 * ── ОДНА ЗАПИСЬ В ДОКУМЕНТ НА ЖЕСТ, А НЕ ПОТОК (Д-1) ───────────────────────────────────────────
 *
 * Chrome шлёт `input` НЕПРЕРЫВНО, пока тянут ползунок оттенка, — по событию на кадр. React зовёт
 * `onChange` именно на `input` (`color` стоит в его списке текстоподобных полей), поэтому одна
 * протяжка приезжала сюда двумя десятками правок. А при ВЫБРАННОМ штрихе писатель цвета — это
 * `editStroke`, то есть полноценный шаг ленты отмены с копией всего массива штрихов: одна протяжка
 * съедала всю глубину ленты (24) и вытесняла из неё ВСЁ нарисованное до этого — молча, без единого
 * слова на экране, и ⌘Z переставал возвращать линии. Замерено на микро-стенде рейки: 24 события
 * `input` за протяжку → 24 вызова `onInk` до правки, 1 вызов после.
 *
 * ЛЕЧИТСЯ НЕ ДРОССЕЛЕМ, А ВЫБОРОМ СОБЫТИЯ, и это важно: дроссель по времени пришлось бы подбирать
 * под скорость руки и он всё равно писал бы в ленту середину жеста. У нативного поля цвета есть
 * два РАЗНЫХ события, и они означают разное: `input` — ход ползунка, `change` — завершённый жест
 * (браузер шлёт его, когда диалог закрывают). В документ уходит `change`; `blur` оставлен
 * страховкой на случай, когда диалог закрыли так, что `change` не пришёл, а `sentRef` не даёт паре
 * записать один и тот же цвет дважды.
 *
 * ЭТО ТОТ ЖЕ ПРИЁМ, ЧТО У СОСЕДНЕГО ПОЛЯ HEX: там писателя бережёт `readInk` в модалке — пока
 * набрано «#2f», в документ не уходит ничего, и правка случается ОДИН раз, когда цвет стал цветом.
 * `change` и есть «цвет стал цветом» для пальца на ползунке.
 *
 * ПОЧЕМУ СЛУШАТЕЛЬ ВЕШАЕТСЯ РУКАМИ: у React нет пропа для нативного `change` текстоподобного поля
 * — его `onChange` это `input`, и другого имени у события нет. `addEventListener('change')` на
 * своём же узле — не обход рамки, а единственный способ отличить жест от его хода.
 *
 * ЖИВОЕ ЗНАЧЕНИЕ ОРГАНА (`live`) ВО ВРЕМЯ ПРОТЯЖКИ ДЕРЖИТСЯ ЛОКАЛЬНО — иначе контролируемое поле
 * откатывалось бы к цвету документа под пальцем. Живого превью на РЕЙКЕ при этом нарочно нет:
 * плашка, показывающая цвет, которого в нити ещё нет, становится ложью органа ровно в тот раз,
 * когда жест кончился без `change`. Живое превью уместно на ХОЛСТЕ, и это правка в модалке —
 * превью-цвет мимо документа и мимо ленты (см. отчёт).
 */
function InkPicker({
  value,
  disabled,
  onPick,
}: {
  /** Последний ПОЛНЫЙ цвет нити, `#rrggbb`: другого нативное поле не принимает. */
  value: string;
  disabled: boolean;
  onPick: (hex: string) => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [live, setLive] = useState(value);
  const liveRef = useRef(value);
  /** Последнее, что ушло писателю. Страж от второй записи того же цвета парой `change`+`blur`. */
  const sentRef = useRef(value);
  // Внешняя правка цвета (плашка, пипетка, поле hex) обязана догнать орган. Во время протяжки
  // `value` не меняется — в документ ничего не уходит, — поэтому эффект не дёргает поле под рукой.
  useEffect(() => {
    liveRef.current = value;
    sentRef.current = value;
    setLive(value);
  }, [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const commit = () => {
      const next = liveRef.current;
      if (!next || next.toLowerCase() === sentRef.current.toLowerCase()) return;
      sentRef.current = next;
      onPick(next);
    };
    el.addEventListener('change', commit);
    el.addEventListener('blur', commit);
    return () => {
      el.removeEventListener('change', commit);
      el.removeEventListener('blur', commit);
    };
  }, [onPick]);
  return (
    <label
      title='pick any colour — the system colour picker'
      className={cn(
        'relative flex h-5 w-5 shrink-0 items-center justify-center border',
        'focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-textColor',
        disabled
          ? 'cursor-default border-borderColor text-textInactiveColor'
          : 'cursor-pointer border-borderColor text-textColor hover:border-textColor',
      )}
    >
      <PaletteIcon />
      <input
        ref={ref}
        type='color'
        value={live}
        disabled={disabled}
        aria-label='pick any ink colour'
        data-ink-picker=''
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          liveRef.current = e.target.value;
          setLive(e.target.value);
        }}
        className='sr-only'
      />
    </label>
  );
}

/**
 * ПАЛИТРА НИТИ — ДВА ОБРАЗЦА, А НЕ ШЕСТЬ (Y-7). Чёрное и белое — не «два цвета из шести», а два
 * РЕЖИМА разметки: белым размечают по тёмной фотографии, чёрным по всему остальному, и других
 * значений по умолчанию у нити нет. Прежние четыре системных цвета (красный/синий/зелёный/
 * фиолетовый) были словарём статусов на чертеже — словарём, которым никто не пользовался, зато
 * четыре плашки занимали ряд, ради которого рейка переносилась на вторую строку.
 *
 * ПРОИЗВОЛЬНЫЙ ЦВЕТ НЕ ПОТЕРЯН — он переехал В ОРГАН, а не в список: палитра-значок рядом
 * (`data-ink-picker`) открывает системный выбор, поле hex (`data-ink-hex`) принимает число руками.
 * То есть выбор стал БЕСКОНЕЧНЫМ вместо шести штук, а не сузился.
 */
const INKS: { hex: string; name: string }[] = [
  { hex: '#000000', name: 'ink — the default line' },
  { hex: '#ffffff', name: 'white — for marking over a dark photo' },
];

/** Пресеты ниба: тот же ряд из трёх чипов, что у нити, только числами — имён у ниба нет. */
const NIB_PRESETS = [12, 48, 120];

/**
 * Пресеты жёсткости и непрозрачности — той же формы `{key,label,px}`, что у нити и стежка, чтобы
 * их рисовал ТОТ ЖЕ `Regulator`. `px` здесь читается как «значение», а не как пиксели: единица
 * подписана отдельным полем, и общая форма стоит того, чтобы имя поля было чуть шире своего
 * первого смысла.
 */
const HARDNESS_PRESETS: readonly { key: string; label: string; px: number }[] = [
  { key: 'soft', label: 'soft', px: 0 },
  { key: 'half', label: 'half', px: 50 },
  { key: 'hard', label: 'hard', px: 100 },
];
const OPACITY_PRESETS: readonly { key: string; label: string; px: number }[] = [
  { key: 'faint', label: '20', px: 20 },
  { key: 'half', label: '50', px: 50 },
  { key: 'full', label: '100', px: 100 },
];

/**
 * ОДИН РЕГУЛЯТОР НА ВСЕ ЧИСЛА РЕЙКИ: имя, поле, единица, ряд пресетов, строка объяснения.
 *
 * Пять почти одинаковых рядов, написанных руками, — это пять мест, где грамматика разъедется:
 * у одного появится пресет, у другого исчезнет единица, третий забудет `aria-label`. Пресеты
 * приходят одной формой `{key,label,px}` — специально общей у нити, стежка, ниба, жёсткости и
 * непрозрачности, — и поэтому ряд чипов рисуется один раз.
 *
 * ВЫБРАННЫЙ ПРЕСЕТ СВЕРЯЕТСЯ ОКРУГЛЕНИЕМ ДО ЦЕЛОГО: числа хранятся десятыми долями, и чип «thin»
 * гас бы на 6.0000001 после единственного клика по стрелке поля.
 */
function Regulator({
  name,
  hint,
  value,
  min,
  max,
  unit,
  disabled,
  onChange,
  presets,
  probe,
  trailing,
}: {
  name: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  disabled: boolean;
  onChange: (n: number) => void;
  presets: readonly { key: string; label: string; px: number }[];
  /** Метка для проб: `data-<probe>-input` на поле, `data-<probe>-presets` на ряду чипов. */
  probe: string;
  trailing?: React.ReactNode;
}) {
  const shown = Math.round(value * 10) / 10;
  return (
    <div className='border-b border-hairline py-1' data-regulator={probe}>
      <div className='flex flex-wrap items-center gap-1.5'>
        <Text size='nano' variant='label' component='span' className='shrink-0 uppercase'>
          {name}
        </Text>
        <ChipRow>
          {presets.map((preset) => {
            const on = Math.round(shown) === Math.round(preset.px);
            return (
              <Chip
                key={preset.key}
                selected={on}
                pressed={on}
                disabled={disabled}
                onClick={() => onChange(preset.px)}
                title={`${name} ${preset.px}${unit}`}
              >
                {preset.label}
              </Chip>
            );
          })}
        </ChipRow>
        {trailing}
        <Input
          type='number'
          min={min}
          max={max}
          step={1}
          value={shown}
          disabled={disabled}
          aria-label={`${name}, ${unit === '%' ? 'per cent' : 'plate pixels'}`}
          {...{ [`data-${probe}-input`]: '' }}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value))}
          className='ml-auto w-14 shrink-0 text-right tabular-nums'
        />
        <Text size='nano' variant='label' component='span' className='shrink-0'>
          {unit}
        </Text>
      </div>
      <Text size='nano' variant='label' component='p'>
        {hint}
      </Text>
    </div>
  );
}

function LayerRow({
  on,
  onToggle,
  name,
  sub,
}: {
  on: boolean;
  onToggle: () => void;
  name: string;
  sub: string;
}) {
  return (
    <div className='flex items-center gap-2 border-b border-hairline py-1'>
      <button
        type='button'
        onClick={onToggle}
        aria-pressed={on}
        className='flex min-w-0 shrink-0 cursor-pointer items-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
      >
        <span
          className={cn(
            'flex h-3 w-3 shrink-0 items-center justify-center border border-textColor leading-none',
            on ? 'bg-textColor text-bgColor' : 'bg-bgColor',
          )}
        >
          <Text size='nano' component='span'>
            {on ? '✓' : ''}
          </Text>
        </span>
        <Text size='micro' variant='uppercase' tracking='label' component='span'>
          {name}
        </Text>
      </button>
      <Text size='nano' variant='label' component='span' className='ml-auto min-w-0 truncate'>
        {sub}
      </Text>
    </div>
  );
}

export type RailProps = {
  frozen: boolean;
  /* Кисть в руке — свойства СЛЕДУЮЩЕГО штриха. */
  brush: StitchKey;
  dashed: boolean;
  /** Цвет нити в руке, `#rrggbb`. */
  ink: string;
  /** Размер шва в руке, в пикселях платы. */
  gauge: number;
  /* Выбранный штрих; когда он есть, органы правят ЕГО, а не кисть. */
  selected: number | null;
  selectedStroke: VectorStroke | null;
  /**
   * ДЛИНА СТЕЖКА — ВТОРОЕ ЧИСЛО ШВА. `stepOwn` говорит, развёл ли контекст стежок с нитью своим
   * полем или стежок всё ещё следует за нитью; «следует» — законное состояние формата, не пропуск,
   * и рейка обязана уметь вернуть в него (`onStepFollow`), иначе связанность документа терялась бы
   * навсегда от одного клика по стрелке.
   */
  step: number;
  stepOwn: boolean;
  onStep: (px: number) => void;
  onStepFollow: () => void;
  onBrush: (brush: StitchKey) => void;
  /* Ступени веса ОТДЕЛЬНЫМ ПРОПОМ БОЛЬШЕ НЕ ПРИХОДЯТ: чипы `hairline/thin/bold` теперь рисует
     общий `Regulator` из `GAUGE_PRESETS`, и жмут они ту же `onGauge`, что и поле. Ступень всегда
     была ЯРЛЫКОМ на число, а не второй величиной, — второй писатель на неё был последним местом,
     где это могло разъехаться. */
  onDashed: (dashed: boolean) => void;
  onInk: (hex: string) => void;
  onGauge: (px: number) => void;
  onRemoveSelected: () => void;
  onDeselect: () => void;
  /**
   * НИБ В РУКЕ — размер КРУГЛОГО КОНЧИКА, ОТДЕЛЬНЫМ ЧИСЛОМ от нити. Не потому, что это две разных
   * величины по смыслу (обе — ширина следа инструмента), а потому, что человек держит их разными:
   * стирают крупным кругом, а рисуют тонкой нитью, и одно число заставляло бы крутить ручку
   * туда-обратно на каждой смене инструмента. Орган на рейке при этом ОДИН — он показывает то из
   * двух чисел, которое сейчас в руке, той же грамматикой «одна рейка, несколько контекстов».
   *
   * ОДИН НИБ НА ВСЕ ПЯТЬ КРУГЛЫХ ИНСТРУМЕНТОВ, а не по числу на каждый: довод выше отделяет
   * КОНЧИК от НИТИ, а не ластик от кисти. Пять ручек, которые крутят в одну сторону, — это пять
   * мест, где человек забудет покрутить одну.
   */
  nib: number;
  onNib: (px: number) => void;
  /** Имя инструмента круглого ниба в руке, или '' — тогда орган размера правит нить. */
  nibLabel: string;
  /**
   * В руке ПИКСЕЛЬНЫЙ инструмент. Тогда и только тогда у ниба есть жёсткость края и
   * непрозрачность: у резчика линий полутона не бывает — полилиния либо внутри контура, либо нет.
   */
  rasterTool: boolean;
  /** В руке инструмент ЛИНИЙ — тогда рейка показывает виды шва; иначе они молчат. */
  lineTool: boolean;
  hardness: number;
  onHardness: (pct: number) => void;
  opacity: number;
  onOpacity: (pct: number) => void;
  /** Пипетка взведена: следующий клик по холсту возьмёт цвет, а не нарисует. */
  picking: boolean;
  onPicking: (on: boolean) => void;
  /* Области лассо. Растушёвка — свойство КАЖДОЙ области; операции применяются к активной. */
  sels: SelectionArea[];
  activeSel: number | null;
  onActivateSel: (i: number | null) => void;
  onFeatherSel: (i: number, px: number) => void;
  onCopySel: (i: number) => void;
  onDeleteSel: (i: number) => void;
  onDropSel: (i: number) => void;
  /** Растушевать ПИКСЕЛИ внутри области — операция, а не ореол. Радиус берётся из её же числа. */
  onSoftenSel: (i: number) => void;
  /* Слои сцены. */
  vecOn: boolean;
  onVecOn: () => void;
  rasterOn: boolean;
  onRasterOn: () => void;
  strokesCount: number;
  baseLabel: string | null;
  /* Пиксельный канал: заведён ли, менялся ли, в каком разрешении. */
  rasterReady: boolean;
  rasterDirty: boolean;
  rasterSize: string;
  /** Сервер уже хранит живопись этого слоя — тогда её можно снять и вернуть нетронутое фото. */
  rasterStored: boolean;
  onDropRaster: () => void;
  /* ЛЕНТА ОТМЕНЫ — ПРИНИМАЕТСЯ, НО БОЛЬШЕ НЕ ПЕЧАТАЕТСЯ: группа «history» убрана по Y-3. Пропы
     оставлены НАМЕРЕННО, а не по забывчивости — снять их значило бы править вызывающую сторону
     ради удаления текста, а вернуть сигнал о вытеснении (`undoEvicted`) — это одна строка здесь.
     Потолки приходят ПРОПОМ, а не берутся из модуля: печатать можно только те числа, по которым
     лента реально вытесняет, а не свою копию их. */
  undoDepth: number;
  undoBytes: number;
  undoEvicted: boolean;
  undoCeiling: number;
  undoByteCeiling: number;
  /* Туда и обратно. */
  canDownload: boolean;
  onDownload: () => void;
  /**
   * Чем «download SVG» является для ЭТОГО слоя. Слой-файл отдаёт оригинал производителя, а не
   * пересериализацию, и слова обязаны сказать это; без пропа остаётся правда рисованного слоя.
   * После Y-3 живёт ПОДСКАЗКОЙ кнопки, а не абзацем на экране, — различие осталось выразимым.
   */
  outNote?: string;
  frameRatio: number;
  strokes: VectorStroke[];
  onImport: (strokes: VectorStroke[], mode: 'add' | 'replace') => void;
  /* Что случится при сохранении — слова зависят от того, есть ли база и слот. */
  saveNote: string;
};

export function VectorBrushRail(p: RailProps) {
  const editing = p.selected !== null && p.selectedStroke !== null;
  // Контекст органов: свойства выбранного штриха либо кисти в руке. Одна пятёрка значений на оба
  // случая — потому и одна пятёрка органов.
  const curBrush = editing ? p.selectedStroke!.brush : p.brush;
  const curDashed = editing ? p.selectedStroke!.dashed : p.dashed;
  const curInk = editing ? p.selectedStroke!.ink ?? '#000000' : p.ink;
  const curGauge = editing ? strokeGauge(p.selectedStroke!) : p.gauge;
  const curStep = editing ? strokeStep(p.selectedStroke!) : p.step;
  const stepOwn = editing ? hasOwnStep(p.selectedStroke!) : p.stepOwn;
  // ЧЕТВЁРТЫЙ КОНТЕКСТ ОРГАНА РАЗМЕРА — круглый ниб (резчик линий, клон, кисть, ластик, штамп).
  // Выбранный штрих старше инструмента: если строка взята, рейка правит ЕЁ, чем бы ни была занята
  // рука, — иначе «done» на выбранной строке означало бы разное в зависимости от того, какой чип
  // нажат над холстом.
  const sizingNib = !editing && !!p.nibLabel;
  const size = sizingNib ? p.nib : curGauge;
  const sizeMin = sizingNib ? MIN_NIB : MIN_GAUGE;
  const sizeMax = sizingNib ? MAX_NIB : MAX_GAUGE;
  const setSize = (n: number) => (sizingNib ? p.onNib(n) : p.onGauge(n));
  /**
   * ВИДЫ ШВА МОЛЧАТ, ПОКА В РУКЕ ПИКСЕЛЬНЫЙ ИНСТРУМЕНТ. Девять образцов, ни один из которых не
   * может ничего сделать, — это не «полный пульт», а девять органов, молча ничего не делающих; тот
   * же довод, по которому у развилки входа не рисуются чипы зума. Выбранный штрих старше руки:
   * взята строка — виды показываются, чем бы рука ни была занята.
   */
  const showStitches = editing || p.lineTool;
  /**
   * ВИД ШВА КАК СТРОКА СПИСКА, А НЕ КАК КЛЮЧ. Выпадающий список и превью под ним обязаны говорить
   * об одном и том же виде; беря обоих отсюда, развести их нельзя. Фолбэк на первый вид — не
   * украшение: ключ приезжает из документа, а документ мог быть записан вкладкой, знавшей вид,
   * которого в этой сборке ещё (или уже) нет, — и тогда список без совпадающего пункта прислал бы
   * обратно пустоту, стерев вид у выбранной строки.
   */
  const curStitch = STITCHES.find((s) => s.key === curBrush) ?? STITCHES[0];
  /**
   * Значение системного выбора цвета обязано быть `#rrggbb` — поле hex рядом принимает набранное
   * руками, и на полпути там законно живёт «#2f». Отдаём в орган последний ПОЛНЫЙ цвет, иначе
   * браузер молча подставит чёрный и вернёт его же следующим событием, перекрасив нить.
   */
  const pickerInk = /^#[0-9a-fA-F]{6}$/.test(curInk) ? curInk : '#000000';

  return (
    <div className='flex h-full w-[264px] shrink-0 flex-col gap-2 overflow-y-auto border border-borderColor bg-bgColor p-2.5'>
      {showStitches && (
        <div>
          <GroupLabel
            flush
            action={
              editing ? (
                <span className='flex items-center gap-1.5'>
                  <Button
                    variant='secondary'
                    size='xs'
                    disabled={p.frozen}
                    onClick={p.onRemoveSelected}
                  >
                    delete
                  </Button>
                  <Button variant='secondary' size='xs' onClick={p.onDeselect}>
                    done
                  </Button>
                </span>
              ) : undefined
            }
          >
            {editing ? `line ${p.selected! + 1} — its stitch` : 'brush — the next line'}
          </GroupLabel>
          <Text size='nano' variant='label' component='p' className='mb-1'>
            {editing
              ? 'these controls now edit the picked line. Esc or «done» puts the brush back in hand.'
              : 'pick the machine, then draw. 1–9 pick from the keyboard.'}
          </Text>
          {/* ОДИН ВЫБОР ВМЕСТО ДЕВЯТИ ОБРАЗЦОВ РАЗОМ (Y-6). Девять боксов по 200 юнитов занимали
              полрейки и прокручивали всё остальное за нижний край: человек, крутящий толщину,
              не видел ни цвета, ни стежка. Список видов — вещь, которую читают РАЗ в начале
              строчки, а размер и цвет крутят ПОСТОЯННО, и место на экране обязано делиться по
              частоте обращения, а не по числу вариантов.

              ЗНАЧЕНИЕ БЕРЁТСЯ ИЗ САМОГО СПИСКА (`curStitch`), а не из пропа: у Radix рядом со
              списком живёт скрытый нативный `<select>`, и значение, которого НЕТ среди пунктов,
              он принять не может — обратно приходит `onValueChange('')`, то есть пустота, которой
              никто не выбирал (замерено на операциях, см. довод в `ui/components/select.tsx`).
              Здесь пункты и значение считаются из ОДНОГО массива `STITCHES`, поэтому разъехаться
              им негде по построению.

              КЛАВИШИ 1–9 ЖИВЫ И НЕ ТРОНУТЫ: они висят в `vector-modal.tsx` на экране целиком, а
              гард `isTyping` глушит их на фокусе внутри поля/списка — ровно так же, как глушил на
              прежних кнопках `role=radio`. Смена органа этого не меняет. */}
          {/* Метка для проб стоит на ОБЁРТКЕ, а не на самом списке: примитив раздаёт лишние пропы
              `Select.Root`, а тот — не узел DOM, и `data-*` на нём просто исчезает (замерено:
              переписи узлов селектор не находил вовсе). */}
          <div data-stitch-select=''>
            <Select
              name='stitch-kind'
              placeholder='stitch kind'
              fullWidth
              disabled={p.frozen}
              // Запертый список обязан ВЫГЛЯДЕТЬ запертым: Radix метит кнопку `disabled`, но у
              // примитива на этот случай цвета нет, и в режиме только-чтения выбор видов читался
              // как живой (замерено на пресете `unreadable`).
              className='disabled:text-textInactiveColor'
              value={curStitch.key}
              items={STITCHES.map((s, i) => ({ value: s.key, label: `${i + 1} · ${s.name}` }))}
              onValueChange={(v: string) => p.onBrush(v as StitchKey)}
            />
          </div>
          {/* ПРЕВЬЮ РОВНО ВЫБРАННОГО ВИДА, В ЕГО ЖЕ НАСТРОЙКАХ — тем же `strokeGeometry`, что
              рисует сцену и экспорт. ISO-класс уехал СЮДА из строк списка: в пункте он воровал
              ширину у названия, а нужен он ровно в одном месте — рядом с тем, на что смотрят. */}
          <div
            className='mt-1 border border-borderColor px-1.5 py-1'
            data-stitch-preview={curBrush}
          >
            <StitchSample brush={curBrush} gauge={curGauge} step={curStep} dashed={curDashed} />
            <Text size='nano' variant='label' component='p'>
              {curStitch.name} · {curStitch.iso}
            </Text>
          </div>
        </div>
      )}

      {/* ── ЦВЕТ И ЧИСЛА. Один орган размера на четыре контекста (кисть / выбранная строка /
          круглый ниб / пиксельный ниб) — та же грамматика, что у видов шва выше, и заголовок
          группы говорит, чем она сейчас является. */}
      <div>
        <GroupLabel flush>{sizingNib ? `ink & the ${p.nibLabel} nib` : 'ink & seam'}</GroupLabel>
        <Text size='nano' variant='label' component='p' className='mb-1'>
          {p.rasterTool
            ? 'the nib is the round tip in your hand — its size, the softness of its edge and how much it lays down at once'
            : sizingNib
              ? 'the nib is the round tip in your hand; the ink below stays the brush’s, for when you pick it up again'
              : 'two numbers, not one: the THREAD it is sewn with, and the STITCH that thread lays. A thin thread with a long stitch is an ordinary basting seam.'}
        </Text>

        <div className='flex flex-wrap items-center gap-1 border-b border-hairline py-1'>
          {INKS.map((c) => {
            const on = curInk.toLowerCase() === c.hex;
            return (
              <button
                key={c.hex}
                type='button'
                disabled={p.frozen}
                aria-pressed={on}
                title={c.name}
                aria-label={`ink ${c.name}`}
                data-ink-swatch={c.hex}
                onClick={() => p.onInk(c.hex)}
                className={cn(
                  'h-5 w-5 shrink-0 cursor-pointer disabled:cursor-default',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor',
                  on ? 'border-2 border-textColor p-px' : 'border border-borderColor p-0.5',
                )}
              >
                <span className='block h-full w-full' style={{ background: c.hex }} />
              </button>
            );
          })}
          {/* СИСТЕМНЫЙ ВЫБОР ЦВЕТА — свой орган: в документ он пишет ОДИН раз за жест, а не по
              событию на кадр протяжки. Довод и замер — у самого `InkPicker`. */}
          <InkPicker value={pickerInk} disabled={p.frozen} onPick={p.onInk} />
          {/* ПИПЕТКА — ТОТ ЖЕ ОРГАН, ЧТО БЫЛ, ТОЛЬКО ЗНАЧКОМ (Y-8/Y-10): она взводит СЛЕДУЮЩИЙ
              клик по холсту, а не красит сейчас, поэтому у неё есть нажатое состояние, и оно
              нарисовано заливкой — тем же способом, что у выбранной плашки рядом. Имя для читалки
              осталось словом «eyedropper»: значок без имени невыразим ни голосом, ни пробой. */}
          <button
            type='button'
            disabled={p.frozen}
            aria-pressed={p.picking}
            aria-label='eyedropper'
            data-ink-eyedropper=''
            onClick={() => p.onPicking(!p.picking)}
            title='eyedropper — take the colour from the canvas, the picture underneath and the paint included (i)'
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center border',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor',
              'disabled:cursor-default disabled:text-textInactiveColor',
              p.picking
                ? 'border-textColor bg-textColor text-bgColor'
                : 'cursor-pointer border-borderColor bg-bgColor text-textColor hover:border-textColor',
            )}
          >
            <EyedropperIcon />
          </button>
          <Input
            type='text'
            value={curInk}
            disabled={p.frozen}
            aria-label='ink, hex'
            data-ink-hex=''
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => p.onInk(e.target.value)}
            className='ml-auto w-20 shrink-0 uppercase tabular-nums'
          />
        </div>

        {/* РЕГУЛЯТОР — ОДИН КОМПОНЕНТ НА ВСЕ ЧЕТЫРЕ ЧИСЛА (нить, стежок, ниб, жёсткость,
            непрозрачность). Три похожих ряда, написанных руками, разошлись бы первой правкой:
            у одного появилось бы поле, у другого пресеты, и «размер» начал бы означать разное. */}
        <Regulator
          name={sizingNib ? 'nib' : 'thread'}
          hint={
            sizingNib
              ? 'the diameter of the round tip, in plate pixels'
              : 'the thickness of the thread, in plate pixels'
          }
          value={size}
          min={sizeMin}
          max={sizeMax}
          unit='px'
          disabled={p.frozen}
          onChange={setSize}
          presets={
            sizingNib
              ? NIB_PRESETS.map((n) => ({ key: String(n), label: String(n), px: n }))
              : GAUGE_PRESETS
          }
          probe='size'
        />

        {/* ДЛИНА СТЕЖКА — ВТОРОЕ ЧИСЛО ШВА, и оно живёт только в контексте линии: у круглого ниба
            стежков не бывает. «Follows the thread» — законное состояние формата, а не пропуск:
            штрих без своего `step` шьётся стежком по нити, и документ остаётся прежней версии. */}
        {!sizingNib && (
          <Regulator
            name='stitch'
            hint={
              stepOwn
                ? 'the length of one stitch, set apart from the thread'
                : 'the length of one stitch — following the thread until you move it'
            }
            value={curStep}
            min={MIN_STEP}
            max={MAX_STEP}
            unit='px'
            disabled={p.frozen}
            onChange={p.onStep}
            presets={STEP_PRESETS}
            probe='step'
            trailing={
              stepOwn ? (
                <Chip
                  dashed
                  disabled={p.frozen}
                  onClick={p.onStepFollow}
                  title='let the stitch follow the thread again — the document stops carrying a stitch of its own'
                >
                  follow
                </Chip>
              ) : undefined
            }
          />
        )}

        {/* ЖЁСТКОСТЬ И НЕПРОЗРАЧНОСТЬ — только у пиксельного кончика. У резчика линий полутона нет
            вовсе: полилиния либо внутри контура, либо снаружи, и «наполовину вырезать» — не
            операция, а два органа, молча ничего не делающих. */}
        {p.rasterTool && (
          <>
            <Regulator
              name='hardness'
              hint='1 is a hard round edge; 0 fades from the centre out'
              value={p.hardness}
              min={0}
              max={100}
              unit='%'
              disabled={p.frozen}
              onChange={p.onHardness}
              presets={HARDNESS_PRESETS}
              probe='hardness'
            />
            <Regulator
              name='opacity'
              hint='how much one pass lays down — passes do not stack inside a single stroke'
              value={p.opacity}
              min={1}
              max={100}
              unit='%'
              disabled={p.frozen}
              onChange={p.onOpacity}
              presets={OPACITY_PRESETS}
              probe='opacity'
            />
          </>
        )}

        {!sizingNib && (
          <>
            <ChipRow>
              <Chip
                dashed
                selected={curDashed}
                pressed={curDashed}
                disabled={p.frozen}
                onClick={() => p.onDashed(!curDashed)}
              >
                construction
              </Chip>
            </ChipRow>
            <Text size='nano' variant='label' component='p'>
              dashed — a construction line; solid — what is sewn
            </Text>
          </>
        )}
      </div>

      <div>
        <GroupLabel flush>layers</GroupLabel>
        <LayerRow
          on={p.vecOn}
          onToggle={p.onVecOn}
          name='lines'
          sub={`${p.strokesCount} line${p.strokesCount === 1 ? '' : 's'} · editable for ever`}
        />
        {/* ПОДПИСЬ ПИКСЕЛЬНОГО СЛОЯ ГОВОРИТ ПРАВДУ О ТОМ, ЧТО ПОД НЕЙ. Прежнее «never touched»
            стало бы ложью в ту секунду, когда ластик прогрызает фотографию: слой ЕСТЬ копия
            подложки, и трогают именно его. Не тронутым остаётся исходное медиа, и это сказано
            отдельно — иначе человек решил бы, что стирает оригинал. */}
        {(p.baseLabel || p.rasterReady) && (
          <LayerRow
            on={p.rasterOn}
            onToggle={p.onRasterOn}
            name='pixels'
            sub={
              p.rasterReady
                ? `${p.rasterSize}${p.rasterDirty ? ' · painted' : ' · a copy of the base'}`
                : `${p.baseLabel ?? 'nothing yet'} · starts when a pixel tool is picked`
            }
          />
        )}
        {/* ДВА ПОЯСНИТЕЛЬНЫХ АБЗАЦА ОТСЮДА УБРАНЫ (Y-3): `data-base-note` («… is the original
            underneath…») и `data-pixels-note` («The pixel layer is a whole picture…»). Оба
            объясняли УСТРОЙСТВО хранения тому, кто в этот момент целится рукой; владелец прочёл
            их один раз и с тех пор они занимали треть колонки над органами, которые он крутит
            каждую минуту. Всё, что они обещали, осталось ОРГАНОМ, а не словами: возврат нетронутой
            картинки — кнопкой ниже (`data-drop-raster`), состояние пиксельного слоя — подписью
            строки слоя («painted» / «a copy of the base»). Ни один писатель не потерян. */}
        {/* СНЯТЬ ЖИВОПИСЬ — НЕ «СТЕРЕТЬ ХОЛСТ». Прозрачный холст, записанный как новое состояние,
            оставил бы фотографию стёртой навсегда; снятие канала возвращает подложку. Дверь
            существует только там, где есть что снимать. */}
        {p.rasterStored && (
          <div className='pt-1'>
            <Button
              variant='secondary'
              size='xs'
              disabled={p.frozen}
              onClick={p.onDropRaster}
              data-drop-raster=''
              title='drop the painted pixels on the next save and bring the untouched picture back'
            >
              revert to the untouched picture
            </Button>
          </div>
        )}
      </div>

      {/* ── ГРУППА «HISTORY» УБРАНА ЦЕЛИКОМ (Y-3). Она не держала ни одного органа — только счёт
          шагов, размер удержанных пикселей и слова про общий ⌘z, — поэтому убирать было нечего,
          кроме прозы. ⌘z и его потолок работают ровно как работали: и лента, и вытеснение живут в
          `vector-raster-history.ts`, рейка их лишь ПЕЧАТАЛА.
          ЧЕГО СТОИТ ЭТО УДАЛЕНИЕ, ЧЕСТНО: вместе с абзацем ушло единственное место, где вслух
          говорилось о вытеснении (`undoEvicted`) — то есть о молча потерянных старых шагах. Пропы
          `undoDepth/undoBytes/undoEvicted/undoCeiling/undoByteCeiling` РЕЙКА ПО-ПРЕЖНЕМУ
          ПРИНИМАЕТ (см. `RailProps`), так что вернуть сигнал одной строкой — или поднять его в
          шапку над холстом — можно, не трогая вызывающую сторону. */}
      {/* ОБЛАСТИ ЛАССО. Группа существует только вместе с областями: пустой пульт — шум.
          Растушёвка стоит В СТРОКЕ области — она принадлежит выделению, не инструменту, и две
          области честно держат два разных числа. Операции — под списком и только у АКТИВНОЙ:
          один пульт на текущий контекст, как у кисти и выбранного штриха выше. */}
      {p.sels.length > 0 && (
        <div>
          <GroupLabel flush>selections</GroupLabel>
          <Text size='nano' variant='label' component='p' className='mb-1'>
            an area holds the pixel tools inside it and cuts the lines at its edge. Feather is that
            area&rsquo;s own softness: it is how far the paint fades at the edge, and it is the
            radius «soften inside» blurs the pixels by.
          </Text>
          {p.sels.map((s, i) => {
            const active = p.activeSel === i;
            return (
              <div
                key={i}
                className='flex items-center gap-1.5 border-b border-hairline py-1'
                data-sel-row={i}
              >
                <Chip
                  selected={active}
                  pressed={active}
                  onClick={() => p.onActivateSel(active ? null : i)}
                  title={active ? 'deactivate this area' : 'make this area the active one'}
                >
                  area {i + 1}
                </Chip>
                <Text size='nano' variant='label' component='span' className='ml-auto shrink-0'>
                  feather
                </Text>
                <Input
                  type='number'
                  min={0}
                  max={200}
                  step={1}
                  value={s.feather}
                  disabled={p.frozen}
                  aria-label={`feather of area ${i + 1}, plate pixels`}
                  data-sel-feather-input={i}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    p.onFeatherSel(i, Number(e.target.value) || 0)
                  }
                  className='w-14 shrink-0 text-right tabular-nums'
                />
                <Text size='nano' variant='label' component='span' className='shrink-0'>
                  px
                </Text>
                <button
                  type='button'
                  onClick={() => p.onDropSel(i)}
                  title='drop this area — the strokes stay'
                  aria-label={`drop area ${i + 1}`}
                  className='shrink-0 cursor-pointer px-1 text-labelColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor'
                >
                  <Text size='micro' component='span'>
                    ✕
                  </Text>
                </button>
              </div>
            );
          })}
          {p.activeSel !== null && p.sels[p.activeSel] && (
            <div className='mt-1.5 flex flex-wrap items-center gap-1.5'>
              <Button
                variant='secondary'
                size='xs'
                disabled={p.frozen}
                onClick={() => p.onCopySel(p.activeSel!)}
                title='duplicate the LINES inside the active area (⌘c) — copies land slightly offset. Pixels are not copied.'
              >
                copy inside
              </Button>
              <Button
                variant='secondary'
                size='xs'
                disabled={p.frozen}
                onClick={() => p.onDeleteSel(p.activeSel!)}
                data-delete-inside=''
                title='remove everything inside this area (⌫) — the PIXELS erase through to transparency, and the lines are cut at the ants line so their outside pieces live on. A feather softens the erased edge.'
              >
                delete inside
              </Button>
              {/* РАСТУШЁВКА КАК ОПЕРАЦИЯ, А НЕ ОРЕОЛ. Число области здесь играет свою вторую роль
                  — радиус смягчения; заперта кнопка ровно тогда, когда числа нет, и подпись
                  говорит об этом, а не молчит. */}
              <Button
                variant='secondary'
                size='xs'
                disabled={p.frozen || !p.sels[p.activeSel]?.feather}
                onClick={() => p.onSoftenSel(p.activeSel!)}
                data-soften-inside=''
                title={
                  p.sels[p.activeSel]?.feather
                    ? `blur the PIXELS inside this area by ${p.sels[p.activeSel]?.feather}px — the pixels themselves, not a halo over them`
                    : 'give this area a feather first — it is the radius the pixels soften by'
                }
              >
                soften inside
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── ДВЕРИ НАРУЖУ И ОБРАТНО. АБЗАЦ УБРАН (Y-3), ОБА ОРГАНА НА МЕСТЕ И ТАМ ЖЕ, ГДЕ БЫЛИ:
          «download SVG» и дверь импорта — это ЕДИНСТВЕННЫЙ путь работы в стороннем редакторе, и
          потерять их значило бы потерять функцию, а не текст. Заголовок группы укорочен до «svg»:
          «out and back» был половиной объяснения, а не именем.
          ТЕКСТ АБЗАЦА НЕ ПРОПАЛ, А СТАЛ ПОДСКАЗКОЙ КНОПКИ. Он говорил то, чего по кнопке не
          видно, — чем именно является выгрузка ДЛЯ ЭТОГО слоя (файл производителя против
          пересериализации нарисованного), — и на слое-файле это разные вещи; `outNote` приходит
          пропом ровно ради этого различия. На экране его больше нет, под курсором он есть. */}
      <div>
        <GroupLabel flush>svg</GroupLabel>
        <div className='flex flex-wrap items-center gap-1.5'>
          <Button
            variant='secondary'
            size='xs'
            disabled={!p.canDownload}
            onClick={p.onDownload}
            title={
              p.outNote ??
              'the SVG is written by the same renderer that draws this screen; the raster is LINKED underneath, not embedded'
            }
          >
            download SVG
          </Button>
          <SvgImportDoor
            disabled={p.frozen}
            frameRatio={p.frameRatio}
            existing={p.strokes}
            onApply={p.onImport}
          />
        </div>
      </div>

      <div className='mt-auto border-t border-hairline pt-1.5'>
        <Text size='nano' variant='label' component='p'>
          {p.saveNote}
        </Text>
      </div>
    </div>
  );
}
