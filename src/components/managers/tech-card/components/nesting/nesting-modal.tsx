// Раскладка (nesting) modal: DXF выкройки одного размера → детали → авто-раскладка на
// полосе ткани в web worker'е. Ничего не пишет на бек — расчётный инструмент (расход
// метража, вердикт «влезает ли в отрез»). Файл лениво импортируется из patterns-field,
// так что dxf-parser/clipper2-js/воркер живут только в чанке раскладки.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import CheckboxCommon from 'ui/components/checkbox';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import Selector from 'ui/components/selector';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import type { NestConfig, NestResult, PieceDTO, Unit } from 'lib/nesting/types';
import { NEST_DEFAULTS } from 'lib/nesting/types';
import { renderLayoutSvg } from 'lib/nesting/render/svg';
import { useNesting, type NestingFile } from './use-nesting';

type PieceSel = Record<number, { checked: boolean; qty: number }>;

function PieceThumb({ piece }: { piece: PieceDTO }) {
  const path = useMemo(() => {
    const s = 30 / Math.max(piece.bboxW, piece.bboxH, 1e-6);
    return piece.poly.map((p) => `${(p.x * s).toFixed(1)},${(30 - p.y * s).toFixed(1)}`).join(' ');
  }, [piece]);
  return (
    <svg viewBox='-1 -1 32 32' className='h-8 w-8 shrink-0 border border-borderColor bg-bgColor'>
      <polygon points={path} fill='none' stroke='currentColor' strokeWidth='1' />
    </svg>
  );
}

