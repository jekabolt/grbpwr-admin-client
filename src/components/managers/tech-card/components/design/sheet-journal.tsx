import type { GetDesignBandResponse, common_DesignSheetIssue } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';

import { issueLine, type MintOrigin } from './mint-dialog';
import { newClientRequestId, useDesignWrites } from './use-design-band';

/**
 * THE JOURNAL, AND WHY IT IS NOT A REVISION LOG.
 *
 * `RecordDesignSheetIssue` writes `printed` / `shared` and MINTS NOTHING — the contract says so in
 * as many words, and the distinction is the reason the journal exists at all: reprinting the same
 * paper is not a new revision, and a system that made it one would grow a revision per print. So
 * `minted` is the ONE line nobody can write here; it is born of the mint and only of the mint,
 * which is what keeps the journal evidence of what happened rather than a list of what somebody
 * typed. The server refuses `action = "minted"` with InvalidArgument.
 *
 * The band ships at most 50 lines, newest first. A card that issues more has a history worth paging
 * and will get its own read before it does.
 */

export function SheetJournal({
  journal,
  className,
}: {
  journal: common_DesignSheetIssue[] | undefined;
  className?: string;
}) {
  const lines = journal ?? [];
  if (lines.length === 0) {
    return (
      <Text size='micro' variant='label' component='p' className={className}>
        empty — nothing has been issued yet
      </Text>
    );
  }
  return (
    <div className={className}>
      {lines.map((issue, i) => (
        <div
          key={issue.id ?? `${issue.versionNumber}-${issue.action}-${i}`}
          className='flex items-baseline justify-between gap-2 border-b border-hairline py-1'
        >
          <Text size='micro' component='span' className='min-w-0 truncate'>
            {issueLine(issue)}
          </Text>
        </div>
      ))}
      {lines.length >= 50 && (
        <Text size='nano' variant='label' component='p' className='mt-1 uppercase'>
          the last 50 lines
        </Text>
      )}
    </div>
  );
}

/**
 * PRINT — the act, not the paper.
 *
 * Three things happen on this button and they are three different storeys:
 *
 *  1. THE FORK. Paper can only carry a version. When the document has moved past vN the person is
 *     asked which of the two truths goes on the paper — vN as it stands, or a new version minted
 *     from the bench first. This dialog only owns the question; the mint owns the minting.
 *  2. THE JOURNAL LINE. `printed` against the version that is actually being printed.
 *  3. THE PAPER, which is the print page's (F-8), reached with the version pinned in the query.
 *     WHAT THE PIN SELECTS IS THE COMPOSITION — which pictures the sheet carries — and NOT the
 *     callouts: those are printed live, off the card, the way the prototype exports them
 *     (`70-actions.js:276`). So `?sheet=3` means «lay out v3's plates», and the notes on them are
 *     whatever the card says at the moment the page renders. A frozen second copy of the callouts
 *     would put two factory truths under one signature, which is the failure this whole tab is
 *     arranged to prevent.
 *
 * NO QR IS PRINTED IN THIS WAVE, and that is a decision rather than an omission (`17` Э3): there is
 * no public viewer and no token behind it, so the code would encode an address that answers
 * nothing — and paper carrying a dead QR dies silently on the shop floor, which is the worst of the
 * available failures. The version number goes on the paper instead.
 */
export const SHEET_PRINT_PARAM = 'sheet';

export function printSheetPath(techCardId: number, versionNumber: number): string {
  const path = ROUTES.techCardPrint.replace(':id', String(techCardId));
  return `${path}?${SHEET_PRINT_PARAM}=${versionNumber}`;
}

