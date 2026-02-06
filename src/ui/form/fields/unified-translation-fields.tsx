import { LANGUAGES } from 'constants/constants';
import { useEffect, useState } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { LanguageButtons } from '../../components/language-buttons';

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
      setValue(`${fieldPrefix}.${translationIndex}.languageId`, selectedLanguageId, {
        shouldDirty: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLanguageId, translationIndex, translations.length, replace, setValue, fieldPrefix]);

  useEffect(() => {
    const pathParts = fieldPrefix.split('.');
    let node: any = errors;

    for (const part of pathParts) {
      node = node?.[part];
      if (!node) return;
    }

    if (!Array.isArray(node) || !node.length || !translations.length) return;

    const idx = node.findIndex((item: any) => item && fields.some((f) => item[f.name]));

    const langId = translations[idx]?.languageId;
    if (idx !== -1 && typeof langId === 'number') {
      setSelectedLanguageId(langId);
    }
  }, [errors, fieldPrefix, fields, translations]);

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

    fields.forEach((field) => {
      const fieldPath = `${fieldPrefix}.${actualTranslationIndex}.${field.name}`;
      const currentValue = fieldValues[field.name];
      if (currentValue !== undefined) {
        setValue(fieldPath, currentValue, { shouldDirty: true });
      }
    });

    setSelectedLanguageId(languageId);
  };

  const handleFieldChange = (fieldName: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [fieldName]: value }));
    const fieldPath = `${fieldPrefix}.${actualTranslationIndex}.${fieldName}`;
    setValue(fieldPath, value, { shouldDirty: true });
  };

  const isLanguageFilled = (languageId: number) => {
    const index = translations.findIndex((t: any) => t?.languageId === languageId);
    if (index < 0) return false;

    return fields.some((field) => {
      const value = watch(`${fieldPrefix}.${index}.${field.name}`);
      return value && value.trim().length > 0;
    });
  };

  const getFieldError = (fieldName: string) => {
    const fieldPath = `${fieldPrefix}.${actualTranslationIndex}.${fieldName}`;
    const pathParts = fieldPath.split('.');
    let error: any = errors;

    for (const part of pathParts) {
      if (!error) return null;
      error = error[part];
    }

    return error?.message;
  };

  return (
    <div className='space-y-3'>
      <LanguageButtons
        selectedLanguageId={selectedLanguageId}
        isLanguageFilled={isLanguageFilled}
        onLanguageChange={handleLanguageChange}
      />

      <div className='space-y-4'>
        {fields.map((field) => {
          const fieldValue = fieldValues[field.name] || '';
          const placeholder =
            field.placeholder || `enter ${field.label.toLowerCase()} in ${selectedLanguage?.name}`;
          const errorMessage = getFieldError(field.name);

          if (field.type === 'textarea') {
            return (
              <div key={field.name} className='space-y-2'>
                <Text component='label'>{field.label}</Text>
                <textarea
                  value={fieldValue}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    handleFieldChange(field.name, e.target.value)
                  }
                  placeholder={placeholder}
                  className={`w-full border ${errorMessage ? 'border-red-500' : 'border-text'} leading-4 bg-transparent resize-none min-h-[100px] focus:outline-none p-2`}
                  rows={field.rows || 4}
                  readOnly={!editMode}
                />
                {errorMessage && <p className='text-sm font-medium text-red-500'>{errorMessage}</p>}
              </div>
            );
          }

          return (
            <div key={field.name} className='space-y-2'>
              <Text component='label'>{field.label}</Text>
              <div className={`border-b ${errorMessage ? 'border-red-500' : 'border-textColor'}`}>
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
              {errorMessage && <p className='text-sm font-medium text-red-500'>{errorMessage}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
