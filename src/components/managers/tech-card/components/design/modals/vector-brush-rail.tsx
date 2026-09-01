import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
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
 * плату, и различимость здесь свойство геометрии, а не увеличения.
 */

/** Бокс образца, в юнитах И в пикселях разом (1:1 — см. довод в шапке). */
const SAMPLE_W = 200;

/**
 * ВЫСОТА ОБРАЗЦА РАСТЁТ ВМЕСТЕ С РАЗМЕРОМ ШВА. 22 юнита — прежний бокс, и на кисти по умолчанию
 * (6) он ровно прежний. Но крупный шов кладёт волну амплитудой в полторы толщины нити, и в
 * фиксированном боксе она была бы срезана краем: образец показывал бы шов МЕНЬШЕ, чем он ляжет,
 * ровно на той настройке, ради которой ручку размера и завели.
 */
const sampleH = (gauge: number) => Math.max(22, Math.round(gauge * 1.1));

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
  /** Длина стежка. Именно она задаёт фигуру — образец обязан слушать её, а не одну нить. */
  step: number;
  dashed: boolean;
}) {
  // ВЫСОТА БОКСА РАСТЁТ ПО СТЕЖКУ, А НЕ ПО НИТИ: поперечные размеры фигуры посажены на стежок, и
  // «тонкая нитка длинным стежком» — та самая пара, ради которой регулятора стало два, — была бы
  // срезана краем бокса ровно на ней.
  const h = sampleH(Math.max(gauge, step));
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
 * ПАЛИТРА НИТИ — шесть цветов, и это НЕ украшение, поэтому правило монохрома не нарушено.
 *
 * Чёрное и белое — сама нить: белым размечают по тёмной фотографии, чёрным по всему остальному.
 * Остальные четыре взяты НЕ произвольно, а ровно из палитры системы, и означают на чертеже то же
 * самое, что и везде в админке: красный — сломано и подлежит переделке, синий — вопрос в полёте,
 * зелёный — принято, фиолетовый — единственный акцент. Технолог, читающий флэт, читает те же
 * четыре слова, что и на любом другом экране, — а не «цветовое кодирование по вкусу рисовавшего».
 */
const INKS: { hex: string; name: string }[] = [
  { hex: '#000000', name: 'ink — the default line' },
  { hex: '#ffffff', name: 'white — for marking over a dark photo' },
  { hex: '#ff0000', name: 'red — broken, to be redone' },
  { hex: '#2323ff', name: 'blue — a question, mid-flight' },
  { hex: '#0f7a34', name: 'green — approved as drawn' },
  { hex: '#311eee', name: 'purple — the single accent' },
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
  /* Лента отмены — ОДНА на линии и пиксели. Потолок называется вслух: см. группу «history». */
  undoDepth: number;
  undoBytes: number;
  undoEvicted: boolean;
  /** Потолки приходят ПРОПОМ, а не берутся здесь из модуля: рейка обязана печатать те числа, по
   *  которым лента реально вытесняет, а не свою копию их. */
  undoCeiling: number;
  undoByteCeiling: number;
  /* Туда и обратно. */
  canDownload: boolean;
  onDownload: () => void;
  /**
   * Чем «download SVG» является для ЭТОГО слоя. Слой-файл отдаёт оригинал производителя, а не
   * пересериализацию, и слова обязаны сказать это; без пропа остаётся правда рисованного слоя.
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
              : 'pick the machine, then draw — every line is born with the stitch in hand. 1–9 pick from the keyboard.'}
          </Text>
          {/* ДЕВЯТЬ ВИДОВ — СПИСКОМ С ОБРАЗЦАМИ, потому что на цеховом полу шов узнают по рисунку,
              а не по номеру; ISO-класс едет рядом для того, кто держит номера в голове. Роль radio:
              ровно один вид активен, и стрелки читалки говорят об этом честно. */}
          <div role='radiogroup' aria-label='stitch kind' className='space-y-1'>
            {STITCHES.map((s, i) => {
              const active = curBrush === s.key;
              return (
                <button
                  key={s.key}
                  type='button'
                  role='radio'
                  aria-checked={active}
                  disabled={p.frozen}
                  onClick={() => p.onBrush(s.key)}
                  className={cn(
                    'block w-full cursor-pointer border px-1.5 py-1 text-left transition-colors duration-150 motion-reduce:transition-none',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor',
                    'disabled:cursor-default disabled:text-textInactiveColor',
                    active
                      ? 'border-textColor bg-textColor text-bgColor'
                      : 'border-borderColor bg-bgColor text-textColor hover:border-textColor',
                  )}
                >
                  <span className='flex items-baseline justify-between gap-1.5'>
                    <Text size='micro' component='span' className='min-w-0 truncate'>
                      {i + 1} · {s.name}
                    </Text>
                    <Text size='nano' component='span' className='shrink-0'>
                      {s.iso}
                    </Text>
                  </span>
                  {/* Образец — тем же РАЗМЕРОМ и «строительностью», какими штрих реально ляжет:
                      крупный шов и виден крупным, вместе с высотой бокса. Цвет — см. StitchSample. */}
                  <StitchSample brush={s.key} gauge={curGauge} step={curStep} dashed={curDashed} />
                </button>
              );
            })}
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

        <div className='flex flex-wrap items-center gap-1.5 py-1'>
          <Chip
            selected={p.picking}
            pressed={p.picking}
            disabled={p.frozen}
            onClick={() => p.onPicking(!p.picking)}
            title='take the colour from the canvas, the picture underneath and the paint included (i)'
          >
            eyedropper
          </Chip>
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
        {p.baseLabel && (
          <Text size='nano' variant='label' component='p' data-base-note=''>
            «{p.baseLabel}» is the original underneath. It is never written to — the eraser eats
            through the COPY, and the hole lives in the copy&rsquo;s own transparency.
          </Text>
        )}
        {/* ЧЕМ ПЛАТИТ СОХРАНЕНИЕ ПИКСЕЛЕЙ — В РЕЙКЕ, А НЕ КОРОБКОЙ НАД ХОЛСТОМ. Условная коробка
            там сдвигала холст на свою высоту в момент, когда рука уже целилась (замерено пробами
            66 и 83); рейка — колонка со своей прокруткой, и её рост холсту ничего не стоит. */}
        {p.rasterReady && (
          <Text size='nano' variant='label' component='p' data-pixels-note=''>
            The pixel layer is a whole picture, not a patch
            {p.rasterDirty ? ', and it has changed' : ''}. Saving uploads it in full{' '}
            <b>only when the paint actually changed</b> — a save that touched lines alone says
            nothing about pixels, and the stored ones survive untouched. The original media is{' '}
            <b>never written to</b>; «revert to the untouched picture» brings it back.
          </Text>
        )}
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

      {/* ── ЛЕНТА ОТМЕНЫ. ПОТОЛОК НАЗВАН ЧИСЛОМ, а не подразумевается: молчаливая потеря истории
          выглядит как поломка отмены, и человек, у которого ⌘Z однажды не вернул, перестаёт ему
          верить навсегда. Одна лента на оба материала — довод в `vector-raster-history.ts`. */}
      <div>
        <GroupLabel flush>history</GroupLabel>
        <Text size='nano' variant='label' component='p' data-undo-note=''>
          {p.undoDepth
            ? `${p.undoDepth} step${p.undoDepth === 1 ? '' : 's'} back${p.undoBytes ? ` · ${(p.undoBytes / 1024 / 1024).toFixed(1)} MB of pixels held` : ''}. `
            : 'nothing to take back yet. '}
          Lines and pixels share ONE ⌘z, in the order they happened. The ceiling is{' '}
          <b>
            {p.undoCeiling} steps or {p.undoByteCeiling} MB
          </b>{' '}
          of pixels, whichever comes first; past it the oldest step is dropped.
          {p.undoEvicted ? ' Some of the oldest steps have already been dropped.' : ''}
        </Text>
      </div>

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
                title='duplicate the strokes inside the active area (⌘c) — copies land slightly offset'
              >
                copy inside
              </Button>
              <Button
                variant='secondary'
                size='xs'
                disabled={p.frozen}
                onClick={() => p.onDeleteSel(p.activeSel!)}
                title='cut the strokes at the ants line and remove what is inside (⌫)'
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

      <div>
        <GroupLabel flush>out and back</GroupLabel>
        <Text size='nano' variant='label' component='p' className='mb-1'>
          {p.outNote ??
            'the SVG is written by the same renderer that draws this screen; the raster is LINKED underneath, not embedded. Fix it outside, upload it back — what a stroke cannot hold is refused by name, never dropped quietly.'}
        </Text>
        <div className='flex flex-wrap items-center gap-1.5'>
          <Button variant='secondary' size='xs' disabled={!p.canDownload} onClick={p.onDownload}>
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