export function PrintSheetButton({
  techCardId,
  band,
  diverged,
  disabled,
  onMintFirst,
}: {
  techCardId: number;
  band: GetDesignBandResponse;
  /** The names that have changed since the version, or null when the document still matches it. */
  diverged: string[] | null;
  disabled?: boolean;
  /** Opens the mint with `origin: 'print'` — the act that would give birth to the next version. */
  onMintFirst: (origin: MintOrigin) => void;
}) {
  const navigate = useNavigate();
  const { showMessage } = useSnackBarStore();
  const writes = useDesignWrites(techCardId);
  const [forkOpen, setForkOpen] = useState(false);

  const version = band.latestVersion?.versionNumber ?? 0;

  const go = async (versionNumber: number) => {
    if (versionNumber <= 0) return;
    try {
      // The line is written BEFORE the paper is laid out, and deliberately: the journal records the
      // ISSUE — that this version left the building — and a person who reaches the print view has
      // issued it. Writing it after would mean a print that failed to render is a print that never
      // happened, which is exactly backwards for a document meant to be evidence.
      await writes.recordIssue.mutateAsync({
        versionNumber,
        action: 'printed',
        clientRequestId: newClientRequestId(),
      });
    } catch {
      // The mutation's own onError has already said what went wrong. The paper is not held hostage
      // to the journal: an unjournalled print is a gap in the record, a blocked print is a garment
      // nobody can cut.
    }
    navigate(printSheetPath(techCardId, versionNumber));
  };

  return (
    <>
      <Button
        variant='secondary'
        size='sm'
        disabled={disabled || version <= 0}
        onClick={() => {
          if (diverged) {
            setForkOpen(true);
            return;
          }
          void go(version);
        }}
      >
        print v{version || '—'}
      </Button>

      <ConfirmationModal
        open={forkOpen}
        onOpenChange={setForkOpen}
        title='print — the bench has moved on'
        hideActions
        width='sm'
        onConfirm={() => {}}
      >
        <div className='space-y-stack'>
          <Text size='micro' component='p'>
            The sheet is v{version}; the bench no longer matches it
            {diverged ? ` (${diverged.join(', ').toLowerCase()})` : ''}. Paper can only carry a
            version, so this is a choice and not a detail.
          </Text>
          <div className='flex flex-wrap items-center gap-1.5'>
            <Button
              variant='secondary'
              size='sm'
              onClick={() => {
                setForkOpen(false);
                void go(version);
              }}
            >
              print v{version} as it is
            </Button>
            <Button
              variant='main'
              size='sm'
              onClick={() => {
                setForkOpen(false);
                onMintFirst('print');
              }}
            >
              mint v{version + 1} first
            </Button>
            <Button variant='secondary' size='sm' onClick={() => setForkOpen(false)}>
              cancel
            </Button>
          </div>
          <Text size='nano' variant='label' component='p' className='uppercase'>
            no QR is printed in this wave — the sheet carries its version number. Notes print live
            either way.
          </Text>
        </div>
      </ConfirmationModal>
    </>
  );
}

/**
 * A version's own short identity, for the header and for the paper.
 *
 * IT IS BUILT FROM THE PLATES BECAUSE THE CONTRACT CARRIES NO VERSION-LEVEL DIGEST.
 * `DesignSheetPlate.content_hash` is «the hash at mint — what this version actually froze»; the
 * version itself has no such column. So the short form quoted next to `v3` is the first plate's
 * hash, and it is labelled as one rather than dressed up as a signature over the whole sheet —
 * which it is not, and which nothing here may imply.
 *
 * Empty is honest and means «these plates predate 0336», not «the hashes differ».
 */
export function versionShortHash(version?: { plates?: { contentHash?: string }[] }): string {
  const first = (version?.plates ?? []).map((p) => (p.contentHash ?? '').trim()).find(Boolean);
  return first ? first.slice(0, 8) : '';
}

/** `printed 3 times · last 14:41` for one version, off the journal the band already shipped. */
export function useIssueSummary(
  journal: common_DesignSheetIssue[] | undefined,
  versionNumber: number,
): string {
  return useMemo(() => {
    const mine = (journal ?? []).filter((j) => (j.versionNumber ?? 0) === versionNumber);
    const printed = mine.filter((j) => j.action === 'printed').length;
    if (printed === 0) return 'never printed';
    return `printed ${printed} time${printed === 1 ? '' : 's'}`;
  }, [journal, versionNumber]);
}

/** Shown when the band read failed for a reason that is not «this binary has no band». */
export function BandError({ onRetry }: { onRetry: () => void }) {
  return (
    <CalloutBox tone='error'>
      <Text size='micro' component='p'>
        <b>the design band did not load.</b> The rest of the card is unaffected.
      </Text>
      <Button variant='secondary' size='xs' className='mt-1.5' onClick={onRetry}>
        try again
      </Button>
    </CalloutBox>
  );
}
