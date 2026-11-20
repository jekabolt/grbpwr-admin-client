import { adminService } from 'api/api';
import type {
  CopyLibraryFileToMediaResponse,
  GetLibraryFacetsResponse,
  LibraryFolder,
  ListLibraryFoldersResponse,
  ListLibraryItemsResponse,
} from 'api/proto-http/admin';
import {
  type LibraryFilter,
  type LibraryRef,
  type LibrarySortKey,
  refToPb,
  toPbFilter,
  toPbSort,
  withoutFolder,
} from './types';

/** Page size of the unified list. The server caps `limit` at 200. */
export const LIBRARY_PAGE_SIZE = 60;

export async function listLibraryItems(args: {
  filter: LibraryFilter;
  sort: LibrarySortKey;
  limit: number;
  offset: number;
}): Promise<ListLibraryItemsResponse> {
  return adminService.ListLibraryItems({
    filter: toPbFilter(args.filter),
    sort: toPbSort(args.sort),
    limit: args.limit,
    offset: args.offset,
  });
}

export async function getLibraryFacets(filter: LibraryFilter): Promise<GetLibraryFacetsResponse> {
  return adminService.GetLibraryFacets({ filter: toPbFilter(filter) });
}

/** Every folder, flat. The server ignores the folder fields of the filter. */
export async function listLibraryFolders(
  filter: LibraryFilter,
): Promise<ListLibraryFoldersResponse> {
  return adminService.ListLibraryFolders({ filter: toPbFilter(withoutFolder(filter)) });
}

/** `parentId` 0 = root. */
export async function createLibraryFolder(
  parentId: number,
  name: string,
): Promise<LibraryFolder | undefined> {
  const res = await adminService.CreateLibraryFolder({ parentId, name: name.trim() });
  return res.folder;
}

export async function renameLibraryFolder(
  id: number,
  name: string,
): Promise<LibraryFolder | undefined> {
  const res = await adminService.RenameLibraryFolder({ id, name: name.trim() });
  return res.folder;
}

/** `newParentId` 0 = root. */
export async function moveLibraryFolder(
  id: number,
  newParentId: number,
): Promise<LibraryFolder | undefined> {
  const res = await adminService.MoveLibraryFolder({ id, newParentId });
  return res.folder;
}

/** Only an empty folder can go; anything inside answers `folder_not_empty`. */
export async function deleteLibraryFolder(id: number): Promise<void> {
  await adminService.DeleteLibraryFolder({ id });
}

/** `folderId` 0 = take out of every folder. All or nothing; answers the number moved. */
export async function moveLibraryItems(refs: LibraryRef[], folderId: number): Promise<number> {
  const res = await adminService.MoveLibraryItems({ refs: refs.map(refToPb), folderId });
  return res.moved ?? 0;
}

/** A private library image/vector/video becomes a media row; the file stays. Dedup by sha256. */
export async function copyLibraryFileToMedia(
  fileId: number,
): Promise<CopyLibraryFileToMediaResponse> {
  return adminService.CopyLibraryFileToMedia({ fileId });
}

/** The server error words of the library RPCs (gRPC status message). */
export const LIBRARY_ERRORS = [
  'library_filter_invalid',
  'library_no_section',
  'folder_not_empty',
  'folder_depth',
  'folder_cycle',
  'not_copyable',
  'folder_name_taken',
] as const;

export type LibraryErrorCode = (typeof LIBRARY_ERRORS)[number];

/** Short UI words for the library errors, 1–3 words each. */
export const LIBRARY_ERROR_WORD: Record<LibraryErrorCode, string> = {
  library_filter_invalid: 'bad filter',
  library_no_section: 'no access',
  folder_not_empty: 'folder not empty',
  folder_depth: 'too deep',
  folder_cycle: 'into itself',
  not_copyable: 'not a picture',
  folder_name_taken: 'name taken',
};

/** The library error word inside a thrown error, if any. */
export function libraryErrorCode(e: unknown): LibraryErrorCode | undefined {
  const text = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e ?? '');
  return LIBRARY_ERRORS.find((code) => text.includes(code));
}

const MAX_FILE_NAME_RUNES = 255;

/**
 * The `file_name` an upload request carries (`UploadContent{Image,Video,Vector,Model}Request`):
 * the base name only, trimmed, at most 255 runes; undefined when nothing is left.
 */
export function uploadFileName(source: File | string | undefined): string | undefined {
  const raw = typeof source === 'string' ? source : source?.name;
  if (!raw) return undefined;
  const base = raw.split(/[\\/]/).pop()?.trim() ?? '';
  if (!base) return undefined;
  return Array.from(base).slice(0, MAX_FILE_NAME_RUNES).join('');
}
