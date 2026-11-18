import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';
import { Button, Pencil1Icon, Text } from 'ui';

import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4 } from './composite-sidecar-v4';
import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5 } from './composite-sidecar-v5';
import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6 } from './composite-sidecar-v6';
import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7 } from './composite-sidecar-v7';
import type {
  PatternImportDxfPhaseEExactNAssemblyOrderSessionV2,
  PatternImportDxfProductExactNDesktopGeometryV2,
} from './exact-n-seam-production-mount-v2';
import {
  PatternImportDxfPhaseEExactNTopologyAnnotationEditorV1,
  type PatternImportDxfPhaseEExactNTopologyAnnotationEditorHandleV1,
} from './exact-n-topology-annotation-editor-v1';
import type { PatternImportDxfPhaseERestoredTopologyAnnotationReadbackV1 } from './restored-topology-annotation-reader-v1';
import type { PatternImportDxfPhaseETopologyAnnotationApplicationTransactionV5 } from './topology-annotation-application-transaction-v5';
import type { PatternImportDxfPhaseETopologyAnnotationDraftV5 } from './topology-annotation-save-control-v5';
import type { PatternImportDxfPhaseEWrappedTopologyAnnotationSaveV1 } from './wrapped-topology-annotation-save-v1';

type Saved = PatternImportDxfPhaseERestoredTopologyAnnotationReadbackV1;
type EditState = Readonly<{
  baseline: Saved;
  draft: PatternImportDxfPhaseETopologyAnnotationDraftV5;
  status: 'editing' | 'saving' | 'saved' | 'blocked';
  detail?: string;
}>;

