import { UpdateSettingsRequest } from "api/proto-http/admin"

export const defaultSettingsStates: UpdateSettingsRequest = {
    shipmentCarriers: undefined,
    paymentMethods: undefined,
    siteAvailable: undefined,
    maxOrderItems: undefined
}