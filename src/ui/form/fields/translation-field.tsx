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
  const {
    control,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext();
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

  useEffect(() => {
    if (translations.length === 0) {
      const initialTranslations = LANGUAGES.map((language) => ({
        languageId: language.id,
        [fieldName]: '',
      }));
      replace(initialTranslations);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translations.length, replace]);

  useEffect(() => {
    if (translationIndex < 0 && translations.length > 0) {
      const newTranslation = {
        languageId: selectedLanguageId,
        [fieldName]: '',
      };
      const newTranslations = [...translations, newTranslation];
      replace(newTranslations);
    } else if (translationIndex >= 0) {
      setValue(`${fieldPrefix}.${translationIndex}.languageId`, selectedLanguageId, {
        shouldDirty: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLanguageId, translationIndex, translations.length, replace, setValue, fieldPrefix]);

  useEffect(() => {
    const fieldPath = `${fieldPrefix}.${actualTranslationIndex}.${fieldName}`;
    const newValue = watch(fieldPath) || '';
    setCurrentInputValue(newValue);
  }, [selectedLanguageId, actualTranslationIndex, fieldPrefix, fieldName, watch]);

  useEffect(() => {
    const pathParts = fieldPrefix.split('.');
    let node: any = errors;

    for (const part of pathParts) {
      node = node?.[part];
      if (!node) return;
    }

    if (!Array.isArray(node) || !node.length || !translations.length) return;

    const idx = node.findIndex((item: any) => item && item[fieldName]);

    const langId = translations[idx]?.languageId;
    if (idx !== -1 && typeof langId === 'number') {
      setSelectedLanguageId(langId);
    }
  }, [errors, fieldPrefix, fieldName, translations]);

  const handleLanguageChange = (e: React.MouseEvent<HTMLButtonElement>, languageId: number) => {
    e.preventDefault();

    // Save current value before switching languages
    if (currentInputValue !== undefined) {
      setValue(fieldNameWithIndex, currentInputValue, { shouldDirty: true });
    }

    setSelectedLanguageId(languageId);
  };

  const handleInputChange = (value: string) => {
    setCurrentInputValue(value);
    setValue(fieldNameWithIndex, value, { shouldDirty: true });
  };

  const handleBlur = () => {
    if (currentInputValue !== undefined) {
      setValue(fieldNameWithIndex, currentInputValue, { shouldDirty: true });
    }
  };

  const isLanguageFilled = (languageId: number) => {
    const index = translations.findIndex((t: any) => t?.languageId === languageId);
    if (index < 0) return false;
    const value = watch(`${fieldPrefix}.${index}.${fieldName}`);
    return value && value.trim().length > 0;
  };

  const getFieldError = () => {
    const fieldPath = `${fieldPrefix}.${actualTranslationIndex}.${fieldName}`;
    const pathParts = fieldPath.split('.');
    let error: any = errors;

    for (const part of pathParts) {
      if (!error) return null;
      error = error[part];
    }

    return error?.message;
  };

  const errorMessage = getFieldError();

  return (
    <div className='space-y-3'>
      <Text>{label}</Text>

      <LanguageButtons
        selectedLanguageId={selectedLanguageId}
        isLanguageFilled={isLanguageFilled}
        onLanguageChange={handleLanguageChange}
        showRedBorderForUnfilled={true}
      />

      <div className={`border-b ${errorMessage ? 'border-red-500' : 'border-textColor'}`}>
        <Input
          name={fieldNameWithIndex}
          value={currentInputValue}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange(e.target.value)}
          onBlur={handleBlur}
          placeholder={`enter ${label.toLowerCase()} in ${selectedLanguage?.name}`}
          className='w-full border-none leading-4 bg-transparent'
        />
      </div>

      {errorMessage && <Text className='text-red-500'>{errorMessage}</Text>}
    </div>
  );
}
