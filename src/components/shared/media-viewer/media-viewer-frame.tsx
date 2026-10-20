import { useEffect } from 'react';
import {
  FrameEditorPanel,
  FrameEditorStage,
  useFrameEditor,
  type FrameEditorKind,
} from './frame-editor';
import { ModeDock, ModeHeader, type ViewerLayout } from './media-viewer-panels';

/**
 * The `crop` mode of the viewer (mockup frames 3 and 3b): `crop | expand` is one mode with two
 * chips, because both answer the same question — where the edge of the picture is.
 *
 * Its own component, so the editor (and the pixels it loads) lives exactly as long as the mode:
 * leaving the mode unmounts it, and the next entry starts from the untouched picture.
 *
 * The kind has two owners on purpose — the desktop top bar has separate `crop` and `expand`
 * buttons, the panel has the chips — so it is mirrored both ways and the viewer stays the truth.
 */
export function FrameMode({
  src,
  layout,
  kind,
  onKindChange,
  saving,
  onCancel,
  onSave,
}: {
  src: string;
  layout: ViewerLayout;
  kind: FrameEditorKind;
  onKindChange: (kind: FrameEditorKind) => void;
  saving: boolean;
  onCancel: () => void;
  /** Hands over the baker; the viewer decides where the bytes go. */
  onSave: (bake: () => Promise<string | null>) => void;
}) {
  const editor = useFrameEditor({ src, initialKind: kind });
  const { kind: editorKind, setKind } = editor;

  useEffect(() => {
    setKind(kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);
  useEffect(() => {
    if (editorKind !== kind) onKindChange(editorKind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorKind]);

  const saveDisabled = !editor.dirty || editor.busy;
  const save = () => onSave(async () => (await editor.apply())?.dataUrl ?? null);

  const panel = <FrameEditorPanel editor={editor} tone='dark' />;

  if (layout === 'phone') {
    return (
      <>
        <ModeHeader
          title={editorKind}
          onCancel={onCancel}
          onSave={save}
          saveDisabled={saveDisabled}
          saving={saving}
        />
        <FrameEditorStage editor={editor} className='min-h-0 flex-1 p-2' />
        {editor.error && (
          <p className='shrink-0 px-3 text-micro uppercase tracking-label text-bgColor/60'>
            {editor.error}
          </p>
        )}
        <ModeDock
          layout='phone'
          title={editorKind}
          onCancel={onCancel}
          onSave={save}
          saveDisabled={saveDisabled}
          saving={saving}
        >
          {panel}
        </ModeDock>
      </>
    );
  }

  return (
    <div className='flex min-h-0 flex-1'>
      <FrameEditorStage editor={editor} className='min-h-0 flex-1 px-16 pb-4' />
      <ModeDock
        layout='desk'
        title={editorKind}
        onCancel={onCancel}
        onSave={save}
        saveDisabled={saveDisabled}
        saving={saving}
      >
        {panel}
        {editor.error && (
          <p className='text-micro uppercase tracking-label text-bgColor/60'>{editor.error}</p>
        )}
      </ModeDock>
    </div>
  );
}
