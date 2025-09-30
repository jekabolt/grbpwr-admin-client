import { zodResolver } from '@hookform/resolvers/zod';
import { common_ArchiveInsert, common_MediaFull } from 'api/proto-http/admin';
import { SingleMediaViewAndSelect } from 'components/managers/media/media-selector/components/singleMediaViewAndSelect';
import { MediaSelectorLayout } from 'components/managers/media/media-selector/layout';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { Dialog } from 'ui/components/dialog';
import Media from 'ui/components/media';
import { Form } from 'ui/form';
import InputField from 'ui/form/fields/input-field';
import { TranslationField } from 'ui/form/fields/translation-field';
import { useCreateArchive, useUpdateArchive } from '../utility/useArchive';
import { CheckoutData, defaultData, schema } from './schema';

// Helper function to check if media has 2:1 aspect ratio
const isMainImage = (media: common_MediaFull): boolean => {
  const width = media.media?.fullSize?.width;
  const height = media.media?.fullSize?.height;
  if (!width || !height) return false;
  const ratio = width / height;
  return Math.abs(ratio - 2) < 0.1; // Allow small tolerance for 2:1 ratio
};

interface ArchiveFormProps {
  open: boolean;
  onClose: () => void;
  initialValues?: common_ArchiveInsert;
  archiveId?: number;
  existingMedia?: common_MediaFull[] | undefined;
}

