import { createAdminServiceClient } from './proto-http/admin';
import { axiosRequestHandler } from './api';
import {
  ListObjectsPagedRequest,
  ListObjectsPagedResponse,
  UploadContentImageRequest,
  UploadContentImageResponse,
  UploadContentVideoRequest,
  UploadContentVideoResponse,
  DeleteFromBucketRequest,
  DeleteFromBucketResponse,
  AddProductRequest,
  AddProductResponse,
  GetProductsPagedRequest,
  GetProductsPagedResponse,
  GetProductByIDRequest,
  GetProductByIDResponse,
  AddProductMediaRequest,
  AddProductMediaResponse,
  DeleteProductByIDRequest,
  DeleteProductByIDResponse,
  GetDictionaryRequest,
  GetDictionaryResponse,
} from './proto-http/admin';

const adminService = createAdminServiceClient(axiosRequestHandler);

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

export function addProduct(product: AddProductRequest): Promise<AddProductResponse> {
  return adminService.AddProduct(product);
}

export function getProductsPaged(
  request: GetProductsPagedRequest,
): Promise<GetProductsPagedResponse> {
  // Object.keys(request).forEach((key) => {
  //   const typedKey = key as keyof GetProductsPagedRequest;
  //   if (request[typedKey] === undefined) {
  //     console.log('test', typedKey);
  //     delete request[typedKey];
  //   }
  // });
  return adminService.GetProductsPaged(request);
}

export function getProductByID(request: GetProductByIDRequest): Promise<GetProductByIDResponse> {
  return adminService.GetProductByID(request);
}

export function addMediaByID(request: AddProductMediaRequest): Promise<AddProductMediaResponse> {
  return adminService.AddProductMedia(request);
}

export function deleteProductByID(
  request: DeleteProductByIDRequest,
): Promise<DeleteProductByIDResponse> {
  return adminService.DeleteProductByID(request);
}

export function getDictionary(request: GetDictionaryRequest): Promise<GetDictionaryResponse> {
  return adminService.GetDictionary(request);
}
