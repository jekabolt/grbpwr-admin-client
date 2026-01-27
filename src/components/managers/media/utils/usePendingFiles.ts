import { useEffect, useMemo, useRef, useState } from 'react';
import { PreviewItem } from '../components/preview-media';
import { dataUrlToFile } from './dataUrlToFile';
import { useUploadMedia } from './useUploadMedia';

type PendingFileItem = {
  id: string;
  file: File;
  preview: PreviewItem;
};

export function usePendingFiles() {
  const [pendingFiles, setPendingFiles] = useState<PendingFileItem[]>([]);
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(new Set());
  const [croppedById, setCroppedById] = useState<Record<string, string>>({});
  const previewsRef = useRef<PendingFileItem[]>([]);
  const uploadMedia = useUploadMedia();

  useEffect(() => {
    previewsRef.current = pendingFiles;
  }, [pendingFiles]);

  useEffect(() => {
    return () => {
      previewsRef.current.forEach((item) => {
        if (item.preview.url.startsWith('blob:')) {
          URL.revokeObjectURL(item.preview.url);
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
    setPendingFiles((prev) => {
      const index = prev.findIndex((p) => p.id === id);
      if (index < 0) return prev;

      const item = prev[index];
      if (item?.preview.url) {
        URL.revokeObjectURL(item.preview.url);
      }

      setUploadingIds((prevIds) => {
        const newSet = new Set(prevIds);
        newSet.delete(id);
        return newSet;
      });

      setCroppedById((prevCropped) => {
        if (!prevCropped[id]) return prevCropped;
        const next = { ...prevCropped };
        delete next[id];
        return next;
      });

      return prev.filter((p) => p.id !== id);
    });
  };

  const removeFile = (index: number) => {
    if (index < 0 || index >= pendingFiles.length) return;
    const item = pendingFiles[index];
    if (!item) return;

    if (item.preview.url) {
      URL.revokeObjectURL(item.preview.url);
    }

    setUploadingIds((prevIds) => {
      const newSet = new Set(prevIds);
      newSet.delete(item.id);
      return newSet;
    });

    setCroppedById((prevCropped) => {
      if (!prevCropped[item.id]) return prevCropped;
      const next = { ...prevCropped };
      delete next[item.id];
      return next;
    });

    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUploadAll = async () => {
    if (!pendingFiles.length) return;

    const itemsToUpload = [...pendingFiles];

    setUploadingIds(new Set(itemsToUpload.map((item) => item.id)));

    try {
      for (let i = 0; i < itemsToUpload.length; i += 1) {
        const fileItem = itemsToUpload[i];
        const croppedUrl = croppedById[fileItem.id];
        const fileToUpload = croppedUrl
          ? dataUrlToFile(croppedUrl, fileItem.file.name)
          : fileItem.file;
        // eslint-disable-next-line no-await-in-loop
        await uploadMedia.mutateAsync(fileToUpload);
        removeFileById(fileItem.id);
      }
    } catch (e) {
      console.error('bulk upload failed:', e);
    } finally {
      setUploadingIds(new Set());
    }
  };

  const setCroppedUrl = (index: number, croppedUrl: string) => {
    setCroppedById((prev) => {
      const item = pendingFiles[index];
      if (!item) return prev;
      return { ...prev, [item.id]: croppedUrl };
    });
  };

  const previews = useMemo(() => pendingFiles.map((item) => item.preview), [pendingFiles]);
  const files = useMemo(() => pendingFiles.map((item) => item.file), [pendingFiles]);

  const croppedUrls = useMemo(() => {
    const byIndex: Record<number, string> = {};
    pendingFiles.forEach((item, index) => {
      const url = croppedById[item.id];
      if (url) {
        byIndex[index] = url;
      }
    });
    return byIndex;
  }, [pendingFiles, croppedById]);

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
    handleUploadAll,
    setCroppedUrl,
    removeFile,
    removeFileById,
    addFiles,
  };
}
