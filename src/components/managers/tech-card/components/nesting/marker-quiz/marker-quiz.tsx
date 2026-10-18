// КВИЗ РАСКЛАДКИ: верхняя панель модалки, разложенная в вопросы по одному на экран. Своего
// состояния прогона у квиза нет — каждый ответ пишет в уже существующее состояние модалки
// (режим настила, стол цеха, состав, слои, запас), а шаг «run» запускает тот же прогон, что и
// прежняя кнопка. Здесь только машина шагов и экраны; числа и сеттеры приходят пропами.
import { useEffect, useState } from 'react';

import type { SpreadMode } from 'lib/nesting/spread';
import { Button, Chip, Input, Stat, StatGrid, Text } from 'ui';

import type { LayMode } from '../use-lay-mode';
import {
  EndsPicture,
  GarmentPile,
  KnifePicture,
  LayOnTablePicture,
  LayersPicture,
  SpreadChoicePicture,
  TablePicture,
  fabricColours,
} from './pictures';

export type QuizStep = 'spread' | 'confirm' | 'size' | 'knife' | 'what' | 'layers' | 'ends' | 'run';

const ORDER: QuizStep[] = ['spread', 'confirm', 'size', 'knife', 'what', 'layers', 'ends', 'run'];

// Имя шага в шапке: «confirm» и «size» — один шаг «table» с двумя экранами.
const CHIP: Record<QuizStep, string> = {
  spread: 'spread',
  confirm: 'table',
  size: 'table',
  knife: 'knife',
  what: 'what',
  layers: 'layers',
  ends: 'ends',
  run: 'run',
};

const QUESTION: Record<QuizStep, string> = {
  spread: 'How do you spread the fabric?',
  confirm: 'Is this your cutting table?',
  size: 'How big is your table?',
  knife: 'How high can the knife cut?',
  what: 'What do we cut?',
  layers: 'How many layers?',
  ends: 'How much is wasted at the ends?',
  run: 'Ready to run',
};

/** Шаги для режима настила: один слой — без стола; стопка — с подтверждением стола или его вводом. */
export function quizFlow(mode: LayMode, editingTable: boolean): QuizStep[] {
  if (mode !== 'table') return ['spread', 'what', 'run'];
  return editingTable
    ? ['spread', 'size', 'knife', 'what', 'layers', 'ends', 'run']
    : ['spread', 'confirm', 'what', 'layers', 'ends', 'run'];
}

// Шаг, которого нет в текущем потоке (сменился режим, стол догрузился), — на ближайший живой:
// confirm ↔ size друг в друга, иначе на первый шаг потока не раньше этого.
function clampStep(step: QuizStep, flow: QuizStep[]): QuizStep {
  if (flow.includes(step)) return step;
  const swap = step === 'confirm' ? 'size' : step === 'size' ? 'confirm' : null;
  if (swap && flow.includes(swap)) return swap;
  const at = ORDER.indexOf(step);
  return flow.find((s) => ORDER.indexOf(s) >= at) ?? flow[flow.length - 1];
}