export function PatternImportDxfPhaseESavedTopologyAnnotationEditControlV1({
  session,
  geometry,
  saved,
  save,
  saveStandalone,
  onReadback,
  onReload,
}: Readonly<{
  session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2;
  geometry: PatternImportDxfProductExactNDesktopGeometryV2;
  saved: Saved;
  save?: PatternImportDxfPhaseEWrappedTopologyAnnotationSaveV1;
  saveStandalone?: PatternImportDxfPhaseETopologyAnnotationApplicationTransactionV5['save'];
  onReadback: (expectedPreviousSidecarSha256: string, next: Saved) => void;
  onReload: () => void;
}>) {
  const [edit, setEdit] = useState<EditState | null>(null);
  const [reanchoring, setReanchoring] = useState(false);
  const editorRef = useRef<PatternImportDxfPhaseEExactNTopologyAnnotationEditorHandleV1>(null);
  const pendingRef = useRef<AbortController | null>(null);
  useEffect(() => () => pendingRef.current?.abort(), []);
  const { annotationSource, projection } = geometry;
  const standalone =
    saved.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4 ||
    saved.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5;
  const wrapped =
    saved.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6 ||
    saved.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7;
  if (!annotationSource || !(standalone ? saveStandalone : wrapped && save)) return null;

  const dirty = edit !== null && JSON.stringify(edit.draft) !== JSON.stringify(edit.baseline.draft);
  const submit = async () => {
    if (
      !edit ||
      !dirty ||
      reanchoring ||
      editorRef.current?.isReanchoring() ||
      edit.status === 'blocked' ||
      pendingRef.current
    )
      return;
    const controller = new AbortController();
    pendingRef.current = controller;
    setEdit({ ...edit, status: 'saving', detail: 'Saving and verifying annotations…' });
    try {
      const expected = edit.baseline.sidecarSha256;
      let next: Saved;
      if (standalone && saveStandalone) {
        const result = await saveStandalone(
          session,
          { ...annotationSource, projection },
          edit.draft,
          controller.signal,
          expected,
        );
        if (controller.signal.aborted) return;
        if (!result.ok) {
          setEdit({ ...edit, status: 'blocked', detail: result.blockers[0].detail });
          return;
        }
        next = {
          mediaType: result.mediaType,
          sidecarSha256: result.readback.sidecarSha256,
          draft: { measurements: result.readback.measurements, callouts: result.readback.callouts },
        };
      } else if (save) {
        const result = await save(
          { session, geometry, expectedPreviousSidecarSha256: expected, draft: edit.draft },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (!result.ok) {
          setEdit({
            ...edit,
            status: 'blocked',
            detail:
              result.writeOutcome === 'not-attempted'
                ? result.detail
                : `Save could not be verified. ${result.detail}`,
          });
          return;
        }
        next = {
          mediaType: result.mediaType,
          sidecarSha256: result.sidecarSha256,
          draft: result.readback,
        };
      } else {
        return;
      }
      onReadback(edit.baseline.sidecarSha256, next);
      setEdit({
        baseline: next,
        draft: next.draft,
        status: 'saved',
        detail: 'Saved and verified by fresh readback.',
      });
    } catch {
      if (!controller.signal.aborted)
        setEdit({ ...edit, status: 'blocked', detail: 'Save could not be verified.' });
    } finally {
      if (pendingRef.current === controller) pendingRef.current = null;
    }
  };

  return (
    <Dialog.Root
      open={edit !== null}
      onOpenChange={(open) => {
        if (pendingRef.current) return;
        if (open && !edit) setEdit({ baseline: saved, draft: saved.draft, status: 'editing' });
        if (!open) {
          setEdit(null);
          setReanchoring(false);
          if (edit?.status === 'blocked') onReload();
        }
      }}
    >
      <Dialog.Trigger asChild>
        <Button
          type='button'
          size='xs'
          variant='default'
          aria-label='Edit annotations'
          title='Edit annotations'
          className='flex h-10 w-10 flex-none items-center justify-center p-0 hover:bg-pageBg'
        >
          <Pencil1Icon aria-hidden width={16} height={16} />
        </Button>
      </Dialog.Trigger>
      {edit ? (
        <Dialog.Portal>
          <Dialog.Overlay className='fixed inset-0 z-[210] bg-textColor/50' />
          <Dialog.Content
            className='fixed left-1/2 top-1/2 z-[211] max-h-[90vh] w-[min(46rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-auto border border-borderColor bg-bgColor'
            aria-describedby={undefined}
            onKeyDown={(event) => event.stopPropagation()}
            onEscapeKeyDown={(event) => {
              if (pendingRef.current || editorRef.current?.cancelReanchor()) event.preventDefault();
            }}
            onInteractOutside={(event) => event.preventDefault()}
          >
            <Dialog.Title className='px-3 py-2 text-small font-bold'>
              Edit saved annotations
            </Dialog.Title>
            <PatternImportDxfPhaseEExactNTopologyAnnotationEditorV1
              ref={editorRef}
              enableReanchor
              onReanchorChange={setReanchoring}
              source={{ ...annotationSource, projection }}
              draft={edit.draft}
              onDraftChange={(draft) =>
                setEdit((current) =>
                  current && (current.status === 'editing' || current.status === 'saved')
                    ? { ...current, draft, status: 'editing', detail: undefined }
                    : current,
                )
              }
              disabled={edit.status === 'saving' || edit.status === 'blocked'}
            />
            <div className='flex flex-wrap items-center justify-end gap-2 border-t border-hairline px-3 py-2'>
              {edit.detail ? (
                <Text
                  component='p'
                  size='micro'
                  variant={edit.status === 'blocked' ? 'errorLabel' : 'label'}
                  aria-live='polite'
                  className='mr-auto min-w-0'
                >
                  {edit.detail}
                </Text>
              ) : null}
              {edit.status === 'blocked' ? (
                <Button
                  type='button'
                  size='xs'
                  variant='underline'
                  onClick={() => {
                    setEdit(null);
                    onReload();
                  }}
                >
                  Reload saved annotations
                </Button>
              ) : null}
              <Dialog.Close asChild>
                <Button type='button' size='xs' disabled={edit.status === 'saving'}>
                  {dirty ? 'Discard changes' : 'Close'}
                </Button>
              </Dialog.Close>
              <Button
                type='button'
                size='xs'
                variant='main'
                disabled={
                  !dirty || reanchoring || edit.status === 'saving' || edit.status === 'blocked'
                }
                onClick={() => void submit()}
              >
                Save annotations
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      ) : null}
    </Dialog.Root>
  );
}
