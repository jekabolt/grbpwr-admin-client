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
  MAX_GAUGE,
  MIN_GAUGE,
  STITCHES,
  WEIGHT_GAUGE,
  strokeGauge,
  strokeGeometry,
  type StitchKey,
  type StrokeWeight,
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
  dashed,
}: {
  brush: StitchKey;
  gauge: number;
  dashed: boolean;
}) {
  const h = sampleH(gauge);
  const g = strokeGeometry(
    {
      tool: 'line',
      brush,
      weight: 'thin',
      gauge,
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
  onBrush: (brush: StitchKey) => void;
  /** Ступень веса — ЯРЛЫК на число размера, а не отдельная величина; см. `pickWeightPreset`. */
  onWeight: (weight: StrokeWeight) => void;
  onDashed: (dashed: boolean) => void;
  onInk: (hex: string) => void;
  onGauge: (px: number) => void;
  onRemoveSelected: () => void;
  onDeselect: () => void;
  /**
   * НИБ В РУКЕ — размер круга ластика и штампа, ОТДЕЛЬНЫМ ЧИСЛОМ от нити. Не потому, что это две
   * разных величины по смыслу (обе — ширина следа инструмента), а потому, что человек держит их
   * разными: стирают крупным кругом, а рисуют тонкой нитью, и одно число заставляло бы крутить
   * ручку туда-обратно на каждой смене инструмента. Орган на рейке при этом ОДИН — он показывает
   * то из двух чисел, которое сейчас в руке, той же грамматикой «одна рейка, два контекста».
   */
  nib: number;
  onNib: (px: number) => void;
  /** Инструмент круглого ниба (ластик или штамп) в руке — тогда орган размера правит ниб. */
  nibTool: 'erase' | 'stamp' | null;
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
  /* Слои сцены. */
  vecOn: boolean;
  onVecOn: () => void;
  rasterOn: boolean;
  onRasterOn: () => void;
  strokesCount: number;
  baseLabel: string | null;
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
  // ТРЕТИЙ КОНТЕКСТ ОРГАНА РАЗМЕРА — круглый ниб. Выбранный штрих старше инструмента: если строка
  // взята, рейка правит ЕЁ, чем бы ни была занята рука, — иначе «done» на выбранной строке
  // означало бы разное в зависимости от того, какой чип нажат над холстом.
  const sizingNib = !editing && p.nibTool !== null;
  const size = sizingNib ? p.nib : curGauge;
  const sizeMin = sizingNib ? MIN_NIB : MIN_GAUGE;
  const sizeMax = sizingNib ? MAX_NIB : MAX_GAUGE;
  const setSize = (n: number) => (sizingNib ? p.onNib(n) : p.onGauge(n));

  return (
    <div className='flex h-full w-[264px] shrink-0 flex-col gap-2 overflow-y-auto border border-borderColor bg-bgColor p-2.5'>
      <div>
        <GroupLabel
          flush
          action={
            editing ? (
              <span className='flex items-center gap-1.5'>
                <Button variant='secondary' size='xs' disabled={p.frozen} onClick={p.onRemoveSelected}>
                  delete
                </Button>
                <Button variant='secondary' size='xs' onClick={p.onDeselect}>
                  done
                </Button>
              </span>
            ) : undefined
          }
        >
          {editing ? `line ${p.selected! + 1} — its stitch` : 'brush — the next stroke'}
        </GroupLabel>
        <Text size='nano' variant='label' component='p' className='mb-1'>
          {editing
            ? 'these controls now edit the picked line. Esc or «done» puts the brush back in hand.'
            : 'pick the machine, then draw — every stroke is born with the stitch in hand. 1–9 pick from the keyboard.'}
        </Text>
        {/* ДЕВЯТЬ ВИДОВ — СПИСКОМ С ОБРАЗЦАМИ, потому что на цеховом полу шов узнают по рисунку, а
            не по номеру; ISO-класс едет рядом для того, кто держит номера в голове. Роль radio:
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
                <StitchSample brush={s.key} gauge={curGauge} dashed={curDashed} />
              </button>
            );
          })}
        </div>
      </div>

      {/* ── ЦВЕТ И РАЗМЕР. Один орган размера на три контекста (кисть / выбранная строка / ниб) —
          та же грамматика, что у видов шва выше, и заголовок группы говорит, чем она сейчас
          является. Прежняя группа `weight` из трёх ступеней жива здесь ЧИПАМИ-ПРЕСЕТАМИ: ступень
          это то же число, только названное словом. */}
      <div>
        <GroupLabel flush>{sizingNib ? `ink & the ${p.nibTool} nib` : 'ink & size'}</GroupLabel>
        <Text size='nano' variant='label' component='p' className='mb-1'>
          {sizingNib
            ? 'the nib is the round tip in your hand; the ink below stays the brush’s, for when you pick it up again'
            : 'one number is the whole seam: the thread and the stitch it lays. A heavier topstitch takes longer stitches.'}
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
            title='take the colour from the canvas, the picture underneath included (i)'
          >
            eyedropper
          </Chip>
          <Text size='nano' variant='label' component='span' className='ml-auto shrink-0'>
            {sizingNib ? 'nib' : 'size'}
          </Text>
          <Input
            type='number'
            min={sizeMin}
            max={sizeMax}
            step={1}
            value={size}
            disabled={p.frozen}
            aria-label={sizingNib ? 'nib width, plate pixels' : 'seam size, plate pixels'}
            data-size-input=''
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSize(Number(e.target.value))}
            className='w-14 shrink-0 text-right tabular-nums'
          />
          <Text size='nano' variant='label' component='span' className='shrink-0'>
            px
          </Text>
        </div>

        <ChipRow>
          {sizingNib
            ? NIB_PRESETS.map((n) => (
                <Chip
                  key={n}
                  selected={size === n}
                  pressed={size === n}
                  disabled={p.frozen}
                  onClick={() => p.onNib(n)}
                >
                  {n}
                </Chip>
              ))
            : (['hairline', 'thin', 'bold'] as const).map((w) => (
                <Chip
                  key={w}
                  selected={Math.round(curGauge) === WEIGHT_GAUGE[w]}
                  pressed={Math.round(curGauge) === WEIGHT_GAUGE[w]}
                  disabled={p.frozen}
                  onClick={() => p.onWeight(w)}
                >
                  {w}
                </Chip>
              ))}
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
      </div>

      <div>
        <GroupLabel flush>layers</GroupLabel>
        <LayerRow
          on={p.vecOn}
          onToggle={p.onVecOn}
          name='vector'
          sub={`${p.strokesCount} line${p.strokesCount === 1 ? '' : 's'} · yours`}
        />
        {p.baseLabel && (
          <LayerRow
            on={p.rasterOn}
            onToggle={p.onRasterOn}
            name='raster'
            sub={`${p.baseLabel} · never touched`}
          />
        )}
      </div>

      {/* ОБЛАСТИ ЛАССО. Группа существует только вместе с областями: пустой пульт — шум.
          Растушёвка стоит В СТРОКЕ области — она принадлежит выделению, не инструменту, и две
          области честно держат два разных числа. Операции — под списком и только у АКТИВНОЙ:
          один пульт на текущий контекст, как у кисти и выбранного штриха выше. */}
      {p.sels.length > 0 && (
        <div>
          <GroupLabel flush>selections</GroupLabel>
          <Text size='nano' variant='label' component='p' className='mb-1'>
            strokes are cut at the ants line; feather is each area&rsquo;s own softness
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
