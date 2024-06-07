import { adminService } from './admin';
import {
  AddPromoRequest,
  AddPromoResponse,
  DeletePromoCodeRequest,
  DeletePromoCodeResponse,
  DisablePromoCodeRequest,
  DisablePromoCodeResponse,
  ListPromosRequest,
  ListPromosResponse,
} from './proto-http/admin';

export function addPromo(request: AddPromoRequest): Promise<AddPromoResponse> {
  return adminService.AddPromo(request);
}

export function getPromo(request: ListPromosRequest): Promise<ListPromosResponse> {
  return adminService.ListPromos(request);
}

export function deletePromo(request: DeletePromoCodeRequest): Promise<DeletePromoCodeResponse> {
  return adminService.DeletePromoCode(request)
}

export function disablePromo(request: DisablePromoCodeRequest): Promise<DisablePromoCodeResponse> {
  return adminService.DisablePromoCode(request)
}


