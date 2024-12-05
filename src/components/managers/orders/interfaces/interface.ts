import { common_Dictionary, common_OrderStatusEnum, common_PaymentMethodNameEnum } from "api/proto-http/admin";

export interface SearchFilters {
    status: common_OrderStatusEnum | undefined;
    paymentMethod: common_PaymentMethodNameEnum | undefined;
    orderId: string | undefined;
    email: string | undefined;
}

export interface FilterProps {
    dictionary: common_Dictionary | undefined;
    loading: boolean;
    onSearch: (filters: SearchFilters) => void;
}
