import { Button } from '@mui/material';
import { uploadContentImage, uploadContentVideo } from 'api/admin';
import React, { FC, useState } from 'react';
import styles from 'styles/dragDrop.scss';

interface DragDropProps {
  reloadFile?: () => void;
}

const fileExtensionToContentType: { [key: string]: string } = {
  jpg: 'image/jpg',
  png: 'image/png',
  webm: 'video/webm',
  mp4: 'video/mp4',
  jpeg: 'image/jpeg',
};

export const DragDrop: FC<DragDropProps> = ({ reloadFile }) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedFileUrl, setSelectedFileUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const processFiles = (files: FileList) => {
    if (files && files.length > 0) {
      const file = files[0];
      setSelectedFiles([file]);
      setSelectedFileUrl(URL.createObjectURL(file));
    }
  };

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement> | React.DragEvent<HTMLDivElement>,
  ) => {
    e.preventDefault();

    let files: FileList | null = null;
    if (e.type === 'drop' && 'dataTransfer' in e) {
      files = e.dataTransfer.files;
    } else if (e.type === 'change' && e.target instanceof HTMLInputElement && e.target.files) {
      files = e.target.files;
    }

    if (files && files.length > 0) {
      processFiles(files);
    } else {
      alert('No selected files.');
    }
    if ('dataTransfer' in e) {
      setIsDragging(false);
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
        reloadFile?.();
      }
    };

    reader.readAsDataURL(selectedFile);
  };

  return (
    <>
      <div
        onDragOver={(e) => handleDrag(e, true)}
        onDragEnter={(e) => handleDrag(e, true)}
        onDragLeave={(e) => handleDrag(e, false)}
        onDrop={handleFileChange}
        className={`${styles.drag_drop_container} ${isDragging ? styles.drag_drop_label : ''}`}
      >
        {!selectedFileUrl && <label htmlFor='files'>DRAG AND DROP FILES HERE</label>}
        <input id='files' type='file' accept='image/*, video/*' onChange={handleFileChange} />
        {selectedFileUrl && <p className={styles.drag_drop_img_selected}>media is selected</p>}
        <Button variant='contained' onClick={handleUpload} className={styles.drag_drop_btn}>
          UPLOAD
        </Button>
      </div>
    </>
  );
};
