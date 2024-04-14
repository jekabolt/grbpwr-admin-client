import { adminService } from './admin';
import {
  DeliveredOrderRequest,
  DeliveredOrderResponse,
  GetOrderByIdRequest,
  GetOrderByIdResponse,
  ListOrdersRequest,
  ListOrdersResponse,
  RefundOrderRequest,
  RefundOrderResponse,
  SetTrackingNumberRequest,
  SetTrackingNumberResponse,
} from './proto-http/admin';

export function getOrdersList(request: ListOrdersRequest): Promise<ListOrdersResponse> {
  return adminService.ListOrders(request);
}

export function getOrderById(request: GetOrderByIdRequest): Promise<GetOrderByIdResponse> {
  return adminService.GetOrderById(request);
}

export function setTrackingNumberUpdate(
  request: SetTrackingNumberRequest,
): Promise<SetTrackingNumberResponse> {
  return adminService.SetTrackingNumber(request);
}

export function deliveredOrderUpdate(
  request: DeliveredOrderRequest,
): Promise<DeliveredOrderResponse> {
  return adminService.DeliveredOrder(request);
}

export function refundOrderUpdate(request: RefundOrderRequest): Promise<RefundOrderResponse> {
  return adminService.RefundOrder(request);
}
