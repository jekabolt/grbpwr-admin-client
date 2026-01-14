import { LANGUAGES } from 'constants/constants';
import { cn } from 'lib/utility';
import { useEffect, useState } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';

type Props = {
  fieldPrefix: string;
  nameLabel?: string;
  descriptionLabel?: string;
  editMode: boolean;
};

export function UnifiedTranslationFields({
  fieldPrefix,
  nameLabel = 'name',
  descriptionLabel = 'description',
  editMode,
}: Props) {
  const { control, watch, setValue } = useFormContext();
  const { replace } = useFieldArray({
    control,
    name: fieldPrefix,
  });

  const translations = watch(fieldPrefix) || [];
  const [selectedLanguageId, setSelectedLanguageId] = useState<number>(LANGUAGES[0].id);
  const [currentNameValue, setCurrentNameValue] = useState<string>('');
  const [currentDescriptionValue, setCurrentDescriptionValue] = useState<string>('');

  const selectedLanguage = LANGUAGES.find((lang) => lang.id === selectedLanguageId);
  const translationIndex = translations.findIndex((t: any) => t?.languageId === selectedLanguageId);
  const actualTranslationIndex = translationIndex >= 0 ? translationIndex : translations.length;
  const nameFieldWithIndex = `${fieldPrefix}.${actualTranslationIndex}.name`;
  const descriptionFieldWithIndex = `${fieldPrefix}.${actualTranslationIndex}.description`;
  const currentNameFormValue = watch(nameFieldWithIndex) || '';
  const currentDescriptionFormValue = watch(descriptionFieldWithIndex) || '';

  useEffect(() => {
    if (translations.length === 0) {
      const initialTranslations = LANGUAGES.map((language) => ({
        languageId: language.id,
        name: '',
        description: '',
      }));
      replace(initialTranslations);
    }
  }, [translations.length, replace]);

  useEffect(() => {
    if (translationIndex < 0 && translations.length > 0) {
      const newTranslations = [...translations];
      newTranslations.push({
        languageId: selectedLanguageId,
        name: '',
        description: '',
      });
      replace(newTranslations);
    } else if (translationIndex >= 0) {
      setValue(`${fieldPrefix}.${translationIndex}.languageId`, selectedLanguageId);
    }
  }, [selectedLanguageId, translationIndex]);

  useEffect(() => {
    if (!currentNameValue) {
      setCurrentNameValue(currentNameFormValue);
    }
  }, [currentNameFormValue]);

  useEffect(() => {
    if (!currentDescriptionValue) {
      setCurrentDescriptionValue(currentDescriptionFormValue);
    }
  }, [currentDescriptionFormValue]);

  const handleLanguageChange = (e: React.MouseEvent<HTMLButtonElement>, languageId: number) => {
    e.preventDefault();

    if (currentNameValue.trim() || currentNameValue !== currentNameFormValue) {
      setValue(nameFieldWithIndex, currentNameValue);
    }
    if (currentDescriptionValue.trim() || currentDescriptionValue !== currentDescriptionFormValue) {
      setValue(descriptionFieldWithIndex, currentDescriptionValue);
    }

    setSelectedLanguageId(languageId);

    const newTranslationIndex = translations.findIndex((t: any) => t?.languageId === languageId);
    const newNameField = `${fieldPrefix}.${newTranslationIndex >= 0 ? newTranslationIndex : translations.length}.name`;
    const newDescriptionField = `${fieldPrefix}.${newTranslationIndex >= 0 ? newTranslationIndex : translations.length}.description`;
    const newNameValue = watch(newNameField) || '';
    const newDescriptionValue = watch(newDescriptionField) || '';
    setCurrentNameValue(newNameValue);
    setCurrentDescriptionValue(newDescriptionValue);
  };

  const handleNameChange = (value: string) => {
    setCurrentNameValue(value);
    setValue(nameFieldWithIndex, value);
  };

  const handleDescriptionChange = (value: string) => {
    setCurrentDescriptionValue(value);
    setValue(descriptionFieldWithIndex, value);
  };

  const isLanguageFilled = (languageId: number) => {
    const index = translations.findIndex((t: any) => t?.languageId === languageId);
    if (index < 0) return false;
    const nameValue = watch(`${fieldPrefix}.${index}.name`);
    const descriptionValue = watch(`${fieldPrefix}.${index}.description`);
    return (
      (nameValue && nameValue.trim().length > 0) ||
      (descriptionValue && descriptionValue.trim().length > 0)
    );
  };

  return (
    <div className='space-y-3'>
      <div className='flex justify-between flex-wrap'>
        {LANGUAGES.map((language) => {
          const isFilled = isLanguageFilled(language.id);
          const isSelected = language.id === selectedLanguageId;
          return (
            <Button
              key={language.id}
              variant='simple'
              size='lg'
              onClick={(e: React.MouseEvent<HTMLButtonElement>) =>
                handleLanguageChange(e, language.id)
              }
              className={cn(
                'border border-text bg-bgColor text-text hover:bg-text hover:text-bgColor',
                {
                  'bg-text text-bgColor': isSelected,
                  'border-green-500 bg-bgColor text-text': isFilled && !isSelected,
                },
              )}
            >
              {language.code.toUpperCase()}
            </Button>
          );
        })}
      </div>

      <div className='space-y-2'>
        <div className='border-b border-textColor'>
          <Input
            name={nameFieldWithIndex}
            value={currentNameValue || currentNameFormValue}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleNameChange(e.target.value)}
            placeholder={`enter ${nameLabel.toLowerCase()} in ${selectedLanguage?.name}`}
            className='w-full border-none leading-4 bg-transparent'
            readOnly={!editMode}
          />
        </div>
      </div>

      <div className='space-y-2'>
        <textarea
          name={descriptionFieldWithIndex}
          value={currentDescriptionValue || currentDescriptionFormValue}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
            handleDescriptionChange(e.target.value)
          }
          placeholder={`enter ${descriptionLabel.toLowerCase()} in ${selectedLanguage?.name}`}
          className='w-full border border-text leading-4 bg-transparent resize-none min-h-[100px] focus:outline-none p-2'
          rows={4}
          readOnly={!editMode}
        />
      </div>
    </div>
  );
}
