import { useEffect, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Text, Tiles } from 'ui';
import { ICONS, type IconKey } from '../../op-icons';
import type { TechCardFormData } from '../schema';
import { IconTile, TileRow, useStepFieldErrors } from './icon-tile';
import {
  BIND_KIND_TILES,
  bindTileSelection,
  JOIN_KIND_TILES,
  kindFitsClass,
  NO_BINDING_STYLE,
  NO_SEAM_CLASS,
  seamKindGroups,
  seamKindLabel,
  seamKindPick,
  type KindTile,
} from './rules';
import { useStepWrite } from './use-step-write';

const TILE_MIN = 72;

const kindIcon = (token: string) =>
  Object.prototype.hasOwnProperty.call(ICONS, token) ? { key: token as IconKey } : undefined;

/**
 * The «seam kind» row. A binding step picks one of the four binding kinds (they ARE the fold:
 * this row replaces the binding-fold select); a join step picks from eight common kinds, «more»
 * opens every kind grouped. A pick writes the kind with its class (and fold); clicking the picked
 * tile clears it.
 *
 * Always mounted: when the step's seam class changes under a stored kind, the kind that no longer
 * fits is dropped in the same edit (the server refuses a kind of another class).
 */
export function SeamKindTiles({
  index,
  family,
  className,
}: {
  index: number;
  /** Which row this step takes; null = none, though a stored kind is still shown. */
  family: 'bind' | 'join' | null;
  className?: string;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const write = useStepWrite(index);
  const seamKind = (
    (useWatch({ control, name: `operations.${index}.seamKind` }) ?? '') as string
  ).trim();
  const seamClass = (useWatch({ control, name: `operations.${index}.seamClass` }) ??
    NO_SEAM_CLASS) as string;
  const bindingStyle = (useWatch({ control, name: `operations.${index}.bindingStyle` }) ??
    NO_BINDING_STYLE) as string;
  const errors = useStepFieldErrors(index, ['seamKind', 'bindingStyle']);
  const [moreOpen, setMoreOpen] = useState(false);

  // The class moved under the kind (here or in the step list): drop the kind that no longer fits.
  // Never on mount — opening a step does not edit it.
  const seenClass = useRef(seamClass);
  useEffect(() => {
    if (seenClass.current === seamClass) return;
    seenClass.current = seamClass;
    if (seamKind && !kindFitsClass(seamKind, seamClass)) write('seamKind', '');
  }, [seamClass, seamKind, write]);

  if (!family && !seamKind) return null;

  const pick = (token: string) => {
    const next = seamKindPick(token, { seamKind, bindingStyle });
    write('seamKind', next.seamKind);
    if (next.seamClass !== undefined) write('seamClass', next.seamClass);
    if (next.bindingStyle !== undefined) write('bindingStyle', next.bindingStyle);
  };

  const bind = family === 'bind';
  const selection = bind
    ? bindTileSelection(seamKind, bindingStyle)
    : { token: seamKind, derived: false };
  const base: readonly KindTile[] = bind ? BIND_KIND_TILES : JOIN_KIND_TILES;
  // A stored kind outside the row (another class, or newer than this bundle) is shown, picked.
  const tiles =
    seamKind && !base.some((t) => t.token === seamKind)
      ? [...base, { token: seamKind, label: seamKindLabel(seamKind) }]
      : base;

  const tile = (t: KindTile, title?: string) => {
    const selected = selection.token === t.token;
    return (
      <IconTile
        key={t.token}
        icon={kindIcon(t.token)}
        label={t.label}
        title={title}
        selected={selected}
        derived={selected && selection.derived}
        onClick={() => pick(selected && !selection.derived ? '' : t.token)}
      />
    );
  };

  return (
    <TileRow
      field={`operations.${index}.seamKind`}
      alsoField={bind ? `operations.${index}.bindingStyle` : undefined}
      label='seam kind'
      errors={errors}
      className={className}
    >
      <Tiles min={TILE_MIN}>
        {tiles.map((t) => tile(t))}
        {!bind && (
          <IconTile
            label={moreOpen ? 'less' : 'more'}
            dashed
            selected={false}
            onClick={() => setMoreOpen((open) => !open)}
          />
        )}
      </Tiles>
      {!bind && moreOpen && (
        <div className='flex flex-col gap-2 pt-1'>
          {seamKindGroups().map((g) => (
            <div key={g.group} className='flex flex-col gap-1'>
              <Text size='micro' variant='label' tracking='label' className='uppercase'>
                {g.group}
              </Text>
              <Tiles min={TILE_MIN}>{g.kinds.map((t) => tile(t, t.label))}</Tiles>
            </div>
          ))}
        </div>
      )}
    </TileRow>
  );
}
