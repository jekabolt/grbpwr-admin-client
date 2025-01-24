import { Button, Grid2 as Grid, TextField } from '@mui/material';
import { addArchive } from 'api/archive';
import { common_ArchiveInsert, common_MediaFull } from 'api/proto-http/admin';
import { Dialog } from 'components/common/dialog';
import { MediaSelector } from 'components/common/media-selector-layout/mediaSelector';
import { Field, Form, Formik, FormikProps } from 'formik';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import styles from 'styles/archive.scss';

const initialValue: common_ArchiveInsert = {
  title: '',
  description: '',
  tag: '',
  mediaIds: [],
};

export function CreateArchive({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showMessage } = useSnackBarStore();
  const [selectedMedia, setSelectedMedia] = useState<common_MediaFull[]>([]);

  async function handleSubmit(values: common_ArchiveInsert) {
    try {
      const archiveData = {
        ...values,
      };
      const response = await addArchive({ archiveInsert: archiveData });
      if (response) showMessage('archive created', 'success');
      setSelectedMedia([]);
      onClose();
    } catch (error) {
      showMessage('failed to add archive:', 'error');
    }
  }

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

  return (
    <Dialog open={open} onClose={onClose} fullScreen>
      <Formik initialValues={initialValue} onSubmit={handleSubmit}>
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
                <MediaSelector
                  select={(media, allowMultiple) => handleMediaSelect(media, allowMultiple, formik)}
                  selectedMedia={selectedMedia}
                  aspectRatio={['1:1', '3:4', '4:3']}
                  isDeleteAccepted={false}
                  allowMultiple
                  hideVideos
                  hideNavBar
                />
              </Grid>
              <Grid size={{ xs: 12 }} display='flex' justifyContent='end'>
                <Button type='submit' variant='contained' size='large' sx={{ width: '20%' }}>
                  create archive
                </Button>
              </Grid>
            </Grid>
          </Form>
        )}
      </Formik>
    </Dialog>
  );
}
