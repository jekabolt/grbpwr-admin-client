import { LANGUAGES } from 'constants/constants';
import { useEffect, useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import Select from 'ui/components/select';
import Text from 'ui/components/text';

type Props = {
  label: string;
  fieldPrefix: string; // e.g., "product.translations"
  fieldName: string; // e.g., "name" or "description"
};

export function TranslationField({ label, fieldPrefix, fieldName }: Props) {
  const { setValue, watch } = useFormContext();
  const [selectedLanguageId, setSelectedLanguageId] = useState<number>(LANGUAGES[0].id);
  const [currentInputValue, setCurrentInputValue] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Find the selected language
  const selectedLanguage = LANGUAGES.find((lang) => lang.id === selectedLanguageId);

  // Get all translations from the form
  const allTranslations = watch(fieldPrefix) || [];

  // Find the index of the translation for the selected language
  const translationIndex = allTranslations.findIndex(
    (t: any) => t.languageId === selectedLanguageId,
  );

  // If translation doesn't exist for this language, create it
  const actualTranslationIndex = translationIndex >= 0 ? translationIndex : allTranslations.length;

  // Construct the field name with the actual translation index
  const fieldNameWithIndex = `${fieldPrefix}.${actualTranslationIndex}.${fieldName}`;

  // Get current value from form for the selected language
  const currentFormValue = watch(fieldNameWithIndex) || '';

  // Initialize the languageId for the current translation
  useEffect(() => {
    if (translationIndex < 0) {
      // Create new translation object for this language
      const newTranslations = [...allTranslations];
      newTranslations.push({
        languageId: selectedLanguageId,
        [fieldName]: '',
      });
      setValue(fieldPrefix, newTranslations);
    } else {
      // Ensure languageId is set for existing translation
      setValue(`${fieldPrefix}.${translationIndex}.languageId`, selectedLanguageId);
    }
  }, [setValue, fieldPrefix, translationIndex, selectedLanguageId, allTranslations, fieldName]);

  const handleLanguageChange = (languageIdString: string) => {
    // Save current input before switching
    if (currentInputValue.trim()) {
      setValue(fieldNameWithIndex, currentInputValue);
    }

    const languageId = parseInt(languageIdString, 10);
    setSelectedLanguageId(languageId);

    // Reset input value for new language
    setCurrentInputValue('');
  };

  const handleSaveCurrentInput = () => {
    if (currentInputValue.trim()) {
      setValue(fieldNameWithIndex, currentInputValue);
      setCurrentInputValue('');
    }
  };

  const handleInputChange = (value: string) => {
    setCurrentInputValue(value);
  };

  return (
    <div className='w-full'>
      <Text>{label}</Text>
      <div className='flex items-end w-full '>
        <div className='flex-shrink-0'>
          <Select
            name={`${fieldPrefix}.${actualTranslationIndex}.languageId`}
            value={selectedLanguageId.toString()}
            onValueChange={handleLanguageChange}
            items={LANGUAGES.map((language) => ({
              value: language.id.toString(),
              label: language.code,
            }))}
          />
        </div>
        <div className='border-b border-textColor flex items-end pl-4 w-full'>
          <div className='flex-1'>
            <Input
              name={fieldNameWithIndex}
              ref={inputRef}
              value={currentInputValue || currentFormValue}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                handleInputChange(e.target.value)
              }
              placeholder={`enter ${label.toLowerCase()} in ${selectedLanguage?.name}`}
              className='w-full border-none leading-4 bg-transparent'
            />
          </div>
          <Button
            size='lg'
            onClick={handleSaveCurrentInput}
            disabled={!currentInputValue.trim()}
            className='flex-shrink-0  ml-2 bg-transparent'
          >
            save
          </Button>
        </div>
      </div>
    </div>
  );
}
