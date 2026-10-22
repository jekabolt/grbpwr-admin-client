// PRINT 1:1 — the marker quiz shell with three screens: what we print (sizes × copies), which
// paper (a roll, asked every time and prefilled with the last width, or A4 / A3 tiles), and the
// result (facts + the paper laid sideways) with the PDF download. The layout is the engine's
// (lib/pattern-export/roll-print.ts); this file only asks, shows and saves.
//
// Tiles: the engine lays the picked sizes on a virtual roll (TILE_ROLL), its sheets are stacked
// into one drawing here, and that drawing goes through the existing tiled PDF path (planPdf).
import { PHONE_QUERY, useMediaQuery } from 'components/managers/tasks/hooks/useMediaQuery';
import { fetchMediaBlob } from 'lib/features/media-blob';
import { downloadFile } from 'lib/pattern-export/download';
import type { PatternDrawing } from 'lib/pattern-export/drawing';
import { planPdf, type PdfPlan } from 'lib/pattern-export/dxf-pdf';
import { exportDrawing } from 'lib/pattern-export/formats';
import {
  exportRollPrint,
  minRollWidthCm,
  planRollPrint,
  ROLL_MAX_WIDTH_CM,
  readRollPrintSource,
  type RollPrintPlan,
  type RollPrintSource,
  type RollSpec,
  type SizeCopies,
} from 'lib/pattern-export/roll-print';
import { type RollPrintPaper, zipRollPrintPdfs } from 'lib/pattern-export/roll-print-zip';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState } from 'react';
import { CheckboxCommon, ConfirmationModal, EmptyCell, GroupLabel, Input, Text } from 'ui';

import {
  PictureChoice,
  Fact,
  FactList,
  parseNum,
  QtyRows,
  QuizFooter,
  QuizFrame,
  type QuizMain,
} from '../nesting/marker-quiz/marker-quiz';
import { PaperChoicePicture } from '../nesting/marker-quiz/pictures';
import { pdfDeps } from './download';
import { readPrintRoll, rememberPrintRoll, rememberTestSquare } from './roll-print-memory';

export type RollPrintTarget = {
  url: string;
  fileName: string;
  /** Material of the slot: the dialog header. */
  material: string;
  /** Card code for the PDF title line and the file name (falls back to the file's own title). */
  title: string;
  /** Key of the remembered picks. */
  cardKey: string;
  /** Material slots for one batch print. Omitted for the existing per-file action. */
  slots?: RollPrintSlot[];
};

export type RollPrintSlot = {
  key: string;
  label: string;
  material: string;
  url: string;
  fileName: string;
};

type Step = 1 | 2 | 3;
type Paper = 'roll' | 'A4' | 'A3';

const QUESTION: Record<Step, string> = {
  1: 'What do we print?',
  2: 'Which paper?',
  3: 'Ready to print',
};

const PAPERS: readonly { value: Paper; name: string; sub: string }[] = [
  { value: 'roll', name: 'Roll', sub: 'plotter' },
  { value: 'A4', name: 'A4 tiles', sub: 'office printer' },
  { value: 'A3', name: 'A3 tiles', sub: 'office printer' },
];

// One long roll: the engine splits only past the PDF page limit (5.08 m). Owner, 22.10.
const ROLL_SHEET_M = 5;
const ROLL_EDGE_MM = 5;
const rollOf = (widthCm: number, testSquare = true): RollSpec => ({
  widthCm,
  maxSheetM: ROLL_SHEET_M,
  edgeMm: ROLL_EDGE_MM,
  testSquare,
});
// The virtual roll the tiles are laid on before they are cut into pages.
const TILE_ROLL: RollSpec = { widthCm: 100, maxSheetM: ROLL_SHEET_M, edgeMm: 0 };
const TILE_GAP_MM = 20;
// The widest roll a single PDF page can carry.
const MAX_ROLL_CM = ROLL_MAX_WIDTH_CM;

