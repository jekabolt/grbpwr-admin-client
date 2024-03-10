import { adminService } from './admin';
import {
  SetShipmentCarrierAllowanceRequest,
  SetShipmentCarrierAllowanceResponse,
  SetPaymentMethodAllowanceRequest,
  SetPaymentMethodAllowanceResponse,
  SetShipmentCarrierPriceRequest,
  SetShipmentCarrierPriceResponse,
  SetSiteAvailabilityRequest,
  SetSiteAvailabilityResponse,
  SetMaxOrderItemsRequest,
} from './proto-http/admin';

export function setShipmentCarrier(
  request: SetShipmentCarrierAllowanceRequest,
): Promise<SetShipmentCarrierAllowanceResponse> {
  return adminService.SetShipmentCarrierAllowance(request);
}

export function setPaymentMethod(
  request: SetPaymentMethodAllowanceRequest,
): Promise<SetPaymentMethodAllowanceResponse> {
  return adminService.SetPaymentMethodAllowance(request);
}

export function setShipmentCarrierPrice(
  request: SetShipmentCarrierPriceRequest,
): Promise<SetShipmentCarrierPriceResponse> {
  return adminService.SetShipmentCarrierPrice(request);
}

export function setSiteAvailability(
  request: SetSiteAvailabilityRequest,
): Promise<SetSiteAvailabilityResponse> {
  return adminService.SetSiteAvailability(request);
}

export function setMaxOrderItems(
  request: SetMaxOrderItemsRequest,
): Promise<SetSiteAvailabilityResponse> {
  return adminService.SetMaxOrderItems(request);
}
