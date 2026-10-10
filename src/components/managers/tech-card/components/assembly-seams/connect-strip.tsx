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

/**
 * Edge roles that are normally left FREE — a hem, the centre-front opening, a vent, a strip's
 * outer edge, a sleeve's wrist: two of them sewn to each other is rarely what the person means.
 */
const FREE_ROLES = new Set(['hem', 'cf', 'vent', 'strip edge', 'wrist']);
const ROLE_PLURAL: Record<string, string> = {
  hem: 'hems',
  cf: 'centre-front edges',
  vent: 'vent edges',
  'strip edge': 'outer strip edges',
  wrist: 'wrists',
};

/** «two hems are not usually sewn together — sure?», or null when either side is a sewing edge. */
export function freeEdgesWarning(
  a: readonly string[],
  b: readonly string[],
  roles: RoleWords,
): string | null {
  const roleOf = (ids: readonly string[]) => {
    const rs = new Set(ids.map((id) => roles.get(id) ?? ''));
    return rs.size === 1 ? [...rs][0] : '';
  };
  const ra = roleOf(a);
  const rb = roleOf(b);
  if (!FREE_ROLES.has(ra) || !FREE_ROLES.has(rb)) return null;
  const what =
    ra === rb
      ? `two ${ROLE_PLURAL[ra] ?? ra}`
      : `a ${ra === 'cf' ? 'centre-front edge' : ra} and a ${rb === 'cf' ? 'centre-front edge' : rb}`;
  const hint =
    ra === 'cf' && rb === 'cf'
      ? ' (the front opening is buttoned — mark it a closure, not a seam)'
      : ' — both are edges a garment usually leaves free';
  return `${what} are not usually sewn together${hint} — sure?`;
}

export function ConnectStrip({
  pick,
  geoms,
  roles,
  direction,
  replacing,
  frozen,
  rereading,
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
  rereading: boolean;
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
  const warning = ready ? freeEdgesWarning(pick.a, pick.b, roles) : null;
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
      {warning && (
        <Text
          size='micro'
          component='span'
          className='basis-full text-warning'
          data-connect-warning=''
        >
          ! {warning}
        </Text>
      )}
      <div className='flex items-center gap-1.5'>
        <Button
          variant='main'
          size='sm'
          disabled={!ready || frozen || rereading}
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
