import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useLibraryFile } from 'components/managers/files/hooks/useFiles';
import { SECTION } from 'constants/routes';
import { notify } from 'lib/stores/store';
import { useId, useState, type ChangeEvent, type ReactNode } from 'react';
import { Button, Chip, ChipRow, Close, GroupLabel, Input, Placeholder, Text } from 'ui';

import { LabelFilePicker } from './label-file-picker';
import {
  LABEL_PRINT_METHODS,
  clampPrintToLabel,
  printFitIssue,
  type LabelPrintMethod,
} from './label-placement';
import type { FormGarmentLabelPrint } from './labels-schema';
import { wireInt } from './wire-int';

const PRINT_COLOURS = ['black', 'white', 'pms 877 silver', 'tonal'];

const methodLabel = (method?: string) => (method ?? '').replaceAll('_', ' ');

const cleanDecimal = (value: string): string | null => {
  const next = value.replace(',', '.');
  return /^\d*(?:\.\d{0,2})?$/.test(next) ? next : null;
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className='flex min-w-0 flex-col gap-0.5'>
      <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
        {label}
      </Text>
      {children}
    </div>
  );
}

function MmInput({
  value,
  label,
  disabled,
  onChange,
}: {
  value?: string;
  label: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <span className='flex items-center gap-1.5'>
      <Input
        inputMode='decimal'
        value={value ?? ''}
        aria-label={label}
        disabled={disabled}
        className='w-14'
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const next = cleanDecimal(event.target.value);
          if (next != null) onChange(next);
        }}
      />
      <Text size='micro' variant='label' component='span'>
        mm
      </Text>
    </span>
  );
}

function MethodChips({
  value,
  disabled,
  onChange,
}: {
  value?: string;
  disabled: boolean;
  onChange: (value: LabelPrintMethod) => void;
}) {
  return (
    <ChipRow>
      {LABEL_PRINT_METHODS.map((method) => (
        <Chip
          key={method}
          nonForm
          selected={value === method}
          pressed={value === method}
          disabled={disabled}
          onClick={() => onChange(method)}
        >
          {methodLabel(method)}
        </Chip>
      ))}
    </ChipRow>
  );
}

function PrintFileName({ id }: { id?: number }) {
  const query = useLibraryFile(id || undefined);
  return <>{query.data?.file?.fileName || (id ? `file ${id}` : 'no file')}</>;
}

function PrintFields({
  print,
  labelWidthMm,
  labelHeightMm,
  disabled,
  onChange,
}: {
  print: FormGarmentLabelPrint;
  labelWidthMm?: string;
  labelHeightMm?: string;
  disabled: boolean;
  onChange: (value: Partial<FormGarmentLabelPrint>) => void;
}) {
  const colourList = `print-colours-${useId().replace(/:/g, '')}`;
  const patchSize = (value: Partial<FormGarmentLabelPrint>) => {
    const next = { ...print, ...value };
    onChange({
      ...value,
      ...clampPrintToLabel(next, labelWidthMm, labelHeightMm, Number(next.xMm), Number(next.yMm)),
    });
  };
  return (
    <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
      <Field label='method'>
        <MethodChips
          value={print.method}
          disabled={disabled}
          onChange={(method) => onChange({ method })}
        />
      </Field>
      <Field label='size'>
        <span className='flex items-center gap-1.5'>
          <Input
            inputMode='decimal'
            value={print.widthMm ?? ''}
            aria-label='print width'
            disabled={disabled}
            className='w-14'
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const value = cleanDecimal(event.target.value);
              if (value != null) patchSize({ widthMm: value });
            }}
          />
          <Text variant='label' component='span'>
            ×
          </Text>
          <Input
            inputMode='decimal'
            value={print.heightMm ?? ''}
            aria-label='print height'
            disabled={disabled}
            className='w-14'
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const value = cleanDecimal(event.target.value);
              if (value != null) patchSize({ heightMm: value });
            }}
          />
          <Text size='micro' variant='label' component='span'>
            mm
          </Text>
        </span>
      </Field>
      <Field label='from left'>
        <MmInput
          value={print.xMm}
          label='print from left'
          disabled={disabled}
          onChange={(xMm) =>
            onChange(
              clampPrintToLabel(print, labelWidthMm, labelHeightMm, Number(xMm), Number(print.yMm)),
            )
          }
        />
      </Field>
      <Field label='from top'>
        <MmInput
          value={print.yMm}
          label='print from top'
          disabled={disabled}
          onChange={(yMm) =>
            onChange(
              clampPrintToLabel(print, labelWidthMm, labelHeightMm, Number(print.xMm), Number(yMm)),
            )
          }
        />
      </Field>
      <Field label='colour'>
        <Input
          value={print.colour ?? ''}
          list={colourList}
          disabled={disabled}
          autoComplete='off'
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            onChange({ colour: event.target.value })
          }
        />
        <datalist id={colourList}>
          {PRINT_COLOURS.map((colour) => (
            <option key={colour} value={colour} />
          ))}
        </datalist>
      </Field>
    </div>
  );
}

