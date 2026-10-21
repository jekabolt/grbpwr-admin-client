// «⋯» of a sheet row: the versions of one pattern sheet. The active file first (it carries the
// download), then TechCardSizePattern.history newest first (each with `restore` when restorable).
// Restore itself goes through restoreSheetVersion (nesting/reupload-session.ts).
import { adminService } from 'api/api';
import type { common_TechCard, common_TechCardPatternRevision } from 'api/proto-http/admin';
import { useState, type ReactNode } from 'react';
import { Button, ConfirmationModal, GenericPopover, Text } from 'ui';

export type SheetVersion = {
  key: string;
  revision: number | null;
  /** RFC 3339 timestamp, '' = unknown */
  at: string;
  url: string;
  fileName: string;
  sha256: string;
  /** card snapshot taken with this version; 0 = none (restore re-applies the file) */
  snapshotId: number;
  current: boolean;
};

/** The active row + its history, newest first. */
export function sheetVersions(
  active: {
    url?: string;
    filename?: string;
    version?: number;
    uploadedAt?: string;
    sha256?: string;
  },
  history: readonly common_TechCardPatternRevision[] | undefined,
): SheetVersion[] {
  const older = [...(history ?? [])]
    .filter((h) => !!h.url && h.url !== active.url)
    .sort((a, b) => (b.revision ?? 0) - (a.revision ?? 0))
    .map<SheetVersion>((h, i) => ({
      key: `${h.revision ?? 0}-${i}`,
      revision: h.revision && h.revision > 0 ? h.revision : null,
      at: h.createdAt ?? '',
      url: h.url ?? '',
      fileName: h.fileName ?? '',
      sha256: h.sha256 ?? '',
      // Not on the generated type yet (TechCardPatternRevision.snapshot_id): read when present.
      snapshotId: Number((h as { snapshotId?: number | string }).snapshotId ?? 0) || 0,
      current: false,
    }));
  const rev = active.version && active.version > 0 ? active.version : null;
  return [
    {
      key: 'current',
      revision: rev ?? (older.length > 0 ? (older[0].revision ?? older.length) + 1 : null),
      at: active.uploadedAt ?? '',
      url: active.url ?? '',
      fileName: active.filename ?? '',
      sha256: active.sha256 ?? '',
      snapshotId: 0,
      current: true,
    },
    ...older,
  ];
}

function ddmm(at: string): string {
  const d = at ? new Date(at) : null;
  if (!d || Number.isNaN(d.getTime()) || d.getTime() <= 0) return '';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── SWITCH POINT: the snapshot restore RPC ─────────────────────────────────────────────────
// RestoreTechCardSnapshot may not be in the generated client yet. Looked up at run time so this
// compiles before and after the proto regeneration; null = not there, restore re-applies the file.
export type SnapshotRestoreRpc = (req: {
  techCardId: number;
  snapshotId: number;
  expectedLockVersion: number;
}) => Promise<{ techCard?: common_TechCard }>;

export function snapshotRestoreRpc(): SnapshotRestoreRpc | null {
  const fn: unknown = (adminService as unknown as Record<string, unknown>).RestoreTechCardSnapshot;
  return typeof fn === 'function' ? (fn.bind(adminService) as SnapshotRestoreRpc) : null;
}

export function SheetVersionsModal({
  open,
  versions,
  canRestore,
  download,
  onRestore,
  onClose,
}: {
  open: boolean;
  versions: SheetVersion[];
  canRestore: (v: SheetVersion) => boolean;
  /** export items for the current file (DXF original, PDF, PLT) */
  download: ReactNode;
  onRestore: (v: SheetVersion) => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  return (
    <ConfirmationModal
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      onConfirm={onClose}
      title='versions'
      width='sm'
      hideActions
    >
      <ul className='divide-y divide-hairline'>
        {versions.map((v) => (
          <li key={v.key} className='flex items-center gap-3 py-1.5'>
            <Text size='micro' component='span' className='w-10 shrink-0 tabular-nums'>
              {v.revision != null ? `v${v.revision}` : ''}
            </Text>
            <Text
              size='micro'
              variant='label'
              component='span'
              className='min-w-0 flex-1 text-center tabular-nums'
            >
              {ddmm(v.at)}
            </Text>
            {v.current ? (
              v.url && download ? (
                <GenericPopover
                  noTail
                  open={downloadOpen}
                  onOpenChange={setDownloadOpen}
                  contentProps={{ align: 'end', side: 'bottom', sideOffset: 4 }}
                  triggerProps={{
                    className: 'text-micro uppercase underline hover:opacity-70',
                  }}
                  openElement='download'
                >
                  <div
                    className='flex flex-col items-start gap-1'
                    onClick={() => setDownloadOpen(false)}
                  >
                    {download}
                  </div>
                </GenericPopover>
              ) : (
                <span />
              )
            ) : canRestore(v) ? (
              <Button
                type='button'
                variant='underline'
                size='xs'
                disabled={busy !== null}
                onClick={async () => {
                  setBusy(v.key);
                  try {
                    await onRestore(v);
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {busy === v.key ? 'restore…' : 'restore'}
              </Button>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ul>
    </ConfirmationModal>
  );
}
