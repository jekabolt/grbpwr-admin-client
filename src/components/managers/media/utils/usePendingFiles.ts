import { useEffect, useMemo, useRef, useState } from 'react';
import { dataUrlToFile } from './dataUrlToFile';
import { useUploadMedia } from './useUploadMedia';
import { PreviewItem } from '../components/preview-media';

type PendingFileItem = {
  id: string;
  file: File;
  preview: PreviewItem;
};

export function usePendingFiles() {
  const [pendingFiles, setPendingFiles] = useState<PendingFileItem[]>([]);
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(new Set());
  const [croppedUrls, setCroppedUrls] = useState<Record<number, string>>({});
  const previewsRef = useRef<PreviewItem[]>([]);
  const uploadMedia = useUploadMedia();

  useEffect(() => {
    previewsRef.current = pendingFiles.map((item) => item.preview);
  }, [pendingFiles]);

  useEffect(() => {
    return () => {
      previewsRef.current.forEach((p) => {
        if (p.url.startsWith('blob:')) {
          URL.revokeObjectURL(p.url);
        }
      });
    };
  }, []);

  const addFiles = (files: File[]) => {
    const newItems: PendingFileItem[] = files.map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      preview: {
        url: URL.createObjectURL(file),
        type: (file.type.startsWith('video/') ? 'video' : 'image') as PreviewItem['type'],
      },
    }));
    setPendingFiles((prev) => [...prev, ...newItems]);
  };

  const removeFileById = (id: string) => {
    const index = pendingFiles.findIndex((p) => p.id === id);
    if (index < 0) return;
    
    const item = pendingFiles[index];
    if (item?.preview.url) {
      URL.revokeObjectURL(item.preview.url);
    }
    setUploadingIds((prev) => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
    setPendingFiles((prev) => prev.filter((p) => p.id !== id));
    shiftCroppedUrls(index);
  };

  const removeFile = (index: number) => {
    if (index < 0 || index >= pendingFiles.length) return;
    const item = pendingFiles[index];
    if (item?.preview.url) {
      URL.revokeObjectURL(item.preview.url);
    }
    setUploadingIds((prevIds) => {
      const newSet = new Set(prevIds);
      newSet.delete(item.id);
      return newSet;
    });
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
    shiftCroppedUrls(index);
  };

  const setUploadingIndex = (index: number | null) => {
    if (index === null) {
      setUploadingIds(new Set());
    } else {
      setPendingFiles((prev) => {
        if (index >= 0 && index < prev.length) {
          setUploadingIds((prevIds) => new Set(prevIds).add(prev[index].id));
        }
        return prev;
      });
    }
  };

  const clearUploadingById = (id: string) => {
    setUploadingIds((prev) => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
  };

  const isUploading = (index: number) => {
    if (index < 0 || index >= pendingFiles.length) return false;
    return uploadingIds.has(pendingFiles[index].id);
  };

  const shiftCroppedUrls = (removedIndex: number) => {
    setCroppedUrls((prev) => {
      const newUrls = { ...prev };
      delete newUrls[removedIndex];
      const shifted: Record<number, string> = {};
      Object.keys(newUrls).forEach((key) => {
        const oldIndex = parseInt(key, 10);
        if (oldIndex > removedIndex) {
          shifted[oldIndex - 1] = newUrls[oldIndex];
        } else if (oldIndex < removedIndex) {
          shifted[oldIndex] = newUrls[oldIndex];
        }
      });
      return shifted;
    });
  };

  const handleUpload = async (index: number, croppedUrl?: string) => {
    if (!pendingFiles.length || index < 0 || index >= pendingFiles.length) return;

    const fileItem = pendingFiles[index];
    if (!fileItem || isUploading(index)) return;

    const fileId = fileItem.id;
    setUploadingIndex(index);
    try {
      const fileToUpload = croppedUrl
        ? dataUrlToFile(croppedUrl, fileItem.file.name)
        : fileItem.file;
      await uploadMedia.mutateAsync(fileToUpload);
      clearUploadingById(fileId);
      removeFileById(fileId);
    } catch (e) {
      console.error('upload failed:', e);
      clearUploadingById(fileId);
    }
  };

  const setCroppedUrl = (index: number, croppedUrl: string) => {
    setCroppedUrls((prev) => ({ ...prev, [index]: croppedUrl }));
  };

  const previews = useMemo(() => pendingFiles.map((item) => item.preview), [pendingFiles]);
  const files = useMemo(() => pendingFiles.map((item) => item.file), [pendingFiles]);

  const uploadingIndices = useMemo(() => {
    return new Set(
      Array.from(uploadingIds)
        .map((id) => pendingFiles.findIndex((p) => p.id === id))
        .filter((i) => i >= 0),
    );
  }, [uploadingIds, pendingFiles]);

  return {
    pendingFiles: files,
    previews,
    pendingFileItems: pendingFiles,
    croppedUrls,
    uploadingIndices,
    handleUpload,
    setCroppedUrl,
    removeFile,
    removeFileById,
    addFiles,
  };
}
