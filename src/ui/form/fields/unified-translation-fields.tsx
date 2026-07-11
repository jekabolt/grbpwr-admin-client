import { LANGUAGES } from 'constants/constants';
import { useSnackBarStore } from 'lib/stores/store';
import { translateToAllLanguages } from 'lib/translate';
import { cn } from 'lib/utility';
import { useEffect, useRef, useState } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { LanguageButtons } from '../../components/language-buttons';

type FieldConfig = {
  name: string;
  label: string;
  type?: 'input' | 'textarea';
  placeholder?: string;
  rows?: number;
  /** Show a live character counter and flag overflow. */
  maxLength?: number;
  /** Whether this field counts toward "language complete". Defaults to true. */
  required?: boolean;
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

  const { showMessage } = useSnackBarStore();
  const translations = watch(fieldPrefix) || [];
  const [selectedLanguageId, setSelectedLanguageId] = useState<number>(LANGUAGES[0].id);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [isTranslating, setIsTranslating] = useState(false);

  const selectedLanguage = LANGUAGES.find((lang) => lang.id === selectedLanguageId);
  const translationIndex = translations.findIndex((t: any) => t?.languageId === selectedLanguageId);
  const actualTranslationIndex = translationIndex >= 0 ? translationIndex : translations.length;

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

  const lastErrorLangIdRef = useRef<number | null>(null);

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
      if (lastErrorLangIdRef.current !== langId) {
        lastErrorLangIdRef.current = langId;
        setSelectedLanguageId(langId);
      }
    } else {
      lastErrorLangIdRef.current = null;
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

  const requiredFields = fields.filter((f) => f.required !== false);

  const isLanguageComplete = (languageId: number) => {
    const index = translations.findIndex((t: any) => t?.languageId === languageId);
    if (index < 0) return false;
    return requiredFields.every((field) => {
      const value = watch(`${fieldPrefix}.${index}.${field.name}`);
      return value && value.trim().length > 0;
    });
  };

  const completedCount = LANGUAGES.filter((l) => isLanguageComplete(l.id)).length;
  const allComplete = completedCount === LANGUAGES.length;

  // Copy the language currently being edited into every other language.
  const handleCopyToAll = () => {
    const source: Record<string, string> = {};
    fields.forEach((field) => {
      source[field.name] =
        fieldValues[field.name] ??
        watch(`${fieldPrefix}.${actualTranslationIndex}.${field.name}`) ??
        '';
    });
    translations.forEach((t: any, i: number) => {
      if (t?.languageId === selectedLanguageId) return;
      fields.forEach((field) => {
        setValue(`${fieldPrefix}.${i}.${field.name}`, source[field.name], { shouldDirty: true });
      });
    });
  };

  // Translate the language currently being edited into every other language
  // using the model behind /api/translate (per-language, not a verbatim copy).
  const handleTranslateToAll = async () => {
    const fieldsToTranslate = fields.map((f) => ({
      name: f.name,
      value:
        fieldValues[f.name] ?? watch(`${fieldPrefix}.${actualTranslationIndex}.${f.name}`) ?? '',
      maxLength: f.maxLength,
    }));

    setIsTranslating(true);
    try {
      const translated = await translateToAllLanguages({
        sourceLanguageId: selectedLanguageId,
        fields: fieldsToTranslate,
      });

      translations.forEach((t: any, i: number) => {
        const result = translated[t?.languageId];
        if (!result) return;
        fields.forEach((field) => {
          const value = result[field.name];
          if (typeof value === 'string') {
            setValue(`${fieldPrefix}.${i}.${field.name}`, value, { shouldDirty: true });
          }
        });
      });

      showMessage('translated into all languages', 'success');
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'translation failed', 'error');
    } finally {
      setIsTranslating(false);
    }
  };

  const hasAnyValue = fields.some((f) => (fieldValues[f.name] || '').trim().length > 0);

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
    <div className='space-y-3 border border-textInactiveColor p-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex items-center gap-2'>
          <Text variant='uppercase'>translations</Text>
          <Text variant={allComplete ? 'default' : 'inactive'} size='small'>
            {completedCount}/{LANGUAGES.length} complete
          </Text>
        </div>
        {editMode && (
          <div className='flex items-center gap-2'>
            <Button
              type='button'
              variant='secondary'
              onClick={handleCopyToAll}
              disabled={!hasAnyValue || isTranslating}
              className='px-2 py-1'
            >
              copy {selectedLanguage?.code.toUpperCase()} → all
            </Button>
            <Button
              type='button'
              variant='main'
              onClick={handleTranslateToAll}
              disabled={!hasAnyValue || isTranslating}
              loading={isTranslating}
              className='px-2 py-1'
            >
              translate {selectedLanguage?.code.toUpperCase()} → all
            </Button>
          </div>
        )}
      </div>

      <LanguageButtons
        selectedLanguageId={selectedLanguageId}
        isLanguageFilled={isLanguageComplete}
        onLanguageChange={handleLanguageChange}
      />

      <div className='space-y-4 pt-1'>
        {fields.map((field) => {
          const fieldValue = fieldValues[field.name] || '';
          const placeholder =
            field.placeholder || `enter ${field.label.toLowerCase()} in ${selectedLanguage?.name}`;
          const errorMessage = getFieldError(field.name);
          const over = field.maxLength !== undefined && fieldValue.length > field.maxLength;

          const labelRow = (
            <div className='flex items-center justify-between'>
              <Text component='label' size='small' variant='label'>
                {field.label}
                {field.required === false ? '' : ' *'}
              </Text>
              {field.maxLength !== undefined && (
                <Text size='small' className={cn({ 'text-error': over })}>
                  {fieldValue.length}/{field.maxLength}
                </Text>
              )}
            </div>
          );

          if (field.type === 'textarea') {
            return (
              <div key={field.name} className='space-y-1'>
                {labelRow}
                <textarea
                  value={fieldValue}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    handleFieldChange(field.name, e.target.value)
                  }
                  placeholder={placeholder}
                  className={cn(
                    'w-full border leading-4 bg-transparent resize-none min-h-[100px] focus:outline-none p-2',
                    errorMessage || over ? 'border-error' : 'border-textInactiveColor',
                  )}
                  rows={field.rows || 4}
                  readOnly={!editMode}
                />
                {errorMessage && <Text variant='error'>{errorMessage}</Text>}
              </div>
            );
          }

          return (
            <div key={field.name} className='space-y-1'>
              {labelRow}
              <div
                className={cn(
                  'border-b',
                  errorMessage || over ? 'border-error' : 'border-textInactiveColor',
                )}
              >
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
              {errorMessage && <Text variant='error'>{errorMessage}</Text>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
