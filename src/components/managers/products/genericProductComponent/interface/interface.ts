import { common_ProductNew } from "api/proto-http/admin";

export interface GenericProductComponentInterface {
    initialFormValues: common_ProductNew;
    isEditMode?: boolean;
    productId?: string;
}