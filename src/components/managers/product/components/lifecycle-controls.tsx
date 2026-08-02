import { adminService } from 'api/api';
import { common_ColorwayLifecycleStatus } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Section } from 'ui/components/section';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

// R6: the colourway lifecycle is a stored status with server-validated transitions, driven by
// dedicated RPCs (not a raw `hidden` write). This block replaces the old visibility toggle:
//   DRAFT --Publish--> ACTIVE <--Hide/Unhide--> HIDDEN, ACTIVE|HIDDEN --Archive--> ARCHIVED, and
//   ARCHIVED --Restore--> HIDDEN (#60 — archiving is reversible, not terminal).
// Publish enforces preconditions server-side; on FAILED_PRECONDITION we surface the reasons.

type StatusMeta = { label: string; tone: 'ok' | 'warn' | 'attention' | 'mut' | 'ink' };

// Lifecycle status uses the system's own colour semantics, not a pastel fill:
//   draft    — blue, mid-flight, waiting on a human to publish
//   active   — green, live
//   hidden   — ink, deliberately set and deliberately off the storefront
//   archived — grey, retired / not applicable
// Each also carries its word, so the state survives a monochrome or colour-blind read.
const STATUS_META: Record<string, StatusMeta> = {
  COLORWAY_LIFECYCLE_STATUS_DRAFT: { label: 'draft', tone: 'attention' },
  COLORWAY_LIFECYCLE_STATUS_ACTIVE: { label: 'active', tone: 'ok' },
  COLORWAY_LIFECYCLE_STATUS_HIDDEN: { label: 'hidden', tone: 'ink' },
  COLORWAY_LIFECYCLE_STATUS_ARCHIVED: { label: 'archived', tone: 'mut' },
};

export function StatusBadge({ status }: { status?: common_ColorwayLifecycleStatus }) {
  const meta = status ? STATUS_META[status] : undefined;
  if (!meta) return null; // UNKNOWN / unset → fail closed, show nothing
  return <Pill tone={meta.tone}>{meta.label}</Pill>;
}

