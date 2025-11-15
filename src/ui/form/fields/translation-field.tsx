import { LANGUAGES } from 'constants/constants';
import { useEffect, useState } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import Text from 'ui/components/text';

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

  const handleLanguageChange = (languageId: number) => {
    if (currentInputValue.trim()) {
      setValue(fieldNameWithIndex, currentInputValue);
    }

    setSelectedLanguageId(languageId);

    const newTranslationIndex = translations.findIndex((t: any) => t?.languageId === languageId);
    const newFieldName = `${fieldPrefix}.${newTranslationIndex >= 0 ? newTranslationIndex : translations.length}.${fieldName}`;
    const newValue = watch(newFieldName) || '';
    setCurrentInputValue(newValue);
  };

  const handleSave = () => {
    if (currentInputValue.trim()) {
      setValue(fieldNameWithIndex, currentInputValue);
      setCurrentInputValue('');
    }
  };

  const handleInputChange = (value: string) => {
    setCurrentInputValue(value);
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

      <div className='flex gap-2 flex-wrap'>
        {LANGUAGES.map((language) => {
          const isFilled = isLanguageFilled(language.id);
          const isSelected = language.id === selectedLanguageId;
          return (
            <Button
              key={language.id}
              type='button'
              variant={isSelected ? 'default' : 'default'}
              onClick={() => handleLanguageChange(language.id)}
              className={isFilled && !isSelected ? 'border-2 border-green-500' : ''}
            >
              {language.code.toUpperCase()}
            </Button>
          );
        })}
      </div>

      <div className='flex items-end w-full gap-2'>
        <div className='flex-1 border-b border-textColor'>
          <Input
            name={fieldNameWithIndex}
            value={currentInputValue || currentFormValue}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange(e.target.value)}
            placeholder={`enter ${label.toLowerCase()} in ${selectedLanguage?.name}`}
            className='w-full border-none leading-4 bg-transparent'
          />
        </div>
        <Button
          type='button'
          size='lg'
          onClick={handleSave}
          disabled={!currentInputValue.trim()}
          className='flex-shrink-0 bg-transparent'
        >
          save
        </Button>
      </div>
    </div>
  );
}
