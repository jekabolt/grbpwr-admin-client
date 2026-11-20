import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { filesKeys } from 'components/managers/files/hooks/useFiles';
import { mediaKeys } from 'components/managers/media/utils/useMediaQuery';
import {
  copyLibraryFileToMedia,
  createLibraryFolder,
  deleteLibraryFolder,
  moveLibraryFolder,
  moveLibraryItems,
  renameLibraryFolder,
} from '../api/library';
import type { LibraryRef } from '../api/types';
import { libraryKeys } from './keys';

/**
 * Refreshes the library and the two old screens' caches: a move, a copy or a folder change is
 * visible on the media and files screens too until C3 retires them.
 */
export function invalidateLibrary(qc: QueryClient): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: libraryKeys.all }),
    qc.invalidateQueries({ queryKey: mediaKeys.all }),
    qc.invalidateQueries({ queryKey: filesKeys.all }),
  ]).then(() => undefined);
}

export function useLibraryMutations() {
  const qc = useQueryClient();
  const onSuccess = () => invalidateLibrary(qc);

  const createFolder = useMutation({
    mutationFn: (v: { parentId: number; name: string }) => createLibraryFolder(v.parentId, v.name),
    onSuccess,
  });
  const renameFolder = useMutation({
    mutationFn: (v: { id: number; name: string }) => renameLibraryFolder(v.id, v.name),
    onSuccess,
  });
  const moveFolder = useMutation({
    mutationFn: (v: { id: number; newParentId: number }) => moveLibraryFolder(v.id, v.newParentId),
    onSuccess,
  });
  const deleteFolder = useMutation({
    mutationFn: (v: { id: number }) => deleteLibraryFolder(v.id),
    onSuccess,
  });
  const moveItems = useMutation({
    mutationFn: (v: { refs: LibraryRef[]; folderId: number }) =>
      moveLibraryItems(v.refs, v.folderId),
    onSuccess,
  });
  const copyToMedia = useMutation({
    mutationFn: (v: { fileId: number }) => copyLibraryFileToMedia(v.fileId),
    onSuccess,
  });

  return { createFolder, renameFolder, moveFolder, deleteFolder, moveItems, copyToMedia };
}
