import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo } from 'react';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import {
  SHEET_MINIMUM,
  VIEW_LABELS,
  analyseMint,
  benchDoor,
  openDoor,
  readBench,
  slotIsFilled,
  useDesignSaveHost,
  type CalloutLike,
} from '../mint-dialog';

/**
 * WHAT THE MINT NEEDS — the same checklist the versions block shows, reachable from anywhere.
 *
 * IT IS NOT A SECOND SET OF RULES. Every line is computed by `analyseMint`, the function the mint
 * dialog itself gates on, so this screen cannot promise a mint the mint would refuse. That was the
 * failure worth designing against: a checklist with its own arithmetic tells somebody he is ready,
 * he presses the button, and the server disagrees.
 *
 * A LOCK AND A QUESTION ARE DIFFERENT THINGS, AND THE LIST SAYS WHICH IS WHICH. Two of these rows
 * BLOCK — the sheet minimum, and the absence of the page's save path. The rest are things the mint
 * ASKS: an uploaded plate states no fit of its own and a mixed composition is legal with consent,
 * so marking them red would teach people that the list lies. Callouts pinned outside the
 * composition are named for the same reason and block nothing: a version freezes the PLATES, not
 * the callouts, so such a mark is a thing that will not appear on the paper — a fact to be told
 * rather than a corruption to be prevented.
 *
 * EVERY LINE IS A DOOR (Г10). The prototype's own defect was a lock that named a tab and offered no
 * way to reach it; `openDoor` walks to the rendered thing and pulses it, and says where it was when
 * the tab holding it is not on screen.
 */

type Verdict = 'ready' | 'blocks' | 'asked';

type CheckRow = {
  key: string;
  label: string;
  state: string;
  verdict: Verdict;
  /** Where to go. Absent = there is nowhere to walk to, which is itself worth not pretending. */
  door?: { path: string; where: string };
};

const VERDICT_TONE: Record<Verdict, 'ok' | 'warn' | 'attention'> = {
  ready: 'ok',
  blocks: 'warn',
  asked: 'attention',
};

const VERDICT_WORD: Record<Verdict, string> = {
  ready: 'ready',
  blocks: 'blocks the mint',
  asked: 'asked at mint',
};

export function PreconditionsModal({
  open,
  onOpenChange,
  band,
  callouts,
  onMint,
  disabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  band: GetDesignBandResponse;
  /** The card's callouts, as the form holds them. The mint reads exactly these seven fields. */
  callouts: CalloutLike[];
  /** Opens the mint. Omitted by a caller that has no save host to mint through. */
  onMint?: () => void;
  disabled?: boolean;
}) {
  const { showMessage } = useSnackBarStore();
  const host = useDesignSaveHost();

  const bench = useMemo(() => readBench(band), [band]);
  const analysis = useMemo(() => analyseMint(bench, callouts), [bench, callouts]);

  const rows = useMemo<CheckRow[]>(() => {
    const out: CheckRow[] = [];

    for (const view of SHEET_MINIMUM) {
      const filled = slotIsFilled(bench.byView.get(view));
      out.push({
        key: `slot:${view}`,
        label: `${VIEW_LABELS[view]} slot`,
        state: filled ? 'filled' : 'empty',
        verdict: filled ? 'ready' : 'blocks',
        door: {
          path: benchDoor({ viewKey: view }),
          where: `the ${VIEW_LABELS[view]} slot is on the bench`,
        },
      });
    }

    out.push({
      key: 'uploaded-fit',
      label: 'fit on hand-brought plates',
      state: analysis.uploadedCount
        ? `${analysis.uploadedCount} plate${analysis.uploadedCount === 1 ? '' : 's'} state no fit of their own`
        : 'none to ask about',
      verdict: analysis.uploadedCount ? 'asked' : 'ready',
      door: analysis.uploadedCount
        ? { path: benchDoor({ viewKey: 'front' }), where: 'the plates are on the bench' }
        : undefined,
    });

    if (analysis.mixed) {
      out.push({
        key: 'mixed',
        label: 'mixed composition',
        state: analysis.mixedNote || 'the plates come from different places',
        verdict: 'asked',
        door: { path: benchDoor({ viewKey: 'front' }), where: 'the plates are on the bench' },
      });
    }

    if (analysis.unrepinned.length) {
      out.push({
        key: 'unrepinned',
        label: 'callouts off the sheet',
        state: `${analysis.unrepinned.length} pinned to pictures this composition does not contain — they will not print`,
        verdict: 'asked',
        door: {
          path: `callouts.${analysis.unrepinned[0].index}.description`,
          where: 'the callouts are beside the sheet',
        },
      });
    }

    // THE SAVE PATH IS A PRECONDITION, AND A HARD ONE. A version is written by the same transaction
    // that saves the document, so without the page's own settle step the mint is not merely
    // unavailable — performing it would leave every sign-off on this card re-approving itself on the
    // next save. There is nowhere to walk to: the fix is a mount, not a field.
    if (!host) {
      out.push({
        key: 'host',
        label: 'the card’s save path',
        state: 'this tab is not mounted inside DesignSaveHostProvider',
        verdict: 'blocks',
      });
    }

    return out;
  }, [bench, analysis, host]);

  const blocking = rows.filter((r) => r.verdict === 'blocks');
  const ready = blocking.length === 0;

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={() => {
        onOpenChange(false);
        onMint?.();
      }}
      closeOnConfirm={false}
      width='md'
      title='what the mint needs'
      cancelLabel='close'
      confirmLabel='mint ▸'
      confirmDisabled={!ready || !onMint || !!disabled}
      footerHint={
        ready
          ? 'nothing blocks it — the questions below are asked in the dialog itself'
          : blocking.map((r) => r.label).join(', ')
      }
    >
      <div className='space-y-stack'>
        <Text size='micro' variant='label' component='p'>
          The sheet is the accepted composition of the bench. There is no «accept» button anywhere:
          a version is a by-product of an ACT — the first print or release mints v1 — and this list
          says what stands in the way of that act, and what it will ask you when it happens.
        </Text>

        <div>
          {rows.map((row) => (
            <div key={row.key} className='flex items-center gap-2 border-b border-hairline py-1'>
              <Text
                size='micro'
                component='span'
                className='w-32 shrink-0 truncate'
                title={row.label}
              >
                {row.label}
              </Text>
              <Text size='micro' variant='label' component='span' className='min-w-0 flex-1'>
                {row.state}
              </Text>
              <Pill tone={VERDICT_TONE[row.verdict]}>{VERDICT_WORD[row.verdict]}</Pill>
              {row.door && (
                <Button
                  variant='secondary'
                  size='xs'
                  disabled={disabled}
                  onClick={() => openDoor(row.door!.path, row.door!.where, showMessage)}
                >
                  go to it
                </Button>
              )}
            </div>
          ))}
        </div>

        <Text size='micro' variant='label' component='p'>
          The bench is free to hold any views at all; the MINIMUM is checked here, at the mint, and
          nowhere else. What a version freezes is which pictures are on the sheet — the callouts are
          not frozen, so correcting a note never needs a new version.
        </Text>
      </div>
    </ConfirmationModal>
  );
}
