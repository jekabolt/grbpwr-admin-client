import React, { FC, useState } from 'react';
import { uploadContentImage } from 'api/admin';
import styles from 'styles/thumbnail.scss';

export const DragDrop: FC = () => {
  const [selectedFile, setSelectedFiles] = useState<File[]>([]);
  const [selectedFileUrl, setSelectedFileUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const processFiles = (files: FileList | null) => {
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

  const uploadFile = async (file: File, fileName: string) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result;
      if (base64 && typeof base64 === 'string') {
        try {
          await uploadContentImage({
            rawB64Image: base64,
            folder: 'your folder name',
            imageName: fileName,
          });
          setSelectedFiles([]);
          setSelectedFileUrl(null);
        } catch (error) {
          alert('error uploading file' + error);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (selectedFile.length === 0) {
      alert('select a file to upload');
    }

    const fileNameInput = document.getElementById('file_name') as HTMLInputElement;
    const fileName = fileNameInput.value.trim();
    if (!fileName) {
      alert('enter name');
    }

    await uploadFile(selectedFile[0], fileName);

    fileNameInput.value = '';
  };

  return (
    <>
      <div
        onDragOver={(e) => handleDrag(e, true)}
        onDragEnter={(e) => handleDrag(e, true)}
        onDragLeave={(e) => handleDrag(e, false)}
        onDrop={handleFileChange}
        className={`${styles.drag_drop_label} ${isDragging ? styles.drag_drop_label : ''}`}
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
      </div>
      <div className={styles.drag_drop_naming}>
        <input
          id='file_name'
          type='text'
          placeholder='Enter file name'
          className={styles.drag_drop_input}
        />
        <button type='button' onClick={handleUpload} className={styles.drag_drop_btn}>
          UPLOAD
        </button>
      </div>
    </>
  );
};
