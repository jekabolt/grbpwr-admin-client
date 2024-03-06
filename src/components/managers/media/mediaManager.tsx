import { FC, useState } from 'react';
import styles from 'styles/media-manager.scss';
import { ROUTES } from 'constants/routes';
import { useNavigate } from '@tanstack/react-location';
import { uploadContentImage, uploadContentVideo, getAllUploadedFiles } from 'api/admin';
import { ListObjectsPagedRequest } from 'api/proto-http/admin';
import { Layout } from 'components/login/layout';

const fileExtensionToContentType: { [key: string]: string } = {
  jpg: 'image/jpg',
  png: 'image/png',
  webm: 'video/webm',
  mp4: 'video/mp4',
  jpeg: 'image/jpeg',
  // Add more mappings as needed
};

export const MediaManager: FC = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [selectedFileUrl, setSelectedFileUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false); // Added state for dragging
  const navigate = useNavigate();

  const handleFileChange = (
    event: React.ChangeEvent<HTMLInputElement> | React.DragEvent<HTMLDivElement>,
  ) => {
    let files;
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
      const selectedFile = files[0];
      setSelectedFiles(Array.from(files));

      const fileUrl = URL.createObjectURL(selectedFile);
      setSelectedFileUrl(fileUrl);
    }
  };

  const handleDrag = (event: React.DragEvent<HTMLDivElement>, dragging: boolean) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(dragging);
  };

  const handleViewAll = async () => {
    try {
      const authToken = localStorage.getItem('authToken');

      if (!authToken) {
        console.log('fuck off');
        alert('Authentication token not found');
        return;
      }

      const request: ListObjectsPagedRequest = {
        limit: 10,
        offset: 0,
        orderFactor: 'ORDER_FACTOR_ASC',
      };

      const response = await getAllUploadedFiles(request);

      const filesFromResponse =
        response.list?.map((media) => {
          const fileExtension = (media.media?.fullSize?.split('.').pop() || '').toLowerCase();
          return new File(
            [
              /* your content here */
            ],
            media.media?.fullSize || '',
            {
              type: fileExtensionToContentType[fileExtension] || '',
            },
          );
        }) || [];

      setUploadedFiles(filesFromResponse);

      const queryParams = new URLSearchParams();
      queryParams.append('uploadedFiles', JSON.stringify(response));
      navigate({ to: `${ROUTES.all}?${queryParams.toString()}`, replace: true });

      setUploadedFiles(filesFromResponse);
    } catch (error) {
      console.error('Error fetching uploaded files:', error);
    }
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

    const nameInput = document.getElementById('file_name') as HTMLInputElement;
    const fileName = nameInput.value.trim();
    if (!fileName) {
      alert('Please enter a name for the file.');
      return;
    }

    localStorage.setItem('name', fileName);

    const selectedFile = selectedFiles[0];
    const fileExtension = (selectedFile.name.split('.').pop() || '').toLowerCase();
    console.log('File extension:', fileExtension);

    if (!fileExtension) {
      alert('Invalid file format.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      if (event.target && event.target.result) {
        const baseData64 = event.target.result as string;

        try {
          const contentType = fileExtensionToContentType[fileExtension];

          if (!contentType) {
            alert('invalid extension');
            alert(contentType);
          }

          if (contentType.startsWith('image')) {
            const response = await uploadContentImage({
              rawB64Image: baseData64,
            });
            console.log('uploaded:', response);
          } else if (contentType.startsWith('video')) {
            const raw = trimBeforeBase64(baseData64);
            const response = uploadContentVideo({
              raw: raw,
              contentType: contentType,
            });
            console.log('uploaded:', response);
          }

          nameInput.value = '';
          setSelectedFiles([]);
          setSelectedFileUrl(null);
        } catch (error) {
          alert('error uploading video');
        }
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
            className={`${styles.drop_container} ${isDragging ? styles.dragging : ''}`} // Conditional class for visual feedback
            onDragOver={(e) => handleDrag(e, true)}
            onDragEnter={(e) => handleDrag(e, true)}
            onDragLeave={(e) => handleDrag(e, false)}
            onDrop={handleFileChange} // Reuse the file change handler for the drop event
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
              style={{ display: 'none' }} // Hide the input but keep it in the DOM for accessibility
            />
            {selectedFileUrl && selectedFileUrl.startsWith('blob:') && (
              <div className={styles.preview}>
                <img className={styles.media_img} src={selectedFileUrl} alt='Selected Image' />
              </div>
            )}
          </div>
          <div className={styles.name_upload}>
            <div className={styles.name_container}>
              <label htmlFor='file_name' className={styles.name}>
                NAME
              </label>
              <input
                type='text'
                placeholder='TEXT FIELD'
                id='file_name'
                className={styles.name_input}
              />
            </div>
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
