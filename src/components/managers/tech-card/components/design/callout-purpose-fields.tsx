import { MediaSelector } from 'components/managers/media/components/media-selector';
import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import {
  ARTWORK_SUBS,
  artworkAttachFit,
  DETAIL_SCALES,
  parseSpec,
  seamShort,
  SECTION_PRESETS,
  spiOf,
  writeSpec,
  type Spec,
} from 'ui/components/annotation/purpose';
import { frameAspectOf } from 'ui/components/annotation/frame-aspect';
import { StitchPictogram, stitchBrushOf } from 'ui/components/annotation/stitch-pictogram';
import { Chip, ChipRow } from 'ui/components/chip';
import Input from 'ui/components/input';
import Select from 'ui/components/select';

import { BomLineSelect } from '../bom-line-picker';
import { PRINT_METHOD_LABELS, seamClassOptions } from '../operation-options';
import type { TechCardFormData } from '../schema';
import { STITCHES } from './modals/vector-strokes';
import type { RailCallout } from './callout-rail';

/**
 * ═══ ПОЛЯ НАЗНАЧЕНИЯ В СТРОКЕ УКАЗАНИЯ (волна callout kinds) ═══════════════════════════════════
 *
 * Одна компактная строка (или две) полей того назначения, которое у указания выбрано, плюс тихий
 * переключатель назначения сверху. Только существующие примитивы: Chip/ChipRow, Input, Select,
 * BomLineSelect, MediaSelector. Подписей над полями нет — их роль играют placeholder'ы.
 *
 * Запись — leaf `callouts.N.spec`, всегда объектом (`writeSpec`).
 */

const ISO_ITEMS = [
  { value: '', label: 'stitch · ISO 4915' },
  ...STITCHES.filter((s) => /^\d/.test(s.iso)).map((s) => ({
    value: s.iso,
    label: (
      <span className='inline-flex min-w-0 items-center gap-1.5'>
        <StitchPictogram iso={s.iso} />
        <span className='truncate'>{`${s.iso} ${s.name}`}</span>
      </span>
    ),
  })),
];

/**
 * ПОДПИСЬ ВЫБРАННОГО СТЕЖКА — ИЗ НОМЕРА, А НЕ ИЗ ПУНКТА СПИСКА (R29, владелец: «при выбранном стиче
 * показывает только исо но без пиктограмки»). Номер в указании бывает и не из списка (401, 602 —
 * приходят из шага или старой записи), и подпись пункта тогда не находилась: оставались голые
 * цифры. Пиктограмма и имя берутся по самому номеру (алиасы — у `stitchBrushOf`).
 */
function StitchValue({ iso }: { iso: string }) {
  const brush = stitchBrushOf(iso);
  const name =
    STITCHES.find((s) => s.iso === iso)?.name ?? STITCHES.find((s) => s.key === brush)?.name ?? '';
  return (
    <span className='inline-flex min-w-0 items-center gap-1.5' data-stitch-value={iso}>
      <StitchPictogram iso={iso} />
      <span className='truncate'>{[iso, name].filter(Boolean).join(' ')}</span>
    </span>
  );
}

// ВТОРОЙ ВЫБОР — ШОВ (ISO 4916), И ОН ОБЯЗАН ЧИТАТЬСЯ ШВОМ (R28, владелец: «в пикере почему-то два
// пикера стича зачем?»): пустой — «seam», выбранный — «seam · LS lapped», а не голый номер стандарта
// рядом с номером стандарта стежков.
const SEAM_ITEMS = [
  { value: '', label: 'seam' },
  ...seamClassOptions
    .filter((o) => o.value !== 'TECH_CARD_SEAM_CLASS_UNKNOWN')
    .map((o) => ({ value: o.value as string, label: o.label })),
];

const PRINT_METHODS = Object.values(PRINT_METHOD_LABELS).filter(Boolean);

// ЧИПОВ ТИПА (PLAIN / DETAIL / ARTWORK …) В СТРОКЕ НЕТ (R23, владелец: «если мы уже создали
// колаут определенного типа мы не должны его тип менять в эдиторе»). Тип задаётся чипом панели
// при постановке и дальше не меняется.

