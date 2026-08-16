import { common_MediaFull, common_ColorwayFull } from 'api/proto-http/admin';
import { MediaGallerySelector } from 'components/managers/media/components/media-gallery-selector';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { Control, useController } from 'react-hook-form';
import { ProductFormData } from '../utility/schema';

type Props = {
  product?: common_ColorwayFull;
  control: Control<ProductFormData>;
  clearKey?: number;
  editMode?: boolean;
};

export function MediaAds({ product, control, clearKey, editMode }: Props) {
  const { field } = useController({
    name: 'mediaIds',
    control,
  });
  const [mediaAds, setMediaAds] = useState<common_MediaFull[]>([]);
  const { showMessage } = useSnackBarStore();
  const productMedia = product?.media || [];

  const mediaById = new Map<number, common_MediaFull>(
    [...productMedia, ...mediaAds]
      .filter((m): m is common_MediaFull & { id: number } => m.id != null)
      .map((m) => [m.id, m]),
  );
  const mediaLinks = (field.value ?? [])
    .map((id) => mediaById.get(id))
    .filter((m): m is common_MediaFull => m != null);

  useEffect(() => {
    if (!product && typeof clearKey === 'number') {
      setMediaAds([]);
      field.onChange([]);
    }
  }, [clearKey]);

  function handleMediaAds(mediaAds: common_MediaFull[]) {
    if (!mediaAds.length) return;
    const uniqueMediaAds = mediaAds.filter((m) => !field.value?.includes(m.id || 0));
    if (!uniqueMediaAds.length) {
      // Нативный `alert()` — чужая по языку и по виду коробка, которую ещё надо закрыть кнопкой
      // «ОК». Вся остальная подсистема отвечает тостом, отвечаем им же.
      showMessage(
        mediaAds.length === 1
          ? 'this frame is already in the gallery'
          : 'these frames are already in the gallery',
        'error',
      );
      return;
    }
    setMediaAds((prevMediaAds) => [...prevMediaAds, ...uniqueMediaAds]);
    const selectedMediaAds = [...(field.value || []), ...uniqueMediaAds.map((media) => media.id)];
    field.onChange(selectedMediaAds);
  }

  function deleteMediaAds(mediaId: number) {
    // `mediaAds` — КЭШ РАЗРЕШЁННЫХ МЕДИА, а не сам выбор: выбор живёт в `field.value`. Выкидывая
    // отсюда убранный кадр, форма теряла его адрес и размеры, а вместе с ними и возможность
    // нарисовать кадр обратно — «вернуть» вернуло бы голый id.
    field.onChange(field.value?.filter((id) => id !== mediaId));
  }

  // Порядок кадров — это порядок показа в карточке товара, поэтому он приезжает сюда целиком.
  // Обложка при этом НЕ первый кадр: у неё отдельное поле (`thumbnailMediaId`), и подписывать
  // словом «обложка» первый рекламный кадр было бы неправдой.
  function reorderMediaAds(next: common_MediaFull[]) {
    setMediaAds((prev) => {
      const known = new Set(prev.map((m) => m.id));
      const fresh = next.filter((m) => m.id != null && !known.has(m.id));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
    field.onChange(next.map((m) => m.id).filter((id): id is number => id != null));
  }

  return (
    <MediaGallerySelector
      media={mediaLinks}
      editMode={editMode}
      aspectRatio={['4:5', 'Custom']}
      frameAspect='4/5'
      purpose='additional photo'
      ratioCaption='any ratio'
      fit='contain'
      onSelect={handleMediaAds}
      onDelete={deleteMediaAds}
      onReorder={reorderMediaAds}
    />
  );
}
