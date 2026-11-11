// The topstitch picker reads like the seam picker: every stored line has a number on the canvas
// and in the footer, the same number as «line N» in the LINES table.
import type { PieceGeom } from 'lib/assembly-skeleton/types';
import { resolveEdge } from 'lib/assembly-skeleton/union';
import type { SidePart } from 'lib/seams';
import type { UseFormSetValue } from 'react-hook-form';
import { Button, Close, Text } from 'ui';

import type { TechCardFormData } from '../schema';
import { topstitchLineMm, topstitchLineParts, type TopstitchLine } from '../topstitch-lines';
import { PairNo } from './pair-no';
import { fmtMm } from './step-seams-model';
import type { NoMark } from './step-picture-view';

/** One number per stored line, at the middle of its longest part; `i` is the line's index. */
export function topstitchLineNos(
  lines: readonly TopstitchLine[],
  geoms: ReadonlyMap<string, PieceGeom>,
): NoMark[] {
  return lines.flatMap((line, i) => {
    let longest: { part: SidePart; mm: number } | null = null;
    for (const part of topstitchLineParts(line, geoms)) {
      const mm = part.range
        ? Math.abs(part.range[1] - part.range[0])
        : resolveEdge(part.target, geoms)?.len ?? 0;
      if (!longest || mm > longest.mm) longest = { part, mm };
    }
    if (!longest) return [];
    const { target, range } = longest.part;
    return [{ id: target, i, ...(range ? { range } : {}) }];
  });
}

/** `<side> · <width> mm · <length> mm`; a width or length that is not known is left out. */
export function topstitchLineText(
  line: TopstitchLine,
  o: {
    geoms: ReadonlyMap<string, PieceGeom>;
    sideName: (targets: readonly string[]) => string;
    widthMm?: string;
    sizeId?: number;
  },
): string {
  const width = Number.parseFloat(String(o.widthMm ?? '').replace(',', '.'));
  const length = topstitchLineMm(line, o.sizeId);
  return [
    o.sideName(topstitchLineParts(line, o.geoms).map((part) => part.target)),
    Number.isFinite(width) && width > 0 ? `${fmtMm(width)} mm` : '',
    length != null ? `${fmtMm(length)} mm` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The same write the LINES table makes. */
export function writeTopstitchLines(
  setValue: UseFormSetValue<TechCardFormData>,
  index: number,
  next: TopstitchLine[],
) {
  setValue(`operations.${index}.topstitchLines`, next, { shouldDirty: true });
}

export const withoutTopstitchLine = (lines: readonly TopstitchLine[], lineKey: string) =>
  lines.filter((line) => line.lineKey !== lineKey);

/** The footer's stored lines, listed as the seams are: a number, and for the active line its words and ×. */
export function TopstitchLineList({
  lines,
  active,
  frozen,
  busy,
  textOf,
  onToggle,
  onRemove,
}: {
  lines: readonly TopstitchLine[];
  active: string | null;
  frozen: boolean;
  busy: boolean;
  textOf: (line: TopstitchLine) => string;
  onToggle: (lineKey: string | null) => void;
  onRemove: (lineKey: string) => void;
}) {
  return (
    <>
      {lines.map((line, i) => {
        const on = line.lineKey === active;
        return (
          <span
            key={line.lineKey}
            className='flex min-w-0 items-center gap-2'
            data-topstitch-line={i + 1}
          >
            <Button
              type='button'
              variant='underline'
              size='xs'
              aria-pressed={on}
              onClick={() => onToggle(on ? null : line.lineKey)}
            >
              <PairNo i={i} />
            </Button>
            {(on || lines.length === 1) && (
              <Text size='micro' tracking='label' className='min-w-0 truncate uppercase'>
                {textOf(line)}
              </Text>
            )}
            {on && !frozen && (
              <Close
                onClick={() => onRemove(line.lineKey)}
                disabled={busy}
                aria-label='remove line'
                data-topstitch-remove=''
              />
            )}
          </span>
        );
      })}
    </>
  );
}
