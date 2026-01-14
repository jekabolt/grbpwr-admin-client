import { axiosRequestHandler } from './api';
import {
  DeleteFromBucketRequest,
  DeleteFromBucketResponse,
  DeleteProductByIDRequest,
  DeleteProductByIDResponse,
  GetDictionaryRequest,
  GetDictionaryResponse,
  GetProductByIDRequest,
  GetProductByIDResponse,
  GetProductsPagedRequest,
  GetProductsPagedResponse,
  ListObjectsPagedRequest,
  ListObjectsPagedResponse,
  UploadContentImageRequest,
  UploadContentImageResponse,
  UploadContentVideoRequest,
  UploadContentVideoResponse,
  UpsertProductRequest,
  UpsertProductResponse,
  createAdminServiceClient,
} from './proto-http/admin/index.ts';
import { createFrontendServiceClient } from './proto-http/frontend/index.ts';

export const adminService = createAdminServiceClient(axiosRequestHandler);
export const frontService = createFrontendServiceClient(axiosRequestHandler);

export function getAllUploadedFiles(
  request: ListObjectsPagedRequest,
): Promise<ListObjectsPagedResponse> {
  return adminService.ListObjectsPaged(request);
}

export function uploadContentImage(
  request: UploadContentImageRequest,
): Promise<UploadContentImageResponse> {
  return adminService.UploadContentImage(request);
}

export function uploadContentVideo(
  request: UploadContentVideoRequest,
): Promise<UploadContentVideoResponse> {
  return adminService.UploadContentVideo(request);
}

export function deleteFiles(request: DeleteFromBucketRequest): Promise<DeleteFromBucketResponse> {
  return adminService.DeleteFromBucket(request);
}

export function upsertProduct(request: UpsertProductRequest): Promise<UpsertProductResponse> {
  return adminService.UpsertProduct(request);
}

export function getProductsPaged(
  request: GetProductsPagedRequest,
): Promise<GetProductsPagedResponse> {
  return adminService.GetProductsPaged(request);
}

export function getProductByID(request: GetProductByIDRequest): Promise<GetProductByIDResponse> {
  return adminService.GetProductByID(request);
}

export function deleteProductByID(
  request: DeleteProductByIDRequest,
): Promise<DeleteProductByIDResponse> {
  return adminService.DeleteProductByID(request);
}

export function getDictionary(
  request: GetDictionaryRequest,
  bypassCache = false,
): Promise<GetDictionaryResponse> {
  const storedData = localStorage.getItem('dictionary');
  if (storedData && !bypassCache) {
    return Promise.resolve().then(() => JSON.parse(storedData));
  } else {
    return adminService.GetDictionary(request).then((response) => {
      localStorage.setItem('dictionary', JSON.stringify(response));
      return response;
    });
  }
}
