import type { common_Model } from 'api/proto-http/admin';
import { genderOptions } from 'constants/filter';
import { useMemo, type JSX } from 'react';
import SelectComponent from 'ui/components/select';

import { BODY_TYPES, mediaThumb } from './model';

/**
 * ═══ НА КАКОМ ТЕЛЕ ЭТО СТОИТ — ОДИН ВОПРОС, ОДИН ОРГАН (r3 п.37) ══════════════════════════════
 *
 * Владелец, дословно: «THE BODY: очень много кнопок» и «один пикер тела (селект с превью), без
 * ряда чипов+поиска+плиток одновременно».
 *
 * ЧТО ЗДЕСЬ СТОЯЛО. ТРИ ОРГАНА СРАЗУ, все три развёрнутые на экране: ряд из пяти чипов
 * телосложения, поле поиска по моделям и галерея плиток с фотографиями (до 260px высоты) — плюс
 * абзац под ними. Четыре предмета на один вопрос «на каком теле», занимавшие треть экрана 3D и
 * ломавшие колонку полей: `presentation`, `garment size` и `fit` — однострочные ряды, а между ними
 * стояла стопка.
 *
 * ЧТО СТАЛО. ОДИН СЕЛЕКТ, ростом ровно с остальные три поля колонки, с превью прямо в пунктах:
 *
 *   ┌──────────────────────────────┐
 *   │ [фото] VERA K. · 178 cm      │   ← лицо: миниатюра выбранной модели и её факты
 *   └──────────────────────────────┘
 *      any body
 *      BUILD — a word the generator reads
 *        slim · athletic · average · curvy · plus
 *      OUR MODELS — recorded on the run; nothing about her is sent
 *        [фото] Vera K. · women · 178 cm · base M
 *
 * ⚠ ВЫБОР СТАЛ ВЗАИМОИСКЛЮЧАЮЩИМ, И ЭТО НАМЕРЕННО, А НЕ ПОБОЧНО. Контракт разрешает назвать ОБА
 * (`DesignThreedParams.body_type`: «a run may state both»), и прежний экран это разрешал — двумя
 * органами. Один список выразить «и Вера, и атлетичное» не может, и терять тут нечего: у названной
 * модели телосложение УЖЕ есть, своё, а слово поверх её имени описывает не её. Один вопрос — один
 * ответ; провод при этом не изменился ни полем, обе половины по-прежнему уезжают своими
 * (`modelId` / `bodyType`), просто непустой всегда ровно одна.
 *
 * ⚠ ЧТО ИЗ ЭТОГО УПРАВЛЯЕТ КАРТИНКОЙ, А ЧТО ТОЛЬКО ЗАПИСЫВАЕТСЯ, — СКАЗАНО В ЗАГОЛОВКАХ ГРУПП
 * СПИСКА, а не абзацем под ним. Абзац снят вместе с остальными органами, но ЕГО ФАКТ снять было
 * нельзя: телосложение — слово, оно уезжает в промпт (`designgen/snapshot.go`); `model_id` — ссылка
 * на строку картотеки, и у снимка прогона нет поля ни под имя модели, ни под её мерки, так что
 * генератор о ней не узнаёт ничего. Орган, который делает не то, что кажется, хуже отсутствующего —
 * поэтому фраза стоит РОВНО ТАМ, где выбирают, только теперь внутри списка, а не под ним.
 *
 * ПОИСК СНЯТ ПО СЛОВУ ВЛАДЕЛЬЦА («без ряда чипов+поиска+плиток»). Список моделей этой админки —
 * картотека примерочных моделей, не каталог; он прокручивается, как прокручивается любой длинный
 * `Select` в этом продукте.
 */

const HEIGHT_MEASUREMENT = 'BODY_MEASUREMENT_NAME_HEIGHT';

/** Sentinel: Radix forbids an empty item value, and «nothing said» is a legal answer. */
const NO_BODY = '__nobody__';
/** Пункт телосложения — `b:athletic`; пункт модели — `m:12`. Один список, два регистра ответа. */
const BUILD = 'b:';
const MODEL = 'm:';

