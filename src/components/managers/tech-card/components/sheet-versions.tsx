// The history button of a sheet row opens one pattern sheet's versions. The active file comes first
// (with download), then TechCardSizePattern.history newest first (each with `restore` when restorable
// and `delete` when it has a stable history id), and sheet `delete` at the bottom. The row keeps its
// own ×; re-upload lives in the tile strip and row drag-drop. Restore goes through
// restoreSheetVersion (nesting/reupload-session.ts).
import type { common_TechCardPatternRevision } from 'api/proto-http/admin';
import { useState, type ReactNode } from 'react';
import { Button, ConfirmationModal, GenericPopover, Text } from 'ui';

export type SheetVersion = {
  key: string;
  revision: number | null;
  /** stable history row id; 0 = legacy row, not deletable */
  historyId: number;
  /** RFC 3339 timestamp, '' = unknown */
  at: string;
  url: string;
  fileName: string;
  sha256: string;
  /** card snapshot taken with this version; 0 = none, not restorable */
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
  const retained = [...(history ?? [])]
    .filter((h) => !!h.url && h.url !== active.url)
    .sort((a, b) => (b.revision ?? 0) - (a.revision ?? 0))
    .map<SheetVersion>((h, i) => ({
      key: h.historyId ? `history-${h.historyId}` : `${h.revision ?? 0}-${i}`,
      revision: h.revision && h.revision > 0 ? h.revision : null,
      historyId: Number(h.historyId ?? 0) || 0,
      at: h.createdAt ?? '',
      url: h.url ?? '',
      fileName: h.fileName ?? '',
      sha256: h.sha256 ?? '',
      snapshotId: Number(h.snapshotId ?? 0) || 0,
      current: false,
    }));
  const rev = active.version && active.version > 0 ? active.version : null;
  return [
    {
      key: 'current',
      // A restored sheet keeps its old number: the active row's own revision, never a count.
      revision: rev,
      historyId: 0,
      at: active.uploadedAt ?? '',
      url: active.url ?? '',
      fileName: active.filename ?? '',
      sha256: active.sha256 ?? '',
      snapshotId: 0,
      current: true,
    },
    ...retained,
  ];
}

/** A deleted sheet: TechCard.removedPatternHistory rows of one sheet, newest first. */
export type RemovedSheet = {
  key: string;
  /** the slot it was filed under; '' = unknown */
  scopeKey: string;
  fileName: string;
  /** newest revision's date */
  at: string;
  /** the newest revision's snapshot (the card before the delete); 0 = not restorable */
  snapshotId: number;
  versions: SheetVersion[];
};

// The read model carries line_key / scope_key only once the proto exposes them; until then a sheet
// is told apart by its file name (then url).
type RemovedRevision = common_TechCardPatternRevision & { lineKey?: string; scopeKey?: string };

/** removedPatternHistory (server order: newest first) grouped into one entry per deleted sheet. */
export function removedSheets(
  history: readonly common_TechCardPatternRevision[] | undefined,
): RemovedSheet[] {
  const out = new Map<string, RemovedSheet>();
  (history ?? []).forEach((raw, i) => {
    const h = raw as RemovedRevision;
    if (!h.url) return;
    const id = h.lineKey || h.fileName || h.url;
    const v: SheetVersion = {
      key: h.historyId ? `history-${h.historyId}` : `removed-${i}`,
      revision: h.revision && h.revision > 0 ? h.revision : null,
      historyId: Number(h.historyId ?? 0) || 0,
      at: h.createdAt ?? '',
      url: h.url,
      fileName: h.fileName ?? '',
      sha256: h.sha256 ?? '',
      snapshotId: Number(h.snapshotId ?? 0) || 0,
      current: false,
    };
    const seen = out.get(id);
    if (seen) {
      seen.versions.push(v);
      return;
    }
    out.set(id, {
      key: `removed-${id}`,
      scopeKey: h.scopeKey ?? '',
      fileName: v.fileName || v.url.split('/').pop() || '',
      at: v.at,
      snapshotId: v.snapshotId,
      versions: [v],
    });
  });
  return [...out.values()];
}

export function ddmm(at: string): string {
  const d = at ? new Date(at) : null;
  if (!d || Number.isNaN(d.getTime()) || d.getTime() <= 0) return '';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function SheetVersionsModal({
  open,
  versions,
  canRestore,
  canDeleteRevision,
  download,
  onRestore,
  onDeleteRevision,
  onClose,
  onDelete,
}: {
  open: boolean;
  versions: SheetVersion[];
  canRestore: (v: SheetVersion) => boolean;
  canDeleteRevision: (v: SheetVersion) => boolean;
  /** export items for the current file (DXF original, PDF, PLT) */
  download: ReactNode;
  onRestore: (v: SheetVersion) => Promise<void>;
  onDeleteRevision: (v: SheetVersion) => Promise<boolean>;
  onClose: () => void;
  /** the row's delete (askRemove → confirm); absent = no delete */
  onDelete?: () => void;
}) {
  const [busy, setBusy] = useState<{ key: string; action: 'restore' | 'delete' } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SheetVersion | null>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const deleteLabel = deleteTarget
    ? `delete ${deleteTarget.revision != null ? `v${deleteTarget.revision}` : 'version'}`
    : 'delete version';
  return (
    <>
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
              ) : (
                <span className='inline-flex items-center gap-1'>
                  {canRestore(v) && (
                    <Button
                      type='button'
                      variant='underline'
                      size='xs'
                      disabled={busy !== null}
                      onClick={async () => {
                        setBusy({ key: v.key, action: 'restore' });
                        try {
                          await onRestore(v);
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      {busy?.key === v.key && busy.action === 'restore' ? 'restore…' : 'restore'}
                    </Button>
                  )}
                  {v.historyId > 0 && (
                    <Button
                      type='button'
                      variant='underline'
                      size='xs'
                      disabled={busy !== null || !canDeleteRevision(v)}
                      onClick={() => setDeleteTarget(v)}
                    >
                      delete
                    </Button>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
        {onDelete && (
          <div className='mt-2 border-t border-borderColor pt-2'>
            <Button type='button' variant='underline' size='xs' onClick={onDelete}>
              delete
            </Button>
          </div>
        )}
      </ConfirmationModal>

      <ConfirmationModal
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o && busy?.action !== 'delete') setDeleteTarget(null);
        }}
        onConfirm={() => {
          if (!deleteTarget || busy !== null) return;
          const target = deleteTarget;
          setBusy({ key: target.key, action: 'delete' });
          void onDeleteRevision(target)
            .then((deleted) => {
              if (deleted) setDeleteTarget(null);
            })
            .finally(() => setBusy(null));
        }}
        closeOnConfirm={false}
        title={deleteLabel}
        confirmLabel={busy?.action === 'delete' ? 'deleting…' : 'delete'}
        confirmDisabled={busy !== null}
        cancelDisabled={busy?.action === 'delete'}
        width='sm'
      >
        <Text>{deleteLabel}</Text>
      </ConfirmationModal>
    </>
  );
}
