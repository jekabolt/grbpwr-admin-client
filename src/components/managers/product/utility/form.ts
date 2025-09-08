
// import { productInitialValues } from "constants/product/initial-values";

// export const createProductPayload = (
//     values: common_ProductNew,
//     id: string | undefined,
//     isCopyMode: boolean,
// ): UpsertProductRequest => ({
//     id: isCopyMode ? undefined : id ? parseInt(id) : undefined,
//     product: {
//         ...values,
//         sizeMeasurements: getNonEmptySizeMeasurements(values),
//     } as common_ProductNew,
// });


// export const handleFormReset = (
//     id: string | undefined,
//     isCopyMode: boolean,
//     resetForm: () => void,
//     setInitialValues: (values: common_ProductNew) => void,
// ) => {
//     if (!id || (!isCopyMode && !id)) {
//         resetForm();
//         setInitialValues(productInitialValues());
//     }
// };