function genderLabel(gender?: string): string {
  if (!gender || gender === 'GENDER_ENUM_UNKNOWN') return '';
  return genderOptions.find((g) => g.value === gender)?.label ?? '';
}

export function modelName(model?: common_Model | null): string {
  return (model?.model?.name ?? '').trim() || `model ${model?.id ?? 0}`;
}

/**
 * `women · 178 cm · base M` — модель словами картотеки, без её имени (имя стоит рядом).
 *
 * Мерки тела хранятся в МИЛЛИМЕТРАХ, а о модели говорят в сантиметрах.
 */
export function modelFacts(model: common_Model, sizeName: (id: number) => string): string {
  const parts: string[] = [];
  const gender = genderLabel(model.model?.gender);
  if (gender) parts.push(gender);
  const heightMm = (model.model?.measurements ?? []).find(
    (m) => m.name === HEIGHT_MEASUREMENT,
  )?.valueMm;
  if (typeof heightMm === 'number' && heightMm > 0) parts.push(`${Math.round(heightMm / 10)} cm`);
  const base = (model.model?.defaultSizeIds ?? [])[0];
  const label = base ? sizeName(base) : '';
  if (label) parts.push(`base ${label}`);
  return parts.join(' · ');
}

/** Обложка модели: назначенная миниатюра, иначе первый кадр её галереи. */
function modelThumb(model: common_Model): string {
  return mediaThumb(model.thumbnail) || mediaThumb((model.media ?? [])[0]);
}

/**
 * ПРЕВЬЮ В ПРОПОРЦИИ 3/4 — И В ПУНКТЕ СПИСКА, И НА ЛИЦЕ СЕЛЕКТА. Одна пиктограмма в двух местах,
 * а не «фото в списке, слово в поле»: выбранное обязано выглядеть так же, как выглядело, когда на
 * него нажимали. Разнится ТОЛЬКО рост, и по арифметике ряда — довод у самого класса ниже.
 * Без снимка полосатого квадрата тут НЕТ: он в 24 пикселя читается как сор; имя стоит одно.
 */
function Face({ url, alt, tight }: { url: string; alt: string; tight?: boolean }): JSX.Element | null {
  if (!url) return null;
  return (
    <img
      src={url}
      alt={alt}
      loading='lazy'
      /* ⚠ НА ЛИЦЕ КАДР НИЖЕ, И ЭТО АРИФМЕТИКА РЯДА, А НЕ ВКУС. Строка селекта — 18px (12px × 1.5),
         плюс `py-[3px]` даёт ровно 24px, и все четыре поля колонки этой высоты. Кадр в 24px
         поднял бы ОДНО поле до 30px, и колонка, которую владелец просил выровнять, разъехалась бы
         на одном ряду. В списке места вдоволь, и там превью крупнее. */
      className={
        tight
          ? 'h-[18px] w-[14px] shrink-0 border border-borderColor object-cover'
          : 'h-6 w-[18px] shrink-0 border border-borderColor object-cover'
      }
    />
  );
}

/**
 * ОДИН ПИКЕР ТЕЛА. Пишет РОВНО ОДНУ из двух половин ответа и обнуляет вторую — довод в шапке файла.
 */
