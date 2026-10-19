import { useMemo } from 'react';
import { cn } from 'lib/utility';
import { BackLink, Button, Text } from 'ui';

export type OldPieceDecision = 'delete' | 'keep';

export type OldPieceLosses = {
  recipeRows: number;
  norms: number;
  areas: number;
  operations: number;
};

export type OldPieceItem = {
  lineKey: string;
  name: string;
  losses: OldPieceLosses;
};

const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const sizeSuffix = /([_\s-](?:xxxs|xxs|xs|s|m|l|xl|xxl|xxxl|os|one[_\s-]?size))$/i;

export function hasOldPieceLoss(losses: OldPieceLosses): boolean {
  return losses.recipeRows > 0 || losses.norms > 0 || losses.areas > 0 || losses.operations > 0;
}

function displayNames(items: readonly OldPieceItem[]): Map<string, string> {
  const suffixes = items.map(
    (item) => item.name.trim().match(sizeSuffix)?.[1]?.toLowerCase() ?? '',
  );
  const sharedSuffix = suffixes.length > 0 && suffixes.every((suffix) => suffix === suffixes[0]);
  return new Map(
    items.map((item) => {
      const name = item.name.trim() || item.lineKey;
      return [item.lineKey, sharedSuffix && suffixes[0] ? name.replace(sizeSuffix, '') : name];
    }),
  );
}

function itemLosses(losses: OldPieceLosses): string {
  return [
    losses.recipeRows > 0 ? 'recipe' : '',
    losses.operations > 0
      ? `${losses.operations} ${losses.operations === 1 ? 'operation' : 'operations'}`
      : '',
    losses.norms > 0 ? 'norms' : '',
    losses.areas > 0 ? 'areas' : '',
  ]
    .filter(Boolean)
    .join(', ');
}

function keptLosses(items: readonly OldPieceItem[]): string {
  return [
    items.some((item) => item.losses.recipeRows > 0) ? 'recipes' : '',
    items.some((item) => item.losses.operations > 0) ? 'operations' : '',
    items.some((item) => item.losses.norms > 0) ? 'norms' : '',
    items.some((item) => item.losses.areas > 0) ? 'areas' : '',
  ]
    .filter(Boolean)
    .join(', ');
}

