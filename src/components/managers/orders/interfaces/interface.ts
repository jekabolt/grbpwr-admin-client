import { MakeGenerics } from "@tanstack/react-location";
import { common_Dictionary, common_OrderStatusEnum, common_PaymentMethodNameEnum } from "api/proto-http/admin";
import { common_OrderFull } from "api/proto-http/frontend";

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

export type OrderDetailsPathProps = MakeGenerics<{
    Params: {
        uuid: string;
    };
}>;

export interface OrderDetailsState {
    orderDetails: common_OrderFull | undefined;
    dictionary?: common_Dictionary | undefined;
    orderStatus: string | undefined;
    isLoading: boolean;
}

export interface OrderDescriptionProps {
    orderDetails: common_OrderFull | undefined;
    orderStatus: string | undefined;
}

export interface DisplayState {
    showBilling: boolean;
    page: number;
    pageSize: number;
    columnVisibility: {
        thumbnail: boolean;
        size: boolean;
    };
}

export const STATUS = {
    confirmed: '#008f0080',
    denied: '#fc000080',
};