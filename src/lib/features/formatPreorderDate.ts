import { days } from 'constants/dayNumbers';

export function formatPreorderDate(newDate: string | undefined) {
  if (!newDate) return '';

  const date = new Date(newDate);
  const day = date.getDate();
  const dayAlphabet = days[day - 1];
  const month = date.toLocaleString('default', { month: 'long' });
  const year = date.getFullYear();

  return `Item will be available by the ${dayAlphabet} of ${month} ${year}.`;
}

type OrdinalMap = {
  [key: string]: string;
};

// Define the ordinalMap with explicit type
const ordinalMap: OrdinalMap = {
  first: '01',
  second: '02',
  third: '03',
  fourth: '04',
  fifth: '05',
  sixth: '06',
  seventh: '07',
  eighth: '08',
  ninth: '09',
  tenth: '10',
  eleventh: '11',
  twelfth: '12',
  thirteenth: '13',
  fourteenth: '14',
  fifteenth: '15',
  sixteenth: '16',
  seventeenth: '17',
  eighteenth: '18',
  nineteenth: '19',
  twentieth: '20',
  'twenty-first': '21',
  'twenty-second': '22',
  'twenty-third': '23',
  'twenty-fourth': '24',
  'twenty-fifth': '25',
  'twenty-sixth': '26',
  'twenty-seventh': '27',
  'twenty-eighth': '28',
  'twenty-ninth': '29',
  thirtieth: '30',
  'thirty-first': '31',
};

/**
 * Converts a formatted date string to a standard date format.
 * @param formattedString The input string in the format: "Item will be available by the thirty-first of May 2024."
 * @returns A string representing the date in "DD.MM.YYYY" format or an error message.
 */
export function convertFormattedStringToDate(formattedString: string | undefined): string {
  // Regex to extract the ordinal, month, and year
  const dateRegex = /the (.+?) of (\w+) (\d{4})/;
  const match = formattedString?.match(dateRegex);

  if (match) {
    const [, dayOrdinal, month, year] = match;

    // Map the ordinal word to a number using the map, and ensure it's valid
    const day = ordinalMap[dayOrdinal.toLowerCase() as keyof OrdinalMap];
    if (!day) {
      return 'Invalid day ordinal.';
    }

    // Convert month name to month number
    const monthNumber = new Date(`${month} 1, 2000`).getMonth() + 1;
    const monthStr = monthNumber < 10 ? `0${monthNumber}` : `${monthNumber}`;

    // Return the date in "yyyy-MM-dd" format
    return `${year}-${monthStr}-${day}`;
  } else {
    return 'Invalid date format.';
  }
}
