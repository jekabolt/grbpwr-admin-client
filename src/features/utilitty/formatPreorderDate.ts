import { days } from "constants/dayNumbers";

export function formatPreorderDate(newDate: string | undefined) {
    if (!newDate) return '';

    const date = new Date(newDate);
    const day = date.getDate();
    const dayAlphabet = days[day - 1];
    const month = date.toLocaleString('default', { month: 'long' });
    const year = date.getFullYear();

    return `Item will be available by the ${dayAlphabet} of ${month} ${year}.`;
}



