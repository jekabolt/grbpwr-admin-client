// The label at its true proportions with its artwork on it: click to add a fold line, click a line
// to remove it. What folds under is shaded grey. Preset chips fill the lines from a fold word.
import { useLibraryFile } from 'components/managers/files/hooks/useFiles';
import type { MouseEvent } from 'react';
import { Chip, ChipRow } from 'ui';

import type { FormGarmentLabel } from './labels-schema';
import {
  MAX_FOLD_LINES,
  foldWordOf,
  foldedSpans,
  formatFoldLines,
  labelFoldLines,
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
  libraryFileId,
  disabled,
  onChange,
}: {
  widthMm: number;
  heightMm: number;
  fold?: string;
  foldLinesMm?: string;
  libraryFileId?: unknown;
  disabled: boolean;
  onChange: (value: { fold: Fold; foldLinesMm: string }) => void;
}) {
  const fileId = wireInt(libraryFileId);
  const fileQuery = useLibraryFile(fileId || undefined);
  const preview = fileQuery.data?.file?.previewUrl || '';

  const lines = labelFoldLines({ fold, foldLinesMm }, heightMm);
  const k = Math.min(BOX_H / heightMm, BOX_W / widthMm);
  const w = widthMm * k;
  const h = heightMm * k;
  const x = PAD_X;
  const y = PAD_Y;
  const viewW = x + w + GUTTER;
  const viewH = y + h + PAD_Y;

  const setLines = (next: number[]) => {
    const csv = formatFoldLines(next, heightMm);
    const kept = csv ? csv.split(',').map(Number) : [];
    onChange({ fold: foldWordOf(kept, heightMm) as Fold, foldLinesMm: csv });
  };

  const onClick = (event: MouseEvent<SVGSVGElement>) => {
    if (disabled) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (!box.height) return;
    const py = ((event.clientY - box.top) * viewH) / box.height;
    const mm = Math.round(((py - y) / k) * 2) / 2;
    const hit = lines.findIndex((line) => Math.abs(line - mm) * k <= HIT_PX);
    if (hit >= 0) {
      setLines(lines.filter((_, index) => index !== hit));
      return;
    }
    if (mm <= 0 || mm >= heightMm || lines.length >= MAX_FOLD_LINES) return;
    setLines([...lines, mm]);
  };

  const preset = (word: string) =>
    onChange({
      fold: word as Fold,
      foldLinesMm: formatFoldLines(presetFoldLines(word, heightMm), heightMm),
    });

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex justify-center bg-pageBg p-3'>
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
        </svg>
      </div>
      <ChipRow>
        {labelFoldingOptions.map((option) => (
          <Chip
            key={option}
            nonForm
            selected={fold === option}
            pressed={fold === option}
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
