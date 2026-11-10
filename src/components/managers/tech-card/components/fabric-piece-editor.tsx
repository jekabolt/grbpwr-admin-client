import {
  useId,
  useRef,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Chip, ChipRow, Input, Select, Text } from 'ui';

import { clampLabelToPiece, clampPrintToLabel, pieceFitIssue } from './label-placement';
import type { FormGarmentLabel } from './labels-schema';
import { formatFoldLines, presetFoldLines } from './label-fold-lines';
import { wireInt } from './wire-int';

const DRAW_W = 480;
const DRAW_H = 210;
const PAD_X = 54;
const PAD_Y = 24;
const GRIP = 12;

type FabricLine = { id?: number; name?: string; section?: string };
type Change = Partial<Omit<FormGarmentLabel, 'key'>>;
type Drag =
  | { kind: 'label' | 'print'; pointerId: number; index?: number; dx: number; dy: number }
  | { kind: 'seam'; pointerId: number };
type DragStart =
  | { kind: 'label'; dx: number; dy: number }
  | { kind: 'print'; index: number; dx: number; dy: number }
  | { kind: 'seam' };

const numberOf = (value?: string): number => Number(value) || 0;
const mmText = (value: number): string => String(Math.round(value * 100) / 100);

const cleanDecimal = (value: string): string | null => {
  const next = value.replace(',', '.');
  return /^\d*(?:\.\d{0,2})?$/.test(next) ? next : null;
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className='flex min-w-0 flex-col gap-0.5'>
      <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
        {label}
      </Text>
      {children}
    </div>
  );
}

function MmField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <span className='flex items-center gap-1.5'>
        <Input
          inputMode='decimal'
          value={value ?? ''}
          disabled={disabled}
          aria-label={label}
          className='w-20'
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const next = cleanDecimal(event.target.value);
            if (next != null) onChange(next);
          }}
        />
        <Text size='micro' variant='label' component='span'>
          mm
        </Text>
      </span>
    </Field>
  );
}

function PieceSideView() {
  return (
    <svg viewBox='0 0 220 120' className='max-h-full max-w-full' role='img' aria-label='piece side'>
      <rect
        x={64}
        y={30}
        width={42}
        height={80}
        fill='var(--color-pageBg)'
        stroke='var(--color-textColor)'
      />
      <rect
        x={114}
        y={30}
        width={42}
        height={80}
        fill='var(--color-pageBg)'
        stroke='var(--color-textColor)'
      />
      <line x1={110} x2={110} y1={4} y2={48} stroke='var(--color-textColor)' strokeWidth={3} />
      <line x1={113} x2={113} y1={8} y2={30} stroke='var(--color-labelColor)' strokeWidth={2} />
      <line
        x1={64}
        x2={156}
        y1={42}
        y2={42}
        stroke='var(--color-textColor)'
        strokeDasharray='4 3'
      />
      <text x={118} y={18} className='fill-textColor text-nano'>
        label
      </text>
      <text x={104} y={12} textAnchor='end' className='fill-labelColor text-nano'>
        piece
      </text>
      <text x={64} y={118} className='fill-labelColor text-nano'>
        outer
      </text>
      <text x={156} y={118} textAnchor='end' className='fill-labelColor text-nano'>
        lining
      </text>
    </svg>
  );
}

function PieceGarmentView({ row }: { row: FormGarmentLabel }) {
  const pieceWidth = Math.max(1, numberOf(row.pieceWidthMm));
  const pieceHeight = Math.max(1, numberOf(row.pieceHeightMm));
  const labelWidth = numberOf(row.widthMm);
  const labelHeight = numberOf(row.heightMm);
  const x = 10;
  const y = 8;
  const k = Math.min(180 / pieceWidth, 100 / pieceHeight);
  return (
    <svg
      viewBox={`0 0 ${pieceWidth * k + 20} ${pieceHeight * k + 16}`}
      className='max-h-full max-w-full'
      role='img'
      aria-label='piece on garment'
    >
      <rect
        x={x}
        y={y}
        width={pieceWidth * k}
        height={pieceHeight * k}
        fill='var(--color-pageBg)'
        stroke='var(--color-textColor)'
      />
      <rect
        x={x + numberOf(row.labelXMm) * k}
        y={y + numberOf(row.labelYMm) * k}
        width={labelWidth * k}
        height={labelHeight * k}
        fill='var(--color-bgColor)'
        stroke='var(--color-textColor)'
      />
    </svg>
  );
}

