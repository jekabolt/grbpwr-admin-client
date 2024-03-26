import { useNavigate } from '@tanstack/react-location';
import { uploadContentImage, uploadContentVideo } from 'api/admin';
import { Layout } from 'components/login/layout';
import { ROUTES } from 'constants/routes';
import { FC, useState } from 'react';
import styles from 'styles/media-manager.scss';

export const fileExtensionToContentType: { [key: string]: string } = {
  jpg: 'image/jpg',
  png: 'image/png',
  webm: 'video/webm',
  mp4: 'video/mp4',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export const MediaManager: FC = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedFileUrl, setSelectedFileUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false); // Added state for dragging
  const navigate = useNavigate();

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

  const handleViewAll = () => {
    navigate({ to: ROUTES.all });
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
      <div className={styles.media_wrapper}>
        <div className={styles.media_container}>
          <h2 className={styles.media_title}>MEDIA MANAGER</h2>
          <div
            className={`${styles.drop_container} ${isDragging ? styles.dragging : ''}`}
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
        </div>
        <div className={styles.view_all}>
          <h3 className={styles.view_all_btn} onClick={handleViewAll}>
            VIEW ALL
          </h3>
        </div>
      </div>
    </Layout>
  );
};
