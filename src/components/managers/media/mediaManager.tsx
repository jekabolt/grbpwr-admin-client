import { Grid } from '@mui/material';
import { useNavigate } from '@tanstack/react-location';
import { uploadContentImage, uploadContentVideo } from 'api/admin';
import { Layout } from 'components/login/layout';
import { MediaList } from 'features/mediaSelector/listMedia';
import { fileExtensionToContentType } from 'features/utilitty/filterExtentions';
import useMediaSelector from 'features/utilitty/useMediaSelector';
import { FC, useEffect, useState } from 'react';

export const MediaManager: FC = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedFileUrl, setSelectedFileUrl] = useState<string | null>(null);
  const { media, setMedia, fetchFiles } = useMediaSelector();
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchFiles(50, 0);
  }, [fetchFiles]);

  const handleFileChange = (
    event: React.ChangeEvent<HTMLInputElement> | React.DragEvent<HTMLDivElement>,
  ) => {
    let files: FileList | null = null;
    if ('dataTransfer' in event) {
      event.preventDefault();
      setIsDragging(false);
      if (event.dataTransfer) {
        files = event.dataTransfer.files;
      }
    } else {
      files = (event.target as HTMLInputElement).files;
    }

    if (files && files.length > 0) {
      const fileList = Array.from(files);
      setSelectedFiles(fileList);
      const fileUrl = URL.createObjectURL(fileList[0]);
      setSelectedFileUrl(fileUrl);
    }
  };

  const handleDrag = (event: React.DragEvent<HTMLDivElement>, dragging: boolean) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(dragging);
  };

  function trimBeforeBase64(input: string): string {
    const parts = input.split('base64,');
    if (parts.length > 1) {
      return parts[1];
    }
    return input;
  }

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      alert('Please select a file to upload.');
      return;
    }

    const selectedFile = selectedFiles[0];
    const fileExtension = (selectedFile.name.split('.').pop() || '').toLowerCase();

    if (!fileExtension) {
      alert('Invalid file format.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      if (event.target && event.target.result) {
        const baseData64 = event.target.result as string;

        const contentType = fileExtensionToContentType[fileExtension];

        if (!contentType) {
          alert('Invalid extension');
          return;
        }

        if (contentType.startsWith('image')) {
          await uploadContentImage({
            rawB64Image: baseData64,
          });
        } else if (contentType.startsWith('video')) {
          const raw = trimBeforeBase64(baseData64);
          await uploadContentVideo({
            raw: raw,
            contentType: contentType,
          });
        }

        setSelectedFiles([]);
        setSelectedFileUrl(null);
      }
    };

    reader.readAsDataURL(selectedFile);
  };

  return (
    <Layout>
      <Grid container justifyContent='center'>
        {/* <div className={styles.media_container}>
          <div
            onDragOver={(e) => handleDrag(e, true)}
            onDragEnter={(e) => handleDrag(e, true)}
            onDragLeave={(e) => handleDrag(e, false)}
            onDrop={handleFileChange}
          >
            {!selectedFileUrl && (
              <label htmlFor='files' className={styles.drop_title}>
                DRAG AND DROP
              </label>
            )}
            <input
              type='file'
              accept='image/*, video/*'
              multiple
              onChange={handleFileChange}
              id='files'
              className={styles.files}
              style={{ display: 'none' }}
            />
            {selectedFileUrl && selectedFileUrl.startsWith('blob:') && (
              <div className={styles.preview}>
                <img className={styles.media_img} src={selectedFileUrl} alt='Selected Image' />
              </div>
            )}
          </div>
          <div className={styles.name_upload}>
            <div className={styles.upload_container}>
              <button onClick={handleUpload} className={styles.upload_btn}>
                UPLOAD
              </button>
            </div>
          </div>
        </div> */}
        <Grid item xs={10}>
          <MediaList
            media={media}
            setMedia={setMedia}
            allowMultiple={false}
            selectedMedia={[]}
            select={() => {}}
            height='auto'
          />
        </Grid>
      </Grid>
    </Layout>
  );
};
