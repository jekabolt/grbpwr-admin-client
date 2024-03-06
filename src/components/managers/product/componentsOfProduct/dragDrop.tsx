import React, { FC, useState } from 'react';
import { uploadContentImage } from 'api/admin';
import styles from 'styles/mediaSelector.scss';

interface DragDropProps {
  reloadFile: () => void;
}

export const DragDrop: FC<DragDropProps> = ({ reloadFile }) => {
  const [selectedFile, setSelectedFiles] = useState<File[]>([]);
  const [selectedFileUrl, setSelectedFileUrl] = useState<string>();
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const processFiles = (files: FileList) => {
    if (files && files.length) {
      setSelectedFiles(Array.from(files));
      setSelectedFileUrl(URL.createObjectURL(files[0]));
    }
  };

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement> | React.DragEvent<HTMLDivElement>,
  ) => {
    e.preventDefault();
    let files: FileList | null = null;
    if (e.type === 'drop' && 'dataTransfer' in e) {
      files = e.dataTransfer.files;
    } else if (e.target instanceof HTMLInputElement && e.target.files) {
      files = e.target.files;
    }

    if (files) {
      processFiles(files);
    } else {
      console.log('no files selected or droped');
    }

    setIsDragging(false);
  };

  const handleDrag = (event: React.DragEvent<HTMLDivElement>, dragging: boolean) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(dragging);
  };

  const uploadFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result;
      if (base64 && typeof base64 === 'string') {
        try {
          await uploadContentImage({
            rawB64Image: base64,
          });
          setSelectedFiles([]);
          setSelectedFileUrl('');
          await reloadFile();
        } catch (error) {
          alert('error uploading file: ' + error);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (selectedFile.length === 0) {
      alert('select a file to upload');
    }
    await uploadFile(selectedFile[0]);
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
        <input
          id='files'
          type='file'
          accept='image/*, video/*'
          multiple
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        {selectedFileUrl && <p className={styles.drag_drop_img_selected}>image is selected</p>}
        <button type='button' onClick={handleUpload} className={styles.drag_drop_btn}>
          UPLOAD
        </button>
      </div>
    </>
  );
};
