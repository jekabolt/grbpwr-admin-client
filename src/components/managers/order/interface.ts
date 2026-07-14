import { common_Dictionary, common_OrderStripeDetails } from 'api/proto-http/admin';
import { common_OrderFull } from 'api/proto-http/frontend';

export interface OrderDetailsState {
  orderDetails: common_OrderFull | undefined;
  // Admin-only Stripe settlement metadata (EUR received, fee, FX, card, risk, dashboard link).
  // Arrives as a sibling of `order` on GetOrderByUUIDResponse; empty until Stripe captures.
  stripeDetails: common_OrderStripeDetails | undefined;
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
