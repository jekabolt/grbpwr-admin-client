import { common_Dictionary } from 'api/proto-http/admin';
import { common_OrderFull } from 'api/proto-http/frontend';

export interface OrderDetailsState {
  orderDetails: common_OrderFull | undefined;
  dictionary?: common_Dictionary | undefined;
  orderStatus: string | undefined;
  isLoading: boolean;
}

export interface OrderDescriptionProps {
  orderDetails: common_OrderFull | undefined;
  orderStatus: string | undefined;
  isPrinting: boolean;
}

export interface DisplayState {
  page: number;
  pageSize: number;
  columnVisibility: {
    thumbnail: boolean;
    size: boolean;
  };
}
