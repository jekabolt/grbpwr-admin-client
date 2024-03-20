import { useState } from "react";

interface FormValues {
    [key: string]: string | undefined
}
export const useProductForm = (initialValues: FormValues) => {
    const [inputValues, setInputValues] = useState<FormValues>(initialValues);

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = event.target;
        setInputValues(prevValues => ({
            ...prevValues,
            [name]: value
        }));
    };

    return { inputValues, handleInputChange };
};
