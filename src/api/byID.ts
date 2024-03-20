import { adminService } from './admin';
import {
  AddProductMeasurementRequest,
  AddProductMeasurementResponse,
  AddProductTagRequest,
  AddProductTagResponse,
  DeleteProductMediaRequest,
  DeleteProductMediaResponse,
  DeleteProductTagRequest,
  DeleteProductTagResponse,
  UpdateProductRequest,
  UpdateProductResponse,
  UpdateProductSizeStockRequest,
  UpdateProductSizeStockResponse,
} from './proto-http/admin';


export function updateProductById(request: UpdateProductRequest): Promise<UpdateProductResponse> {
  return adminService.UpdateProduct(request)
}

export function updateSize(
  request: UpdateProductSizeStockRequest,
): Promise<UpdateProductSizeStockResponse> {
  return adminService.UpdateProductSizeStock(request);
}

export function updateMeasurement(
  request: AddProductMeasurementRequest,
): Promise<AddProductMeasurementResponse> {
  return adminService.AddProductMeasurement(request);
}

export function updateTag(request: AddProductTagRequest): Promise<AddProductTagResponse> {
  return adminService.AddProductTag(request);
}

export function deleteTag(request: DeleteProductTagRequest): Promise<DeleteProductTagResponse> {
  return adminService.DeleteProductTag(request);
}

export function deleteMediaById(request: DeleteProductMediaRequest): Promise<DeleteProductMediaResponse> {
  return adminService.DeleteProductMedia(request)
}
