import { adminService } from './admin';
import {
  AddPromoRequest,
  AddPromoResponse,
  ListPromosRequest,
  ListPromosResponse,
} from './proto-http/admin';

export function addPromo(request: AddPromoRequest): Promise<AddPromoResponse> {
  return adminService.AddPromo(request);
}

export function getPromo(request: ListPromosRequest): Promise<ListPromosResponse> {
  return adminService.ListPromos(request);
}
