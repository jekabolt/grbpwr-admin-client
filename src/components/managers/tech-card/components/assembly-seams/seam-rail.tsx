// THE RAIL (03-SEAMS-DESIGN §5.2 zone 3): the seams grouped by what is left to do with them —
// TO DECIDE first, then CONFIRMED, REJECTED, STALE, ORPHAN — each a GroupLabel over its rows.

import type { PieceGeom } from 'lib/assembly-skeleton/types';
import type { StoredSeamDirection } from 'lib/seams';
import { GroupLabel } from 'ui/components/group-label';
import Text from 'ui/components/text';
import { GROUPS, type ReviewItem, type SeamGroup } from './review-model';
import { SeamRow, type RowDoors } from './seam-row';
import type { RoleWords } from './words';

export const GROUP_WORDS: Record<SeamGroup, string> = {
  decide: 'to decide',
  confirmed: 'confirmed',
  rejected: 'rejected',
  stale: 'stale',
  orphan: 'orphan',
};

const EMPTY: Record<SeamGroup, string> = {
  decide: 'nothing left to decide',
  confirmed: 'no seam confirmed yet',
  rejected: 'nothing rejected',
  stale: 'nothing stale — every decision fits today’s pattern',
  orphan: 'no decision lost its piece',
};

export function SeamRail({
  items,
  visible,
  geoms,
  roles,
  selectedId,
  frozen,
  directionOf,
  wordsFor,
  doors,
}: {
  items: readonly ReviewItem[];
  visible: ReadonlySet<SeamGroup>;
  geoms: ReadonlyMap<string, PieceGeom>;
  roles: RoleWords;
  selectedId: string | null;
  frozen: boolean;
  directionOf: (it: ReviewItem) => StoredSeamDirection;
  wordsFor: (it: ReviewItem) => 'reject' | 'note' | null;
  doors: RowDoors;
}) {
  const shown = GROUPS.filter((g) => visible.has(g));
  const groups = shown
    .map((g) => ({ g, rows: items.filter((it) => it.group === g) }))
    // In «all», an empty group is not a heading; a group asked for by name says it is empty.
    .filter((x) => x.rows.length > 0 || shown.length === 1);
  return (
    <div
      role='listbox'
      aria-label='seams'
      aria-activedescendant={
        selectedId ? `seam-row-${items.find((it) => it.id === selectedId)?.n}` : undefined
      }
      data-seam-rail=''
    >
      {groups.length === 0 && (
        <Text size='micro' variant='label' component='p' className='py-2'>
          the pattern gives no seams to read here
        </Text>
      )}
      {groups.map(({ g, rows }, i) => (
        <div key={g} data-seam-groupbox={g}>
          <GroupLabel flush={i === 0}>
            {GROUP_WORDS[g]} ({rows.length})
          </GroupLabel>
          {rows.length === 0 ? (
            <Text size='micro' variant='label' component='p' className='py-2'>
              {EMPTY[g]}
            </Text>
          ) : (
            rows.map((it) => (
              <SeamRow
                key={it.id}
                item={it}
                geoms={geoms}
                roles={roles}
                selected={it.id === selectedId}
                frozen={frozen}
                direction={directionOf(it)}
                words={wordsFor(it)}
                doors={doors}
              />
            ))
          )}
        </div>
      ))}
    </div>
  );
}
