import { common_Dictionary, common_ProductFull, common_ProductNew } from "api/proto-http/admin";

export interface Country {
    value: string;
    label: string;
}

export interface GenericProductFormInterface {
    product?: common_ProductFull | undefined;
    initialProductState: common_ProductNew;
    isEditMode?: boolean;
    isAddingProduct?: boolean;
    isCopyMode: boolean;
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
    isCopyMode: boolean;
}

export interface MediaViewInterface {
    clearMediaPreview?: boolean;
    isEditMode?: boolean;
    isAddingProduct: boolean;
    product?: common_ProductFull;
    isCopyMode: boolean;
}

export interface ProductSizesAndMeasurementsInterface {
    isEditMode?: boolean;
    dictionary?: common_Dictionary;
    isAddingProduct: boolean;
}

export interface ProductTagsInterface {
    isEditMode?: boolean;
    isAddingProduct: boolean;
    isCopyMode: boolean;
}