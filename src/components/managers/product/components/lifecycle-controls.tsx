import { adminService } from 'api/api';
import { common_ColorwayLifecycleStatus } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';

// R6: the colourway lifecycle is a stored status with server-validated transitions, driven by
// dedicated RPCs (not a raw `hidden` write). This block replaces the old visibility toggle:
//   DRAFT --Publish--> ACTIVE <--Hide/Unhide--> HIDDEN, and ACTIVE|HIDDEN --Archive--> ARCHIVED.
// Publish enforces preconditions server-side; on FAILED_PRECONDITION we surface the reasons.

type StatusMeta = { label: string; className: string };

const STATUS_META: Record<string, StatusMeta> = {
  COLORWAY_LIFECYCLE_STATUS_DRAFT: { label: 'draft', className: 'bg-yellow-200 text-black' },
  COLORWAY_LIFECYCLE_STATUS_ACTIVE: { label: 'active', className: 'bg-green-300 text-black' },
  COLORWAY_LIFECYCLE_STATUS_HIDDEN: { label: 'hidden', className: 'bg-textColor text-bgColor' },
  COLORWAY_LIFECYCLE_STATUS_ARCHIVED: { label: 'archived', className: 'bg-red-300 text-black' },
};

export function StatusBadge({ status }: { status?: common_ColorwayLifecycleStatus }) {
  const meta = status ? STATUS_META[status] : undefined;
  if (!meta) return null; // UNKNOWN / unset → fail closed, show nothing
  return (
    <span className={`px-1.5 py-0.5 ${meta.className}`}>
      <Text size='small' variant='uppercase'>
        {meta.label}
      </Text>
    </span>
  );
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

  return (
    <div className='flex flex-col gap-2 border border-textInactiveColor px-3 py-2'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex items-center gap-2'>
          <Text variant='uppercase' size='small'>
            lifecycle
          </Text>
          <StatusBadge status={status} />
        </div>
        {canWrite && !isArchived && (
          <div className='flex flex-wrap items-center gap-2'>
            {isDraft && (
              <Button
                type='button'
                variant='main'
                size='lg'
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
                size='lg'
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
                size='lg'
                className='uppercase'
                disabled={busy}
                onClick={() => transition('COLORWAY_LIFECYCLE_STATUS_ACTIVE', 'Colorway shown')}
              >
                unhide
              </Button>
            )}
            {(isActive || isHidden) && (
              <Button
                type='button'
                variant='secondary'
                size='lg'
                className='uppercase'
                disabled={busy}
                onClick={() => setConfirmArchive(true)}
              >
                archive
              </Button>
            )}
          </div>
        )}
      </div>

      {isDraft && (
        <Text variant='inactive' size='small'>
          draft — not on the storefront. publishing requires a complete, sellable colourway.
        </Text>
      )}

      {publishReasons.length > 0 && (
        <div className='flex flex-col gap-1 border border-red-300 bg-red-50 p-2'>
          <Text size='small' variant='uppercase' className='!text-red-700'>
            cannot publish yet
          </Text>
          <ul className='list-disc pl-5'>
            {publishReasons.map((r, i) => (
              <li key={i}>
                <Text size='small' className='!text-red-700'>
                  {r}
                </Text>
              </li>
            ))}
          </ul>
        </div>
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
          archive this colourway? this is terminal — it will be removed from the storefront and
          cannot be un-archived.
        </Text>
      </ConfirmationModal>
    </div>
  );
}
