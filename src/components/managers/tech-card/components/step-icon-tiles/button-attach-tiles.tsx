import { useEffect, useRef } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button, Text, Tiles } from 'ui';
import { cn } from 'lib/utility';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import type { TechCardFormData } from '../schema';
import { IconTile, TileRow, useStepFieldErrors } from './icon-tile';
import {
  articleHoles,
  holesDefaultFits,
  NO_ATTACH_PATTERN,
  patternAfterHoles,
  patternTiles,
} from './rules';
import { useStepWrite } from './use-step-write';

const HOLE_COUNTS = [2, 4] as const;
const EMPTY_KEYS: string[] = [];

/**
 * The button step's «holes» toggle (2 | 4) and its pattern as icon tiles. Two holes take one bar
 * only; switching to two drops a four-hole pattern. The linked BOM article's hole count is copied
 * into an unset step once, as an edit — when a person links the article, turns the step into a
 * button step, or picks a pattern — never on opening the step (opening never edits).
 *
 * Always mounted: holes left on a step that is no longer a button step stay visible (toggle
 * only) so they can be cleared, the way the residue strip shows other hidden values.
 */
export function ButtonAttachTiles({
  index,
  show,
  bomLines,
  frozen = false,
  className,
}: {
  index: number;
  /** The step is a button-attach step (the old «button pattern» gate). */
  show: boolean;
  bomLines: readonly { lineKey?: string; materialId?: number }[];
  frozen?: boolean;
  className?: string;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const write = useStepWrite(index);
  const holes = (useWatch({ control, name: `operations.${index}.buttonHoles` }) ?? 0) as number;
  const pattern = (useWatch({ control, name: `operations.${index}.attachPattern` }) ??
    NO_ATTACH_PATTERN) as string;
  const bomLineKeys = (useWatch({ control, name: `operations.${index}.bomLineKeys` }) ??
    EMPTY_KEYS) as string[];
  const { data } = useMaterials('', true, show);
  const materials = data?.materials;
  const articleHoleCount = show
    ? articleHoles(
        bomLineKeys,
        bomLines,
        (id) => materials?.find((m) => m.id === id)?.hardwareAttrs?.buttonHoles,
      )
    : 0;
  const errors = useStepFieldErrors(index, ['buttonHoles', 'attachPattern']);

  // Copy the article's holes after a person's change here (linked articles or the step's gate),
  // never on mount. Pending until the article list has the answer; one copy per change.
  const signature = `${show}|${bomLineKeys.join(',')}`;
  const seen = useRef(signature);
  const pending = useRef(false);
  useEffect(() => {
    if (seen.current !== signature) {
      seen.current = signature;
      pending.current = true;
    }
    if (!pending.current || frozen || !show) return;
    if (holes !== 0) {
      pending.current = false;
      return;
    }
    if (holesDefaultFits(holes, articleHoleCount, pattern)) {
      pending.current = false;
      write('buttonHoles', articleHoleCount);
    }
  }, [signature, show, frozen, holes, articleHoleCount, pattern, write]);

  if (!show && holes === 0) return null;

  const pickHoles = (n: number) => {
    if (holes === n) {
      write('buttonHoles', 0);
      return;
    }
    write('buttonHoles', n);
    const next = patternAfterHoles(n, pattern);
    if (next !== pattern) write('attachPattern', next);
  };

  const pickPattern = (value: string) => {
    if (pattern === value) {
      write('attachPattern', NO_ATTACH_PATTERN);
      return;
    }
    write('attachPattern', value);
    if (holes === 0 && holesDefaultFits(0, articleHoleCount, value)) {
      write('buttonHoles', articleHoleCount);
    }
  };

  const toggle = (
    <div className='flex'>
      {HOLE_COUNTS.map((n) => (
        <Button
          key={n}
          type='button'
          size='xs'
          variant={holes === n ? 'main' : 'secondary'}
          aria-pressed={holes === n}
          onClick={() => pickHoles(n)}
          // The article's count, while the step does not state one: outlined, not picked.
          className={cn(
            'min-w-7 tabular-nums',
            n === 4 && '-ml-px',
            holes === 0 && articleHoleCount === n && 'border-dashed border-textColor',
          )}
        >
          {n}
        </Button>
      ))}
    </div>
  );

  if (!show) {
    return (
      <TileRow
        field={`operations.${index}.buttonHoles`}
        label='holes'
        errors={errors}
        className={className}
      >
        {toggle}
      </TileRow>
    );
  }

  const tiles = patternTiles(holes, pattern);
  const stray = pattern !== NO_ATTACH_PATTERN && !tiles.some((t) => t.value === pattern);

  return (
    <TileRow
      field={`operations.${index}.attachPattern`}
      alsoField={`operations.${index}.buttonHoles`}
      label='button pattern'
      lead={
        <>
          <Text
            size='micro'
            variant='label'
            tracking='label'
            component='span'
            className='ml-2 leading-none uppercase'
          >
            holes
          </Text>
          {toggle}
        </>
      }
      errors={errors}
      className={className}
    >
      <Tiles min={72}>
        {tiles.map((t) => (
          <IconTile
            key={t.value}
            icon={{ key: t.icon }}
            label={t.label}
            selected={pattern === t.value}
            onClick={() => pickPattern(t.value)}
          />
        ))}
        {stray && (
          <IconTile
            icon={{ key: 'button_not_stated' }}
            label={pattern.replace('TECH_CARD_BUTTON_ATTACH_PATTERN_', '').toLowerCase()}
            selected
            onClick={() => pickPattern(pattern)}
          />
        )}
      </Tiles>
    </TileRow>
  );
}
