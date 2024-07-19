import { common_Dictionary, common_ProductFull, common_ProductNew } from "api/proto-http/admin";

export interface Country {
    value: string;
    label: string;
}

export interface GenericProductFormInterface {
    initialProductState: common_ProductNew;
    isEditMode?: boolean;
    isAddingProduct?: boolean;
    productId?: string;
    dictionary?: common_Dictionary;
    onSubmit: (
        values: common_ProductNew,
        actions: { setSubmitting: (isSubmitting: boolean) => void; resetForm: () => void },
    ) => Promise<void>;
    onEditModeChange?: (isEditMode: boolean) => void;
}

export interface BasicProductFieldsInterface {
    dictionary?: common_Dictionary;
    product?: common_ProductFull;
    isEditMode?: boolean;
    isAddingProduct: boolean;
}

export interface MediaViewInterface {
    clearMediaPreview?: boolean;
    isEditMode?: boolean;
    isAddingProduct: boolean;
    product?: common_ProductFull;
}

export interface ProductSizesAndMeasurementsInterface {
    isEditMode?: boolean;
    dictionary?: common_Dictionary;
    isAddingProduct: boolean;
}

export interface ProductTagsInterface {
    isEditMode?: boolean;
    isAddingProduct: boolean;
    initialTags?: string[];
}