// Split a backend precondition message into individual reasons so the operator sees a checklist of
// what still blocks publishing (the server joins them with ';' / newlines / ', ').
function splitReasons(message: string): string[] {
  return message
    .split(/\n|;|(?:,\s+(?=[a-z]))/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function LifecycleControls({
  colorwayId,
  status,
  lockVersion,
  canWrite,
  onChanged,
}: {
  colorwayId: number;
  status?: common_ColorwayLifecycleStatus;
  lockVersion?: number;
  canWrite: boolean;
  onChanged?: () => void;
}) {
  const { showMessage } = useSnackBarStore();
  const [busy, setBusy] = useState(false);
  const [publishReasons, setPublishReasons] = useState<string[]>([]);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const expectedVersion = lockVersion ?? 0;

  const isDraft = status === 'COLORWAY_LIFECYCLE_STATUS_DRAFT';
  const isActive = status === 'COLORWAY_LIFECYCLE_STATUS_ACTIVE';
  const isHidden = status === 'COLORWAY_LIFECYCLE_STATUS_HIDDEN';
  const isArchived = status === 'COLORWAY_LIFECYCLE_STATUS_ARCHIVED';

  async function run(action: () => Promise<unknown>, okMsg: string) {
    setBusy(true);
    setPublishReasons([]);
    try {
      await action();
      showMessage(okMsg, 'success');
      onChanged?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Transition failed';
      showMessage(msg, 'error');
      throw e;
    } finally {
      setBusy(false);
    }
  }

  const publish = () =>
    run(
      () => adminService.PublishColorway({ colorwayId, expectedVersion }),
      'Colorway published',
    ).catch((e) => {
      // Surface publish preconditions (FAILED_PRECONDITION) as an actionable checklist.
      const msg = e instanceof Error ? e.message : '';
      if (msg) setPublishReasons(splitReasons(msg));
    });

  const transition = (target: common_ColorwayLifecycleStatus, okMsg: string) =>
    run(
      () => adminService.TransitionColorwayStatus({ colorwayId, expectedVersion, target }),
      okMsg,
    ).catch(() => {});

  const archive = () =>
    run(
      () => adminService.ArchiveColorwayByID({ colorwayId, expectedVersion }),
      'Colorway archived',
    ).catch(() => {});

  // #60: archiving is reversible. The SERVER picks where it lands — HIDDEN for something that was
  // published, DRAFT for a discarded draft, which must not be handed a publication it never earned.
  // The requested target stays HIDDEN because that is the RPC's "unarchive" edge; the message stays
  // neutral because the outcome is the server's call.
  const restore = () => transition('COLORWAY_LIFECYCLE_STATUS_HIDDEN', 'Colorway restored');

  return (
    <Section
      title='lifecycle'
      action={
        <div className='flex flex-wrap items-center gap-2'>
          <StatusBadge status={status} />
          {canWrite && !isArchived ? (
            <>
              {isDraft && (
                <Button
                  type='button'
                  variant='main'
                  size='sm'
                  className='uppercase'
                  disabled={busy}
                  onClick={publish}
                >
                  publish
                </Button>
              )}
              {isActive && (
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  className='uppercase'
                  disabled={busy}
                  onClick={() => transition('COLORWAY_LIFECYCLE_STATUS_HIDDEN', 'Colorway hidden')}
                >
                  hide
                </Button>
              )}
              {isHidden && (
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  className='uppercase'
                  disabled={busy}
                  onClick={() => transition('COLORWAY_LIFECYCLE_STATUS_ACTIVE', 'Colorway shown')}
                >
                  unhide
                </Button>
              )}
              {/* A DRAFT can be archived too — that is how a colourway created by mistake is
                discarded. Without it a draft was a dead end (publish or nothing) and it kept
                pinning its style: a style with any live colourway cannot change purpose, and
                there is no delete. The verb differs because the consequence does — nothing
                public is being retired. */}
              {(isDraft || isActive || isHidden) && (
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  className='uppercase'
                  disabled={busy}
                  onClick={() => setConfirmArchive(true)}
                >
                  {isDraft ? 'discard' : 'archive'}
                </Button>
              )}
            </>
          ) : canWrite && isArchived ? (
            // #60: an archived colourway can be restored (→ hidden) instead of being permanently stuck.
            <Button
              type='button'
              variant='main'
              size='sm'
              className='uppercase'
              disabled={busy}
              onClick={restore}
            >
              restore
            </Button>
          ) : null}
        </div>
      }
    >
      {isArchived && (
        <Text variant='inactive' size='small'>
          archived — removed from the storefront. restore brings it back as hidden, or as a draft if
          it was never published.
        </Text>
      )}

      {isDraft && (
        <Text variant='inactive' size='small'>
          draft — not on the storefront. publishing requires a complete, sellable colourway.
        </Text>
      )}

      {publishReasons.length > 0 && (
        <CalloutBox tone='error'>
          <Text size='small' variant='uppercase' className='font-bold'>
            <b>cannot publish yet</b>
          </Text>
          <ul className='list-disc pl-5'>
            {publishReasons.map((r, i) => (
              <li key={i}>
                <Text size='small'>{r}</Text>
              </li>
            ))}
          </ul>
        </CalloutBox>
      )}

      <ConfirmationModal
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        onConfirm={() => {
          setConfirmArchive(false);
          archive();
        }}
        onCancel={() => setConfirmArchive(false)}
      >
        <Text variant='uppercase' className='font-bold'>
          {isDraft
            ? 'discard this colourway? it was never published, so nothing leaves the storefront. you can restore it later (it comes back as a draft).'
            : 'archive this colourway? it will be removed from the storefront. you can restore it later (it comes back hidden).'}
        </Text>
      </ConfirmationModal>
    </Section>
  );
}
