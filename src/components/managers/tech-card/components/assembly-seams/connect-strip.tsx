// THE CONNECT STRIP (03-SEAMS-DESIGN §5.2 zone 4): hand mode. «click the first edge … then the
// second» → the two sides in words with a LIVE check — lengths, Δ, notches matched by position,
// direction — and connect (Enter) / flip (f) / cancel (Esc). Whole runs and soft chains, and a
// composite by shift-clicking more runs on one side; a partial range by dragging is P2.

import type { PieceGeom } from 'lib/assembly-skeleton/types';
import type { StoredSeamDirection } from 'lib/seams';
import { Button } from 'ui/components/button';
import { Chip } from 'ui/components/chip';
import Text from 'ui/components/text';
import type { HandPick } from './seams-sheet';
import {
  deltaPct,
  directionWords,
  notchCheck,
  notchWords,
  sideLen,
  sideWords,
  type RoleWords,
} from './words';

export function ConnectStrip({
  pick,
  geoms,
  roles,
  direction,
  replacing,
  frozen,
  onConnect,
  onFlip,
  onCancel,
}: {
  pick: HandPick;
  geoms: ReadonlyMap<string, PieceGeom>;
  roles: RoleWords;
  direction: StoredSeamDirection;
  /** «connect again» of a stale row: the new pair replaces it under the same key. */
  replacing: string | null;
  frozen: boolean;
  onConnect: () => void;
  onFlip: () => void;
  onCancel: () => void;
}) {
  const la = sideLen(pick.a, geoms);
  const lb = sideLen(pick.b, geoms);
  const ready = pick.a.length > 0 && pick.b.length > 0;
  const side = (ids: readonly string[], len: number) =>
    `${sideWords(ids, geoms, roles)} ${Math.round(len)} mm`;
  const d = deltaPct(la, lb);
  return (
    <div className='flex flex-wrap items-center gap-x-3 gap-y-1.5' data-connect-strip=''>
      <Text
        size='micro'
        variant='uppercase'
        tracking='group'
        component='span'
        className='font-bold'
      >
        connect by hand
      </Text>
      {replacing && (
        <Text size='micro' variant='label' component='span'>
          replaces the stale decision {replacing}
        </Text>
      )}
      <Text component='span' className='min-w-0 flex-1 tabular-nums' data-connect-words=''>
        {pick.a.length === 0 ? (
          <span className='text-labelColor'>
            click the first edge on the sheet · shift-click adds another run to the same side
          </span>
        ) : !ready ? (
          <>
            {side(pick.a, la)}
            <span className='text-labelColor'> ↔ now click the second edge</span>
          </>
        ) : (
          <>
            {side(pick.a, la)} <span className='text-labelColor'>↔</span> {side(pick.b, lb)}
            <span className='text-labelColor'>
              {' '}
              · Δ {d.toFixed(1)} % · {notchWords(notchCheck(pick.a, pick.b, geoms, direction))} ·{' '}
              {directionWords(direction)}
            </span>
          </>
        )}
      </Text>
      <div className='flex items-center gap-1.5'>
        <Button
          variant='main'
          size='sm'
          disabled={!ready || frozen}
          onClick={onConnect}
          data-connect-door='connect'
        >
          connect ⏎
        </Button>
        <Chip onClick={onFlip} disabled={!ready} title='the two sides walk the same way'>
          ⇄ flip f
        </Chip>
        <Chip onClick={onCancel}>cancel esc</Chip>
      </div>
    </div>
  );
}