function numOr(v: string, fallback: number): number {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

export function NestingModal({
  files,
  sizeLabel,
  onClose,
}: {
  files: NestingFile[] | null; // null = closed
  sizeLabel?: string;
  onClose: () => void;
}) {
  const { parse, run, start, stop, resetRun, unitOverride, setUnitOverride } = useNesting(files);

  const [widthCm, setWidthCm] = useState<number>(NEST_DEFAULTS.fabricWidthCm);
  // Raw keystrokes; the min-clamp lands on BLUR (clamping per keystroke makes 90 unreachable
  // — typing «9» snaps to 10).
  const [widthRaw, setWidthRaw] = useState<string | null>(null);
  const [targetCm, setTargetCm] = useState<number | ''>('');
  const [gapCm, setGapCm] = useState<number>(NEST_DEFAULTS.gapCm);
  const [marginCm, setMarginCm] = useState<number>(NEST_DEFAULTS.edgeMarginCm);
  const [crossGrain, setCrossGrain] = useState<boolean>(NEST_DEFAULTS.allowCrossGrain);
  const [budgetS, setBudgetS] = useState<number>(NEST_DEFAULTS.timeBudgetMs / 1000);
  const [sel, setSel] = useState<PieceSel>({});

  const pieces = parse.phase === 'ready' ? parse.pieces : [];
  const usable = widthCm - 2 * marginCm;

  // Cross-strip span in the allowed rotations; a piece that fits nowhere is auto-unchecked.
  const fitsWidth = useMemo(() => {
    const m = new Map<number, boolean>();
    for (const p of pieces) {
      const spans = crossGrain ? [p.bboxH, p.bboxW] : [p.bboxH];
      m.set(p.id, Math.min(...spans) <= usable + 1e-9);
    }
    return m;
  }, [pieces, usable, crossGrain]);

  // (Re)seed the selection whenever a parse lands.
  useEffect(() => {
    if (parse.phase !== 'ready') return;
    const next: PieceSel = {};
    for (const p of parse.pieces) next[p.id] = { checked: true, qty: 1 };
    setSel(next);
  }, [parse]);

  const running = run.phase === 'running';
  const stopping = running && run.stopping;
  const result: NestResult | null =
    run.phase === 'done' ? run.result : run.phase === 'running' ? run.best : null;

  // A result computed for other parameters is stale — drop it the moment they change
  // (inputs are disabled while running, so this can only fire against a done run).
  useEffect(() => {
    resetRun();
  }, [widthCm, gapCm, marginCm, crossGrain, sel, resetRun]);

  const target = targetCm === '' ? undefined : targetCm;
  // Live preview renders simplified contours (every coalesced frame re-parses the SVG);
  // the finished layout renders exact — that's also what «скачать SVG» exports.
  const svg = useMemo(
    () =>
      result
        ? renderLayoutSvg(result, pieces, widthCm, target, run.phase === 'running' ? 0.05 : 0)
        : null,
    [result, pieces, widthCm, target, run.phase],
  );

  const checkedCount = pieces.filter((p) => sel[p.id]?.checked && fitsWidth.get(p.id)).length;

  const startRun = () => {
    if (parse.phase !== 'ready') return;
    const config: NestConfig = {
      pieces: pieces
        .filter((p) => sel[p.id]?.checked && fitsWidth.get(p.id))
        .map((p) => ({ pieceId: p.id, quantity: Math.max(1, Math.round(sel[p.id]?.qty ?? 1)) })),
      fabricWidthCm: widthCm,
      targetLengthCm: target,
      gapCm,
      edgeMarginCm: marginCm,
      allowCrossGrain: crossGrain,
      timeBudgetMs: budgetS * 1000,
      rdpEpsCm: NEST_DEFAULTS.rdpEpsCm,
    };
    start(parse.parseId, config);
  };

  const downloadTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (downloadTimer.current != null) window.clearTimeout(downloadTimer.current);
    },
    [],
  );
  const downloadSvg = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `раскладка${sizeLabel ? `-${sizeLabel}` : ''}.svg`;
    a.click();
    // Deferred: Safari/Firefox may not have started the download when click() returns.
    downloadTimer.current = window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const verdict =
    result && target != null
      ? result.usedLengthCm <= target && result.placedCount === result.totalCount
        ? { ok: true, text: `влезает · запас ${(target - result.usedLengthCm).toFixed(1)} см` }
        : { ok: false, text: `не влезает · нужно ${result.usedLengthCm.toFixed(1)} см` }
      : null;

  return (
    <ConfirmationModal
      open={files != null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      onConfirm={onClose}
      title={`раскладка DXF${sizeLabel ? ` — ${sizeLabel}` : ''}`}
      width='lg'
      hideActions
    >
      <div className='flex flex-col gap-2.5 lg:flex-row'>
        {/* Left rail: material + run parameters, then the recognized piece list. */}
        <div className='w-full shrink-0 space-y-2.5 lg:w-[300px]'>
          <div className='grid grid-cols-2 gap-1.5'>
            <label className='space-y-0.5'>
              <Text size='nano' variant='label' component='span'>
                ширина полотна, см
              </Text>
              <Input
                name='nest-width'
                type='number'
                value={widthRaw ?? String(widthCm)}
                min={10}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWidthRaw(e.target.value)}
                onBlur={() => {
                  setWidthCm(Math.max(10, numOr(widthRaw ?? '', widthCm)));
                  setWidthRaw(null);
                }}
                disabled={running}
              />
            </label>
            <label className='space-y-0.5'>
              <Text size='nano' variant='label' component='span'>
                целевая длина, см
              </Text>
              <Input
                name='nest-target'
                type='number'
                value={targetCm}
                placeholder='без цели'
                min={0}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const v = e.target.value.trim();
                  setTargetCm(v === '' ? '' : Math.max(0, numOr(v, 0)));
                }}
                disabled={running}
              />
            </label>
            <label className='space-y-0.5'>
              <Text size='nano' variant='label' component='span'>
                зазор, см
              </Text>
              <Input
                name='nest-gap'
                type='number'
                value={gapCm}
                min={0}
                step={0.1}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setGapCm(Math.max(0, numOr(e.target.value, gapCm)))
                }
                disabled={running}
              />
            </label>
            <label className='space-y-0.5'>
              <Text size='nano' variant='label' component='span'>
                отступ от кромки, см
              </Text>
              <Input
                name='nest-margin'
                type='number'
                value={marginCm}
                min={0}
                step={0.5}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setMarginCm(Math.max(0, numOr(e.target.value, marginCm)))
                }
                disabled={running}
              />
            </label>
          </div>

          <div className='flex flex-wrap items-center gap-x-3 gap-y-1.5'>
            <label className='flex cursor-pointer items-center gap-1.5'>
              <CheckboxCommon
                name='nest-crossgrain'
                checked={crossGrain}
                onChange={(c: boolean) => setCrossGrain(c)}
                disabled={running}
              />
              <Text size='micro' component='span'>
                разрешить поворот 90°
              </Text>
            </label>
            <Selector
              label='время'
              compact
              value={budgetS}
              options={[
                { value: 5, label: '5 с' },
                { value: 20, label: '20 с' },
                { value: 60, label: '60 с' },
              ]}
              onChange={(v: string | number) => setBudgetS(Number(v))}
              disabled={running}
            />
            <Selector
              label='юниты DXF'
              compact
              value={unitOverride}
              options={[
                {
                  value: 'auto',
                  // The detected unit stays visible even on 'авто' — a file whose header
                  // lies about units is caught by the operator seeing «авто (см)» on a
                  // sleeve that should be in mm.
                  label:
                    parse.phase === 'ready'
                      ? `авто (${parse.detectedUnit === 'mm' ? 'мм' : parse.detectedUnit === 'cm' ? 'см' : 'дюймы'})`
                      : 'авто',
                },
                { value: 'mm', label: 'мм' },
                { value: 'cm', label: 'см' },
                { value: 'in', label: 'дюймы' },
              ]}
              onChange={(v: string | number) => setUnitOverride(String(v) as Unit)}
              disabled={running || parse.phase === 'loading'}
            />
          </div>

          {parse.phase === 'ready' && unitOverride !== 'auto' && unitOverride !== parse.detectedUnit && (
            <Text size='nano' variant='label'>
              файл заявляет {parse.detectedUnit === 'mm' ? 'мм' : parse.detectedUnit === 'cm' ? 'см' : 'дюймы'} — выбран ручной override
            </Text>
          )}

          {parse.phase === 'loading' && (
            <Text size='micro' variant='label'>
              загрузка и разбор DXF…
            </Text>
          )}
          {parse.phase === 'error' && <CalloutBox tone='error'>{parse.message}</CalloutBox>}
          {parse.phase === 'ready' && parse.warnings.length > 0 && (
            <CalloutBox tone='note' className='max-h-24 space-y-0.5 overflow-y-auto'>
              {parse.warnings.map((w, i) => (
                <Text key={i} size='nano' component='p'>
                  {w}
                </Text>
              ))}
            </CalloutBox>
          )}

          {/* Piece list: checkbox · thumb · name · размеры · qty. */}
          {pieces.length > 0 && (
            <div className='max-h-[46vh] space-y-1 overflow-y-auto border border-borderColor p-1.5'>
              <div className='flex items-center justify-between'>
                <Text size='nano' variant='label'>
                  детали: {pieces.length} · выбрано {checkedCount}
                </Text>
                <button
                  type='button'
                  className='text-nano uppercase underline hover:opacity-70'
                  onClick={() => {
                    const next: PieceSel = {};
                    for (const p of pieces) {
                      next[p.id] = { checked: !!fitsWidth.get(p.id), qty: sel[p.id]?.qty ?? 1 };
                    }
                    setSel(next);
                  }}
                >
                  выбрать все
                </button>
              </div>
              {pieces.map((p) => {
                const fits = fitsWidth.get(p.id) ?? false;
                const s = sel[p.id] ?? { checked: false, qty: 1 };
                return (
                  <div key={p.id} className='flex items-center gap-1.5'>
                    <CheckboxCommon
                      name={`nest-piece-${p.id}`}
                      checked={s.checked && fits}
                      disabled={!fits || running}
                      onChange={(c: boolean) => setSel((m) => ({ ...m, [p.id]: { ...s, checked: c } }))}
                    />
                    <PieceThumb piece={p} />
                    <div className='min-w-0 flex-1'>
                      <Text size='micro' component='p' className='truncate'>
                        {p.name}
                      </Text>
                      <Text size='nano' variant='label' component='p'>
                        {p.bboxW.toFixed(1)} × {p.bboxH.toFixed(1)} см
                      </Text>
                    </div>
                    {!fits && <Pill tone='warn'>шире полотна</Pill>}
                    <Input
                      name={`nest-qty-${p.id}`}
                      type='number'
                      value={s.qty}
                      min={1}
                      disabled={!fits || running}
                      className='w-12 shrink-0 px-1 py-0 text-micro'
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setSel((m) => ({ ...m, [p.id]: { ...s, qty: Math.max(1, Math.round(numOr(e.target.value, 1))) } }))
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right pane: the strip to scale + stats. */}
        <div className='min-w-0 flex-1 space-y-2'>
          {svg ? (
            <div
              className='max-h-[56vh] w-full overflow-auto border border-borderColor bg-bgColor [&_svg]:h-auto [&_svg]:w-full'
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <div className='flex h-[40vh] items-center justify-center border border-borderColor bg-bgColor'>
              <Text size='micro' variant='label'>
                {running
                  ? 'считаем раскладку…'
                  : pieces.length > 0
                    ? 'выберите детали и нажмите «запустить»'
                    : '—'}
              </Text>
            </div>
          )}

          {result && (
            <StatGrid min={120}>
              <Stat label='использовано' value={`${result.usedLengthCm.toFixed(1)} см`} />
              <Stat
                label='эффективность'
                value={`${(result.efficiency * 100).toFixed(1)} %`}
                sub={`ткань ${widthCm} см`}
              />
              <Stat
                label='размещено'
                value={`${result.placedCount}/${result.totalCount}`}
                tone={result.placedCount === result.totalCount ? undefined : 'down'}
              />
              {verdict && (
                <Stat
                  label='вердикт'
                  value={<Pill tone={verdict.ok ? 'ok' : 'warn'}>{verdict.ok ? 'влезает' : 'не влезает'}</Pill>}
                  sub={verdict.text}
                />
              )}
              <Stat
                label='поколение'
                value={String(result.generation)}
                sub={`${(result.elapsedMs / 1000).toFixed(1)} с${run.phase === 'done' && run.stopped ? ' · остановлено' : ''}`}
              />
            </StatGrid>
          )}
          {result && result.warnings.length > 0 && (
            <CalloutBox tone='note'>
              {result.warnings.map((w, i) => (
                <Text key={i} size='nano' component='p'>
                  {w}
                </Text>
              ))}
            </CalloutBox>
          )}

          {/* Footer: own actions (the shell's are hidden). */}
          <div className='flex flex-wrap items-center justify-end gap-1.5 border-t border-hairline pt-2'>
            {running && run.nfp && (
              <Text size='nano' variant='label' className='mr-auto'>
                подготовка геометрии {run.nfp.done}/{run.nfp.total}
              </Text>
            )}
            {running && !run.nfp && run.best && (
              <Text size='nano' variant='label' className='mr-auto'>
                поколение {run.generation} · лучшая длина {run.best.usedLengthCm.toFixed(1)} см
              </Text>
            )}
            <Button
              type='button'
              variant='main'
              disabled={parse.phase !== 'ready' || checkedCount === 0 || running}
              onClick={startRun}
            >
              запустить
            </Button>
            <Button type='button' variant='secondary' disabled={!running || stopping} onClick={stop}>
              {stopping ? 'останавливаем…' : 'стоп'}
            </Button>
            <Button type='button' variant='secondary' disabled={!svg || running} onClick={downloadSvg}>
              скачать SVG
            </Button>
            <Button type='button' variant='secondary' onClick={onClose}>
              закрыть
            </Button>
          </div>
        </div>
      </div>
    </ConfirmationModal>
  );
}
