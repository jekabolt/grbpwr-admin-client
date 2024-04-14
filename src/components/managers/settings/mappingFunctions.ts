import { PaymentMethodAllowance, ShipmentCarrierAllowancePrice, common_PaymentMethod, common_PaymentMethodNameEnum, common_ShipmentCarrier } from "api/proto-http/admin";

export function mapShipmentCarriers(
    carriers: common_ShipmentCarrier[] | undefined,
): ShipmentCarrierAllowancePrice[] {
    return (
        carriers?.map((carrier) => ({
            carrier: carrier.shipmentCarrier?.carrier,
            allow: carrier.shipmentCarrier?.allowed,
            price: carrier.shipmentCarrier?.price
                ? { value: carrier.shipmentCarrier.price.value }
                : undefined,
        })) || []
    );
}

export function mapPaymentMethods(
    payments: common_PaymentMethod[] | undefined,
): PaymentMethodAllowance[] | undefined {
    return payments?.map((payment) => ({
        paymentMethod: payment.name
            ?.replace(/^PAYMENT_METHOD_NAME_ENUM_/, '')
            .replace(/^USDT_/, '') as common_PaymentMethodNameEnum,
        allow: payment.allowed,
    }));
}