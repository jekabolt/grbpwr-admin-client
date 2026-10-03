import type { common_DesignRun } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { TILE_CORNER, TILE_QUIET } from 'ui/components/tile-skin';
import { Tile } from 'ui/components/tiles';

import { runHandle } from '../handles';
import { isCancelling, runStatus } from './run-state';
import { useGenerationWrites } from './use-generation';

/**
 * ═══ A RUN IN FLIGHT — ITS PLACEHOLDER TILES, AND THE ONE WAY TO STOP IT (03.10, owner item 23) ═══
 *
 * Owner, verbatim: «если у нас идет генерация и мы хотим ее отменить или в GENERATION HISTORY или в
 * LATEST GENERATION мы должны иметь эту возможность».
 *
 * The dashed cells a live run reserves (`running 0:12`, `reserved`) are drawn here once, for the
 * bench (`run-outputs.tsx`) and for the history grid (`generation-history.tsx`, FLAT and FABRIC
 * RENDER alike). The stop is a corner of the FIRST cell in the tile anatomy (20-TILE-SPEC §3): the
 * word `cancel`, quiet (`TILE_QUIET`), bottom-right where `edit` stands on a finished picture — the
 * placeholder has no picture to draw over, so the last verb slot is free. Not `✕`: on every tile
 * `✕` means «out of this block» (unmark, off the input), never an act on money; stopping a paid
 * job is a different verb and says its own word. One corner per run, not per cell: the run is
 * stopped whole, and four `cancel`s over four reserved cells would read as «drop this picture».
 *
 * The server's rule (`CancelDesignRun`, `useGenerationWrites.cancelRun`): `pending` → `cancelled`
 * outright; `running` → `cancel_requested_at` stamped, the call already sent cannot be recalled, and
 * an answer that still arrives is recorded and paid for — it then lands as an ordinary result.
 * While the stamp stands the cell wears the flag `cancelling…` and the corner is gone (asking twice
 * changes nothing). This was the run panel's door (`meta ▸`, `run-panel.tsx`), unreachable since
 * FLAT's and FABRIC RENDER's histories became the grid (T09, T24).
 */
export function LiveTiles({
  techCardId,
  run,
  count,
  wordOf,
  disabled,
}: {
  techCardId: number;
  run: common_DesignRun;
  /** How many cells the run reserves. */
  count: number;
  /** The word in the middle of cell `i` — the host's (`running 0:12` / `reserved`). */
  wordOf: (i: number) => string;
  /** The card is read-only here, or the server does not answer the design routes: no corner. */
  disabled?: boolean;
}) {
  const { cancelRun } = useGenerationWrites(techCardId);
  const runId = run.id ?? 0;
  /** Asked and answered, and the band has not come back with the stamp yet: say so already. */
  const asked = cancelRun.isSuccess && cancelRun.variables === runId;
  const cancelling = isCancelling(run) || asked;
  const handle = runHandle(runId);
  const canCancel = !disabled && runId > 0 && !cancelling;
  const pending = cancelRun.isPending;

  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Tile
          key={i}
          dashed
          media={
            <div
              className='group relative flex w-full items-center justify-center bg-bgSecondary'
              style={{ aspectRatio: '4 / 5' }}
              data-live-tile={runId || undefined}
            >
              <Text
                size='nano'
                variant='label'
                component='span'
                className='uppercase tracking-label'
              >
                {wordOf(i)}
              </Text>
              {i === 0 && cancelling && (
                <span
                  className='pointer-events-none absolute left-1 top-1 inline-block bg-bgColor'
                  data-flag='cancelling…'
                >
                  <Pill
                    tone='mut'
                    title='asked to stop — an answer that still arrives is recorded and paid for'
                  >
                    cancelling…
                  </Pill>
                </span>
              )}
              {i === 0 && canCancel && (
                <button
                  type='button'
                  data-run-cancel={runId}
                  aria-label={`cancel ${handle}`}
                  title={
                    runStatus(run) === 'running'
                      ? 'stop this run — the call already sent cannot be recalled; an answer that still arrives is recorded and paid for'
                      : 'stop this run before it starts'
                  }
                  aria-busy={pending || undefined}
                  disabled={pending}
                  onClick={() => cancelRun.mutate(runId)}
                  className={cn(
                    'absolute bottom-1 right-1 z-20 py-0.5 leading-none',
                    TILE_CORNER,
                    TILE_QUIET,
                    pending && 'opacity-100',
                  )}
                >
                  {pending ? 'cancel…' : 'cancel'}
                </button>
              )}
            </div>
          }
        />
      ))}
    </>
  );
}
