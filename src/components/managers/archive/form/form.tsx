import { Button, Grid2 as Grid, TextField } from '@mui/material';
import { common_ArchiveInsert, common_MediaFull } from 'api/proto-http/admin';
import { Dialog } from 'components/common/dialog';
import { MediaSelector } from 'components/common/media-selector-layout/mediaSelector';
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
  title: '',
  description: '',
  tag: '',
  mediaIds: [],
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
    const newSelectedMedia = allowMultiple
      ? selectedMedia.some((item) => item.id === media.id)
        ? selectedMedia.filter((item) => item.id !== media.id)
        : [...selectedMedia, media]
      : [media];

    setSelectedMedia(newSelectedMedia);
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

  async function handleDeleteArchiveItem(id: number, values: common_ArchiveInsert) {
    if (!id) return;
    try {
      const updatedItems = values.mediaIds
        ?.filter((mediaId) => mediaId !== id)
        .filter((id): id is number => id !== undefined);
      await updateArchiveStore(archiveId || 0, { ...values, mediaIds: updatedItems });
      showMessage('Archive item deleted', 'success');
    } catch (e) {
      showMessage('Failed to delete archive item', 'error');
    }
  }

  const handleSaveMediaSelection = async (values: common_ArchiveInsert) => {
    try {
      const combinedMediaIds = [
        ...(existingMedia?.map((media) => media.id) || []),
        ...selectedMedia.map((media) => media.id),
      ].filter((id): id is number => id !== undefined);

      await updateArchiveStore(archiveId || 0, { ...values, mediaIds: combinedMediaIds });
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
              <Grid size={{ xs: 12 }} display='flex' justifyContent='space-between'>
                <Grid size={{ xs: 2 }}>
                  <Field as={TextField} name='title' label='title' fullWidth />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Field as={TextField} name='description' label='description' fullWidth />
                </Grid>
                <Grid size={{ xs: 2 }}>
                  <Field as={TextField} name='tag' label='tag' fullWidth />
                </Grid>
              </Grid>

              <Grid size={{ xs: 12 }} className={styles.media_selector_wrapper}>
                {archiveId && !showMediaSelector ? (
                  <ArchiveMediaDisplay
                    remove={handleDeleteArchiveItem}
                    media={existingMedia || []}
                    values={formik.values}
                  />
                ) : (
                  <MediaSelector
                    select={(media, allowMultiple) =>
                      handleMediaSelect(media, allowMultiple, formik)
                    }
                    selectedMedia={selectedMedia}
                    aspectRatio={['1:1', '3:4', '4:3']}
                    isDeleteAccepted={false}
                    allowMultiple
                    hideVideos
                    hideNavBar
                  />
                )}
              </Grid>

              <Grid
                size={{ xs: 12 }}
                display='flex'
                justifyContent={archiveId ? 'space-between' : 'end'}
                gap={2}
              >
                {archiveId && !showMediaSelector && (
                  <Button
                    variant='contained'
                    size='large'
                    sx={{ width: '20%' }}
                    onClick={() => setShowMediaSelector(true)}
                  >
                    select new items
                  </Button>
                )}
                {archiveId && showMediaSelector ? (
                  <Button
                    variant='contained'
                    size='large'
                    sx={{ width: '20%' }}
                    onClick={() => handleSaveMediaSelection(formik.values)}
                  >
                    Save Selection
                  </Button>
                ) : (
                  <Button type='submit' variant='contained' size='large' sx={{ width: '20%' }}>
                    {archiveId ? 'Update' : 'Create'} Archive
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