export function CalloutPurposeFields({
  index,
  c,
  disabled,
}: {
  index: number;
  c: RailCallout;
  disabled?: boolean;
}) {
  const form = useFormContext<TechCardFormData>();
  const spec = parseSpec(c.spec);
  if (!spec || spec.t === 'note') return null;
  const put = (next: Spec) =>
    form.setValue(`callouts.${index}.spec` as never, writeSpec(next) as never, {
      shouldDirty: true,
    });
  const name = (k: string) => `callout-${index}-${k}`;

  switch (spec.t) {
    case 'detail':
      return (
        <ChipRow data-callout-purpose='detail'>
          {DETAIL_SCALES.map((k) => (
            <Chip
              key={k}
              dashed={spec.scale !== k}
              selected={spec.scale === k}
              pressed={spec.scale === k}
              disabled={disabled}
              onClick={() => put({ ...spec, scale: k })}
              title={`the region enlarged ×${k}`}
            >
              ×{k}
            </Chip>
          ))}
          <RuleSep />
          <OwnPicture
            url={spec.url}
            disabled={disabled}
            purpose='detail callout'
            label='photo'
            title='a photo of your own instead of the enlarged region'
            clearTitle='show the enlarged region again instead of the photo'
            onPick={(mediaId, url) => put({ ...spec, mediaId, url })}
            onClear={() => put({ t: 'detail', scale: spec.scale })}
          />
        </ChipRow>
      );

    case 'artwork':
      return (
        <div className='space-y-1' data-callout-purpose='artwork'>
          <ChipRow>
            {ARTWORK_SUBS.map((k) => (
              <Chip
                key={k}
                dashed={spec.sub !== k}
                selected={spec.sub === k}
                pressed={spec.sub === k}
                disabled={disabled}
                onClick={() => put({ ...spec, sub: k, method: undefined })}
              >
                {k}
              </Chip>
            ))}
            <RuleSep />
            <OwnPicture
              url={spec.url}
              disabled={disabled}
              purpose='artwork callout'
              label='image'
              title='the artwork itself — a PNG keeps its transparency over the flat'
              clearTitle='remove the artwork image'
              onPick={(mediaId, url) => {
                put({ ...spec, mediaId, url });
                fitZoneOnAttach(form, index, url);
              }}
              onClear={() => put({ ...spec, mediaId: undefined, url: undefined })}
            />
          </ChipRow>
          <div className='grid grid-cols-[4.5rem_4.5rem_1fr] gap-1'>
            <Unit unit='mm'>
              <Input
                name={name('w')}
                value={spec.w ?? ''}
                disabled={disabled}
                placeholder='w'
                inputMode='decimal'
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  put({ ...spec, w: e.target.value })
                }
              />
            </Unit>
            <Unit unit='mm'>
              <Input
                name={name('h')}
                value={spec.h ?? ''}
                disabled={disabled}
                placeholder='h'
                inputMode='decimal'
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  put({ ...spec, h: e.target.value })
                }
              />
            </Unit>
            {spec.sub === 'print' ? (
              <Select
                name={name('method')}
                placeholder='method'
                items={[
                  { value: '', label: '—' },
                  ...PRINT_METHODS.map((m) => ({ value: m, label: m })),
                ]}
                value={spec.method ?? ''}
                renderValue={(v: string | number) => (v ? <Compact>{v}</Compact> : undefined)}
                disabled={disabled}
                onValueChange={(v: string) => put({ ...spec, method: v })}
              />
            ) : (
              <Input
                name={name('method')}
                value={spec.method ?? ''}
                disabled={disabled}
                placeholder='method'
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  put({ ...spec, method: e.target.value })
                }
              />
            )}
          </div>
          <Input
            name={name('from')}
            value={spec.from ?? ''}
            disabled={disabled}
            placeholder='placement — e.g. 8 cm below the neck seam, centred'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              put({ ...spec, from: e.target.value })
            }
          />
        </div>
      );

    case 'stitch': {
      const spi = spiOf(spec.stcm);
      return (
        <div className='space-y-1' data-callout-purpose='stitch'>
          <div className='grid grid-cols-2 gap-1'>
            <Select
              name={name('iso')}
              placeholder='stitch · ISO 4915'
              items={ISO_ITEMS}
              value={spec.iso ?? ''}
              renderValue={(v: string | number) =>
                v ? <StitchValue iso={String(v)} /> : undefined
              }
              disabled={disabled}
              onValueChange={(v: string) => put({ ...spec, iso: v })}
            />
            <Select
              name={name('seam')}
              placeholder='seam'
              items={SEAM_ITEMS}
              value={spec.seam ?? ''}
              renderValue={(v: string | number) =>
                v ? <Compact>{`seam · ${seamShort(String(v))}`}</Compact> : undefined
              }
              disabled={disabled}
              onValueChange={(v: string) => put({ ...spec, seam: v })}
            />
          </div>
          <div className='grid grid-cols-[1fr_1fr_1.4fr] gap-1'>
            <Unit unit={spi ? `st/cm · ${spi} spi` : 'st/cm'}>
              <Input
                name={name('stcm')}
                value={spec.stcm ?? ''}
                disabled={disabled}
                placeholder='density'
                inputMode='decimal'
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  put({ ...spec, stcm: e.target.value })
                }
              />
            </Unit>
            <Unit unit='mm'>
              <Input
                name={name('allowance')}
                value={spec.allowance ?? ''}
                disabled={disabled}
                placeholder='allowance'
                inputMode='decimal'
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  put({ ...spec, allowance: e.target.value })
                }
              />
            </Unit>
            <Input
              name={name('method')}
              value={spec.method ?? ''}
              disabled={disabled}
              placeholder='method'
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                put({ ...spec, method: e.target.value })
              }
            />
          </div>
        </div>
      );
    }

    case 'material':
      return (
        <div data-callout-purpose='material'>
          <MaterialSelect
            value={spec.lineKey ?? ''}
            disabled={disabled}
            onChange={(lineKey, lineName) =>
              put({
                t: 'material',
                lineKey: lineKey || undefined,
                name: lineKey ? lineName : undefined,
              })
            }
          />
        </div>
      );

    case 'section':
      return (
        <SectionLayers
          layers={spec.layers.map((l) => l.name)}
          disabled={disabled}
          name={name('layer')}
          onChange={(names) => put({ t: 'section', layers: names.map((n) => ({ name: n })) })}
        />
      );
  }
}

