import { adminService } from './admin';
import { UpdateProductSizeStockRequest, UpdateProductSizeStockResponse } from './proto-http/admin';

export function updateSize(
  request: UpdateProductSizeStockRequest,
): Promise<UpdateProductSizeStockResponse> {
  return adminService.UpdateProductSizeStock(request);
}
