import { adminService } from './admin';
import {
  GetOrdersByStatusRequest,
  GetOrdersByStatusResponse,
  GetOrderByIdRequest,
  GetOrderByIdResponse,
  GetOrdersByEmailRequest,
  GetOrdersByEmailResponse,
} from './proto-http/admin';

export function ordersByStatus(
  request: GetOrdersByStatusRequest,
): Promise<GetOrdersByStatusResponse> {
  return adminService.GetOrdersByStatus(request);
}

export function orderById(request: GetOrderByIdRequest): Promise<GetOrderByIdResponse> {
  return adminService.GetOrderById(request);
}

export function orderByEmail(request: GetOrdersByEmailRequest): Promise<GetOrdersByEmailResponse> {
  return adminService.GetOrdersByEmail(request);
}
