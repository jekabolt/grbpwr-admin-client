import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import Text from 'ui/components/text';

import { SvgImportDoor } from './svg-import-door';
import {
  STITCHES,
  strokeGeometry,
  type StitchKey,
  type StrokeWeight,
  type VectorStroke,
} from './vector-strokes';

/**
 * РЕЙКА КИСТЕЙ полноэкранного векторного редактора — все органы, которые НЕ являются холстом.
 *
 * ОДНА РЕЙКА, ДВА КОНТЕКСТА, И ЭТО ГЛАВНОЕ РЕШЕНИЕ ФАЙЛА. Пока ничего не выбрано, рейка правит
 * КИСТЬ В РУКЕ — вид шва, вес и «строительность» СЛЕДУЮЩЕГО штриха. Как только инструмент `select`
 * взял штрих, ровно те же органы правят ВЫБРАННЫЙ штрих. Два отдельных пульта на одни и те же три
 * свойства разъехались бы первой же правкой (у одного появился бы орган, которого нет у другого), а
 * человек получил бы два места, где «вид шва» отвечает по-разному. Заголовок рейки говорит, каким
 * из двух контекстов она сейчас является.
 *
 * ОБРАЗЦЫ РИСУЕТ ТОТ ЖЕ `strokeGeometry`, ЧТО СЦЕНУ, ЭКСПОРТ И РАСТР, — и в боксе 200 юнитов,
 * то есть в масштабе обычного чертежа, БЕЗ подмены scaleRef. Прежний пикер рисовал образец
 * 44×12 и девять видов были неотличимы: волна зигзага в 44-юнитовом боксе — полтора пикселя.
 * Образец шириной в честные 200 юнитов, показанный 1:1, — это тот же штрих, каким он ляжет на
 * плату, и различимость здесь свойство геометрии, а не увеличения.
 */

/** Бокс образца, в юнитах И в пикселях разом (1:1 — см. довод в шапке). */
const SAMPLE_W = 200;
const SAMPLE_H = 22;

export function StitchSample({
  brush,
  weight,
  dashed,
}: {
  brush: StitchKey;
  weight: StrokeWeight;
  dashed: boolean;
}) {
  const g = strokeGeometry(
    {
      tool: 'line',
      brush,
      weight,
      dashed,
      pts: [
        [0.02, 0.5],
        [0.98, 0.5],
      ],
    },
    SAMPLE_W,
    SAMPLE_H,
  );
  return (
    <svg
      width={SAMPLE_W}
      height={SAMPLE_H}
      viewBox={`0 0 ${SAMPLE_W} ${SAMPLE_H}`}
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
  weight: StrokeWeight;
  dashed: boolean;
  /* Выбранный штрих; когда он есть, органы правят ЕГО, а не кисть. */
  selected: number | null;
  selectedStroke: VectorStroke | null;
  onBrush: (brush: StitchKey) => void;
  onWeight: (weight: StrokeWeight) => void;
  onDashed: (dashed: boolean) => void;
  onRemoveSelected: () => void;
  onDeselect: () => void;
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
  frameRatio: number;
  strokes: VectorStroke[];
  onImport: (strokes: VectorStroke[], mode: 'add' | 'replace') => void;
  /* Что случится при сохранении — слова зависят от того, есть ли база и слот. */
  saveNote: string;
};

export function VectorBrushRail(p: RailProps) {
  const editing = p.selected !== null && p.selectedStroke !== null;
  // Контекст органов: свойства выбранного штриха либо кисти в руке. Одна тройка значений на оба
  // случая — потому и одна тройка органов.
  const curBrush = editing ? p.selectedStroke!.brush : p.brush;
  const curWeight = editing ? p.selectedStroke!.weight : p.weight;
  const curDashed = editing ? p.selectedStroke!.dashed : p.dashed;

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
                {/* Образец — тем же весом и «строительностью», какими штрих реально ляжет. */}
                <StitchSample brush={s.key} weight={curWeight} dashed={curDashed} />
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <GroupLabel flush>weight</GroupLabel>
        <ChipRow>
          {(['hairline', 'thin', 'bold'] as const).map((w) => (
            <Chip
              key={w}
              selected={curWeight === w}
              pressed={curWeight === w}
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

      <div>
        <GroupLabel flush>out and back</GroupLabel>
        <Text size='nano' variant='label' component='p' className='mb-1'>
          the SVG is written by the same renderer that draws this screen; the raster is LINKED
          underneath, not embedded. Fix it outside, upload it back — what a stroke cannot hold is
          refused by name, never dropped quietly.
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
