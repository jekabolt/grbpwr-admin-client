import { Button, Grid2 as Grid, TextField } from '@mui/material';
import { common_ArchiveInsert, common_MediaFull } from 'api/proto-http/admin';

import { MediaSelector } from 'components/common/media-selector-layout/media-selector-components/mediaSelector';
import { Dialog } from 'components/common/utility/dialog';
import { Field, Form, Formik, FormikProps } from 'formik';
import { useArchiveStore, useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import styles from 'styles/archive.scss';
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

export const isVideo = (media: common_MediaFull) => {
  const videoExtensions = ['.mp4', '.mov', '.avi', '.wmv', '.webm'];
  return media.media?.fullSize?.mediaUrl
    ? videoExtensions.some((ext) => media.media?.fullSize?.mediaUrl?.toLowerCase().endsWith(ext))
    : false;
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
    if (isVideo(media)) {
      const newSelectedMedia = selectedMedia.filter((item) => !isVideo(item));

      if (formik?.values.videoId !== media.id) {
        formik?.setFieldValue('videoId', media.id);
        setSelectedMedia([...newSelectedMedia, media]);
      } else {
        formik?.setFieldValue('videoId', undefined);
        setSelectedMedia(newSelectedMedia);
      }
      return;
    }

    const existingImages = selectedMedia.filter((item) => !isVideo(item));
    const newSelectedMedia = allowMultiple
      ? existingImages.some((item) => item.id === media.id)
        ? existingImages.filter((item) => item.id !== media.id)
        : [...existingImages, media]
      : [media];

    const existingVideo = selectedMedia.find((item) => isVideo(item));
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
      onClose();
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
        // Handle video deletion
        await updateArchiveStore(archiveId || 0, {
          ...values,
          videoId: undefined,
        });
      } else {
        // Handle image deletion
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

  const handleSaveMediaSelection = async (values: common_ArchiveInsert) => {
    try {
      const existingImages = existingMedia?.filter((media) => !isVideo(media)) || [];
      const selectedImages = selectedMedia.filter((media) => !isVideo(media));

      const combinedMediaIds = [
        ...existingImages.map((media) => media.id),
        ...selectedImages.map((media) => media.id),
      ].filter((id): id is number => id !== undefined);

      const selectedVideo = selectedMedia.find((media) => isVideo(media));
      const videoId = selectedVideo?.id;

      await updateArchiveStore(archiveId || 0, {
        ...values,
        mediaIds: combinedMediaIds,
        videoId: videoId || values.videoId,
      });

      setShowMediaSelector(false);
      setSelectedMedia([]);
      showMessage('Media items added successfully', 'success');
    } catch (error) {
      showMessage('Failed to add media items', 'error');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullScreen>
      <Formik initialValues={initialValues} onSubmit={handleSubmit} enableReinitialize>
        {(formik: FormikProps<common_ArchiveInsert>) => (
          <Form className={styles.form}>
            <Grid container gap={1}>
              <Grid
                size={{ xs: 12 }}
                display={{ xs: 'grid', lg: 'flex' }}
                justifyContent={{ xs: '', lg: 'space-between' }}
                gap={{ xs: 2 }}
              >
                <Grid size={{ xs: 12, lg: 2 }}>
                  <Field as={TextField} name='heading' label='heading' fullWidth />
                </Grid>
                <Grid size={{ xs: 12, lg: 6 }}>
                  <Field as={TextField} name='description' label='description' fullWidth />
                </Grid>
                <Grid size={{ xs: 12, lg: 2 }}>
                  <Field as={TextField} name='tag' label='tag' fullWidth />
                </Grid>
              </Grid>

              <Grid size={{ xs: 12 }} className={styles.media_selector_wrapper}>
                {archiveId && !showMediaSelector ? (
                  <ArchiveMediaDisplay
                    remove={(id, values, isVideo) => handleDeleteArchiveItem(id, values, isVideo)}
                    media={existingMedia || []}
                    values={formik.values}
                  />
                ) : (
                  <MediaSelector
                    select={(media, allowMultiple) =>
                      handleMediaSelect(media, allowMultiple, formik)
                    }
                    selectedMedia={selectedMedia}
                    aspectRatio={['3:4']}
                    isDeleteAccepted={false}
                    allowMultiple
                    hideVideos={false}
                    hideNavBar
                  />
                )}
              </Grid>

              <Grid
                size={{ xs: 12 }}
                display='flex'
                flexDirection={{
                  xs: 'column',
                  lg: 'row',
                }}
                justifyContent={{
                  xs: 'center',
                  lg: archiveId ? 'space-between' : 'end',
                }}
                gap={2}
              >
                {archiveId && !showMediaSelector && (
                  <Button
                    variant='contained'
                    size='large'
                    sx={{ width: { xs: '100%', lg: '20%' } }}
                    onClick={() => setShowMediaSelector(true)}
                  >
                    select new items
                  </Button>
                )}
                {archiveId && showMediaSelector ? (
                  <Button
                    variant='contained'
                    size='large'
                    sx={{ width: { xs: '100%', lg: '20%' } }}
                    onClick={() => handleSaveMediaSelection(formik.values)}
                  >
                    save Selection
                  </Button>
                ) : (
                  <Button
                    type='submit'
                    variant='contained'
                    size='large'
                    sx={{ width: { xs: '100%', lg: '20%' } }}
                  >
                    {archiveId ? 'update' : 'create'} archive
                  </Button>
                )}
              </Grid>
            </Grid>
          </Form>
        )}
      </Formik>
    </Dialog>
  );
}