/** Выбранное значение в поле — одной строкой, как текст в соседнем Input. */
function Compact({ children }: { children: React.ReactNode }) {
  return <span className='min-w-0 truncate text-left'>{children}</span>;
}

/** Единица — тихо, внутри правого края поля, а не подписью над ним. */
function Unit({ unit, children }: { unit: string; children: React.ReactNode }) {
  return (
    <span className='relative block'>
      {children}
      <span className='pointer-events-none absolute right-[7px] top-1/2 -translate-y-1/2 text-nano text-labelColor'>
        {unit}
      </span>
    </span>
  );
}

/**
 * СВОЯ КАРТИНКА В СТРОКЕ — одна дверь на деталь (своё фото) и на артворк (сам принт, PNG с
 * прозрачностью). Миниатюра без подложки: прозрачный артворк виден прозрачным уже здесь.
 * Адрес — compressed → thumbnail → fullSize: все три — WebP с альфой
 * (bucket/alpha_png_upload_test.go), так что первый найденный прозрачность не теряет.
 */
function OwnPicture({
  url,
  disabled,
  purpose,
  label,
  title,
  clearTitle,
  onPick,
  onClear,
}: {
  url?: string;
  disabled?: boolean;
  purpose: string;
  label: string;
  title: string;
  clearTitle: string;
  onPick: (mediaId: number | undefined, url: string) => void;
  onClear: () => void;
}) {
  if (url)
    return (
      // Миниатюра и «×» — одним куском: при переносе строки чипов они не расходятся.
      <span className='inline-flex items-center gap-1'>
        <img
          src={url}
          alt=''
          className='h-[18px] w-[18px] border border-borderColor object-contain'
        />
        <Chip disabled={disabled} onClick={onClear} title={clearTitle}>
          × {label}
        </Chip>
      </span>
    );
  if (disabled) return null;
  return (
    <MediaSelector
      label={`+ ${label}`}
      purpose={purpose}
      aspectRatio={['Custom']}
      allowMultiple={false}
      showVideos={false}
      saveSelectedMedia={(media) => {
        const m = media[0];
        const u =
          m?.media?.compressed?.mediaUrl ||
          m?.media?.thumbnail?.mediaUrl ||
          m?.media?.fullSize?.mediaUrl;
        if (m && u) onPick(m.id ?? undefined, u);
      }}
      trigger={
        <Chip dashed title={title}>
          + {label}
        </Chip>
      }
    />
  );
}

