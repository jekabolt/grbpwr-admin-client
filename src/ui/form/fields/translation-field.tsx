import { LANGUAGES } from 'constants/constants';
import { useEffect, useState } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { LanguageButtons } from '../../components/language-buttons';

type Props = {
  label: string;
  fieldPrefix: string;
  fieldName: string;
};

export function TranslationField({ label, fieldPrefix, fieldName }: Props) {
  const { control, watch, setValue } = useFormContext();
  const { replace } = useFieldArray({
    control,
    name: fieldPrefix,
  });

  const translations = watch(fieldPrefix) || [];
  const [selectedLanguageId, setSelectedLanguageId] = useState<number>(LANGUAGES[0].id);
  const [currentInputValue, setCurrentInputValue] = useState<string>('');

  const selectedLanguage = LANGUAGES.find((lang) => lang.id === selectedLanguageId);

  const translationIndex = translations.findIndex((t: any) => t?.languageId === selectedLanguageId);

  const actualTranslationIndex = translationIndex >= 0 ? translationIndex : translations.length;

  const fieldNameWithIndex = `${fieldPrefix}.${actualTranslationIndex}.${fieldName}`;

  const currentFormValue = watch(fieldNameWithIndex) || '';

  useEffect(() => {
    if (translations.length === 0) {
      const initialTranslations = LANGUAGES.map((language) => ({
        languageId: language.id,
        [fieldName]: '',
      }));
      replace(initialTranslations);
    }
  }, [translations.length, replace, fieldName]);

  useEffect(() => {
    if (translationIndex < 0 && translations.length > 0) {
      const newTranslations = [...translations];
      newTranslations.push({
        languageId: selectedLanguageId,
        [fieldName]: '',
      });
      replace(newTranslations);
    } else if (translationIndex >= 0) {
      setValue(`${fieldPrefix}.${translationIndex}.languageId`, selectedLanguageId);
    }
  }, [selectedLanguageId, translationIndex]);

  useEffect(() => {
    if (!currentInputValue) {
      setCurrentInputValue(currentFormValue);
    }
  }, [currentFormValue]);

  const handleLanguageChange = (e: React.MouseEvent<HTMLButtonElement>, languageId: number) => {
    e.preventDefault();

    // Save current value before switching languages
    if (currentInputValue !== undefined) {
      setValue(fieldNameWithIndex, currentInputValue);
    }

    setSelectedLanguageId(languageId);

    const newTranslationIndex = translations.findIndex((t: any) => t?.languageId === languageId);
    const newFieldName = `${fieldPrefix}.${newTranslationIndex >= 0 ? newTranslationIndex : translations.length}.${fieldName}`;
    const newValue = watch(newFieldName) || '';
    setCurrentInputValue(newValue);
  };

  const handleInputChange = (value: string) => {
    setCurrentInputValue(value);
    // Save to form immediately
    setValue(fieldNameWithIndex, value);
  };

  const handleBlur = () => {
    // Ensure value is saved on blur
    if (currentInputValue !== undefined) {
      setValue(fieldNameWithIndex, currentInputValue);
    }
  };

  const isLanguageFilled = (languageId: number) => {
    const index = translations.findIndex((t: any) => t?.languageId === languageId);
    if (index < 0) return false;
    const value = watch(`${fieldPrefix}.${index}.${fieldName}`);
    return value && value.trim().length > 0;
  };

  return (
    <div className='space-y-3'>
      <Text>{label}</Text>

      <LanguageButtons
        selectedLanguageId={selectedLanguageId}
        isLanguageFilled={isLanguageFilled}
        onLanguageChange={handleLanguageChange}
        showRedBorderForUnfilled={true}
      />

      <div className='border-b border-textColor'>
        <Input
          name={fieldNameWithIndex}
          value={currentInputValue || currentFormValue}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange(e.target.value)}
          onBlur={handleBlur}
          placeholder={`enter ${label.toLowerCase()} in ${selectedLanguage?.name}`}
          className='w-full border-none leading-4 bg-transparent'
        />
      </div>
    </div>
  );
}
