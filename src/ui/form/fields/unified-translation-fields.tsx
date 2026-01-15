import { LANGUAGES } from 'constants/constants';
import { cn } from 'lib/utility';
import { useEffect, useState } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import Text from 'ui/components/text';

type FieldConfig = {
  name: string;
  label: string;
  type?: 'input' | 'textarea';
  placeholder?: string;
  rows?: number;
};

type Props = {
  fieldPrefix: string;
  fields: FieldConfig[];
  editMode?: boolean;
};

export function UnifiedTranslationFields({ fieldPrefix, fields, editMode = true }: Props) {
  const { control, watch, setValue } = useFormContext();
  const { replace } = useFieldArray({
    control,
    name: fieldPrefix,
  });

  const translations = watch(fieldPrefix) || [];
  const [selectedLanguageId, setSelectedLanguageId] = useState<number>(LANGUAGES[0].id);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  const selectedLanguage = LANGUAGES.find((lang) => lang.id === selectedLanguageId);
  const translationIndex = translations.findIndex((t: any) => t?.languageId === selectedLanguageId);
  const actualTranslationIndex = translationIndex >= 0 ? translationIndex : translations.length;

  // Initialize translations if empty
  useEffect(() => {
    if (translations.length === 0) {
      const initialTranslations = LANGUAGES.map((language) => {
        const translation: any = { languageId: language.id };
        fields.forEach((field) => {
          translation[field.name] = '';
        });
        return translation;
      });
      replace(initialTranslations);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translations.length, replace]);

  // Add missing translation for selected language
  useEffect(() => {
    if (translationIndex < 0 && translations.length > 0) {
      const newTranslation: any = { languageId: selectedLanguageId };
      fields.forEach((field) => {
        newTranslation[field.name] = '';
      });
      const newTranslations = [...translations, newTranslation];
      replace(newTranslations);
    } else if (translationIndex >= 0) {
      setValue(`${fieldPrefix}.${translationIndex}.languageId`, selectedLanguageId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLanguageId, translationIndex, translations.length, replace, setValue, fieldPrefix]);

  // Load field values when language changes
  useEffect(() => {
    const newValues: Record<string, string> = {};
    fields.forEach((field) => {
      const fieldPath = `${fieldPrefix}.${actualTranslationIndex}.${field.name}`;
      newValues[field.name] = watch(fieldPath) || '';
    });
    setFieldValues(newValues);
  }, [selectedLanguageId, actualTranslationIndex, fields, fieldPrefix, watch]);

  const handleLanguageChange = (e: React.MouseEvent<HTMLButtonElement>, languageId: number) => {
    e.preventDefault();

    // Save current values before switching
    fields.forEach((field) => {
      const fieldPath = `${fieldPrefix}.${actualTranslationIndex}.${field.name}`;
      const currentValue = fieldValues[field.name];
      if (currentValue !== undefined) {
        setValue(fieldPath, currentValue);
      }
    });

    setSelectedLanguageId(languageId);
  };

  const handleFieldChange = (fieldName: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [fieldName]: value }));
    const fieldPath = `${fieldPrefix}.${actualTranslationIndex}.${fieldName}`;
    setValue(fieldPath, value);
  };

  const isLanguageFilled = (languageId: number) => {
    const index = translations.findIndex((t: any) => t?.languageId === languageId);
    if (index < 0) return false;

    return fields.some((field) => {
      const value = watch(`${fieldPrefix}.${index}.${field.name}`);
      return value && value.trim().length > 0;
    });
  };

  return (
    <div className='space-y-3'>
      <div className='flex justify-between flex-wrap gap-2'>
        {LANGUAGES.map((language) => {
          const isFilled = isLanguageFilled(language.id);
          const isSelected = language.id === selectedLanguageId;
          return (
            <Button
              key={language.id}
              variant='simple'
              size='lg'
              type='button'
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

      <div className='space-y-4'>
        {fields.map((field) => {
          const fieldValue = fieldValues[field.name] || '';
          const placeholder =
            field.placeholder || `enter ${field.label.toLowerCase()} in ${selectedLanguage?.name}`;

          if (field.type === 'textarea') {
            return (
              <div key={field.name} className='space-y-2'>
                <label className='text-sm font-medium'>{field.label}</label>
                <textarea
                  value={fieldValue}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    handleFieldChange(field.name, e.target.value)
                  }
                  placeholder={placeholder}
                  className='w-full border border-text leading-4 bg-transparent resize-none min-h-[100px] focus:outline-none p-2'
                  rows={field.rows || 4}
                  readOnly={!editMode}
                />
              </div>
            );
          }

          return (
            <div key={field.name} className='space-y-2'>
              <Text component='label'>{field.label}</Text>
              <div className='border-b border-textColor'>
                <Input
                  value={fieldValue}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleFieldChange(field.name, e.target.value)
                  }
                  placeholder={placeholder}
                  className='w-full border-none leading-4 bg-transparent'
                  readOnly={!editMode}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
