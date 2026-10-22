// КВИЗ РАСКЛАДКИ: верхняя панель модалки, разложенная в вопросы по одному на экран. Своего
// состояния прогона у квиза нет — каждый ответ пишет в уже существующее состояние модалки
// (режим настила, стол цеха, состав, слои, запас), а шаг «run» запускает тот же прогон, что и
// прежняя кнопка. Здесь только машина шагов и экраны; числа и сеттеры приходят пропами.
import { useEffect, useState } from 'react';

import type { SpreadMode } from 'lib/nesting/spread';
import { Button, Chip, Input, Text, EmptyCell } from 'ui';

import type { LayMode } from '../use-lay-mode';
import {
  EndsPicture,
  KnifePicture,
  LayersPicture,
  SpreadChoicePicture,
  TablePicture,
} from './pictures';

export type QuizStep = 'spread' | 'confirm' | 'size' | 'knife' | 'what' | 'layers' | 'ends' | 'run';

const ORDER: QuizStep[] = ['spread', 'confirm', 'size', 'knife', 'what', 'layers', 'ends', 'run'];

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

// Один размер шрифта на весь квиз — базовый админский; иерархия только цветом и капслоком.
// Чипы и кнопки `xs`/`sm` из 'ui' по умолчанию мельче, поэтому размер задаётся явно.
export const ONE_SIZE = 'text-textBaseSize';
// Рамочная кнопка базового размера (size по умолчанию не тянет `text-micro`).
export const FRAMED = 'px-2.5 py-1 uppercase tracking-label';
// Одна высота у всех контролов ряда: поле, сегменты.
export const CTRL_H = 'h-8';