const newPrint = (labelWidthMm?: string, labelHeightMm?: string): FormGarmentLabelPrint => {
  const labelWidth = Number(labelWidthMm) || 0;
  const labelHeight = Number(labelHeightMm) || 0;
  const width = Math.min(12, labelWidth);
  const height = Math.min(6, labelHeight);
  return {
    id: 0,
    name: '',
    libraryFileId: 0,
    method: 'screen',
    colour: 'black',
    widthMm: width > 0 ? String(width) : '',
    heightMm: height > 0 ? String(height) : '',
    xMm: width > 0 ? String(Math.max(0, Math.round((labelWidth - width) * 100) / 200)) : '0',
    yMm: height > 0 ? String(Math.max(0, Math.round((labelHeight - height) * 100) / 200)) : '0',
  };
};

export function LabelPrintsEditor({
  prints,
  labelWidthMm,
  labelHeightMm,
  selectedIndex,
  disabled,
  onSelect,
  onChange,
}: {
  prints: readonly FormGarmentLabelPrint[];
  labelWidthMm?: string;
  labelHeightMm?: string;
  selectedIndex: number;
  disabled: boolean;
  onSelect: (index: number) => void;
  onChange: (prints: FormGarmentLabelPrint[]) => void;
}) {
  const { canWrite } = usePermissions();
  const [draft, setDraft] = useState<FormGarmentLabelPrint | null>(null);
  const [filePicker, setFilePicker] = useState(false);
  const [fileName, setFileName] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const selected = prints[selectedIndex];

  const openFiles = () => {
    if (!canWrite(SECTION.files)) {
      notify({ sev: 'error', subject: '', text: '', bad: 'no files access' });
      return;
    }
    setFilePicker(true);
  };
  const update = (index: number, value: Partial<FormGarmentLabelPrint>) =>
    onChange(prints.map((print, at) => (at === index ? { ...print, ...value } : { ...print })));
  const remove = (index: number) => {
    onChange(prints.filter((_, at) => at !== index).map((print) => ({ ...print })));
    onSelect(Math.max(0, Math.min(selectedIndex, prints.length - 2)));
  };
  const add = () => {
    if (!draft || !wireInt(draft.libraryFileId)) {
      setDraftError('pick print file');
      return;
    }
    const issue = printFitIssue(draft, labelWidthMm, labelHeightMm);
    if (issue) {
      setDraftError(issue);
      return;
    }
    onChange([...prints.map((print) => ({ ...print })), { ...draft }]);
    onSelect(prints.length);
    setDraft(null);
    setDraftError(null);
    setFileName('');
  };

  return (
    <div className='mt-4'>
      <GroupLabel
        flush
        action={
          !draft && !disabled ? (
            <Button
              type='button'
              variant='underline'
              size='xs'
              onClick={() => {
                setDraft(newPrint(labelWidthMm, labelHeightMm));
                setDraftError(null);
              }}
            >
              + print
            </Button>
          ) : undefined
        }
      >
        prints · {prints.length}
      </GroupLabel>

      {draft ? (
        <div className='flex flex-col gap-3 py-2'>
          <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
            <Field label='file'>
              {wireInt(draft.libraryFileId) ? (
                <div className='flex h-14.5 items-center gap-2.5 border-b border-hairline'>
                  <Placeholder label='file' className='size-11 shrink-0 border-0' />
                  <Text className='min-w-0 flex-1 truncate'>{fileName || 'file'}</Text>
                  <Close
                    size='sm'
                    aria-label='remove print file'
                    onClick={() => {
                      setDraft({ ...draft, libraryFileId: 0, name: '' });
                      setFileName('');
                    }}
                  />
                </div>
              ) : (
                <Button type='button' className='w-full p-0' onClick={openFiles}>
                  <Placeholder dashed label='+ file' className='h-14.5 w-full' />
                </Button>
              )}
            </Field>
          </div>
          <PrintFields
            print={draft}
            labelWidthMm={labelWidthMm}
            labelHeightMm={labelHeightMm}
            disabled={false}
            onChange={(value) => {
              const next = { ...draft, ...value };
              setDraft(next);
              setDraftError(printFitIssue(next, labelWidthMm, labelHeightMm));
            }}
          />
          <div className='flex items-center justify-end gap-3'>
            {draftError ? (
              <Text size='micro' variant='errorLabel' className='mr-auto'>
                {draftError}
              </Text>
            ) : null}
            <Button
              type='button'
              variant='underline'
              size='xs'
              onClick={() => {
                setDraft(null);
                setDraftError(null);
                setFileName('');
              }}
            >
              cancel
            </Button>
            <Button type='button' variant='main' size='sm' onClick={add}>
              add
            </Button>
          </div>
        </div>
      ) : null}

      <div>
        {prints.map((print, index) => {
          const issue = printFitIssue(print, labelWidthMm, labelHeightMm);
          return (
            <div
              key={`${wireInt(print.id)}-${wireInt(print.libraryFileId)}-${index}`}
              className={`border-b border-hairline last:border-b-0 ${index === selectedIndex ? 'outline outline-1 -outline-offset-1 outline-textColor' : ''}`}
            >
              <Button
                type='button'
                variant='default'
                className='flex w-full items-center gap-2 px-0 py-2 text-left'
                aria-pressed={index === selectedIndex}
                onClick={() => onSelect(index)}
              >
                <span className='flex size-7 items-center justify-center border border-borderColor bg-pageBg'>
                  <Text size='nano' component='span'>
                    {print.name?.slice(0, 3).toUpperCase() || 'PR'}
                  </Text>
                </span>
                <span className='min-w-0 flex-1'>
                  <Text className='truncate'>{print.name || 'print'}</Text>
                  <Text size='micro' variant={issue ? 'errorLabel' : 'label'} className='truncate'>
                    {issue || <PrintFileName id={wireInt(print.libraryFileId)} />}
                  </Text>
                </span>
                <Text className='hidden min-w-24 flex-1 truncate sm:block'>
                  {methodLabel(print.method)}
                </Text>
                <Text className='hidden w-24 tabular-nums sm:block'>
                  {`${print.widthMm} × ${print.heightMm} mm`}
                </Text>
                <Text className='hidden min-w-24 flex-1 truncate sm:block'>
                  {print.colour || 'colour'}
                </Text>
                <Close
                  asChild
                  size='sm'
                  aria-label='remove print'
                  onClick={(event: { stopPropagation: () => void }) => {
                    event.stopPropagation();
                    remove(index);
                  }}
                />
              </Button>
            </div>
          );
        })}
      </div>

      {selected && !draft ? (
        <div className='mt-3'>
          <PrintFields
            print={selected}
            labelWidthMm={labelWidthMm}
            labelHeightMm={labelHeightMm}
            disabled={disabled}
            onChange={(value) => update(selectedIndex, value)}
          />
        </div>
      ) : null}

      <LabelFilePicker
        open={filePicker}
        onOpenChange={setFilePicker}
        onPick={(picked) => {
          if (!draft) return;
          const name = picked.fileName || `file ${picked.libraryFileId}`;
          setFileName(name);
          setDraft({
            ...draft,
            libraryFileId: picked.libraryFileId,
            name: draft.name?.trim() || name,
          });
          setDraftError(null);
        }}
      />
    </div>
  );
}