export function ArchiveForm({ open, archiveId, existingMedia, onClose }: ArchiveFormProps) {
  const { showMessage } = useSnackBarStore();
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [mediaPreview, setMediaPreview] = useState<common_MediaFull[]>([]);
  const createArchiveMutation = useCreateArchive();
  const updateArchiveMutation = useUpdateArchive();

  // async function handleSubmit(values: common_ArchiveInsert) {
  //   try {
  //     if (archiveId) {
  //       await updateArchiveMutation.mutateAsync({ id: archiveId, archiveData: values });
  //       showMessage('Archive updated', 'success');
  //     } else {
  //       await createArchiveMutation.mutateAsync(values);
  //       showMessage('Archive created', 'success');
  //     }
  //     setSelectedMedia([]);
  //     onClose();
  //   } catch (error) {
  //     showMessage(`Failed to ${archiveId ? 'update' : 'create'} archive`, 'error');
  //   }
  // }

  async function handleDeleteArchiveItem(
    id: number,
    values: common_ArchiveInsert,
    isVideo?: boolean,
  ) {
    if (!id) return;
    try {
      if (isVideo) {
        await updateArchiveMutation.mutateAsync({
          id: archiveId || 0,
          archiveData: {
            ...values,
            mainMediaId: undefined,
            thumbnailId: undefined,
          },
        });
      } else {
        const updatedItems = values.mediaIds
          ?.filter((mediaId) => mediaId !== id)
          .filter((id): id is number => id !== undefined);
        await updateArchiveMutation.mutateAsync({
          id: archiveId || 0,
          archiveData: {
            ...values,
            mediaIds: updatedItems,
          },
        });
      }
      showMessage('Archive item deleted', 'success');
    } catch (e) {
      showMessage('Failed to delete archive item', 'error');
    }
  }

  // const handleSaveMediaSelection = async (
  //   values: common_ArchiveInsert,
  //   formik: FormikProps<common_ArchiveInsert>,
  // ) => {
  //   try {
  //     const existingImages =
  //       existingMedia?.filter(
  //         (media) => !isVideo(media.media?.fullSize?.mediaUrl) && !isMainImage(media),
  //       ) || [];
  //     const selectedImages = selectedMedia.filter(
  //       (media) => !isVideo(media.media?.fullSize?.mediaUrl) && !isMainImage(media),
  //     );

  //     const existingImageIds = existingImages.map((media) => media.id);
  //     const selectedImageIds = selectedImages.map((media) => media.id);

  //     const combinedMediaIds = [...new Set([...existingImageIds, ...selectedImageIds])].filter(
  //       (id): id is number => id !== undefined,
  //     );

  //     const selectedVideo = selectedMedia.find((media) => isVideo(media.media?.fullSize?.mediaUrl));
  //     const selectedMainImage = selectedMedia.find(
  //       (media) => !isVideo(media.media?.fullSize?.mediaUrl) && isMainImage(media),
  //     );

  //     const videoId = selectedVideo?.id || selectedMainImage?.id;

  //     setShowMediaSelector(false);
  //     formik.setFieldValue('mediaIds', combinedMediaIds);
  //     if (videoId) {
  //       formik.setFieldValue('videoId', videoId);
  //     }

  //     showMessage('Media items selected', 'success');
  //   } catch (error) {
  //     showMessage('Failed to select media items', 'error');
  //   }
  // };

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: defaultData,
  });

  function selectMainMedia(media: common_MediaFull[]) {
    if (!media.length) return;
    const mainMedia = media[0];
    setImagePreviewUrl(mainMedia.media?.thumbnail?.mediaUrl || '');
    form.setValue('mainMediaId', mainMedia.id || 0);
  }

  const uploadMediaInArchive = (newSelectedMedia: common_MediaFull[]) => {
    if (!newSelectedMedia.length) {
      showMessage('No selected media', 'error');
      return;
    }

    const uniqueMedia = newSelectedMedia.filter(
      (m) => !form.getValues('mediaIds')?.includes(m.id || 0),
    );

    if (uniqueMedia.length === 0) {
      showMessage('media already in product', 'error');
      return;
    }

    setMediaPreview((prevPreview) => [...prevPreview, ...uniqueMedia]);

    const updatedMediaIds = [
      ...(form.getValues('mediaIds') || []),
      ...uniqueMedia.map((media) => media.id),
    ];
    form.setValue('mediaIds', updatedMediaIds as number[]);
  };

  async function onSubmit(data: CheckoutData) {
    console.log('Form data:', data);

    // Validate required fields
    if (!data.translations[0].heading || !data.translations[0].description || !data.tag) {
      showMessage('Please fill in all required fields', 'error');
      return;
    }

    try {
      // Transform data to match common_ArchiveInsert interface
      const archiveData: common_ArchiveInsert = {
        tag: data.tag,
        mediaIds: data.mediaIds && data.mediaIds.length > 0 ? data.mediaIds : undefined,
        mainMediaId: data.mainMediaId,
        thumbnailId: data.mediaIds[0],
        translations: data.translations,
      };

      if (archiveId) {
        await updateArchiveMutation.mutateAsync({ id: archiveId, archiveData });
        showMessage('Archive updated', 'success');
      } else {
        await createArchiveMutation.mutateAsync(archiveData);
        showMessage('Archive created', 'success');
      }

      // Reset form and close
      form.reset();
      setMediaPreview([]);
      setImagePreviewUrl('');
      onClose();
    } catch (error) {
      console.error('Failed to save archive:', error);
      showMessage(`Failed to ${archiveId ? 'update' : 'create'} archive`, 'error');
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullScreen>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className='flex lg:flex-row flex-col'>
            <TranslationField fieldPrefix='translations' fieldName='heading' label='heading' />
            <TranslationField
              fieldPrefix='translations'
              fieldName='description'
              label='description'
            />
            <InputField name='tag' placeholder='enter tag' label='tag' />
          </div>

          <SingleMediaViewAndSelect
            link={imagePreviewUrl}
            isDeleteAccepted={false}
            aspectRatio={['2:1', '16:9']}
            aspectOnPreview='2/1'
            saveSelectedMedia={selectMainMedia}
          />

          {mediaPreview.map((m) => (
            <div key={m.id} className='relative'>
              <Media
                type='image'
                src={m.media?.thumbnail?.mediaUrl || ''}
                alt={m.media?.blurhash || ''}
              />
            </div>
          ))}

          <div className='w-full h-auto flex items-center justify-center border border-text'>
            <MediaSelectorLayout
              label='select media'
              aspectRatio={['3:4']}
              isDeleteAccepted={false}
              allowMultiple={true}
              saveSelectedMedia={uploadMediaInArchive}
              hideVideos={true}
            />
          </div>

          <Button
            type='submit'
            disabled={createArchiveMutation.isPending || updateArchiveMutation.isPending}
          >
            {createArchiveMutation.isPending || updateArchiveMutation.isPending
              ? 'Saving...'
              : 'Save'}
          </Button>
        </form>
      </Form>
    </Dialog>
  );
}
