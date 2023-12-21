import { adminService } from './admin';
import {
  UpdateProductNameRequest,
  UpdateProductNameResponse,
  UpdateProductSKURequest,
  UpdateProductSKUResponse,
  UpdateProductPreorderRequest,
  UpdateProductPreorderResponse,
  UpdateProductColorAndColorHexRequest,
  UpdateProductColorAndColorHexResponse,
} from './proto-http/admin';

export function updateName(request: UpdateProductNameRequest): Promise<UpdateProductNameResponse> {
  return adminService.UpdateProductName(request);
}

export function updateSku(request: UpdateProductSKURequest): Promise<UpdateProductSKUResponse> {
  return adminService.UpdateProductSKU(request);
}

export function updatePreorder(
  request: UpdateProductPreorderRequest,
): Promise<UpdateProductPreorderResponse> {
  return adminService.UpdateProductPreorder(request);
}

export function updateColors(
  request: UpdateProductColorAndColorHexRequest,
): Promise<UpdateProductColorAndColorHexResponse> {
  return adminService.UpdateProductColorAndColorHex(request);
}