export function useMarkerQuiz({
  slotKey,
  mode,
  tableSaved,
  startAtRun,
  busy,
}: {
  slotKey: string;
  mode: LayMode;
  // Стол цеха сохранён (длина, ширина, стопка): тогда стол подтверждают, а не вводят.
  tableSaved: boolean;
  // Квиз уже пройден для этой ткани — открыть на шаге «run».
  startAtRun: boolean;
  busy: boolean;
}) {
  // null = никто ещё не ходил: стартовый шаг следует за startAtRun (флаг догружается со слотом).
  const [picked, setPicked] = useState<QuizStep | null>(null);
  const [tableEditing, setTableEditing] = useState(false);
  // «edit» в сводке после прогона: квиз снова поверх готового результата.
  const [reopened, setReopened] = useState(false);
  useEffect(() => {
    setPicked(null);
    setTableEditing(false);
    setReopened(false);
  }, [slotKey]);
  const editingTable = tableEditing || !tableSaved;
  const flow = quizFlow(mode, editingTable);
  const step = clampStep(picked ?? (startAtRun ? 'run' : 'spread'), flow);
  const index = flow.indexOf(step);
  // Прогон или подбор под стол пошёл — квиз сворачивается в сводку.
  useEffect(() => {
    if (busy) setReopened(false);
  }, [busy]);
  return {
    step,
    flow,
    index,
    reopened,
    go: (s: QuizStep) => setPicked(s),
    // Ответ на «spread»: стол снова подтверждают (если он сохранён), а не вводят заново.
    afterSpread: (m: LayMode) => {
      setTableEditing(false);
      setPicked(m === 'table' ? 'confirm' : 'what');
    },
    back: () => {
      if (index > 0) setPicked(flow[index - 1]);
    },
    next: () => {
      // Ушли со шага ввода стола — поток остаётся «с вводом», даже если сохранение стола только что
      // сделало его «сохранённым»: иначе шаг «knife» пропал бы из-под Next.
      if (step === 'size' || step === 'knife') setTableEditing(true);
      if (index < flow.length - 1) setPicked(flow[index + 1]);
    },
    // «No, change it» и любая дверь к размерам стола.
    editTable: () => {
      setTableEditing(true);
      setPicked('size');
    },
    restart: () => {
      setTableEditing(false);
      setPicked('spread');
    },
    // Дверь снаружи (сводка, предупреждение): открыть квиз на нужном шаге.
    open: (s: QuizStep) => {
      if (s === 'size') setTableEditing(true);
      setPicked(s);
      setReopened(true);
    },
    close: () => setReopened(false),
  };
}

export type MarkerQuizState = ReturnType<typeof useMarkerQuiz>;

/** Шаги в шапке модалки: текущий залит, пройденные кликабельны. */
export function QuizChips({ quiz }: { quiz: MarkerQuizState }) {
  const names = [...new Set(quiz.flow.map((s) => CHIP[s]))];
  const current = names.indexOf(CHIP[quiz.step]);
  return (
    <div className='flex flex-wrap items-center gap-1'>
      {names.map((name, i) => {
        const first = quiz.flow.find((s) => CHIP[s] === name) ?? quiz.step;
        return i === current ? (
          <Chip key={name} selected>
            {name}
          </Chip>
        ) : i < current ? (
          <Chip key={name} onClick={() => quiz.go(first)}>
            {name}
          </Chip>
        ) : (
          <Chip key={name}>{name}</Chip>
        );
      })}
    </div>
  );
}