/**
 * ЗОНА ПОД ПРОПОРЦИИ КАРТИНКИ — ОДИН РАЗ, В МОМЕНТ ПРИКРЕПЛЕНИЯ (R20). Варп на четыре ручки растянул
 * бы картинку под рамку, нарисованную до неё. Цель записи ищется заново, когда картинка загрузилась
 * (`artworkAttachFit`): индекс строки к этому моменту мог уехать на соседа.
 */
function fitZoneOnAttach(
  form: ReturnType<typeof useFormContext<TechCardFormData>>,
  index: number,
  url: string,
) {
  const row = form.getValues(`callouts.${index}`);
  if (!row) return;
  const at = {
    index,
    clientRef: row.clientRef,
    url,
    points: JSON.stringify(row.points ?? []),
  };
  const frame = frameAspectOf(row.mediaId);
  const img = new Image();
  img.onload = () => {
    if (!img.naturalWidth || !img.naturalHeight) return;
    const fit = artworkAttachFit(
      form.getValues('callouts') ?? [],
      at,
      img.naturalWidth / img.naturalHeight,
      frame,
    );
    if (fit)
      form.setValue(`callouts.${fit.index}.points` as never, fit.points as never, {
        shouldDirty: true,
      });
  };
  img.src = url;
}

function RuleSep() {
  return <span aria-hidden className='mx-0.5 inline-block h-3 w-px bg-borderColor' />;
}

/** Строка BOM + снимок её имени: печать и плашка читают имя, даже если строку потом удалят. */
function MaterialSelect({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (lineKey: string, name: string) => void;
}) {
  const form = useFormContext<TechCardFormData>();
  return (
    <BomLineSelect
      value={value}
      disabled={disabled}
      noneLabel='— BOM line —'
      onChange={(lineKey) => {
        const line = (form.getValues('bomItems') ?? []).find((b) => b.lineKey === lineKey);
        onChange(lineKey, line?.name?.trim() || '');
      }}
    />
  );
}

/** Слои сверху вниз: чипы с ✕ и одно поле «+ layer» — пресеты подсказкой, свободный текст тоже. */
function SectionLayers({
  layers,
  disabled,
  name,
  onChange,
}: {
  layers: string[];
  disabled?: boolean;
  name: string;
  onChange: (names: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...layers, v]);
    setDraft('');
  };
  const listId = `${name}-presets`;
  return (
    <div className='flex flex-wrap items-center gap-1' data-callout-purpose='section'>
      {layers.map((l, i) => (
        <Chip
          key={`${i}:${l}`}
          selected
          onRemove={disabled ? undefined : () => onChange(layers.filter((_, j) => j !== i))}
        >
          {l}
        </Chip>
      ))}
      {!disabled && (
        <>
          <Input
            name={name}
            list={listId}
            value={draft}
            placeholder='+ layer'
            className='w-28 min-w-0'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const v = e.target.value;
              // Пресет из подсказки ложится сразу; свободный текст — по Enter или уходу из поля.
              if ((SECTION_PRESETS as readonly string[]).includes(v)) {
                onChange([...layers, v]);
                setDraft('');
              } else setDraft(v);
            }}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            onBlur={add}
          />
          <datalist id={listId}>
            {SECTION_PRESETS.filter((p) => !layers.includes(p)).map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </>
      )}
    </div>
  );
}
