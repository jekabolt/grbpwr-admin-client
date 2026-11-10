import { useLibraryFile } from 'components/managers/files/hooks/useFiles';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Chip, ChipRow, Input, Text } from 'ui';

import type { PaperDoc } from '../assembly-print/paper';
import { PaperNested } from '../assembly-print/paper-svg';

import type { FormGarmentLabel } from './labels-schema';
import {
  foldFront,
  foldWordOf,
  formatFoldLines,
  formatStitchLines,
  labelAssembly,
  labelAxisLen,
  labelFoldLines,
  parseFoldLines,
  parseStitchLines,
  presetFoldLines,
} from './label-fold-lines';
import { wireInt } from './wire-int';

const DRAW_W = 560;
const DRAW_H = 150;
const PAD_X = 42;
const PAD_Y = 28;
const GRIP = 12;
const FOLDS = ['flat', 'half', 'ends', 'loop'] as const;

type FoldChange = Pick<
  FormGarmentLabel,
  'fold' | 'foldLinesMm' | 'stitchLinesMm' | 'foldAxis' | 'pages' | 'widthMm' | 'heightMm'
>;

type Drag = { kind: 'fold' | 'stitch'; index: number; pointerId: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const mmText = (value: number) => String(Math.round(value * 10) / 10);

function clampStitches(lines: readonly number[], axisMm: number, loop: boolean): number[] {
  if (!(axisMm > 0) || !lines.length) return [];
  const first = clamp(lines[0] ?? 0, 0, axisMm / 2);
  if (loop) {
    const mirror = axisMm - first;
    return first === mirror ? [first] : [first, mirror];
  }
  return [first, ...lines.slice(1).map((line) => clamp(line, 0, axisMm))];
}

function InputRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className='flex min-h-5.5 items-center gap-3'>
      <Text
        size='micro'
        variant='label'
        tracking='label'
        component='span'
        className='w-20 shrink-0 uppercase'
      >
        {label}
      </Text>
      <span className='min-w-0 flex-1'>{children}</span>
    </div>
  );
}

