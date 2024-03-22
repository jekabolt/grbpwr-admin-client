import { useState } from "react";

interface ProductDataDetails {
    [key: string]: string | undefined;
}

interface ChangeProductDetailsHook {
    inputValues: ProductDataDetails;
    handleInputChange: (event: React.ChangeEvent<HTMLTextAreaElement> | React.ChangeEvent<HTMLInputElement>) => void;
    changedFields: Set<string>;
    resetChangedFields: () => void;
}

export const useChangeProductDetails = (initialValues: ProductDataDetails): ChangeProductDetailsHook => {
    const [inputValues, setInputValues] = useState<ProductDataDetails>(initialValues);
    const [changedFields, setChangedFields] = useState<Set<string>>(new Set());

    const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement> | React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = event.target;
        setInputValues(prevState => ({
            ...prevState,
            [name]: value,
        }));
        setChangedFields(prevFields => new Set(prevFields).add(name));
    };

    const resetChangedFields = () => setChangedFields(new Set());

    return { inputValues, handleInputChange, changedFields, resetChangedFields };
};
