import { getBase64File } from 'lib/features/getBase64';
import { cn } from 'lib/utility';
import { useState } from 'react';
import Input from 'ui/components/input';
import Media from 'ui/components/media';
import { UploadedFile } from './upload-media';

export function DragDrop({
  uploadedFile,
  setUploadedFile,
}: {
  uploadedFile: UploadedFile | null;
  setUploadedFile: React.Dispatch<React.SetStateAction<UploadedFile | null>>;
}) {
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const processFiles = async (files: FileList) => {
    if (files && files.length > 0) {
      const file = files[0];

      const maxSize = file.type.startsWith('video/') ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
      if (file.size > maxSize) {
        const maxSizeMB = maxSize / (1024 * 1024);
        // showMessage(`File too large. Maximum size: ${maxSizeMB}MB`, 'error');
        return;
      }

      try {
        const base64Url = await getBase64File(file);
        const newUploadedFile: UploadedFile = {
          file,
          base64Url,
          type: file.type.startsWith('video/') ? 'video' : 'image',
        };
        setUploadedFile(newUploadedFile);
      } catch (error) {
        // showMessage('Failed to process file. File may be corrupted or too large.', 'error');
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
      //   showMessage('no files selected', 'error');
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
    <div className='w-full h-full space-y-4'>
      <div
        className={cn(
          'flex items-center justify-center w-80 h-[400px] border-2 transition-colors ',
          {
            'border-1': isDragging,
            'border-transparent': uploadedFile,
          },
        )}
        onDragOver={(e) => handleDrag(e, true)}
        onDragEnter={(e) => handleDrag(e, true)}
        onDragLeave={(e) => handleDrag(e, false)}
        onDrop={handleFileChange}
      >
        {!uploadedFile ? (
          <div>
            <label className='cursor-pointer border border-text rounded px-4 py-2 hover:bg-gray-100 w-full sm:w-auto text-center'>
              DRAG AND DROP YOUR MEDIA HERE
              <Input
                name='files'
                type='file'
                accept='image/*, video/*'
                onChange={handleFileChange}
                className='hidden'
              />
            </label>
          </div>
        ) : (
          <div className='w-80 h-[400px]  border border-black'>
            <Media
              src={uploadedFile.base64Url}
              alt={uploadedFile.file?.name ?? ''}
              type={uploadedFile.type}
              controls={uploadedFile.type === 'video'}
              className='w-full h-full'
              aspectRatio='auto'
            />
          </div>
        )}
      </div>
    </div>
  );
}