export function FabricPieceEditor({
  row,
  fabricLines,
  artworkAction,
  selectedPrintIndex,
  disabled,
  onSelectPrint,
  onChange,
}: {
  row: FormGarmentLabel;
  fabricLines: readonly FabricLine[];
  artworkAction?: ReactNode;
  selectedPrintIndex: number;
  disabled: boolean;
  onSelectPrint: (index: number) => void;
  onChange: (value: Change) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const weaveId = `piece-weave-${useId().replace(/:/g, '')}`;
  const seamId = `piece-seam-${useId().replace(/:/g, '')}`;
  const pieceWidth = Math.max(1, numberOf(row.pieceWidthMm));
  const pieceHeight = Math.max(1, numberOf(row.pieceHeightMm));
  const labelWidth = numberOf(row.widthMm);
  const labelHeight = numberOf(row.heightMm);
  const seam = numberOf(row.pieceSeamMm);
  const labelX = numberOf(row.labelXMm);
  const labelY = numberOf(row.labelYMm);
  const k = Math.min(DRAW_W / pieceWidth, DRAW_H / pieceHeight);
  const w = pieceWidth * k;
  const h = pieceHeight * k;
  const x = PAD_X;
  const y = PAD_Y;
  const viewW = x + w + 62;
  const viewH = y + h + PAD_Y;
  const prints = row.prints ?? [];
  const fitIssue = pieceFitIssue(row);

  const patchPiece = (value: Change) => {
    const next = { ...row, ...value };
    onChange({
      ...value,
      ...clampLabelToPiece(next, numberOf(next.labelXMm), numberOf(next.labelYMm)),
    });
  };
  const pointMm = (event: ReactPointerEvent<SVGElement>) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse());
    return { x: (local.x - x) / k, y: (local.y - y) / k };
  };
  const start = (event: ReactPointerEvent<SVGElement>, active: DragStart) => {
    if (disabled) return;
    event.preventDefault();
    svgRef.current?.setPointerCapture(event.pointerId);
    drag.current = { ...active, pointerId: event.pointerId } as Drag;
  };
  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId || disabled) return;
    const point = pointMm(event);
    if (!point) return;
    if (active.kind === 'seam') {
      onChange({ pieceSeamMm: mmText(Math.min(Math.max(0, point.y), labelY)) });
      return;
    }
    if (active.kind === 'label') {
      onChange(clampLabelToPiece(row, point.x - active.dx, point.y - active.dy));
      return;
    }
    const index = active.index ?? -1;
    const print = prints[index];
    if (!print) return;
    const next = clampPrintToLabel(
      print,
      row.widthMm,
      row.heightMm,
      point.x - labelX - active.dx,
      point.y - labelY - active.dy,
    );
    onChange({
      prints: prints.map((candidate, at) =>
        at === index ? { ...candidate, ...next } : { ...candidate },
      ),
    });
  };
  const stop = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
  };

  return (
    <div className='flex flex-col gap-4'>
      <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
        <Field label='piece fabric'>
          <Select
            name={`piece-fabric-${row.lineKey || row.key}`}
            value={wireInt(row.pieceBomItemId) ? String(wireInt(row.pieceBomItemId)) : ''}
            readOnly={disabled}
            placeholder='pick fabric'
            items={[
              { value: '', label: 'no piece' },
              ...fabricLines
                .filter((line) => wireInt(line.id) > 0)
                .map((line) => ({ value: String(wireInt(line.id)), label: line.name || 'fabric' })),
            ]}
            onValueChange={(value: string | undefined) =>
              onChange({ pieceBomItemId: wireInt(value) })
            }
          />
        </Field>
        <Field label='piece size'>
          <span className='flex items-center gap-1.5'>
            <Input
              inputMode='decimal'
              value={row.pieceWidthMm ?? ''}
              aria-label='piece width'
              disabled={disabled}
              className='w-14'
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const value = cleanDecimal(event.target.value);
                if (value != null) patchPiece({ pieceWidthMm: value });
              }}
            />
            <Text variant='label' component='span'>
              ×
            </Text>
            <Input
              inputMode='decimal'
              value={row.pieceHeightMm ?? ''}
              aria-label='piece height'
              disabled={disabled}
              className='w-14'
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const value = cleanDecimal(event.target.value);
                if (value != null) patchPiece({ pieceHeightMm: value });
              }}
            />
            <Text size='micro' variant='label' component='span'>
              mm
            </Text>
          </span>
        </Field>
        <Field label='label on piece'>
          <ChipRow>
            {(
              [
                ['4_sides', '4 sides'],
                ['top_edge', 'top edge'],
              ] as const
            ).map(([value, label]) => (
              <Chip
                key={value}
                nonForm
                selected={row.labelOnPiece === value}
                pressed={row.labelOnPiece === value}
                disabled={disabled}
                onClick={() => onChange({ labelOnPiece: value })}
              >
                {label}
              </Chip>
            ))}
          </ChipRow>
        </Field>
        <MmField
          label='into seam'
          value={row.pieceSeamMm}
          disabled={disabled}
          onChange={(pieceSeamMm) => patchPiece({ pieceSeamMm })}
        />
      </div>

      {fitIssue ? (
        <Text size='micro' variant='errorLabel'>
          {fitIssue}
        </Text>
      ) : null}

      <div className='relative flex min-h-55 items-center justify-center overflow-hidden bg-pageBg p-3'>
        {artworkAction ? <div className='absolute top-3 left-3'>{artworkAction}</div> : null}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${viewW} ${viewH}`}
          className='max-h-52 w-full max-w-full touch-none'
          role='img'
          aria-label='fabric piece editor'
          onPointerMove={move}
          onPointerUp={stop}
          onPointerCancel={stop}
        >
          <defs>
            <pattern id={weaveId} width={5} height={5} patternUnits='userSpaceOnUse'>
              <path d='M0 5L5 0M-1 1L1-1M4 6L6 4' stroke='var(--color-borderColor)' />
            </pattern>
            <pattern
              id={seamId}
              width={6}
              height={6}
              patternUnits='userSpaceOnUse'
              patternTransform='rotate(45)'
            >
              <line y2={6} stroke='var(--color-labelColor)' />
            </pattern>
          </defs>
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill={`url(#${weaveId})`}
            stroke='var(--color-textColor)'
          />
          <rect x={x} y={y} width={w} height={seam * k} fill={`url(#${seamId})`} />
          <line x1={x} x2={x + w} y1={y} y2={y} stroke='var(--color-textColor)' strokeWidth={3} />
          <line
            x1={x}
            x2={x + w}
            y1={y + seam * k}
            y2={y + seam * k}
            stroke='var(--color-textColor)'
            strokeDasharray='4 3'
          />
          <rect
            x={x - 18}
            y={y + seam * k - GRIP / 2}
            width={GRIP}
            height={GRIP}
            fill='var(--color-bgColor)'
            stroke='var(--color-textColor)'
            className={disabled ? '' : 'cursor-ns-resize'}
            onPointerDown={(event) => start(event, { kind: 'seam' })}
          />
          <text
            x={x - 22}
            y={y + seam * k + 3}
            textAnchor='end'
            className='fill-textColor text-nano'
          >
            {mmText(seam)}
          </text>
          <rect
            x={x + labelX * k}
            y={y + labelY * k}
            width={labelWidth * k}
            height={labelHeight * k}
            fill='var(--color-bgColor)'
            stroke='var(--color-textColor)'
            className={disabled ? '' : 'cursor-move'}
            onPointerDown={(event) => {
              const point = pointMm(event);
              if (point)
                start(event, { kind: 'label', dx: point.x - labelX, dy: point.y - labelY });
            }}
          />
          {row.labelOnPiece === '4_sides' ? (
            <rect
              x={x + labelX * k + 4}
              y={y + labelY * k + 4}
              width={Math.max(0, labelWidth * k - 8)}
              height={Math.max(0, labelHeight * k - 8)}
              fill='none'
              stroke='var(--color-textColor)'
              strokeDasharray='3 2'
              pointerEvents='none'
            />
          ) : (
            <line
              x1={x + labelX * k}
              x2={x + (labelX + labelWidth) * k}
              y1={y + labelY * k + 4}
              y2={y + labelY * k + 4}
              stroke='var(--color-textColor)'
              strokeDasharray='3 2'
              pointerEvents='none'
            />
          )}
          {prints.map((print, index) => {
            const px = x + (labelX + numberOf(print.xMm)) * k;
            const py = y + (labelY + numberOf(print.yMm)) * k;
            const pw = numberOf(print.widthMm) * k;
            const ph = numberOf(print.heightMm) * k;
            const selected = index === selectedPrintIndex;
            return (
              <g key={`${wireInt(print.id)}-${index}`}>
                <rect
                  x={px}
                  y={py}
                  width={pw}
                  height={ph}
                  fill='transparent'
                  stroke={selected ? 'var(--color-warning)' : 'transparent'}
                  strokeWidth={1.5}
                  className={disabled ? '' : 'cursor-move'}
                  onPointerDown={(event) => {
                    onSelectPrint(index);
                    const point = pointMm(event);
                    if (point)
                      start(event, {
                        kind: 'print',
                        index,
                        dx: point.x - labelX - numberOf(print.xMm),
                        dy: point.y - labelY - numberOf(print.yMm),
                      });
                  }}
                />
                <text
                  x={px + pw / 2}
                  y={py + ph / 2 + 3}
                  textAnchor='middle'
                  className='fill-textColor text-nano font-bold'
                  pointerEvents='none'
                >
                  {(print.name || 'print').toUpperCase()}
                </text>
              </g>
            );
          })}
          <text x={x + w + 8} y={y + h / 2} className='fill-labelColor text-nano'>
            {mmText(pieceWidth)} × {mmText(pieceHeight)}
          </text>
          <text
            x={x + (labelX + labelWidth / 2) * k}
            y={y + labelY * k - 5}
            textAnchor='middle'
            className='fill-warning text-nano'
          >
            {mmText(labelX)}, {mmText(labelY)}
          </text>
        </svg>
      </div>

      <div className='flex flex-col items-stretch gap-4 sm:flex-row sm:gap-6'>
        <div className='grid h-37.5 grid-cols-2 gap-3 sm:w-96 sm:shrink-0'>
          <div className='relative flex min-w-0 items-center justify-center overflow-hidden border border-borderColor p-2 pt-6'>
            <Text
              size='micro'
              variant='label'
              tracking='label'
              className='absolute top-2 left-2 uppercase'
            >
              side
            </Text>
            <PieceSideView />
          </div>
          <div className='relative flex min-w-0 items-center justify-center overflow-hidden border border-borderColor p-2 pt-6'>
            <Text
              size='micro'
              variant='label'
              tracking='label'
              className='absolute top-2 left-2 uppercase'
            >
              on garment
            </Text>
            <PieceGarmentView row={row} />
          </div>
        </div>
        <div className='grid min-w-0 flex-1 grid-cols-2 gap-3'>
          <Field label='label'>
            <span className='flex items-center gap-1.5'>
              <Input
                inputMode='decimal'
                value={row.widthMm ?? ''}
                aria-label='width mm'
                disabled={disabled}
                className='w-14'
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const value = cleanDecimal(event.target.value);
                  if (value != null) patchPiece({ widthMm: value });
                }}
              />
              <Text variant='label' component='span'>
                ×
              </Text>
              <Input
                inputMode='decimal'
                value={row.heightMm ?? ''}
                aria-label='height mm'
                disabled={disabled}
                className='w-14'
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const value = cleanDecimal(event.target.value);
                  if (value != null) patchPiece({ heightMm: value });
                }}
              />
              <Text size='micro' variant='label' component='span'>
                mm
              </Text>
            </span>
          </Field>
          <MmField
            label='from left'
            value={row.labelXMm}
            disabled={disabled}
            onChange={(labelXMm) => patchPiece({ labelXMm })}
          />
          <MmField
            label='from top'
            value={row.labelYMm}
            disabled={disabled}
            onChange={(labelYMm) => patchPiece({ labelYMm })}
          />
          <Field label='fold'>
            <ChipRow>
              {(['flat', 'half'] as const).map((fold) => (
                <Chip
                  key={fold}
                  nonForm
                  selected={row.fold === fold}
                  pressed={row.fold === fold}
                  disabled={disabled}
                  onClick={() =>
                    onChange({
                      fold,
                      foldLinesMm: formatFoldLines(
                        presetFoldLines(fold, numberOf(row.heightMm)),
                        numberOf(row.heightMm),
                      ),
                    })
                  }
                >
                  {fold}
                </Chip>
              ))}
            </ChipRow>
          </Field>
        </div>
      </div>
    </div>
  );
}
