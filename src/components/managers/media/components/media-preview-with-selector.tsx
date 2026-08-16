import { common_MediaFull } from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { isVideo } from 'lib/features/filterContentType';
import { cn } from 'lib/utility';
import { MediaViewer, useMediaViewer } from 'ui/components/media-viewer';

// Один кадр: заполненный — картинка с «change/remove», пустой — слот, который заполняют кликом,
// ⌘V или броском файла. Вся механика живёт в `MediaSlot`; здесь остаётся только просмотрщик и
// прежняя подпись пропсов, которой пользуются полтора десятка экранов.
interface MediaPreviewWithSelectorProps {
  mediaUrl?: string;
  aspectRatio: string[];
  allowMultiple?: boolean;
  showVideos?: boolean;
  label?: string;
  /** What this media is for (e.g. "landscape"); shown in the picker dialog header. */
  purpose?: string;
  alt?: string;
  editMode?: boolean;
  showSelectorWhenEmpty?: boolean;
  /**
   * When set, the preview is sized by height (width derived from the aspect ratio)
   * instead of filling its container's width. Pass a responsive class, e.g. 'sm:h-44'.
   */
  heightClass?: string;
  onSaveMedia: (media: common_MediaFull[]) => void;
  onClear?: () => void;
}

export function MediaPreviewWithSelector({
  mediaUrl,
  aspectRatio,
  allowMultiple = false,
  showVideos = true,
  alt = 'Media preview',
  label = '+ add media',
  purpose,
  editMode = true,
  showSelectorWhenEmpty = true,
  heightClass,
  onSaveMedia,
  onClear,
}: MediaPreviewWithSelectorProps) {
  const previewAspectRatio = aspectRatio[0]?.replace(':', '/') || '4/5';
  // Height-driven (w-fit) when heightClass given, otherwise fill the container width.
  const sizeClass = heightClass ? cn('w-full sm:w-fit', heightClass) : undefined;
  const mediaIsVideo = isVideo(mediaUrl);
  const viewer = useMediaViewer();

  return (
    <>
      <MediaSlot
        mediaUrl={mediaUrl}
        alt={alt}
        aspectRatio={aspectRatio}
        frameAspect={previewAspectRatio}
        sizeClassName={sizeClass}
        label={label}
        purpose={purpose}
        allowMultiple={allowMultiple}
        showVideos={showVideos}
        // Пустой слот без права заполнить его — это просто рамка: тот же вид, что и у режима
        // просмотра, поэтому и разбирается тем же признаком.
        editMode={editMode && (showSelectorWhenEmpty || !!mediaUrl)}
        // Подпись пропорций под слотом была отдельной строкой; теперь она — вторая строка внутри
        // самой рамки, рядом с жестами, и не двигает соседние поля.
        hint={aspectRatio.filter((r) => r.toLowerCase() !== 'custom').join(' / ') || undefined}
        onOpenViewer={mediaUrl ? () => viewer.openAt(0) : undefined}
        onSelect={onSaveMedia}
        onClear={onClear}
      />

      {mediaUrl && (
        <MediaViewer
          items={[{ src: mediaUrl, type: mediaIsVideo ? 'video' : 'image', alt }]}
          {...viewer}
        />
      )}
    </>
  );
}
