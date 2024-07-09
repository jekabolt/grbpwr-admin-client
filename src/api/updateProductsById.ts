import { adminService } from './admin';
import {
  UpdateProductRequest,
  UpdateProductResponse,
  UpdateProductSizeStockRequest,
  UpdateProductSizeStockResponse
} from './proto-http/admin';


export function updateProductById(request: UpdateProductRequest): Promise<UpdateProductResponse> {
  return adminService.UpdateProduct(request)
}

export function updateSize(
  request: UpdateProductSizeStockRequest,
): Promise<UpdateProductSizeStockResponse> {
  return adminService.UpdateProductSizeStock(request);
}