const f1 = (n: number) => String(Math.round(n * 10) / 10);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/** `XS–XL ×1` when the run is contiguous and even, else `XS ×1 · M ×2`. */
function sizesText(order: string[], copies: SizeCopies): string {
  const live = order.filter((s) => (copies[s] ?? 0) > 0);
  if (live.length === 0) return '';
  const q = copies[live[0]];
  const even = live.every((s) => copies[s] === q);
  const first = order.indexOf(live[0]);
  const contiguous = order.indexOf(live[live.length - 1]) - first + 1 === live.length;
  if (live.length > 1 && even && contiguous) return `${live[0]}–${live[live.length - 1]} ×${q}`;
  return live.map((s) => `${s} ×${copies[s]}`).join(' · ');
}

/** The engine's sheets, one under the other, as one drawing for the tiled PDF. */
function stackSheets(plan: RollPrintPlan, title: string): PatternDrawing {
  const strokes: PatternDrawing['strokes'] = [];
  const labels: PatternDrawing['labels'] = [];
  let y0 = 0;
  let w = 0;
  plan.sheets.forEach((s, i) => {
    const dy = y0;
    strokes.push(
      ...s.drawing.strokes.map((st) => ({
        ...st,
        pts: st.pts.map(([x, y]) => [x, y + dy] as [number, number]),
      })),
    );
    labels.push(...s.drawing.labels.map((l) => ({ ...l, y: l.y + dy })));
    w = Math.max(w, s.drawing.w);
    y0 += Math.max(s.lengthMm, s.drawing.h) + (i < plan.sheets.length - 1 ? TILE_GAP_MM : 0);
  });
  return { w, h: y0, strokes, labels, title, warnings: [] };
}

type Laid =
  | { kind: 'roll'; plan: RollPrintPlan }
  | { kind: 'tiles'; plan: RollPrintPlan; drawing: PatternDrawing; pdf: PdfPlan };

type LoadedSlot = {
  slot: RollPrintSlot;
  bytes: ArrayBuffer | null;
  source: RollPrintSource | null;
  error: string | null;
};

type SlotResult = {
  slot: RollPrintSlot;
  laid: Laid | null;
  error: string | null;
};

const oneSlot = (target: RollPrintTarget): RollPrintSlot => ({
  key: '__single',
  label: target.material || target.fileName,
  material: target.material,
  url: target.url,
  fileName: target.fileName,
});

