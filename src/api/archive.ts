import { adminService, frontService } from './admin';
import {
  AddArchiveRequest,
  AddArchiveResponse,
  DeleteArchiveByIdRequest,
  DeleteArchiveByIdResponse,
  UpdateArchiveRequest,
  UpdateArchiveResponse
} from './proto-http/admin';
import { GetArchivesPagedRequest, GetArchivesPagedResponse } from './proto-http/frontend';

export function addArchive(request: AddArchiveRequest): Promise<AddArchiveResponse> {
  return adminService.AddArchive(request);
}

export function getArchive(request: GetArchivesPagedRequest): Promise<GetArchivesPagedResponse> {
  return frontService.GetArchivesPaged(request);
}

export function deleteArchive(
  request: DeleteArchiveByIdRequest,
): Promise<DeleteArchiveByIdResponse> {
  return adminService.DeleteArchiveById(request);
}

export function updateArchive(request: UpdateArchiveRequest): Promise<UpdateArchiveResponse> {
  return adminService.UpdateArchive(request);
}