// Число из поля: пустое и мусор — null (поле держит строку, пока в фокусе).
export const parseNum = (raw: string, decimal: boolean): number | null => {
  const t = raw.trim().replace(',', '.');
  if (t === '' || !(decimal ? /^\d*\.?\d*$/ : /^\d+$/).test(t) || t === '.') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export function NumField({
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

/** Количество изделий размера: число справа, без −/+. */
export function QtyField({
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
  return (
    <NumField
      label={label}
      value={value}
      disabled={disabled}
      className={`${CTRL_H} w-24 text-right tabular-nums`}
      onCommit={(n) => {
        const next = Math.max(min, Math.round(n));
        if (next !== value) onChange(next);
      }}
    />
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <Text variant='label' tracking='label' component='span' className='uppercase'>
      {children}
    </Text>
  );
}

// Сетка «коробок» под картинкой: равные колонки, в каждой — подпись над одним контролом.
const COLS: Record<number, string> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
};

function Boxes({ children, count }: { children: React.ReactNode; count: number }) {
  return (
    <div className={`grid w-full max-w-3xl grid-cols-1 gap-3 ${COLS[count] ?? 'sm:grid-cols-3'}`}>
      {children}
    </div>
  );
}

function Box({
  label,
  aside,
  children,
}: {
  label: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className='flex min-w-0 flex-col gap-1'>
      <div className='flex h-5 items-center justify-between gap-2'>
        <Label>{label}</Label>
        {aside}
      </div>
      {children}
    </div>
  );
}

/** Поле-коробка: подпись над числом. */
function NumBox({
  label,
  value,
  onCommit,
  decimal = true,
  disabled,
}: {
  label: string;
  value: number | null;
  onCommit: (n: number) => void;
  decimal?: boolean;
  disabled?: boolean;
}) {
  return (
    <Box label={label}>
      <NumField
        label={label}
        decimal={decimal}
        value={value}
        disabled={disabled}
        className={`${CTRL_H} tabular-nums`}
        onCommit={onCommit}
      />
    </Box>
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

// ВЕДОМОСТЬ ФАКТОВ — одна грамматика для шага «run» и для итога прогона в модалке: подпись слева
// (labelColor, капслок), значение справа (чернило, табличные цифры), волосяная линия под строкой.
// Строки с поповером или полем модалка собирает сама из FACT_ROW + FactLabel.
export const FACT_ROW =
  'flex w-full min-w-0 items-center justify-between gap-3 border-b border-hairline py-1.5 text-left text-textBaseSize tabular-nums';

export function FactLabel({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return (
    <Text
      variant={error ? undefined : 'label'}
      tracking='label'
      component='span'
      className={`shrink-0 uppercase ${error ? 'text-error' : ''}`}
    >
      {children}
    </Text>
  );
}

/** Строка ведомости; с onClick вся строка — кнопка. */
export function Fact({
  label,
  error,
  onClick,
  disabled,
  title,
  children,
}: {
  label: React.ReactNode;
  error?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  const body = (
    <>
      <FactLabel error={error}>{label}</FactLabel>
      <span className={`min-w-0 truncate text-right ${error ? 'text-error' : ''}`}>{children}</span>
    </>
  );
  return onClick ? (
    <Button className={FACT_ROW} disabled={disabled} title={title} onClick={onClick}>
      {body}
    </Button>
  ) : (
    <div className={FACT_ROW} title={title}>
      {body}
    </div>
  );
}

/** Столбец строк под линией; `wide` — на широком экране строки встают в колонки. */
export function FactList({
  children,
  wide,
  className = '',
}: {
  children: React.ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`w-full border-t border-hairline ${
        wide ? 'grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3' : 'flex flex-col'
      } ${className}`}
    >
      {children}
    </div>
  );
}

export type QuizWarning = {
  text: string;
  error: boolean;
  fix?: { label: string; onClick?: () => void; href?: string; disabled?: boolean };
};

export type MarkerQuizProps = {
  quiz: MarkerQuizState;
  busy: boolean;
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
  // Ширина полотна, детали, настройки раскладки — готовые строки ведомости (FACT_ROW) со своими
  // полем и поповерами модалки.
  cloth?: React.ReactNode;
  pieces?: React.ReactNode;
  nesting?: React.ReactNode;
  fabricCm: number | null;
  warnings: QuizWarning[];
  // Под ведомостью: выбор ткани (слот BOM), если модалку открыли не со строки BOM.
  extras?: React.ReactNode;
  runDisabled: boolean;
  onRun: () => void;
  onShowResult?: () => void;
};

export function MarkerQuiz(p: MarkerQuizProps) {
  const { quiz } = p;
  const step = quiz.step;
  const table = p.layMode === 'table';
  const layCm = p.markerLengthCm + 2 * p.endLossCm;
  const tableLen = p.tableCm ?? Math.max(Math.ceil(layCm), 200);
  const tableWid = p.tableWidthCm ?? Math.max(p.clothWidthCm + 20, 160);
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
                ['single', 'One layer', 'scissors'],
                ['table', 'Stack of layers', 'knife'],
              ] as const
            ).map(([m, name, sub]) => (
              <PictureChoice
                key={m}
                picked={p.layMode === m}
                disabled={p.busy}
                name={name}
                sub={sub}
                onClick={() => p.onLayMode(m)}
              >
                <SpreadChoicePicture kind={m} />
              </PictureChoice>
            ))}
          </div>
        );
      case 'confirm':
        return (
          <>
            <TablePicture
              lengthCm={p.tableCm ?? 0}
              widthCm={p.tableWidthCm}
              maxStackCm={p.stackLimitCm}
            />
            <Button variant='secondary' className={FRAMED} onClick={quiz.editTable}>
              No, change it
            </Button>
          </>
        );
      case 'size':
        return (
          <>
            <TablePicture lengthCm={tableLen} widthCm={tableWid} maxStackCm={p.stackLimitCm} />
            <Boxes count={2}>
              <NumBox label='length cm' value={p.tableCm} onCommit={nonNeg(p.onTableCm)} />
              <NumBox label='width cm' value={p.tableWidthCm} onCommit={nonNeg(p.onTableWidthCm)} />
            </Boxes>
          </>
        );
      case 'knife':
        return (
          <>
            <KnifePicture maxStackCm={p.stackLimitCm ?? 0} stackCm={p.stackCm ?? undefined} />
            <Boxes count={1}>
              <NumBox label='max stack cm' value={p.stackLimitCm} onCommit={nonNeg(p.onStackCm)} />
            </Boxes>
          </>
        );
      case 'what':
        return (
          <div className='flex w-full max-w-md flex-col gap-4'>
            {p.colourways.length > 0 && (
              <div className='flex items-center gap-3'>
                <Label>colourway</Label>
                <div className={`flex ${CTRL_H}`} role='radiogroup' aria-label='colourway'>
                  {[{ id: 0, label: 'shared' }, ...p.colourways].map((c) => (
                    <Chip
                      key={c.id}
                      className={`${ONE_SIZE} -ml-px justify-center first:ml-0`}
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
              </div>
            )}
            <QtyRows rows={p.rows} total={p.cutTotal} disabled={p.busy} onQty={p.onQty} />
          </div>
        );
      case 'layers': {
        const parts = p.rows
          .map((r, i) => ({ l: r.label, q: p.perPly[i] ?? 0 }))
          .filter((x) => x.q > 0)
          .map((x) => `${x.q} ${x.l}`)
          .join(' · ');
        const askThickness = !p.thicknessFromBom || p.thicknessMm == null;
        return (
          <>
            <LayersPicture
              tableLengthCm={tableLen}
              layCm={layCm}
              plies={p.plies}
              plySizes={plySizes}
              stackCm={p.stackCm ?? 0}
              stackOk={p.stackOk}
              faceToFace={faceToFace}
            />
            <Text component='p' className='text-center tabular-nums'>
              {p.plies} {p.plies === 1 ? 'layer' : 'layers'} × ({parts || <EmptyCell />}) ={' '}
              {p.cutTotal + p.extraTotal}
              {p.extraTotal > 0 && <span className='text-labelColor'> +{p.extraTotal} extra</span>}
            </Text>
            <Boxes count={askThickness ? 3 : 2}>
              <Box label='face'>
                <div className={`flex ${CTRL_H}`} role='radiogroup' aria-label='face'>
                  {(
                    [
                      ['face_up', 'up'],
                      ['face_to_face', 'to face'],
                    ] as const
                  ).map(([m, label]) => (
                    <Chip
                      key={m}
                      className={`${ONE_SIZE} -ml-px flex-1 justify-center first:ml-0`}
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
                </div>
              </Box>
              <Box
                label={p.pliesAuto ? 'layers · auto' : 'layers'}
                aside={
                  p.pliesAuto ? undefined : (
                    <Button
                      variant='underline'
                      className='uppercase'
                      disabled={p.busy}
                      onClick={() => p.onPlies(null)}
                    >
                      auto
                    </Button>
                  )
                }
              >
                <NumField
                  label='layers'
                  value={p.plies}
                  disabled={p.busy}
                  className={`${CTRL_H} tabular-nums`}
                  onCommit={(n) => {
                    const next = Math.max(1, Math.round(n));
                    if (n >= 1 && (next !== p.plies || p.pliesAuto)) p.onPlies(next);
                  }}
                />
              </Box>
              {askThickness && (
                <NumBox
                  label='thickness mm'
                  value={p.thicknessMm}
                  disabled={p.busy}
                  onCommit={(n) => p.onThickness(n > 0 ? n : null)}
                />
              )}
            </Boxes>
          </>
        );
      }
      case 'ends':
        return (
          <>
            <EndsPicture endLossCm={p.endLossCm} layCm={layCm} tableLengthCm={tableLen} />
            <Boxes count={1}>
              <NumBox
                label='end loss cm'
                value={p.endLossCm}
                onCommit={(v) => p.onEndLoss(Math.max(0, v))}
              />
            </Boxes>
          </>
        );
      case 'run': {
        // Ведомость фактов: подпись слева, значение справа; строка — дверь к своему шагу.
        const go = (label: string, to: QuizStep, value: React.ReactNode, error?: boolean) => (
          <Fact
            key={label}
            label={label}
            error={error}
            disabled={p.busy}
            onClick={() => quiz.go(to)}
          >
            {value}
          </Fact>
        );
        const sized = p.rows.filter((r) => r.qty > 0);
        const garments = (
          <>
            {sized.length > 0 && !(sized.length === 1 && sized[0].label === 'garments')
              ? sized.map((r) => `${r.label} × ${r.qty}`).join(' · ')
              : p.cutTotal}
            {table && p.extraTotal > 0 && <span className='text-labelColor'> +{p.extraTotal}</span>}
          </>
        );
        const fix = (w: QuizWarning) =>
          w.fix &&
          (w.fix.href ? (
            <Button asChild variant='secondary' className={FRAMED}>
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
              variant='secondary'
              className={FRAMED}
              disabled={w.fix.disabled || p.busy}
              onClick={w.fix.onClick}
            >
              {w.fix.label}
            </Button>
          ));
        return (
          <>
            <FactList className='max-w-xl'>
              {go('garments', 'what', garments, p.cutTotal === 0)}
              {table && go('layers', 'layers', p.plies)}
              {table &&
                go(
                  'stack',
                  'layers',
                  <>
                    {p.stackCm == null ? <EmptyCell /> : f1(p.stackCm)}
                    <span className='text-labelColor'>
                      {' '}
                      / {p.stackLimitCm == null ? <EmptyCell /> : f1(p.stackLimitCm)}
                    </span>{' '}
                    cm
                  </>,
                  !p.stackOk,
                )}
              {go(
                'fabric',
                table ? 'ends' : 'what',
                p.fabricCm == null
                  ? '—'
                  : `${p.markerEstimate ? '≈ ' : ''}${(p.fabricCm / 100).toFixed(2)} m`,
              )}
              {p.cloth}
              {p.pieces}
              {p.nesting}
            </FactList>
            {p.extras && <div className='flex w-full max-w-xl justify-end'>{p.extras}</div>}
            {p.warnings.length > 0 && (
              <ul className='flex w-full max-w-xl flex-col border-t border-hairline'>
                {p.warnings.map((w) => (
                  <li
                    key={w.text}
                    className='flex items-center justify-between gap-3 border-b border-hairline py-1.5 text-error'
                  >
                    <span className='min-w-0 flex-1'>! {w.text}</span>
                    {fix(w)}
                  </li>
                ))}
              </ul>
            )}
            <Button
              variant='underline'
              className='self-center text-labelColor uppercase'
              disabled={p.busy}
              onClick={quiz.restart}
            >
              redo questions
            </Button>
          </>
        );
      }
    }
  })();

  return (
    <QuizFrame
      question={QUESTION[step]}
      backDisabled={quiz.index === 0 || p.busy}
      onBack={quiz.back}
      aside={
        step === 'run' && p.onShowResult ? (
          <Button variant='underline' className='uppercase' onClick={p.onShowResult}>
            show result
          </Button>
        ) : undefined
      }
      main={
        step !== 'spread'
          ? { label: nextLabel, disabled: nextDisabled, onClick: () => void onNext() }
          : undefined
      }
    >
      {body}
    </QuizFrame>
  );
}

/** A picture card answer (the spread question, the print's paper): picture, name, sub. */
export function PictureChoice({
  picked,
  disabled,
  name,
  sub,
  onClick,
  children,
}: {
  picked: boolean;
  disabled?: boolean;
  name: string;
  sub: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      aria-pressed={picked}
      disabled={disabled}
      className={`flex flex-col gap-2 border p-4 text-left transition-colors hover:border-textColor ${
        picked ? 'border-textColor' : 'border-borderColor'
      }`}
      onClick={onClick}
    >
      {children}
      <Text component='span'>{name}</Text>
      <Label>{sub}</Label>
    </Button>
  );
}

export type QuizMain = { label: string; disabled?: boolean; onClick: () => void };

/** Подвал квиза: «Back» слева, главная кнопка справа. Отдельно — телефон кладёт его в dock модалки. */
export function QuizFooter({
  backDisabled,
  onBack,
  aside,
  main,
  className = 'border-t border-borderColor pt-3',
}: {
  backDisabled?: boolean;
  onBack: () => void;
  aside?: React.ReactNode;
  main?: QuizMain;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Button variant='secondary' className={FRAMED} disabled={backDisabled} onClick={onBack}>
        Back
      </Button>
      <span className='flex-1' />
      {aside}
      {main && (
        <Button variant='main' className={FRAMED} disabled={main.disabled} onClick={main.onClick}>
          {main.label}
        </Button>
      )}
    </div>
  );
}

/** Экран квиза: вопрос по центру, тело, подвал (если `footer` не унесён наружу). */
export function QuizFrame({
  question,
  children,
  backDisabled,
  onBack,
  aside,
  main,
  footer = true,
}: {
  question: React.ReactNode;
  children: React.ReactNode;
  backDisabled?: boolean;
  onBack: () => void;
  aside?: React.ReactNode;
  main?: QuizMain;
  footer?: boolean;
}) {
  return (
    <div className={`flex flex-col ${ONE_SIZE}`}>
      <div className='flex min-h-96 flex-col items-center gap-4 px-2 pt-2 pb-4'>
        <Text component='h2' className='text-center'>
          {question}
        </Text>
        {children}
      </div>
      {footer && (
        <QuizFooter backDisabled={backDisabled} onBack={onBack} aside={aside} main={main} />
      )}
    </div>
  );
}

/** Размер × количество: строки под линией и TOTAL (шаг «what» маркера, шаг 1 печати). */
export function QtyRows({
  rows,
  total,
  disabled,
  onQty,
}: {
  rows: ReadonlyArray<Pick<QuizRow, 'key' | 'label' | 'qty' | 'bad' | 'min'>>;
  total: number;
  disabled?: boolean;
  onQty: (key: string, n: number) => void;
}) {
  return (
    <div className='flex flex-col border-t border-textColor'>
      {rows.map((r) => (
        <div
          key={r.key}
          className={`flex items-center justify-between gap-3 border-b border-hairline py-1.5 ${
            r.qty > 0 ? '' : 'text-labelColor'
          }`}
        >
          <Text component='span' className={r.bad ? 'text-error' : undefined}>
            {r.label}
          </Text>
          <QtyField
            label={r.label}
            value={r.qty}
            min={r.min}
            disabled={disabled}
            onChange={(n) => onQty(r.key, n)}
          />
        </div>
      ))}
      <div className='flex items-center justify-between gap-3 border-b border-textColor py-1.5 uppercase'>
        <span>total</span>
        <span className='w-24 pr-2.5 text-right tabular-nums'>{total}</span>
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
