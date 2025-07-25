import { getBase64File } from 'lib/features/getBase64';
import { useMediaSelectorStore } from 'lib/stores/media/store';
import { useSnackBarStore } from 'lib/stores/store';
import React, { FC, useState } from 'react';
import Input from 'ui/components/input';
import Text from 'ui/components/text';

export const DragDrop: FC = () => {
  const { showMessage } = useSnackBarStore();
  const { uploadState, prepareUpload } = useMediaSelectorStore();
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const processFiles = async (files: FileList) => {
    if (files && files.length > 0) {
      const file = files[0];

      // Check file size (50MB limit for videos, 10MB for images)
      const maxSize = file.type.startsWith('video/') ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
      if (file.size > maxSize) {
        const maxSizeMB = maxSize / (1024 * 1024);
        showMessage(`File too large. Maximum size: ${maxSizeMB}MB`, 'error');
        return;
      }

      try {
        const base64Url = await getBase64File(file);
        prepareUpload({
          selectedFiles: [file],
          selectedFileUrl: base64Url,
        });
      } catch (error) {
        showMessage('Failed to process file. File may be corrupted or too large.', 'error');
        console.error('File processing error:', error);
      }
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
      showMessage('no files selected', 'error');
    }
    if ('dataTransfer' in e) {
      setIsDragging(false);
    }
    if (e.target instanceof HTMLInputElement) {
      e.target.value = '';
    }
  };

  const handleDrag = (event: React.DragEvent<HTMLDivElement>, dragging: boolean) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(dragging);
  };

  return (
    <div className='w-full'>
      <div className='w-full'>
        <div
          className='flex items-center justify-center w-full'
          onDragOver={(e) => handleDrag(e, true)}
          onDragEnter={(e) => handleDrag(e, true)}
          onDragLeave={(e) => handleDrag(e, false)}
          onDrop={handleFileChange}
        >
          <div className='flex items-center justify-center w-full h-40 p-4 bg-inactive'>
            {!uploadState.selectedFiles.length && (
              <label className='cursor-pointer border border-text rounded px-4 py-2 hover:bg-gray-50 w-full sm:w-auto text-center'>
                DRAG AND DROP YOUR MEDIA HERE
                <Input
                  name='files'
                  type='file'
                  accept='image/*, video/*'
                  onChange={handleFileChange}
                  className='hidden'
                />
              </label>
            )}
            {uploadState.selectedFiles.length > 0 && (
              <Text variant='uppercase'>Media is selected</Text>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