function Decision({
  children,
  selected,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant={selected ? 'main' : 'secondary'}
      size='sm'
      // The chosen answer stays filled, hover included: an outline alone vanished under the
      // secondary hover fill, so a click on the already-chosen answer looked like a dead button.
      className={cn('h-11 w-full font-normal', selected && 'hover:bg-textColor hover:text-bgColor')}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function PieceTile({
  item,
  label,
  decision,
  disabled,
  onMove,
}: {
  item: OldPieceItem;
  label: string;
  decision: OldPieceDecision;
  disabled: boolean;
  onMove: () => void;
}) {
  const next = decision === 'keep' ? 'delete' : 'keep';
  const losses = itemLosses(item.losses);
  return (
    <Button
      size='sm'
      aria-label={`${next} ${label}`}
      title={item.name}
      disabled={disabled}
      onClick={onMove}
      className={cn(
        'w-full border bg-bgColor text-left',
        'disabled:bg-bgColor disabled:text-borderColor',
        decision === 'keep'
          ? 'border-textColor text-textColor hover:bg-pageBg'
          : 'border-hairline text-labelColor hover:border-borderColor',
      )}
    >
      <span className='flex min-h-18 min-w-0 items-center'>
        <span className='min-w-0'>
          <span className='block truncate'>piece {label}</span>
          {losses && <span className='mt-1 block text-current'>{losses}</span>}
        </span>
      </span>
    </Button>
  );
}

export function OldPiecesDecision({
  items,
  decisionOf,
  onDecide,
  picking,
  onPickingChange,
  readOnly,
}: {
  items: readonly OldPieceItem[];
  decisionOf: (lineKey: string) => OldPieceDecision;
  onDecide: (entries: readonly (readonly [string, OldPieceDecision])[]) => void;
  picking: boolean;
  onPickingChange: (picking: boolean) => void;
  readOnly: boolean;
}) {
  const names = useMemo(() => displayNames(items), [items]);
  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => {
        const aName = names.get(a.lineKey) ?? a.name;
        const bName = names.get(b.lineKey) ?? b.name;
        return natural.compare(aName, bName) || natural.compare(a.name, b.name);
      }),
    [items, names],
  );
  const empty = sorted.filter((item) => !hasOldPieceLoss(item.losses));
  const kept = sorted.filter((item) => decisionOf(item.lineKey) === 'keep');
  const deleted = sorted.filter((item) => decisionOf(item.lineKey) === 'delete');
  const allDeleted = deleted.length === sorted.length;
  const allKept = kept.length === sorted.length;
  const safeDefault = sorted.every(
    (item) => decisionOf(item.lineKey) === (hasOldPieceLoss(item.losses) ? 'keep' : 'delete'),
  );
  const defaultSelected =
    empty.length === 0 ? allKept : empty.length < sorted.length && safeDefault;
  const deleteAllSelected = allDeleted;
  const pickSelected = !defaultSelected && !deleteAllSelected;

  const decideAll = (decision: OldPieceDecision) =>
    onDecide(sorted.map((item) => [item.lineKey, decision] as const));
  const decideSafe = () =>
    onDecide(
      sorted.map(
        (item) => [item.lineKey, hasOldPieceLoss(item.losses) ? 'keep' : 'delete'] as const,
      ),
    );

  if (picking) {
    return (
      <div className='space-y-6'>
        <BackLink onClick={() => onPickingChange(false)} />

        <div className='space-y-4'>
          <Text size='micro' component='h3' className='uppercase'>
            keep · {kept.length}
          </Text>
          <div className='grid grid-cols-2 gap-2'>
            {kept.map((item) => (
              <PieceTile
                key={item.lineKey}
                item={item}
                label={names.get(item.lineKey) ?? item.name}
                decision='keep'
                disabled={readOnly}
                onMove={() => onDecide([[item.lineKey, 'delete']])}
              />
            ))}
          </div>
        </div>

        <div className='space-y-4'>
          <Text size='micro' component='h3' className='uppercase'>
            delete · {deleted.length}
          </Text>
          <div className='grid grid-cols-2 gap-2'>
            {deleted.map((item) => (
              <PieceTile
                key={item.lineKey}
                item={item}
                label={names.get(item.lineKey) ?? item.name}
                decision='delete'
                disabled={readOnly}
                onMove={() => onDecide([[item.lineKey, 'keep']])}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const keptKinds = keptLosses(kept);
  return (
    <div className='space-y-4'>
      <Text size='micro' component='h3' className='uppercase'>
        {items.length} old {items.length === 1 ? 'piece' : 'pieces'} on the card
      </Text>

      <div className='space-y-2'>
        {empty.length === sorted.length ? (
          <Decision
            selected={deleteAllSelected}
            disabled={readOnly}
            onClick={() => decideAll('delete')}
          >
            delete all {sorted.length}
          </Decision>
        ) : (
          <>
            <Decision
              selected={defaultSelected}
              disabled={readOnly}
              onClick={empty.length === 0 ? () => decideAll('keep') : decideSafe}
            >
              {empty.length === 0 ? 'keep all' : `delete ${empty.length} empty`}
            </Decision>
            <Decision
              selected={deleteAllSelected}
              disabled={readOnly}
              onClick={() => decideAll('delete')}
            >
              delete all {sorted.length}
            </Decision>
          </>
        )}
        <Decision selected={pickSelected} disabled={readOnly} onClick={() => onPickingChange(true)}>
          pick
        </Decision>
      </div>

      {kept.length > 0 && (
        <Text size='micro' variant='label'>
          {kept.length} kept{keptKinds ? ` · ${keptKinds}` : ''}
        </Text>
      )}
    </div>
  );
}
