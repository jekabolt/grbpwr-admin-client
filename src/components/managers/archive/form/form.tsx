import { common_ArchiveInsert, common_MediaFull } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/media-selector/components/mediaSelector';
import { Field, Form, Formik, FormikProps } from 'formik';
import { isVideo } from 'lib/features/filterContentType';
import { useArchiveStore } from 'lib/stores/archive/store';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import { Dialog } from 'ui/components/dialog';
import Input from 'ui/components/input';
import { ArchiveMediaDisplay } from '../utility/archive-items-media';

interface ArchiveFormProps {
  open: boolean;
  onClose: () => void;
  initialValues?: common_ArchiveInsert;
  archiveId?: number;
  existingMedia?: common_MediaFull[] | undefined;
}

const defaultInitialValues: common_ArchiveInsert = {
  heading: '',
  description: '',
  tag: '',
  mediaIds: [],
  videoId: undefined,
};

export function ArchiveForm({
  open,
  onClose,
  initialValues = defaultInitialValues,
  archiveId,
  existingMedia,
}: ArchiveFormProps) {
  const { showMessage } = useSnackBarStore();
  const { addArchive: addArchiveStore, updateArchive: updateArchiveStore } = useArchiveStore();
  const [selectedMedia, setSelectedMedia] = useState<common_MediaFull[]>([]);
  const [showMediaSelector, setShowMediaSelector] = useState(!archiveId);

  const handleMediaSelect = (
    media: common_MediaFull,
    allowMultiple: boolean,
    formik?: FormikProps<any>,
  ) => {
    if (isVideo(media.media?.fullSize?.mediaUrl)) {
      const newSelectedMedia = selectedMedia.filter(
        (item) => !isVideo(item.media?.fullSize?.mediaUrl),
      );

      if (formik?.values.videoId !== media.id) {
        formik?.setFieldValue('videoId', media.id);

        if (formik?.values.mediaIds?.includes(media.id)) {
          formik?.setFieldValue(
            'mediaIds',
            formik.values.mediaIds.filter((id: number) => id !== media.id),
          );
        }

        setSelectedMedia([...newSelectedMedia, media]);
      } else {
        formik?.setFieldValue('videoId', undefined);
        setSelectedMedia(newSelectedMedia);
      }
      return;
    }

    const mediaAlreadyExists = existingMedia?.some((item) => item.id === media.id) || false;

    if (mediaAlreadyExists) {
      showMessage('This media is already in the archive', 'error');
      return;
    }

    const existingImages = selectedMedia.filter((item) => !isVideo(item.media?.fullSize?.mediaUrl));
    const newSelectedMedia = allowMultiple
      ? existingImages.some((item) => item.id === media.id)
        ? existingImages.filter((item) => item.id !== media.id)
        : [...existingImages, media]
      : [media];

    const existingVideo = selectedMedia.find((item) => isVideo(item.media?.fullSize?.mediaUrl));
    setSelectedMedia(existingVideo ? [...newSelectedMedia, existingVideo] : newSelectedMedia);

    formik?.setFieldValue(
      'mediaIds',
      newSelectedMedia.map((media) => media.id),
    );
  };

  async function handleSubmit(values: common_ArchiveInsert) {
    try {
      if (archiveId) {
        await updateArchiveStore(archiveId, values);
        showMessage('Archive updated', 'success');
      } else {
        await addArchiveStore(values);
        showMessage('Archive created', 'success');
      }
      setSelectedMedia([]);
    } catch (error) {
      showMessage(`Failed to ${archiveId ? 'update' : 'create'} archive`, 'error');
    }
  }

  async function handleDeleteArchiveItem(
    id: number,
    values: common_ArchiveInsert,
    isVideo?: boolean,
  ) {
    if (!id) return;
    try {
      if (isVideo) {
        await updateArchiveStore(archiveId || 0, {
          ...values,
          videoId: undefined,
        });
      } else {
        const updatedItems = values.mediaIds
          ?.filter((mediaId) => mediaId !== id)
          .filter((id): id is number => id !== undefined);
        await updateArchiveStore(archiveId || 0, {
          ...values,
          mediaIds: updatedItems,
        });
      }
      showMessage('Archive item deleted', 'success');
    } catch (e) {
      showMessage('Failed to delete archive item', 'error');
    }
  }

  const handleSaveMediaSelection = async (
    values: common_ArchiveInsert,
    formik: FormikProps<common_ArchiveInsert>,
  ) => {
    try {
      const existingImages =
        existingMedia?.filter((media) => !isVideo(media.media?.fullSize?.mediaUrl)) || [];
      const selectedImages = selectedMedia.filter(
        (media) => !isVideo(media.media?.fullSize?.mediaUrl),
      );

      const existingImageIds = existingImages.map((media) => media.id);
      const selectedImageIds = selectedImages.map((media) => media.id);

      const combinedMediaIds = [...new Set([...existingImageIds, ...selectedImageIds])].filter(
        (id): id is number => id !== undefined,
      );

      const selectedVideo = selectedMedia.find((media) => isVideo(media.media?.fullSize?.mediaUrl));
      const videoId = selectedVideo?.id;

      setShowMediaSelector(false);
      formik.setFieldValue('mediaIds', combinedMediaIds);
      if (videoId) {
        formik.setFieldValue('videoId', videoId);
      }

      showMessage('Media items selected', 'success');
    } catch (error) {
      showMessage('Failed to select media items', 'error');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullScreen>
      <Formik initialValues={initialValues} onSubmit={handleSubmit} enableReinitialize>
        {(formik: FormikProps<common_ArchiveInsert>) => (
          <Form className='h-full'>
            <div className='h-full flex flex-col gap-4'>
              <div className='flex flex-col lg:flex-row justify-between gap-4'>
                <Field as={Input} name='heading' placeholder='enter title' className='h-10' />
                <Field
                  as={Input}
                  name='description'
                  placeholder='enter description'
                  className='h-10'
                />
                <Field as={Input} name='tag' placeholder='enter tag' className='h-10' />
              </div>

              <div className='h-full overflow-y-scroll no-scroll-bar'>
                {archiveId && !showMediaSelector ? (
                  <ArchiveMediaDisplay
                    remove={(id, values, isVideo) => handleDeleteArchiveItem(id, values, isVideo)}
                    media={[...(existingMedia || []), ...selectedMedia]}
                    values={formik.values}
                  />
                ) : (
                  <MediaSelector
                    select={(media, allowMultiple) =>
                      handleMediaSelect(media, allowMultiple, formik)
                    }
                    selectedMedia={selectedMedia}
                    aspectRatio={['3:4', '16:9']}
                    isDeleteAccepted={false}
                    allowMultiple
                    hideVideos={false}
                  />
                )}
              </div>

              <div className='w-full flex flex-col lg:flex-row justify-center lg:justify-between gap-2'>
                {archiveId && !showMediaSelector && (
                  <Button size='lg' onClick={() => setShowMediaSelector(true)}>
                    select new items
                  </Button>
                )}
                {archiveId && showMediaSelector ? (
                  <Button
                    size='lg'
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                      e.preventDefault();
                      handleSaveMediaSelection(formik.values, formik);
                    }}
                  >
                    save selection
                  </Button>
                ) : (
                  <Button type='submit' size='lg'>
                    {archiveId ? 'update' : 'create'} archive
                  </Button>
                )}
              </div>
            </div>
          </Form>
        )}
      </Formik>
    </Dialog>
  );
}