export function BodyPicker({
  models,
  loading,
  modelId,
  bodyType,
  sizeName,
  disabled,
  onModel,
  onBodyType,
}: {
  models: readonly common_Model[] | undefined;
  loading?: boolean;
  modelId: number;
  bodyType: string;
  sizeName: (id: number) => string;
  disabled?: boolean;
  onModel: (id: number) => void;
  onBodyType: (value: string) => void;
}): JSX.Element {
  const all = useMemo(() => (models ?? []).filter((m) => (m.id ?? 0) > 0), [models]);
  const chosen = useMemo(() => all.find((m) => (m.id ?? 0) === modelId), [all, modelId]);

  const value = modelId ? `${MODEL}${modelId}` : bodyType ? `${BUILD}${bodyType}` : NO_BODY;

  /**
   * ⚠ ЗАГОЛОВКИ ГРУПП НЕСУТ ФАКТ, А НЕ ЖАНР. `Select` заворачивает СОСЕДНИЕ пункты с одинаковым
   * `group` в `Select.Group` со своим заголовком — то самое место, где фраза «слово уезжает в
   * промпт, а имя модели нет» стоит ближе всего к выбору, который она описывает.
   */
  const items = useMemo(() => {
    const rows: {
      value: string;
      label: React.ReactNode;
      group?: string;
      disabled?: boolean;
    }[] = [{ value: NO_BODY, label: 'any body' }];
    for (const word of BODY_TYPES) {
      rows.push({
        value: `${BUILD}${word}`,
        label: word,
        group: 'build — the generator reads this word',
      });
    }
    if (loading) {
      rows.push({
        value: '__loading__',
        label: 'loading the models…',
        disabled: true,
        group: 'our models — recorded on the run; nothing about her is sent',
      });
      return rows;
    }
    if (!all.length) {
      rows.push({
        value: '__nomodels__',
        label: 'no fit models on this admin yet — add them under MODELS',
        disabled: true,
        group: 'our models — recorded on the run; nothing about her is sent',
      });
      return rows;
    }
    for (const model of all) {
      const id = model.id ?? 0;
      const facts = modelFacts(model, sizeName);
      rows.push({
        value: `${MODEL}${id}`,
        group: 'our models — recorded on the run; nothing about her is sent',
        label: (
          <span className='flex min-w-0 items-center gap-1.5'>
            <Face url={modelThumb(model)} alt='' />
            <span className='min-w-0 truncate'>
              {modelName(model)}
              {facts ? ` · ${facts}` : ''}
            </span>
          </span>
        ),
      });
    }
    return rows;
  }, [all, loading, sizeName]);

  return (
    <div className='w-[260px] shrink-0' data-body-picker=''>
      <SelectComponent
        name='design-threed-body'
        value={value}
        placeholder='any body'
        disabled={disabled}
        items={items}
        fullWidth
        /* ЛИЦО СЕЛЕКТА — ТА ЖЕ ПАРА, ЧТО В ПУНКТЕ: миниатюра и строка. Без него Radix напечатал бы
           ярлык пункта целиком, включая его собственный кадр, но БЕЗ обрезки по ширине поля. */
        renderValue={() => {
          if (chosen) {
            const facts = modelFacts(chosen, sizeName);
            return (
              /* ⚠ `uppercase` НЕ УКРАШЕНИЕ: `SelectItem` заворачивает ярлык в `Text
                 variant='uppercase'`, а `renderValue` эту обёртку минует. Без него выбранное
                 значение печаталось бы строчными в ряду с двумя соседними селектами в капсе —
                 то есть лицо органа не походило бы на пункт, по которому в него нажали. */
              <span className='flex min-w-0 items-center gap-1.5 uppercase'>
                <Face url={modelThumb(chosen)} alt='' tight />
                <span className='min-w-0 truncate'>
                  {modelName(chosen)}
                  {facts ? ` · ${facts}` : ''}
                </span>
              </span>
            );
          }
          if (bodyType) return <span className='truncate uppercase'>{bodyType} build</span>;
          return <span className='truncate uppercase'>any body</span>;
        }}
        onValueChange={(next: string) => {
          /* ОДИН ОТВЕТ НА ОДИН ВОПРОС: каждая ветка пишет ОБЕ половины, и вторая всегда пустая.
             Писать только «свою» значило бы оставить прошлый ответ висеть невидимым — экран
             показывал бы модель, а промпт вёз бы ещё и слово о форме. */
          if (next.startsWith(MODEL)) {
            onBodyType('');
            onModel(Number(next.slice(MODEL.length)) || 0);
            return;
          }
          if (next.startsWith(BUILD)) {
            onModel(0);
            onBodyType(next.slice(BUILD.length));
            return;
          }
          if (next === NO_BODY) {
            onModel(0);
            onBodyType('');
          }
          /* Пункты-заглушки (`__loading__`, `__nomodels__`) отмечены `disabled` и сюда не доходят;
             любое иное значение — фантомная пустота Radix, и она молча игнорируется. */
        }}
      />
      {/* Ничего под селектом НЕТ намеренно: всё, что говорил снятый абзац, стоит заголовками групп
          внутри списка — там, где на него смотрят. */}
    </div>
  );
}