// Число из поля: пустое и мусор — null (поле держит строку, пока в фокусе).
const parseNum = (raw: string, decimal: boolean): number | null => {
  const t = raw.trim().replace(',', '.');
  if (t === '' || !(decimal ? /^\d*\.?\d*$/ : /^\d+$/).test(t) || t === '.') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

function NumField({
  value,
  onCommit,
  label,
  decimal = false,
  disabled,
  className,
}: {
  value: number | null;
  onCommit: (n: number) => void;
  label: string;
  decimal?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input
      inputMode={decimal ? 'decimal' : 'numeric'}
      autoComplete='off'
      aria-label={label}
      disabled={disabled}
      className={className}
      value={draft ?? (value == null ? '' : String(value))}
      onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
        setDraft(value == null ? '' : String(value));
        const el = e.currentTarget;
        requestAnimationFrame(() => el.select());
      }}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        setDraft(e.target.value);
        const n = parseNum(e.target.value, decimal);
        if (n != null) onCommit(n);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

/** − n + : количество изделий размера, число слоёв. */
function Count({
  value,
  min,
  onChange,
  label,
  disabled,
}: {
  value: number;
  min: number;
  onChange: (n: number) => void;
  label: string;
  disabled?: boolean;
}) {
  const set = (n: number) => {
    const next = Math.max(min, Math.round(n));
    if (next !== value) onChange(next);
  };
  return (
    <div className='flex items-stretch'>
      <Button
        variant='secondary'
        size='xs'
        aria-label={`fewer ${label}`}
        disabled={disabled || value <= min}
        onClick={() => set(value - 1)}
      >
        −
      </Button>
      <NumField
        label={label}
        value={value}
        disabled={disabled}
        className='w-12 text-center tabular-nums'
        onCommit={set}
      />
      <Button
        variant='secondary'
        size='xs'
        aria-label={`more ${label}`}
        disabled={disabled}
        onClick={() => set(value + 1)}
      >
        +
      </Button>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
      {children}
    </Text>
  );
}

const f1 = (n: number) => String(Math.round(n * 10) / 10);

export type QuizRow = {
  key: string;
  label: string;
  qty: number;
  // Размер файла, которого нет в карточке: считать можно, сохранить нельзя.
  bad: boolean;
  min: number;
};

export type QuizWarning = {
  text: string;
  error: boolean;
  fix?: { label: string; onClick?: () => void; href?: string; disabled?: boolean };
};

export type MarkerQuizProps = {
  quiz: MarkerQuizState;
  busy: boolean;
  // Цвет ткани колорвея, если он известен (сегодня в данных его нет — нейтральная ткань).
  fabricHex?: string | null;
  layMode: LayMode;
  onLayMode: (m: LayMode) => void;
  tableCm: number | null;
  tableWidthCm: number | null;
  stackLimitCm: number | null;
  onTableCm: (v: number | null) => void;
  onTableWidthCm: (v: number | null) => void;
  onStackCm: (v: number | null) => void;
  // Сохранить стол в настройки цеха (на Next с шагов стола; не на каждую цифру).
  onSaveTable: () => Promise<boolean>;
  savingTable: boolean;
  colourways: ReadonlyArray<{ id: number; label: string }>;
  colourwayId: number;
  onColourway: (id: number) => void;
  rows: QuizRow[];
  onQty: (key: string, n: number) => void;
  spreadMode: SpreadMode;
  onSpreadMode: (m: SpreadMode) => void;
  plies: number;
  pliesAuto: boolean;
  onPlies: (n: number | null) => void;
  // Изделий каждого размера в одном слое, в порядке rows.
  perPly: readonly number[];
  thicknessMm: number | null;
  // Толщина пришла из артикула — показывается, а не спрашивается.
  thicknessFromBom: boolean;
  onThickness: (mm: number | null) => void;
  cutTotal: number;
  extraTotal: number;
  stackCm: number | null;
  stackOk: boolean;
  endLossCm: number;
  onEndLoss: (cm: number) => void;
  clothWidthCm: number;
  // Длина маркера: готового прогона или оценка по площади до него.
  markerLengthCm: number;
  markerEstimate: boolean;
  fabricCm: number | null;
  warnings: QuizWarning[];
  // Тихий ряд шага «run»: ширина полотна, настройки раскладки, детали — прежние поповеры.
  extras?: React.ReactNode;
  runDisabled: boolean;
  onRun: () => void;
  onShowResult?: () => void;
};

export function MarkerQuiz(p: MarkerQuizProps) {
  const { quiz } = p;
  const step = quiz.step;
  const table = p.layMode === 'table';
  const fabric = fabricColours(p.fabricHex);
  const layCm = p.markerLengthCm + 2 * p.endLossCm;
  const tableLen = p.tableCm ?? Math.max(Math.ceil(layCm), 200);
  const tableWid = p.tableWidthCm ?? Math.max(p.clothWidthCm + 20, 160);
  const fits = !table || p.tableCm == null || layCm <= p.tableCm + 0.05;
  const plySizes = p.rows.flatMap((r, i) =>
    Array.from({ length: Math.min(p.perPly[i] ?? 0, 24) }, () => r.label),
  );
  const faceToFace = p.spreadMode === 'face_to_face';
  const nonNeg = (fn: (v: number | null) => void) => (v: number) => fn(v > 0 ? v : null);

  const nextLabel = step === 'confirm' ? 'Yes, correct' : step === 'run' ? 'Run' : 'Next';
  const nextDisabled =
    p.busy ||
    (step === 'what' && p.cutTotal === 0) ||
    (step === 'run' && p.runDisabled) ||
    ((step === 'size' || step === 'knife') && p.savingTable);
  const onNext = async () => {
    if (step === 'run') {
      p.onRun();
      return;
    }
    if ((step === 'size' || step === 'knife') && !(await p.onSaveTable())) return;
    quiz.next();
  };

  const body = (() => {
    switch (step) {
      case 'spread':
        return (
          <div className='grid w-full max-w-3xl gap-4 sm:grid-cols-2'>
            {(
              [
                ['single', 'One layer', 'cut with scissors'],
                ['table', 'Stack of layers', 'cut with a knife'],
              ] as const
            ).map(([m, name, sub]) => (
              <Button
                key={m}
                aria-pressed={p.layMode === m}
                disabled={p.busy}
                className={`flex flex-col gap-3 border p-4 text-left transition-colors hover:border-textColor ${
                  p.layMode === m ? 'border-textColor' : 'border-borderColor'
                }`}
                onClick={() => p.onLayMode(m)}
              >
                <SpreadChoicePicture kind={m} fabric={fabric} />
                <Text size='large' component='span'>
                  {name}
                </Text>
                <Label>{sub}</Label>
              </Button>
            ))}
          </div>
        );
      case 'confirm':
        return (
          <>
            <TablePicture
              lengthCm={p.tableCm ?? 0}
              widthCm={p.tableWidthCm ?? 0}
              maxStackCm={p.stackLimitCm}
            />
            <Button variant='secondary' size='sm' onClick={quiz.editTable}>
              No, change it
            </Button>
          </>
        );
      case 'size':
        return (
          <TablePicture
            lengthCm={tableLen}
            widthCm={tableWid}
            maxStackCm={p.stackLimitCm}
            length={{
              value: p.tableCm ?? 0,
              onChange: nonNeg(p.onTableCm),
              unit: 'cm',
              label: 'length',
            }}
            width={{
              value: p.tableWidthCm ?? 0,
              onChange: nonNeg(p.onTableWidthCm),
              unit: 'cm',
              label: 'width',
            }}
          />
        );
      case 'knife':
        return (
          <KnifePicture
            fabric={fabric}
            maxStackCm={{
              value: p.stackLimitCm ?? 0,
              onChange: nonNeg(p.onStackCm),
              unit: 'cm',
              label: 'max stack',
            }}
          />
        );
      case 'what':
        return (
          <>
            {p.colourways.length > 0 && (
              <div className='flex flex-wrap items-center justify-center gap-2'>
                <Label>colourway</Label>
                {[{ id: 0, label: 'shared' }, ...p.colourways].map((c) => (
                  <Chip
                    key={c.id}
                    selected={c.id === p.colourwayId}
                    pressed={c.id === p.colourwayId}
                    disabled={p.busy}
                    onClick={() => {
                      if (c.id !== p.colourwayId) p.onColourway(c.id);
                    }}
                  >
                    {c.label}
                  </Chip>
                ))}
              </div>
            )}
            <div className='grid w-full max-w-3xl grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-3'>
              {p.rows.map((r) => (
                <div
                  key={r.key}
                  className={`flex flex-col items-center gap-2 border border-borderColor px-2 py-3 ${
                    r.qty > 0 ? '' : 'text-labelColor'
                  }`}
                >
                  <GarmentPile colour={fabric.face} qty={r.qty} />
                  <Text component='span' className={r.bad ? 'text-error' : undefined}>
                    {r.label}
                  </Text>
                  <Count
                    label={r.label}
                    value={r.qty}
                    min={r.min}
                    disabled={p.busy}
                    onChange={(n) => p.onQty(r.key, n)}
                  />
                </div>
              ))}
            </div>
          </>
        );
      case 'layers': {
        const parts = p.rows
          .map((r, i) => ({ l: r.label, q: p.perPly[i] ?? 0 }))
          .filter((x) => x.q > 0)
          .map((x) => `${x.q} ${x.l}`)
          .join(' · ');
        return (
          <>
            <LayersPicture
              tableLengthCm={tableLen}
              tableWidthCm={tableWid}
              clothWidthCm={p.clothWidthCm}
              layCm={layCm}
              endLossCm={p.endLossCm}
              plies={p.plies}
              plySizes={plySizes}
              faceToFace={faceToFace}
              fabric={fabric}
              stackCm={p.stackCm ?? 0}
              stackOk={p.stackOk}
            />
            <p className='text-center text-lg tabular-nums'>
              {p.plies} layers × ({parts || '—'}) = {p.cutTotal + p.extraTotal}
              {p.extraTotal > 0 && <span className='text-labelColor'> +{p.extraTotal} extra</span>}
            </p>
            <div className='flex flex-wrap items-center justify-center gap-3'>
              {(
                [
                  ['face_up', 'all face up'],
                  ['face_to_face', 'face to face'],
                ] as const
              ).map(([m, label]) => (
                <Chip
                  key={m}
                  selected={p.spreadMode === m}
                  pressed={p.spreadMode === m}
                  disabled={p.busy}
                  onClick={() => {
                    if (m !== p.spreadMode) p.onSpreadMode(m);
                  }}
                >
                  {label}
                </Chip>
              ))}
              <Label>layers</Label>
              <Count
                label='layers'
                value={p.plies}
                min={1}
                disabled={p.busy}
                onChange={(n) => p.onPlies(n)}
              />
              {p.pliesAuto ? (
                <Label>auto</Label>
              ) : (
                <Button
                  variant='underline'
                  size='xs'
                  disabled={p.busy}
                  onClick={() => p.onPlies(null)}
                >
                  auto
                </Button>
              )}
              {p.thicknessFromBom && p.thicknessMm != null ? (
                <Label>{p.thicknessMm} mm each</Label>
              ) : (
                <span className='flex items-center gap-1'>
                  <Label>thickness</Label>
                  <NumField
                    label='thickness'
                    decimal
                    value={p.thicknessMm}
                    disabled={p.busy}
                    className='w-14 text-right tabular-nums'
                    onCommit={(n) => p.onThickness(n > 0 ? n : null)}
                  />
                  <Label>mm</Label>
                </span>
              )}
            </div>
          </>
        );
      }
      case 'ends':
        return (
          <EndsPicture
            fabric={fabric}
            endLoss={{
              value: p.endLossCm,
              onChange: (v) => p.onEndLoss(Math.max(0, v)),
              unit: 'cm',
              label: 'each end',
            }}
          />
        );
      case 'run': {
        const fact = (label: string, to: QuizStep, value: React.ReactNode) => (
          <Stat
            key={label}
            label={
              <Button
                variant='underline'
                className='uppercase'
                disabled={p.busy}
                onClick={() => quiz.go(to)}
              >
                {label}
              </Button>
            }
            value={value}
          />
        );
        return (
          <>
            <LayOnTablePicture
              mode={table ? 'table' : 'single'}
              tableLengthCm={tableLen}
              tableWidthCm={tableWid}
              clothWidthCm={p.clothWidthCm}
              markerLengthCm={p.markerLengthCm}
              endLossCm={p.endLossCm}
              plies={table ? p.plies : 1}
              plySizes={plySizes}
              faceToFace={faceToFace}
              fabric={fabric}
              fits={fits}
            />
            <div className='w-full'>
              <StatGrid min={140}>
                {fact(
                  'garments',
                  'what',
                  <>
                    {p.cutTotal}
                    {table && p.extraTotal > 0 && (
                      <span className='text-labelColor'> +{p.extraTotal}</span>
                    )}
                  </>,
                )}
                {table && fact('layers', 'layers', p.plies)}
                {table &&
                  fact(
                    'stack',
                    'layers',
                    <span className={p.stackOk ? undefined : 'text-error'}>
                      {p.stackCm == null ? '—' : f1(p.stackCm)}
                      <span className='text-labelColor'>
                        {' '}
                        / {p.stackLimitCm == null ? '—' : f1(p.stackLimitCm)} cm
                      </span>
                    </span>,
                  )}
                {fact(
                  'fabric',
                  table ? 'ends' : 'what',
                  <>
                    {p.fabricCm == null
                      ? '—'
                      : `${p.markerEstimate ? '≈ ' : ''}${(p.fabricCm / 100).toFixed(2)}`}
                    <span className='text-labelColor'> m</span>
                  </>,
                )}
              </StatGrid>
            </div>
            {p.warnings.length > 0 && (
              <ul className='flex w-full flex-col gap-1.5'>
                {p.warnings.map((w) => (
                  <li
                    key={w.text}
                    className={`flex items-center gap-3 border px-3 py-2 ${
                      w.error ? 'border-error text-error' : 'border-borderColor'
                    }`}
                  >
                    <span className='min-w-0 flex-1'>{w.text}</span>
                    {w.fix &&
                      (w.fix.href ? (
                        <Button asChild variant='underline' size='xs'>
                          <a
                            href={w.fix.href}
                            target='_blank'
                            rel='noopener noreferrer'
                            onClick={w.fix.onClick}
                          >
                            {w.fix.label}
                          </a>
                        </Button>
                      ) : (
                        <Button
                          variant='underline'
                          size='xs'
                          disabled={w.fix.disabled || p.busy}
                          onClick={w.fix.onClick}
                        >
                          {w.fix.label}
                        </Button>
                      ))}
                  </li>
                ))}
              </ul>
            )}
            {p.extras && (
              <div className='flex w-full flex-wrap items-end gap-x-4 gap-y-1.5'>{p.extras}</div>
            )}
            <Button variant='underline' size='xs' disabled={p.busy} onClick={quiz.restart}>
              redo questions
            </Button>
          </>
        );
      }
    }
  })();

  return (
    <div className='flex flex-col'>
      <div className='flex min-h-96 flex-col items-center gap-4 px-2 pt-2 pb-4'>
        <Text size='large' component='h2' className='text-center'>
          {QUESTION[step]}
        </Text>
        {body}
      </div>
      <div className='flex items-center gap-3 border-t border-borderColor pt-3'>
        <Button
          variant='secondary'
          size='sm'
          disabled={quiz.index === 0 || p.busy}
          onClick={quiz.back}
        >
          Back
        </Button>
        <span className='flex-1' />
        {step === 'run' && p.onShowResult && (
          <Button variant='underline' size='xs' onClick={p.onShowResult}>
            show result
          </Button>
        )}
        {step !== 'spread' && (
          <Button variant='main' size='sm' disabled={nextDisabled} onClick={() => void onNext()}>
            {nextLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Квиз свёрнут после прогона: одна строка фактов, «edit» и предупреждения справа. */
export function QuizSummary({
  facts,
  onEdit,
  editDisabled,
  aside,
}: {
  facts: ReadonlyArray<readonly [string, React.ReactNode]>;
  onEdit?: () => void;
  editDisabled?: boolean;
  aside?: React.ReactNode;
}) {
  return (
    <div className='mb-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-textBaseSize tabular-nums'>
      {facts.map(([label, value]) => (
        <span key={label}>
          <span className='text-labelColor'>{label} </span>
          {value}
        </span>
      ))}
      {onEdit && (
        <Button variant='underline' size='xs' disabled={editDisabled} onClick={onEdit}>
          edit
        </Button>
      )}
      {aside && <div className='ml-auto'>{aside}</div>}
    </div>
  );
}
