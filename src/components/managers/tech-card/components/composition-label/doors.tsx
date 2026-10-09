// ТЕЛА ПОЛОС ПРАВКИ ДЛЯ ТРЁХ ЗНАЧЕНИЙ, чьё значение — не текст: лого (SVG из библиотеки), символы
// ухода (словарь ухода стиля) и ссылка QR (пресет + шаблон). Дверь в каждую — само значение на
// ленте; здесь только то, что открывается под ней.
import type { common_MediaFull } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { CareSymbol } from 'components/managers/product/components/care/care-card';
import {
  careCodes,
  careSelectionKey,
  type CareSymbolView,
  type SelectedInstructions,
} from 'components/managers/product/components/care/care-codes';
import { CareInstructions } from 'components/managers/product/components/care/careInstructions';
import { useCareVocabulary } from 'components/managers/product/components/care/use-care-vocabulary';
import { useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { GrbpwrMark } from 'ui/icons/grbpwr-mark';
import { QR_PRESETS } from '../../care-labels/qr-settings';
import { STOREFRONT_QR_TEMPLATE } from '../../care-labels/qr';
import type { QrPreset } from '../../care-labels/use-care-label-prefs';

// ---------- лого ----------

/**
 * Лого: что сейчас печатается и одна дверь в библиотеку, которая берёт ТОЛЬКО SVG (лента
 * печатается кривыми, D-01): растр отказывается фразой, а не кладётся.
 */
export function LogoEditor({
  url,
  custom,
  disabled,
  onPick,
}: {
  url: string;
  custom: boolean;
  disabled?: boolean;
  onPick: (media: common_MediaFull) => void;
}) {
  return (
    <div className='flex flex-wrap items-center gap-6'>
      <span className='flex size-16 items-center justify-center border border-borderColor bg-bgColor p-2'>
        {custom && url ? (
          <img src={url} alt='composition label logo' className='max-h-full max-w-full' />
        ) : (
          <GrbpwrMark className='size-full text-textColor' />
        )}
      </span>
      <div className='flex flex-col gap-2'>
        <Text className='uppercase'>{custom ? 'your SVG' : 'the GRBPWR mark'}</Text>
        {disabled ? null : (
          <MediaSelector
            label='composition label logo'
            purpose='the composition label logo — SVG only, the ribbon is printed in curves'
            vectorOnly
            allowSvg
            saveSelectedMedia={(m) => m[0] && onPick(m[0])}
            trigger={
              <Button type='button' variant='secondary' size='sm' data-logo-pick=''>
                choose an SVG
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}

// ---------- символы ухода ----------

/**
 * Символы — уход СТИЛЯ (`careInstructions`, пишется staged UpdateStyle панели фактов стиля). Здесь
 * второго хранилища нет: кнопка открывает тот же словарный пикер, что на товаре.
 */
export function CareSymbolsEditor({ disabled, reason }: { disabled?: boolean; reason?: string }) {
  const { setValue, control } = useFormContext();
  const value = (useWatch({ control, name: 'careInstructions' }) as string) || '';
  const vocabulary = useCareVocabulary();
  const [open, setOpen] = useState(false);
  const codes = careCodes(value);
  const selected = useMemo(() => vocabulary.parseSelected(value), [vocabulary, value]);

  // Порядок записи — печатный порядок словаря (как CarePicker): иначе значение «прыгает» после
  // перечитывания стиля.
  const write = (next: SelectedInstructions) => {
    const known = new Set(vocabulary.slots.map((s) => s.key));
    const ordered = vocabulary.slots.map((slot) => next[slot.key]).filter(Boolean);
    const orphaned = Object.entries(next)
      .filter(([key, code]) => code && !known.has(key))
      .map(([, code]) => code);
    setValue('careInstructions', [...ordered, ...orphaned].join(','), {
      shouldDirty: true,
      shouldValidate: true,
    });
  };
  const onSelect = (symbol: CareSymbolView) => {
    const key = careSelectionKey(symbol.category, symbol.subCategory);
    const next = { ...selected };
    if (next[key] === symbol.code) delete next[key];
    else next[key] = symbol.code;
    write(next);
  };

  return (
    <div className='flex flex-wrap items-center gap-6' data-care-symbols={codes.join(',')}>
      {codes.length ? (
        <span className='flex flex-wrap gap-1.5'>
          {codes.map((c) => (
            <CareSymbol key={c} code={c} />
          ))}
        </span>
      ) : (
        <Text size='micro' variant='label'>
          no care symbols yet
        </Text>
      )}
      <Button
        type='button'
        variant='secondary'
        size='sm'
        disabled={disabled}
        title={reason}
        onClick={() => setOpen(true)}
      >
        choose care symbols
      </Button>
      <CareInstructions
        isCareTableOpen={open}
        close={() => setOpen(false)}
        onSelectCareInstruction={onSelect}
        selectedInstructions={selected}
      />
    </div>
  );
}

// ---------- QR ----------

/** Ссылка QR: что напечатается у выбранного варианта, пресеты и шаблон. Правки идут в форму сразу. */
export function QrEditor({
  preset,
  template,
  example,
  disabled,
  onChange,
  onDone,
}: {
  preset: QrPreset;
  template: string;
  /** Ссылка выбранного варианта (что напечатается). */
  example: string;
  disabled?: boolean;
  onChange: (patch: { qrPreset?: string; qrTemplate?: string }) => void;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(template);
  return (
    <div className='flex max-w-[560px] flex-col gap-3'>
      <Text className='break-all' data-qr-example=''>
        {example || '—'}
      </Text>
      <ChipRow>
        {QR_PRESETS.map((p) => (
          <Chip
            key={p.id}
            pressed={preset === p.id}
            selected={preset === p.id}
            title={p.title}
            disabled={disabled}
            data-qr-preset={p.id}
            onClick={() => onChange({ qrPreset: p.id === 'storefront' ? '' : p.id })}
          >
            {p.label}
          </Chip>
        ))}
      </ChipRow>
      <Input
        name='composition-qr-template'
        aria-label='QR link template'
        value={preset === 'storefront' ? STOREFRONT_QR_TEMPLATE : draft}
        disabled={disabled || preset === 'storefront'}
        placeholder={preset === 'fixed' ? 'https://…' : 'https://grbpwr.com/p/{base_sku}?s={size}'}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
        onBlur={() => onChange({ qrTemplate: draft.trim() })}
      />
      {preset === 'custom' && (
        <Text size='micro' variant='label'>
          {'{base_sku} {sku} {size} {colorway_id} {style}'}: base SKU is lower-cased
        </Text>
      )}
      <button
        type='button'
        onClick={() => {
          if (preset !== 'storefront') onChange({ qrTemplate: draft.trim() });
          onDone();
        }}
        data-qr-done=''
        className='cursor-pointer self-start text-micro uppercase tracking-label underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-textColor'
      >
        done
      </button>
    </div>
  );
}