export function RollPrintDialog({
  target,
  onClose,
}: {
  target: RollPrintTarget | null;
  onClose: () => void;
}) {
  const phone = useMediaQuery(PHONE_QUERY);
  const targets = useMemo(
    () => (target ? (target.slots?.length ? target.slots : [oneSlot(target)]) : []),
    [target],
  );
  const multiple = targets.length > 1;
  const [step, setStep] = useState<Step>(1);
  const [loaded, setLoaded] = useState<LoadedSlot[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [copies, setCopies] = useState<SizeCopies>({});
  const [paper, setPaper] = useState<Paper>('roll');
  const [testSquare, setTestSquare] = useState(true);
  // Typed by hand; prefilled only with the width the user typed last time.
  const [widthText, setWidthText] = useState('');
  const [results, setResults] = useState<SlotResult[]>([]);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);

  // Open: read every selected material's current file once. A bad slot stays in the batch as its
  // own error; it never prevents another slot from being planned or downloaded.
  useEffect(() => {
    if (!target) return;
    let dead = false;
    const mem = readPrintRoll();
    setStep(1);
    setLoaded([]);
    setSelected(Object.fromEntries(targets.map((slot) => [slot.key, true])));
    setLoading(true);
    setCopies({});
    setResults([]);
    setPaper('roll');
    setTestSquare(mem.testSquare);
    setWidthText(mem.last ? String(mem.last.widthCm) : '');
    void (async () => {
      const next = await Promise.all(
        targets.map(async (slot): Promise<LoadedSlot> => {
          try {
            const bytes = await (await fetchMediaBlob(slot.url)).arrayBuffer();
            return {
              slot,
              bytes,
              source: readRollPrintSource(bytes, slot.fileName),
              error: null,
            };
          } catch (error) {
            return { slot, bytes: null, source: null, error: errText(error) };
          }
        }),
      );
      if (dead) return;
      const allSizes: string[] = [];
      for (const item of next)
        for (const size of item.source?.sizes ?? [])
          if (!allSizes.includes(size.size)) allSizes.push(size.size);
      const last = mem.picks[target.cardKey] ?? {};
      const known = allSizes.some((size) => size in last);
      setCopies(Object.fromEntries(allSizes.map((size) => [size, known ? last[size] ?? 0 : 1])));
      setLoaded(next);
      setLoading(false);
    })();
    return () => {
      dead = true;
    };
  }, [target, targets]);

  const selectedSlots = useMemo(
    () => targets.filter((slot) => selected[slot.key]),
    [selected, targets],
  );
  const selectedLoaded = useMemo(
    () => loaded.filter((item) => selected[item.slot.key]),
    [loaded, selected],
  );
  // The first checked file establishes the grade order; later files append only new sizes.
  const order = useMemo(() => {
    const out: string[] = [];
    for (const item of selectedLoaded)
      for (const size of item.source?.sizes ?? [])
        if (!out.includes(size.size)) out.push(size.size);
    return out;
  }, [selectedLoaded]);
  const total = order.reduce((n, s) => n + (copies[s] ?? 0), 0);
  const title = target?.title || loaded.find((item) => item.source)?.source?.title || 'pattern';
  const widthCm = parseNum(widthText, true) ?? 0;
  const roll = rollOf(widthCm, testSquare);
  const minCm = useMemo(
    () =>
      selectedLoaded.reduce<number | null>((max, item) => {
        if (!item.bytes) return max;
        const next = minRollWidthCm(item.bytes, item.slot.fileName, copies, ROLL_EDGE_MM);
        return max == null ? next : Math.max(max, next);
      }, null),
    [selectedLoaded, copies],
  );
  const widthBad: string | null =
    widthCm <= 0
      ? null
      : minCm != null && widthCm < minCm
        ? `min ${f1(minCm)} cm`
        : widthCm > MAX_ROLL_CM
          ? `max ${f1(MAX_ROLL_CM)} cm`
          : null;

  // Step 3: each slot gets the same copies and paper. Sizes absent from a file are skipped by the
  // engine. A stale batch (the user went back or changed a selection) aborts every live worker.
  useEffect(() => {
    if (step !== 3 || !target) return;
    const ac = new AbortController();
    setRunning(true);
    setResults(selectedLoaded.map((item) => ({ slot: item.slot, laid: null, error: item.error })));
    const spec = paper === 'roll' ? rollOf(widthCm, testSquare) : { ...TILE_ROLL, testSquare };
    Promise.all(
      selectedLoaded.map(async (item): Promise<SlotResult> => {
        if (!item.bytes || !item.source)
          return { slot: item.slot, laid: null, error: item.error ?? 'file not read' };
        try {
          const plan = await planRollPrint(item.bytes, item.slot.fileName, copies, spec, ac.signal);
          if (paper === 'roll')
            return { slot: item.slot, laid: { kind: 'roll', plan }, error: null };
          const drawing = stackSheets(plan, title);
          return {
            slot: item.slot,
            laid: { kind: 'tiles', plan, drawing, pdf: planPdf(drawing, { kind: 'tiles', paper }) },
            error: null,
          };
        } catch (error) {
          if (ac.signal.aborted || (error instanceof Error && error.name === 'AbortError'))
            throw error;
          return { slot: item.slot, laid: null, error: errText(error) };
        }
      }),
    )
      .then((next) => {
        if (!ac.signal.aborted) setResults(next);
      })
      .catch((e) => {
        if (ac.signal.aborted || (e instanceof Error && e.name === 'AbortError')) return;
        setResults(
          selectedLoaded.map((item) => ({ slot: item.slot, laid: null, error: errText(e) })),
        );
      })
      .finally(() => {
        if (!ac.signal.aborted) setRunning(false);
      });
    return () => ac.abort();
  }, [step, selectedLoaded, target, copies, paper, widthCm, testSquare, title]);

  const download = async () => {
    if (!target) return;
    const printable = results.filter((result) => result.laid && result.laid.plan.placed > 0);
    if (printable.length === 0) return;
    setSaving(true);
    try {
      const deps = await pdfDeps();
      const exportOne = (laid: Laid) =>
        laid.kind === 'roll'
          ? exportRollPrint(laid.plan, title, roll, deps)
          : exportDrawing(laid.drawing, paper === 'A3' ? 'pdf-a3' : 'pdf-a4', deps);
      if (selectedSlots.length === 1) {
        const laid = printable[0].laid!;
        const res = exportOne(laid);
        downloadFile(res.blob, res.fileName);
        const n = laid.kind === 'roll' ? laid.plan.sheets.length : laid.pdf.pages.length;
        const tail =
          laid.kind === 'roll' ? (n > 1 ? ` · ${n} sheets` : '') : ` · ${plural(n, 'page')}`;
        useSnackBarStore.getState().showMessage(`saved · ${res.fileName}${tail}`, 'success');
        return;
      }

      const failed = new Map<string, string>();
      const files: { slotLabel: string; bytes: Uint8Array }[] = [];
      for (const result of printable) {
        try {
          const res = exportOne(result.laid!);
          files.push({
            slotLabel: result.slot.label,
            bytes: new Uint8Array(await res.blob.arrayBuffer()),
          });
        } catch (error) {
          failed.set(result.slot.key, errText(error));
        }
      }
      if (failed.size > 0)
        setResults((current) =>
          current.map((result) => ({
            ...result,
            error: failed.get(result.slot.key) ?? result.error,
          })),
        );
      const printPaper: RollPrintPaper =
        paper === 'roll' ? { kind: 'roll', widthCm } : { kind: 'tiles', paper };
      const zip = zipRollPrintPdfs(title, printPaper, files);
      downloadFile(zip.bytes, zip.name, 'application/zip');
      const failedTail = failed.size > 0 ? ` · ${failed.size} failed` : '';
      useSnackBarStore
        .getState()
        .showMessage(
          `saved · ${zip.name} · ${plural(files.length, 'PDF')}${failedTail}`,
          'success',
        );
    } catch (e) {
      useSnackBarStore.getState().showMessage(`not saved · ${errText(e)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const goNext = () => {
    if (step === 2 && target) {
      if (paper === 'roll') {
        // The width is remembered the moment it is answered: the next print starts from it.
        rememberPrintRoll(roll, target.cardKey, copies);
      } else {
        rememberTestSquare(testSquare);
      }
    }
    setStep((s) => (s < 3 ? ((s + 1) as Step) : s));
  };

  const printable = results.filter((result) => result.laid && result.laid.plan.placed > 0).length;
  const downloadZip = selectedSlots.length > 1;
  const main: QuizMain =
    step === 3
      ? {
          label: saving
            ? downloadZip
              ? 'Download ZIP…'
              : 'Download PDF…'
            : downloadZip
              ? 'Download ZIP'
              : 'Download PDF',
          disabled: running || saving || printable === 0,
          onClick: () => void download(),
        }
      : {
          label: 'Next',
          disabled:
            step === 1
              ? loading || selectedSlots.length === 0 || total === 0
              : paper === 'roll' && (!(widthCm > 0) || widthBad != null),
          onClick: goNext,
        };
  const back = () => setStep((s) => (s > 1 ? ((s - 1) as Step) : s));

  const body = (() => {
    if (step === 1) {
      if (loading) return <Wait />;
      if (!multiple && loaded[0]?.error)
        return <Problem text='file not read' title={loaded[0].error} />;
      return (
        <div className={`flex w-full flex-col gap-4 ${multiple ? 'max-w-3xl' : 'max-w-md'}`}>
          {multiple && (
            <SlotRows
              slots={loaded}
              selected={selected}
              onSelect={(key, checked) =>
                setSelected((current) => ({ ...current, [key]: checked }))
              }
            />
          )}
          <QtyRows
            rows={order.map((size) => ({
              key: size,
              label: size,
              qty: copies[size] ?? 0,
              bad: false,
              min: 0,
            }))}
            total={total}
            onQty={(key, n) => setCopies((c) => ({ ...c, [key]: n }))}
          />
        </div>
      );
    }
    if (step === 2)
      return (
        <PaperStep
          paper={paper}
          onPaper={setPaper}
          widthText={widthText}
          onWidth={setWidthText}
          minCm={minCm}
          bad={widthBad}
          testSquare={testSquare}
          onTestSquare={setTestSquare}
        />
      );
    return multiple ? (
      <BatchResultStep
        sizes={sizesText(order, copies)}
        paper={paper}
        widthCm={widthCm}
        results={results}
        running={running}
        onGo={setStep}
      />
    ) : (
      <ResultStep
        sizes={sizesText(order, copies)}
        paper={paper}
        widthCm={widthCm}
        laid={results[0]?.laid ?? null}
        running={running}
        error={results[0]?.error ?? null}
        onGo={setStep}
      />
    );
  })();

  return (
    <ConfirmationModal
      open={target != null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      onConfirm={onClose}
      title={
        multiple ? 'print · all slots' : ['print', target?.material].filter(Boolean).join(' · ')
      }
      width='lg'
      hideActions
      fullScreen={phone}
      dock={
        phone ? (
          <QuizFooter
            className='border-t border-borderColor p-2.5'
            backDisabled={step === 1}
            onBack={back}
            main={main}
          />
        ) : undefined
      }
    >
      <QuizFrame
        question={QUESTION[step]}
        backDisabled={step === 1}
        onBack={back}
        main={main}
        footer={!phone}
      >
        {body}
      </QuizFrame>
    </ConfirmationModal>
  );
}

function Problem({ text, title }: { text: string; title?: string }) {
  return (
    <Text component='p' className='text-error' title={title}>
      ! {text}
    </Text>
  );
}

function Wait() {
  return (
    <Text size='micro' variant='label' component='p'>
      reading…
    </Text>
  );
}

function SlotRows({
  slots,
  selected,
  onSelect,
}: {
  slots: readonly LoadedSlot[];
  selected: Readonly<Record<string, boolean>>;
  onSelect: (key: string, checked: boolean) => void;
}) {
  return (
    <div className='w-full border-y border-hairline divide-y divide-hairline'>
      {slots.map((item, index) => {
        const id = `print-slot-${index}`;
        const checked = selected[item.slot.key] === true;
        return (
          <div key={item.slot.key} className='flex min-h-10 items-center gap-2 py-1.5'>
            <CheckboxCommon
              name={id}
              checked={checked}
              aria-label={`print ${item.slot.label}`}
              onChange={(next) => onSelect(item.slot.key, next)}
            />
            <label
              htmlFor={id}
              className='grid min-w-0 flex-1 cursor-pointer grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-3 sm:items-center'
            >
              <Text
                size='micro'
                tracking='label'
                component='span'
                className={checked ? 'truncate uppercase' : 'truncate uppercase text-labelColor'}
                title={item.slot.label}
              >
                {item.slot.label}
              </Text>
              <Text
                component='span'
                variant='label'
                className='truncate'
                title={item.slot.material}
              >
                {item.slot.material}
              </Text>
              <Text
                component='span'
                variant={item.error ? undefined : 'label'}
                className={`truncate ${item.error ? 'text-error' : ''}`}
                title={item.error ?? item.slot.fileName}
              >
                {item.error ? `! ${item.slot.fileName}` : item.slot.fileName}
              </Text>
            </label>
          </div>
        );
      })}
    </div>
  );
}

function PaperStep({
  paper,
  onPaper,
  widthText,
  onWidth,
  minCm,
  bad,
  testSquare,
  onTestSquare,
}: {
  paper: Paper;
  onPaper: (p: Paper) => void;
  widthText: string;
  onWidth: (w: string) => void;
  minCm: number | null;
  bad: string | null;
  testSquare: boolean;
  onTestSquare: (checked: boolean) => void;
}) {
  return (
    <div className='flex w-full max-w-3xl flex-col items-center gap-4'>
      <div className='grid w-full grid-cols-3 gap-2 sm:gap-4'>
        {PAPERS.map((x) => (
          <PictureChoice
            key={x.value}
            picked={paper === x.value}
            name={x.name}
            sub={x.sub}
            onClick={() => onPaper(x.value)}
          >
            <PaperChoicePicture kind={x.value} />
          </PictureChoice>
        ))}
      </div>
      {paper === 'roll' && (
        <div className='flex flex-col items-center gap-1'>
          <div className='flex items-baseline gap-2'>
            <Input
              inputMode='decimal'
              autoComplete='off'
              aria-label='roll width cm'
              aria-invalid={bad != null}
              className='h-12 w-40 text-right text-statBig tabular-nums'
              value={widthText}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const t = e.target.value;
                if (t === '' || parseNum(t, true) != null) onWidth(t);
              }}
            />
            <span>cm</span>
          </div>
          {bad ? (
            <Text size='micro' component='p' className='text-error'>
              ! {bad}
            </Text>
          ) : (
            <Text size='micro' variant='label' component='p' className='tabular-nums'>
              {minCm != null ? `min ${f1(minCm)} · ` : ''}max {f1(MAX_ROLL_CM)} cm
            </Text>
          )}
        </div>
      )}
      <label htmlFor='print-test-square' className='flex cursor-pointer items-center gap-2'>
        <CheckboxCommon name='print-test-square' checked={testSquare} onChange={onTestSquare} />
        <Text component='span'>test square</Text>
      </label>
    </div>
  );
}

function ResultStep({
  sizes,
  paper,
  widthCm,
  laid,
  running,
  error,
  onGo,
}: {
  sizes: string;
  paper: Paper;
  widthCm: number;
  laid: Laid | null;
  running: boolean;
  error: string | null;
  onGo: (s: Step) => void;
}) {
  const plan = laid?.plan ?? null;
  const problems: { text: string; title?: string }[] = [];
  if (error) problems.push({ text: 'layout failed', title: error });
  if (plan?.tooWide.length)
    problems.push({
      text: `${plural(plan.tooWide.length, 'piece')} wider than ${paper === 'roll' ? 'roll' : 'paper'}`,
      title: plan.tooWide.join('\n'),
    });
  if (plan?.tooLong.length)
    problems.push({
      text: `${plural(plan.tooLong.length, 'piece')} longer than sheet`,
      title: plan.tooLong.join('\n'),
    });
  const sheets = laid?.kind === 'roll' ? laid.plan.sheets.length : 0;
  return (
    <div className='flex w-full flex-col items-center gap-4'>
      <FactList className='max-w-xl'>
        <Fact label='sizes' onClick={() => onGo(1)}>
          {sizes || <EmptyCell />}
        </Fact>
        {paper === 'roll' ? (
          <>
            <Fact label='roll' onClick={() => onGo(2)}>
              {f1(widthCm)} cm
            </Fact>
            <Fact label='length' onClick={() => onGo(2)}>
              {plan ? `${(plan.lengthMm / 1000).toFixed(1)} m` : <EmptyCell />}
            </Fact>
            {sheets > 1 && (
              <Fact label='sheets' onClick={() => onGo(2)}>
                {sheets}
              </Fact>
            )}
          </>
        ) : (
          <>
            <Fact label='paper' onClick={() => onGo(2)}>
              {paper} tiles
            </Fact>
            <Fact label='pages' onClick={() => onGo(2)}>
              {laid?.kind === 'tiles' ? laid.pdf.pages.length : <EmptyCell />}
            </Fact>
          </>
        )}
        <Fact label='pieces' error={!!plan && plan.placed !== plan.total} onClick={() => onGo(1)}>
          {plan ? `${plan.placed} / ${plan.total}` : <EmptyCell />}
        </Fact>
      </FactList>
      {problems.length > 0 && (
        <ul className='flex w-full max-w-xl flex-col border-t border-hairline'>
          {problems.map((p) => (
            <li key={p.text} title={p.title} className='border-b border-hairline py-1.5 text-error'>
              ! {p.text}
            </li>
          ))}
        </ul>
      )}
      <PaperCanvas laid={laid} running={running} />
    </div>
  );
}

function batchProblem(result: SlotResult, paper: Paper): string | null {
  if (result.error) return result.error;
  const plan = result.laid?.plan;
  if (!plan) return null;
  if (plan.placed === 0) return plan.total === 0 ? 'no matching sizes' : 'no pieces fit paper';
  const parts: string[] = [];
  if (plan.tooWide.length)
    parts.push(
      `${plural(plan.tooWide.length, 'piece')} wider than ${paper === 'roll' ? 'roll' : 'paper'}`,
    );
  if (plan.tooLong.length) parts.push(`${plural(plan.tooLong.length, 'piece')} longer than sheet`);
  return parts.join(' · ') || null;
}

function BatchResultStep({
  sizes,
  paper,
  widthCm,
  results,
  running,
  onGo,
}: {
  sizes: string;
  paper: Paper;
  widthCm: number;
  results: readonly SlotResult[];
  running: boolean;
  onGo: (s: Step) => void;
}) {
  const successful = results.filter((result) => result.laid && result.laid.plan.placed > 0);
  const lengthMm = successful.reduce((sum, result) => sum + (result.laid?.plan.lengthMm ?? 0), 0);
  return (
    <div className='flex w-full min-w-0 flex-col items-center gap-4'>
      <FactList className='max-w-xl'>
        <Fact label='sizes' onClick={() => onGo(1)}>
          {sizes || <EmptyCell />}
        </Fact>
        <Fact label={paper === 'roll' ? 'roll' : 'paper'} onClick={() => onGo(2)}>
          {paper === 'roll' ? `${f1(widthCm)} cm` : `${paper} tiles`}
        </Fact>
        <Fact label='length' onClick={() => onGo(2)}>
          {paper === 'roll' ? `${(lengthMm / 1000).toFixed(1)} m` : <EmptyCell />}
        </Fact>
        <Fact label='files' onClick={() => onGo(1)}>
          {successful.length} PDF
        </Fact>
      </FactList>
      <div className='flex w-full min-w-0 flex-col gap-4'>
        {results.map((result) => {
          const problem = batchProblem(result, paper);
          const measure = result.laid
            ? result.laid.kind === 'roll'
              ? `${(result.laid.plan.lengthMm / 1000).toFixed(1)} m`
              : plural(result.laid.pdf.pages.length, 'page')
            : null;
          return (
            <div key={result.slot.key} className='min-w-0'>
              <GroupLabel
                flush
                action={
                  problem ? (
                    <Text component='span' size='micro' className='text-right text-error'>
                      ! {problem}
                    </Text>
                  ) : undefined
                }
              >
                {result.slot.label}
                {measure ? ` · ${measure}` : ''}
              </GroupLabel>
              {((result.laid?.plan.placed ?? 0) > 0 || (!problem && !result.laid)) && (
                <PaperCanvas laid={result.laid} running={running} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The paper laid sideways, as the marker draws its cloth: the roll's width = canvas height, the
 * length runs to the right and scrolls. Each roll sheet is its own panel; the gap is the cut.
 * Tiles: the stacked drawing with the page grid over it.
 */
function PaperCanvas({ laid, running }: { laid: Laid | null; running: boolean }) {
  if (!laid || laid.plan.sheets.length === 0)
    return (
      <div className='flex h-64 w-full items-center justify-center border border-borderColor bg-bgColor'>
        <Text size='micro' variant='label'>
          {running ? 'computing…' : <EmptyCell />}
        </Text>
      </div>
    );
  const panels =
    laid.kind === 'roll'
      ? laid.plan.sheets.map((s, i) => ({ drawing: s.drawing, lengthMm: s.lengthMm, grid: null }))
      : [{ drawing: laid.drawing, lengthMm: laid.drawing.h, grid: laid.pdf.grid ?? null }];
  return (
    <div className='h-72 w-full overflow-x-auto overflow-y-hidden border border-borderColor bg-pageBg p-2'>
      <div className='flex h-full w-max gap-4'>
        {panels.map((p, i) => (
          <div key={i} className='flex h-full flex-col gap-1'>
            <Text
              size='nano'
              variant='label'
              tracking='label'
              component='span'
              className='uppercase'
            >
              {laid.kind === 'roll' ? `sheet ${i + 1}` : `${laid.pdf.pages.length} pages`}
            </Text>
            <SheetSvg
              drawing={p.drawing}
              lengthMm={p.lengthMm}
              grid={p.grid}
              name={`sheet ${i + 1}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Canvas height of a sheet on screen = the roll's width. */
const SHEET_PX = 240;

function SheetSvg({
  drawing,
  lengthMm,
  grid,
  name,
}: {
  drawing: PatternDrawing;
  lengthMm: number;
  grid: PdfPlan['grid'] | null;
  name: string;
}) {
  // Page frame: x across the paper (w), y along it. On screen: along = x, across = y, turned a
  // quarter CCW (a rotation, not a mirror — texts stay readable).
  const W = drawing.w;
  const L = Math.max(lengthMm, drawing.h);
  const sw = Math.max(W, L) / 900;
  const label = Math.min(W, L) / 40;
  return (
    <svg
      viewBox={`0 0 ${L} ${W}`}
      className='block shrink-0 border border-textColor bg-bgColor text-textColor'
      // Explicit size: a flex column sizes itself to the label, so an aspect-ratio box collapses.
      style={{ height: SHEET_PX, width: (SHEET_PX * L) / W }}
      role='img'
      aria-label={name}
    >
      <g transform={`matrix(0 -1 1 0 0 ${W})`} fill='none' stroke='currentColor'>
        {drawing.strokes.map((st, i) => {
          const pts = st.pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
          const line = {
            strokeWidth: sw * (st.kind === 'cut' ? 1.6 : st.kind === 'notch' ? 1.2 : 0.8),
            strokeDasharray: st.dash?.length ? st.dash.join(' ') : undefined,
            strokeLinejoin: 'round' as const,
          };
          return st.closed ? (
            <polygon key={i} points={pts} {...line} />
          ) : (
            <polyline key={i} points={pts} {...line} />
          );
        })}
        {grid?.cells
          .filter((c) => !c.blank)
          .map((c) => (
            <rect
              key={c.label}
              x={c.col * grid.sx - grid.ox}
              y={c.row * grid.sy - grid.oy}
              width={grid.cw}
              height={grid.ch}
              className='text-labelColor'
              strokeWidth={sw * 0.8}
              strokeDasharray={`${sw * 4} ${sw * 3}`}
            />
          ))}
      </g>
      {drawing.labels.map((t, i) => {
        // (x, y) on the page → (y, W − x) on screen.
        const X = t.y;
        const Y = W - t.x;
        const size = t.sizeMm ?? label;
        const turn = t.sizeMm != null ? -((t.angle ?? 0) + 90) : 0;
        return (
          <text
            key={i}
            x={X}
            y={Y}
            fontSize={size}
            fill='currentColor'
            textAnchor={t.sizeMm != null ? 'start' : 'middle'}
            dominantBaseline={t.sizeMm != null ? undefined : 'middle'}
            transform={turn ? `rotate(${turn} ${X} ${Y})` : undefined}
          >
            {t.s}
          </text>
        );
      })}
    </svg>
  );
}