export function LabelFoldEditor({
  widthMm,
  heightMm,
  widthValue,
  heightValue,
  fold,
  foldLinesMm,
  stitchLinesMm,
  foldAxis,
  pages = 1,
  composition,
  artworkAction,
  libraryFileId,
  ribbons,
  disabled,
  onChange,
}: {
  widthMm: number;
  heightMm: number;
  widthValue?: string;
  heightValue?: string;
  fold?: string;
  foldLinesMm?: string;
  stitchLinesMm?: string;
  foldAxis?: string;
  pages?: number;
  composition: boolean;
  artworkAction?: ReactNode;
  libraryFileId?: unknown;
  /** Built ribbons of the composition label, page by page; set, they own the pages. */
  ribbons?: readonly PaperDoc[];
  disabled: boolean;
  onChange: (value: Partial<FoldChange>) => void;
}) {
  const fileId = wireInt(libraryFileId);
  const fileQuery = useLibraryFile(fileId || undefined);
  const preview = fileQuery.data?.file?.previewUrl || '';
  const widthAxis = foldAxis === 'width';
  const axisMm = labelAxisLen({ widthMm, heightMm, foldAxis });
  const lines = labelFoldLines({ fold, foldLinesMm }, axisMm);
  const stitches = parseStitchLines(stitchLinesMm, axisMm);
  const sewn = labelAssembly(lines, stitches, axisMm);
  const built = ribbons && ribbons.length > 0 ? ribbons : null;
  const storedPages = clamp(Math.round(pages || 1), 1, 12);
  const builtPages = built ? clamp(built.length, 1, 12) : 0;
  const safePages = built ? built.length : storedPages;
  const [page, setPage] = useState(0);
  const [foldText, setFoldText] = useState(formatFoldLines(lines, axisMm));
  const [stitchText, setStitchText] = useState(formatStitchLines(stitches, axisMm));
  const [pagesText, setPagesText] = useState(String(safePages));
  const foldInput = useRef<HTMLInputElement>(null);
  const stitchInput = useRef<HTMLInputElement>(null);
  const pagesInput = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const hatchId = `label-hatch-${useId().replace(/:/g, '')}`;
  const foldedHatchId = `label-folded-hatch-${useId().replace(/:/g, '')}`;
  const foldedClipId = `label-folded-${useId().replace(/:/g, '')}`;

  useEffect(() => setPage((current) => Math.min(current, safePages - 1)), [safePages]);
  // Built ribbons own the page count: the row follows them once, then the values agree.
  useEffect(() => {
    if (builtPages > 0 && !disabled && storedPages !== builtPages) onChange({ pages: builtPages });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builtPages, storedPages, disabled]);
  useEffect(() => {
    if (document.activeElement !== pagesInput.current) setPagesText(String(safePages));
  }, [safePages]);
  useEffect(() => {
    if (document.activeElement !== foldInput.current) setFoldText(formatFoldLines(lines, axisMm));
  }, [axisMm, foldLinesMm, fold, lines]);
  useEffect(() => {
    if (document.activeElement !== stitchInput.current)
      setStitchText(formatStitchLines(stitches, axisMm));
  }, [axisMm, stitchLinesMm, stitches]);

  const k = Math.min(DRAW_W / Math.max(widthMm, 1), DRAW_H / Math.max(heightMm, 1));
  const w = widthMm * k;
  const h = heightMm * k;
  const x = PAD_X;
  const y = PAD_Y;
  const viewW = x + w + PAD_X;
  const viewH = y + h + 34;
  const at = (mm: number) => (widthAxis ? x + mm * k : y + mm * k);
  const backPages = Array.from({ length: Math.min(3, safePages - 1) }, (_, index) => index + 1);

  const emitLines = (nextLines: readonly number[]) => {
    const csv = formatFoldLines(nextLines, axisMm);
    const kept = parseFoldLines(csv, axisMm);
    const nextFold =
      fold === 'loop' && kept.length === 1
        ? 'loop'
        : (foldWordOf(kept, axisMm) as FoldChange['fold']);
    setFoldText(csv);
    onChange({ fold: nextFold, foldLinesMm: csv });
  };

  const emitStitches = (next: readonly number[]) => {
    const csv = formatStitchLines(next, axisMm);
    setStitchText(csv);
    onChange({ stitchLinesMm: csv });
  };

  const setPreset = (word: (typeof FOLDS)[number]) => {
    const nextLines = presetFoldLines(word, axisMm);
    const nextStitches = clampStitches(stitches, axisMm, word === 'loop');
    const foldCsv = formatFoldLines(nextLines, axisMm);
    const stitchCsv = formatStitchLines(nextStitches, axisMm);
    setFoldText(foldCsv);
    setStitchText(stitchCsv);
    onChange({ fold: word, foldLinesMm: foldCsv, stitchLinesMm: stitchCsv });
  };

  const setSewnSide = (side: 'short' | 'long') => {
    const leftIsShort = heightMm <= widthMm;
    const nextAxis = side === 'short' ? (leftIsShort ? 'width' : '') : leftIsShort ? '' : 'width';
    const nextLength = nextAxis === 'width' ? widthMm : heightMm;
    const nextLines = presetFoldLines(fold || 'flat', nextLength);
    const nextStitches = clampStitches(stitches, nextLength, fold === 'loop');
    const foldCsv = formatFoldLines(nextLines, nextLength);
    const stitchCsv = formatStitchLines(nextStitches, nextLength);
    setFoldText(foldCsv);
    setStitchText(stitchCsv);
    onChange({ foldAxis: nextAxis, foldLinesMm: foldCsv, stitchLinesMm: stitchCsv });
  };

  const sewnSide =
    widthMm === heightMm
      ? widthAxis
        ? 'short'
        : 'long'
      : widthAxis
        ? heightMm < widthMm
          ? 'short'
          : 'long'
        : widthMm < heightMm
          ? 'short'
          : 'long';

  const pointMm = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse());
    return Math.round(((widthAxis ? local.x - x : local.y - y) / k) * 1) / 1;
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId || disabled) return;
    const raw = pointMm(event);
    if (raw == null) return;
    if (active.kind === 'fold') {
      const next = [...lines];
      next[active.index] = clamp(raw, 1, Math.max(1, axisMm - 1));
      emitLines(next);
      return;
    }
    if (fold === 'loop') {
      const first = clamp(active.index === 0 ? raw : axisMm - raw, 0, axisMm / 2);
      emitStitches(first === axisMm - first ? [first] : [first, axisMm - first]);
      return;
    }
    const next = [...stitches];
    next[active.index] = clamp(raw, 0, active.index === 0 ? axisMm / 2 : axisMm);
    emitStitches(next);
  };

  const stopDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
  };

  const startDrag = (
    event: ReactPointerEvent<SVGRectElement>,
    kind: Drag['kind'],
    index: number,
  ) => {
    if (disabled) return;
    event.preventDefault();
    const svg = event.currentTarget.ownerSVGElement;
    svg?.setPointerCapture(event.pointerId);
    drag.current = { kind, index, pointerId: event.pointerId };
  };

  const isPreset = (word: (typeof FOLDS)[number]) =>
    fold === word &&
    formatFoldLines(lines, axisMm) === formatFoldLines(presetFoldLines(word, axisMm), axisMm);

  const firstStitch = stitches[0] ?? 0;
  const foldedAxisMm = sewn.foldedMm;
  const foldedK = Math.min(
    180 / Math.max(widthAxis ? foldedAxisMm : widthMm, 1),
    115 / Math.max(widthAxis ? heightMm : foldedAxisMm, 1),
  );
  const foldedW = (widthAxis ? foldedAxisMm : widthMm) * foldedK;
  const foldedH = (widthAxis ? heightMm : foldedAxisMm) * foldedK;
  const foldedX = 8;
  const foldedY = 8;
  const frontStart = foldFront(lines, axisMm)[0];
  const foldedBacks = Math.min(3, (lines.length ? 1 : 0) + safePages - 1);
  const foldedFirstStitch = sewn.stitches[0] ?? 0;

  return (
    <div className='flex flex-col gap-4'>
      <div className='relative flex min-h-65 flex-col items-center justify-center gap-2 overflow-hidden bg-pageBg px-3 pt-3 pb-24 sm:h-55 sm:min-h-0 sm:flex-row sm:pt-4 sm:pb-14'>
        <div className='flex w-full items-start justify-between gap-2 sm:absolute sm:inset-x-3 sm:top-3 sm:w-auto'>
          {artworkAction ? <div className='shrink-0'>{artworkAction}</div> : <span />}
          {composition && safePages > 1 ? (
            <ChipRow className='min-w-0 flex-wrap justify-end'>
              {Array.from({ length: safePages }, (_, index) => (
                <Chip
                  key={index}
                  nonForm
                  selected={page === index}
                  pressed={page === index}
                  onClick={() => setPage(index)}
                >
                  {index + 1}
                </Chip>
              ))}
            </ChipRow>
          ) : null}
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${viewW} ${viewH}`}
          className='max-h-42 w-full max-w-full touch-none'
          onPointerMove={onPointerMove}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          data-label-fold-editor=''
          role='img'
          aria-label='label fold editor'
        >
          <defs>
            <pattern
              id={hatchId}
              width={6}
              height={6}
              patternUnits='userSpaceOnUse'
              patternTransform='rotate(45)'
            >
              <line x1={0} y1={0} x2={0} y2={6} stroke='var(--color-borderColor)' strokeWidth={1} />
            </pattern>
          </defs>
          {[...backPages].reverse().map((offset) => (
            <rect
              key={offset}
              x={x + offset * 4}
              y={y + offset * 4}
              width={w}
              height={h}
              fill='var(--color-bgColor)'
              stroke='var(--color-labelColor)'
              strokeWidth={0.8}
            />
          ))}
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill='var(--color-bgColor)'
            stroke='var(--color-textColor)'
            strokeWidth={1}
          />
          {built?.[page] ? (
            <PaperNested doc={built[page]} x={x} y={y} width={w} height={h} />
          ) : null}
          {!built && preview && page === 0 ? (
            <image
              href={preview}
              x={x}
              y={y}
              width={w}
              height={h}
              preserveAspectRatio='xMidYMid meet'
              pointerEvents='none'
            />
          ) : null}
          {firstStitch > 0 ? (
            <rect
              x={x}
              y={y}
              width={widthAxis ? firstStitch * k : w}
              height={widthAxis ? h : firstStitch * k}
              fill={`url(#${hatchId})`}
              pointerEvents='none'
            />
          ) : null}
          {fold === 'loop' && firstStitch > 0 ? (
            <rect
              x={widthAxis ? x + w - firstStitch * k : x}
              y={widthAxis ? y : y + h - firstStitch * k}
              width={widthAxis ? firstStitch * k : w}
              height={widthAxis ? h : firstStitch * k}
              fill={`url(#${hatchId})`}
              pointerEvents='none'
            />
          ) : null}
          <line
            x1={x}
            x2={widthAxis ? x : x + w}
            y1={y}
            y2={widthAxis ? y + h : y}
            stroke='var(--color-textColor)'
            strokeWidth={3}
            data-label-sewn-edge=''
          />
          {fold === 'loop' ? (
            <line
              x1={widthAxis ? x + w : x}
              x2={x + w}
              y1={widthAxis ? y : y + h}
              y2={y + h}
              stroke='var(--color-textColor)'
              strokeWidth={3}
              data-label-sewn-edge=''
            />
          ) : null}
          {stitches.map((line, index) => {
            const p = at(line);
            return (
              <g key={`stitch-${line}-${index}`} data-label-stitch-line={line}>
                <line
                  x1={widthAxis ? p : x}
                  x2={widthAxis ? p : x + w}
                  y1={widthAxis ? y : p}
                  y2={widthAxis ? y + h : p}
                  stroke='var(--color-textColor)'
                  strokeWidth={1.4}
                  strokeDasharray='4 3'
                />
                <rect
                  x={widthAxis ? p - GRIP / 2 : x - 18}
                  y={widthAxis ? y - 18 : p - GRIP / 2}
                  width={GRIP}
                  height={GRIP}
                  fill='var(--color-bgColor)'
                  stroke='var(--color-textColor)'
                  strokeWidth={1.5}
                  className={disabled ? '' : widthAxis ? 'cursor-ew-resize' : 'cursor-ns-resize'}
                  onPointerDown={(event) => startDrag(event, 'stitch', index)}
                />
                <text
                  x={widthAxis ? p : x - 22}
                  y={widthAxis ? y - 23 : p + 3}
                  textAnchor={widthAxis ? 'middle' : 'end'}
                  className='fill-textColor text-nano'
                >
                  {mmText(line)}
                </text>
              </g>
            );
          })}
          {lines.map((line, index) => {
            const p = at(line);
            return (
              <g key={`fold-${line}-${index}`} data-label-fold-line={line}>
                <line
                  x1={widthAxis ? p : x - 4}
                  x2={widthAxis ? p : x + w + 4}
                  y1={widthAxis ? y - 4 : p}
                  y2={widthAxis ? y + h + 4 : p}
                  stroke='var(--color-textColor)'
                  strokeWidth={1.2}
                />
                <rect
                  x={widthAxis ? p - GRIP / 2 : x + w + 6}
                  y={widthAxis ? y + h + 6 : p - GRIP / 2}
                  width={GRIP}
                  height={GRIP}
                  fill='var(--color-textColor)'
                  className={disabled ? '' : widthAxis ? 'cursor-ew-resize' : 'cursor-ns-resize'}
                  onPointerDown={(event) => startDrag(event, 'fold', index)}
                />
                <text
                  x={widthAxis ? p : x + w + 23}
                  y={widthAxis ? y + h + 27 : p + 3}
                  textAnchor={widthAxis ? 'middle' : 'start'}
                  className='fill-textColor text-nano'
                >
                  {mmText(line)}
                </text>
              </g>
            );
          })}
        </svg>
        <div className='absolute inset-x-3 bottom-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
          <span className='flex flex-wrap items-center gap-2'>
            <Text
              size='micro'
              variant='label'
              tracking='label'
              component='span'
              className='uppercase'
            >
              sewn side
            </Text>
            <ChipRow>
              {(['short', 'long'] as const).map((side) => (
                <Chip
                  key={side}
                  nonForm
                  selected={sewnSide === side}
                  pressed={sewnSide === side}
                  disabled={disabled}
                  onClick={() => setSewnSide(side)}
                >
                  {side}
                </Chip>
              ))}
            </ChipRow>
          </span>
          <span className='flex flex-wrap items-center gap-2'>
            <Text
              size='micro'
              variant='label'
              tracking='label'
              component='span'
              className='uppercase'
            >
              fold
            </Text>
            <ChipRow>
              {FOLDS.map((word) => (
                <Chip
                  key={word}
                  nonForm
                  selected={isPreset(word)}
                  pressed={isPreset(word)}
                  disabled={disabled}
                  onClick={() => setPreset(word)}
                >
                  {word}
                </Chip>
              ))}
            </ChipRow>
          </span>
        </div>
      </div>

      <div className='flex flex-col items-stretch gap-4 sm:flex-row sm:gap-6'>
        <div className='flex h-37.5 items-center justify-center overflow-hidden border border-borderColor p-2 sm:w-55 sm:shrink-0'>
          <svg
            viewBox={`0 0 ${foldedW + 24} ${foldedH + 24}`}
            className='max-h-full max-w-full'
            role='img'
            aria-label='folded label'
            data-label-folded-view=''
          >
            <defs>
              <clipPath id={foldedClipId}>
                <rect x={foldedX} y={foldedY} width={foldedW} height={foldedH} />
              </clipPath>
              <pattern
                id={foldedHatchId}
                width={6}
                height={6}
                patternUnits='userSpaceOnUse'
                patternTransform='rotate(45)'
              >
                <line
                  x1={0}
                  y1={0}
                  x2={0}
                  y2={6}
                  stroke='var(--color-borderColor)'
                  strokeWidth={1}
                />
              </pattern>
            </defs>
            {Array.from({ length: foldedBacks }, (_, index) => foldedBacks - index).map(
              (offset) => (
                <rect
                  key={offset}
                  x={foldedX + offset * 3}
                  y={foldedY + offset * 3}
                  width={foldedW}
                  height={foldedH}
                  fill='var(--color-bgColor)'
                  stroke='var(--color-labelColor)'
                  strokeWidth={0.8}
                />
              ),
            )}
            <rect
              x={foldedX}
              y={foldedY}
              width={foldedW}
              height={foldedH}
              fill='var(--color-bgColor)'
              stroke='var(--color-textColor)'
              strokeWidth={1}
            />
            {built ? (
              <g clipPath={`url(#${foldedClipId})`} data-label-folded-artwork=''>
                <PaperNested
                  doc={built[0]}
                  x={widthAxis ? foldedX - frontStart * foldedK : foldedX}
                  y={widthAxis ? foldedY : foldedY - frontStart * foldedK}
                  width={widthMm * foldedK}
                  height={heightMm * foldedK}
                />
              </g>
            ) : null}
            {!built && preview ? (
              <image
                href={preview}
                x={widthAxis ? foldedX - frontStart * foldedK : foldedX}
                y={widthAxis ? foldedY : foldedY - frontStart * foldedK}
                width={widthMm * foldedK}
                height={heightMm * foldedK}
                preserveAspectRatio='xMidYMid meet'
                clipPath={`url(#${foldedClipId})`}
                pointerEvents='none'
                data-label-folded-artwork=''
              />
            ) : null}
            {foldedFirstStitch > 0 ? (
              <rect
                x={foldedX}
                y={foldedY}
                width={widthAxis ? foldedFirstStitch * foldedK : foldedW}
                height={widthAxis ? foldedH : foldedFirstStitch * foldedK}
                fill={`url(#${foldedHatchId})`}
              />
            ) : null}
            {sewn.stitches.map((line) => {
              const p = widthAxis ? foldedX + line * foldedK : foldedY + line * foldedK;
              return (
                <line
                  key={line}
                  x1={widthAxis ? p : foldedX}
                  x2={widthAxis ? p : foldedX + foldedW}
                  y1={widthAxis ? foldedY : p}
                  y2={widthAxis ? foldedY + foldedH : p}
                  stroke='var(--color-textColor)'
                  strokeWidth={1.2}
                  strokeDasharray='3 2'
                />
              );
            })}
            <line
              x1={foldedX}
              x2={widthAxis ? foldedX : foldedX + foldedW}
              y1={foldedY}
              y2={widthAxis ? foldedY + foldedH : foldedY}
              stroke='var(--color-textColor)'
              strokeWidth={3}
            />
          </svg>
        </div>
        <div className='flex h-37.5 min-w-0 flex-1 flex-col justify-between'>
          <InputRow label='folded'>
            <Text component='span' className='tabular-nums'>
              {widthAxis
                ? `${mmText(foldedAxisMm)} × ${mmText(heightMm)}`
                : `${mmText(widthMm)} × ${mmText(foldedAxisMm)}`}{' '}
              mm
            </Text>
          </InputRow>
          <InputRow label='size'>
            <span className='flex min-w-0 flex-wrap items-center gap-1.5'>
              <Input
                inputMode='decimal'
                value={widthValue ?? ''}
                disabled={disabled}
                aria-label='width mm'
                className='w-14'
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const value = event.target.value.replace(',', '.');
                  if (/^\d*(?:\.\d{0,2})?$/.test(value)) onChange({ widthMm: value });
                }}
              />
              <Text variant='label' component='span'>
                ×
              </Text>
              <Input
                inputMode='decimal'
                value={heightValue ?? ''}
                disabled={disabled}
                aria-label='height mm'
                className='w-14'
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const value = event.target.value.replace(',', '.');
                  if (/^\d*(?:\.\d{0,2})?$/.test(value)) onChange({ heightMm: value });
                }}
              />
              <Text size='micro' variant='label' component='span'>
                mm
              </Text>
            </span>
          </InputRow>
          {composition ? (
            <InputRow label='pages'>
              <Input
                ref={pagesInput}
                inputMode='numeric'
                value={built ? String(safePages) : pagesText}
                disabled={disabled || !!built}
                aria-label='pages'
                className='w-14'
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const text = event.target.value;
                  if (!/^\d{0,2}$/.test(text)) return;
                  setPagesText(text);
                  if (text) onChange({ pages: clamp(Number(text), 1, 12) });
                }}
                onBlur={() => setPagesText(String(safePages))}
              />
            </InputRow>
          ) : null}
          <InputRow label='fold at'>
            <span className='flex items-center gap-1.5'>
              <Input
                ref={foldInput}
                value={foldText}
                disabled={disabled || lines.length === 0}
                aria-label='fold at'
                className='w-28 tabular-nums'
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const text = event.target.value;
                  setFoldText(text);
                  const parsed = parseFoldLines(text, axisMm);
                  onChange({
                    fold:
                      fold === 'loop' && parsed.length === 1
                        ? 'loop'
                        : (foldWordOf(parsed, axisMm) as FoldChange['fold']),
                    foldLinesMm: formatFoldLines(parsed, axisMm),
                  });
                }}
                onBlur={() => setFoldText(formatFoldLines(lines, axisMm))}
              />
              <Text size='micro' variant='label' component='span'>
                mm
              </Text>
            </span>
          </InputRow>
          <InputRow label='stitch at'>
            <span className='flex items-center gap-1.5'>
              <Input
                ref={stitchInput}
                value={stitchText}
                disabled={disabled}
                aria-label='stitch at'
                className='w-28 tabular-nums'
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const text = event.target.value;
                  setStitchText(text);
                  onChange({
                    stitchLinesMm: formatStitchLines(parseStitchLines(text, axisMm), axisMm),
                  });
                }}
                onBlur={() => setStitchText(formatStitchLines(stitches, axisMm))}
              />
              <Text size='micro' variant='label' component='span'>
                mm
              </Text>
            </span>
          </InputRow>
        </div>
      </div>
    </div>
  );
}
