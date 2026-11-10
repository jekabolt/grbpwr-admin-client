// The label at its true proportions with its artwork on it. Click to add a fold line; click a line
// again to make it a stitch, again to sew through the fold, again to remove it; click an edge to
// sew it. What folds under is
// shaded grey. Beside it, the label folded, with its size and the stitch over its layers.
import { useLibraryFile } from 'components/managers/files/hooks/useFiles';
import { useId, type MouseEvent } from 'react';
import { Chip, ChipRow } from 'ui';

import type { FormGarmentLabel } from './labels-schema';
import {
  MAX_FOLD_LINES,
  foldFront,
  foldWordOf,
  foldedSpans,
  formatFoldLines,
  formatStitchLines,
  labelAssembly,
  labelFoldLines,
  parseStitchLines,
  presetFoldLines,
} from './label-fold-lines';
import { labelFoldingOptions } from './tech-card-options';
import { wireInt } from './wire-int';

const BOX_H = 220;
const BOX_W = 160;
const PAD_X = 12;
const PAD_Y = 8;
const GUTTER = 64;
const HIT_PX = 6;

type Fold = FormGarmentLabel['fold'];

export function LabelFoldEditor({
  widthMm,
  heightMm,
  fold,
  foldLinesMm,
  stitchLinesMm,
  libraryFileId,
  disabled,
  onChange,
}: {
  widthMm: number;
  heightMm: number;
  fold?: string;
  foldLinesMm?: string;
  stitchLinesMm?: string;
  libraryFileId?: unknown;
  disabled: boolean;
  onChange: (value: { fold: Fold; foldLinesMm: string; stitchLinesMm: string }) => void;
}) {
  const fileId = wireInt(libraryFileId);
  const fileQuery = useLibraryFile(fileId || undefined);
  const preview = fileQuery.data?.file?.previewUrl || '';

  const lines = labelFoldLines({ fold, foldLinesMm }, heightMm);
  const stitches = parseStitchLines(stitchLinesMm, heightMm);
  const sewn = labelAssembly(lines, stitches, heightMm);
  const k = Math.min(BOX_H / heightMm, BOX_W / widthMm);
  const w = widthMm * k;
  const h = heightMm * k;
  const x = PAD_X;
  const y = PAD_Y;
  const viewW = x + w + GUTTER;
  const viewH = y + h + PAD_Y;

  const emit = (nextLines: number[], nextStitches: number[]) => {
    const csv = formatFoldLines(nextLines, heightMm);
    const kept = csv ? csv.split(',').map(Number) : [];
    onChange({
      fold: foldWordOf(kept, heightMm) as Fold,
      foldLinesMm: csv,
      stitchLinesMm: formatStitchLines(nextStitches, heightMm),
    });
  };

  const onClick = (event: MouseEvent<SVGSVGElement>) => {
    if (disabled) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (!box.height) return;
    const py = ((event.clientY - box.top) * viewH) / box.height;
    const raw = (py - y) / k;
    // Whole millimetres; the middle snaps exactly, so a half fold reads as half.
    const mm = Math.abs(raw - heightMm / 2) * k <= HIT_PX ? heightMm / 2 : Math.round(raw);
    const near = (line: number) => Math.abs(line - raw) * k <= HIT_PX;
    const edge = near(0) ? 0 : near(heightMm) ? heightMm : null;
    if (edge !== null) {
      const sewnEdge = stitches.includes(edge);
      emit(lines, sewnEdge ? stitches.filter((line) => line !== edge) : [...stitches, edge]);
      return;
    }
    // One line cycles fold → stitch → fold + stitch → off.
    const foldHit = lines.find(near);
    const stitchHit = stitches.find(near);
    if (foldHit !== undefined && stitchHit !== undefined) {
      emit(
        lines.filter((line) => line !== foldHit),
        stitches.filter((line) => line !== stitchHit),
      );
      return;
    }
    if (foldHit !== undefined) {
      emit(
        lines.filter((line) => line !== foldHit),
        [...stitches, foldHit],
      );
      return;
    }
    if (stitchHit !== undefined) {
      if (stitchHit <= 0 || stitchHit >= heightMm || lines.length >= MAX_FOLD_LINES) {
        emit(
          lines,
          stitches.filter((line) => line !== stitchHit),
        );
        return;
      }
      emit([...lines, stitchHit], stitches);
      return;
    }
    if (mm <= 0 || mm >= heightMm || lines.length >= MAX_FOLD_LINES) return;
    emit([...lines, mm], stitches);
  };

  const preset = (word: string) =>
    onChange({
      fold: word as Fold,
      foldLinesMm: formatFoldLines(presetFoldLines(word, heightMm), heightMm),
      stitchLinesMm: formatStitchLines(stitches, heightMm),
    });

  const isPreset = (word: string) =>
    fold === word &&
    formatFoldLines(lines, heightMm) === formatFoldLines(presetFoldLines(word, heightMm), heightMm);

  const fh = sewn.foldedMm * k;
  const frontTop = foldFront(lines, heightMm)[0];
  const clipId = `label-folded-${useId().replace(/:/g, '')}`;
  const foldedW = x + w + GUTTER;
  const foldedH = y + fh + PAD_Y;

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-wrap items-start justify-center gap-6 bg-pageBg p-3'>
        <svg
          viewBox={`0 0 ${viewW} ${viewH}`}
          width={viewW}
          height={viewH}
          className={disabled ? 'max-w-full' : 'max-w-full cursor-crosshair'}
          onClick={onClick}
          data-label-fold-editor=''
          role='img'
          aria-label='fold lines'
        >
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill='var(--color-bgColor)'
            stroke='var(--color-textColor)'
            strokeWidth={1.25}
          />
          {preview ? (
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
          {foldedSpans(lines, heightMm).map(([from, to]) => (
            <rect
              key={`${from}-${to}`}
              x={x}
              y={y + from * k}
              width={w}
              height={(to - from) * k}
              fill='var(--color-textColor)'
              opacity={0.28}
              pointerEvents='none'
              data-label-folded=''
            />
          ))}
          {lines.map((line) => (
            <g key={line} data-label-fold-line={line}>
              <line
                x1={x - 6}
                x2={x + w + 6}
                y1={y + line * k}
                y2={y + line * k}
                stroke='var(--color-textColor)'
                strokeWidth={1}
              />
              <text x={x + w + 10} y={y + line * k + 3} fontSize={9} fill='var(--color-labelColor)'>
                {line} mm
              </text>
            </g>
          ))}
          {stitches.map((line) => (
            <g key={`s${line}`} data-label-stitch-line={line}>
              <line
                x1={x}
                x2={x + w}
                y1={y + line * k}
                y2={y + line * k}
                stroke='var(--color-error)'
                strokeWidth={2}
                strokeDasharray='5 3'
              />
              {line > 0 && line < heightMm ? (
                <text x={x + w + 10} y={y + line * k + 3} fontSize={9} fill='var(--color-error)'>
                  {line} mm
                </text>
              ) : null}
            </g>
          ))}
        </svg>
        {lines.length || stitches.length ? (
          <svg
            viewBox={`0 0 ${foldedW} ${foldedH}`}
            width={foldedW}
            height={foldedH}
            className='max-w-full'
            data-label-folded-view=''
            role='img'
            aria-label='folded'
          >
            <rect
              x={x}
              y={y}
              width={w}
              height={fh}
              fill='var(--color-bgColor)'
              stroke='var(--color-textColor)'
              strokeWidth={1.25}
            />
            {preview ? (
              <>
                <clipPath id={clipId}>
                  <rect x={x} y={y} width={w} height={fh} />
                </clipPath>
                <image
                  href={preview}
                  x={x}
                  y={y - frontTop * k}
                  width={w}
                  height={h}
                  preserveAspectRatio='xMidYMid meet'
                  clipPath={`url(#${clipId})`}
                  pointerEvents='none'
                  data-label-folded-artwork=''
                />
              </>
            ) : null}
            {sewn.stitches.map((line) => (
              <g key={line}>
                <line
                  x1={x}
                  x2={x + w}
                  y1={y + line * k}
                  y2={y + line * k}
                  stroke='var(--color-error)'
                  strokeWidth={2}
                  strokeDasharray='5 3'
                />
                <text x={x + w + 10} y={y + line * k + 3} fontSize={9} fill='var(--color-error)'>
                  {line} · {sewn.layers}×
                </text>
              </g>
            ))}
          </svg>
        ) : null}
      </div>
      <p className='text-control tabular-nums text-textColor' data-label-folded-size=''>
        {widthMm} × {sewn.foldedMm} mm
      </p>
      <ChipRow>
        {labelFoldingOptions.map((option) => (
          <Chip
            key={option}
            nonForm
            selected={isPreset(option)}
            pressed={isPreset(option)}
            disabled={disabled}
            onClick={() => preset(option)}
          >
            {option}
          </Chip>
        ))}
      </ChipRow>
    </div>
  );
}
