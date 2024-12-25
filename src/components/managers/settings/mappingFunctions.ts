import { PaymentMethodAllowance, ShipmentCarrierAllowancePrice } from "api/proto-http/admin";
import { useDictionaryStore } from "lib/stores/store";

export function useShipmentCarriersMapping(): ShipmentCarrierAllowancePrice[] {
    const { dictionary } = useDictionaryStore();

    return (
        dictionary?.shipmentCarriers?.map((carrier) => ({
            carrier: carrier.shipmentCarrier?.carrier,
            allow: carrier.shipmentCarrier?.allowed,
            price: carrier.shipmentCarrier?.price
                ? { value: carrier.shipmentCarrier.price.value }
                : undefined,
            description: carrier.shipmentCarrier?.description
        })) || []
    );
}

export function usePaymentMethodsMapping(): PaymentMethodAllowance[] {
    const { dictionary } = useDictionaryStore();

    return (
        dictionary?.paymentMethods?.map((payment) => ({
            paymentMethod: payment.name,
            allow: payment.allowed,
        })) || []
    );
}