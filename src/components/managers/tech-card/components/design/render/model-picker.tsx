import type { common_Model } from 'api/proto-http/admin';
import { genderOptions } from 'constants/filter';
import { useMemo, useState, type JSX } from 'react';
import { Chip, ChipRow } from 'ui/components/chip';
import Input from 'ui/components/input';
import { Placeholder } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';

import { BODY_TYPES, mediaThumb } from './model';

/**
 * ═══ НА КАКОМ ТЕЛЕ ЭТО СТОИТ — ОДИН ВОПРОС, ДВА РЕГИСТРА ОТВЕТА (V-15) ════════════════════════
 *
 * Владелец: «в 3д рендере должна быть возможность выбрать из моделей которые у нас есть должна
 * быть так же возможность выбрать телосложение модели если рендерим на модели моделей выбирать
 * КАРТОЧКОЙ С ФОТО а не списком».
 *
 * ВОПРОС ОДИН, И ПОЭТОМУ ОРГАН ОДИН. «Кто» и «какой формы» — это не два независимых поля, это две
 * половины одного ответа на «на каком теле стоит эта вещь», поэтому они стоят вплотную, под общей
 * подсказкой, и обе необязательны по отдельности. Проверка на ЛОЖНОЕ РАСЩЕПЛЕНИЕ (класс дефекта,
 * пойманный в этом репозитории дважды) даёт «не расщепление»: вырожденного близнеца нет — модель
 * это СТРОКА нашей картотеки с лицом, мерками и базовым размером, телосложение это КЛАСС ФОРМЫ;
 * выразить одно через другое нельзя ни в одну сторону; и технолог произносит обе фразы вслух
 * («сними на Вере» и «сними на атлетичном теле»). Контракт говорит то же самое и разрешает назвать
 * ОБА (`DesignThreedParams.body_type`: «a run may state both»), поэтому экран их не рассорил.
 *
 * ЧТО ДОХОДИТ ДО МОДЕЛИ, А ЧТО НЕТ, СКАЗАНО ЧЕЛОВЕКУ ВСЛУХ. Телосложение — слово, оно уезжает в
 * промпт (`designgen/snapshot.go`, строка «turntable»). `model_id` — ссылка на строку картотеки, и
 * у снимка прогона нет поля ни под имя модели, ни под её мерки, так что генератор о ней не узнаёт
 * ничего: выбор модели ЗАПИСЫВАЕТ, на ком снимали, и не управляет картинкой. Подсказка под
 * галереей произносит это, потому что орган, который делает не то, что кажется, хуже отсутствующего.
 *
 * КАРТОЧКА С ФОТО — ЭТО `Tile`, а не своя вёрстка: тот же примитив, которым модели показаны в
 * своём менеджере (`models/components/model-card-list.tsx`), поэтому одна и та же модель выглядит
 * в двух местах одинаково.
 *
 * ⚠ ПОДПИСИ ПРИ ЭТОМ РИСУЮТСЯ НЕ ПРОПАМИ `name`/`sub`, И ЭТО ЗАМЕР, А НЕ ВКУС. Браузер ставит
 * `<button>` собственный `align-items: flex-start`, поэтому дети колоночного флекса внутри плитки
 * НЕ растягиваются по ширине: подпись с `truncate` (`white-space: nowrap`) получает ширину своего
 * max-content, вырастает шире плитки и рисуется поверх соседней — при `overflow: visible` у самой
 * кнопки. Замерено на имени «Aleksandra Konstantinovna Zheleznova»: 216px в плитке шириной 145.
 * Обрезка при этом молчит: обрезать нечего, ширины хватило. Лечится `w-full` (плюс `min-w-0`) на
 * самой подписи — ровно тем, что уже есть у картинки. Место правки — примитив
 * `ui/components/tiles.tsx`, он тут чужой, поэтому подписи стоят здесь, со своими классами.
 */

const HEIGHT_MEASUREMENT = 'BODY_MEASUREMENT_NAME_HEIGHT';

/** Порог, за которым галерею надо уметь фильтровать, а не только листать. */
const FILTER_FROM = 8;

/**
 * Ширина дорожки — та же 132, что у ячейки входной полосы этих экранов. Не совпадение: обе
 * показывают «картинку, по которой выбирают», и общий шаг делает меню продолжением полосы, а не
 * вторым способом показать сетку картинок.
 */
const TILE_MIN = 132;

/**
 * Высота галереи ограничена НАМЕРЕННО, и не круглым числом: 132×(4/3) плюс две строки подписи это
 * ~210px, то есть в кадр попадает один полный ряд И ПОЛОСКА СЛЕДУЮЩЕГО. Обрезанный ряд — это и есть
 * сообщение «ниже есть ещё»; ровно закрытая галерея читалась бы как «моделей всего четыре».
 */
const GALLERY_MAX_HEIGHT = 'max-h-[260px]';

function genderLabel(gender?: string): string {
  if (!gender || gender === 'GENDER_ENUM_UNKNOWN') return '';
  return genderOptions.find((g) => g.value === gender)?.label ?? '';
}

export function modelName(model?: common_Model | null): string {
  return (model?.model?.name ?? '').trim() || `model ${model?.id ?? 0}`;
}

/**
 * `women · 178 cm · base M` — модель словами картотеки, без её имени (имя стоит строкой выше).
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

/** `Vera K. · 178 cm · base M` — одна строка для мест, где карточке не хватает места (инвентарь). */
export function modelCaption(model: common_Model, sizeName: (id: number) => string): string {
  const facts = modelFacts(model, sizeName);
  return [modelName(model), facts].filter(Boolean).join(' · ');
}

/** Обложка модели: назначенная миниатюра, иначе первый кадр её галереи. */
function modelThumb(model: common_Model): string {
  return mediaThumb(model.thumbnail) || mediaThumb((model.media ?? [])[0]);
}

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
  const [query, setQuery] = useState('');

  const all = useMemo(() => (models ?? []).filter((m) => (m.id ?? 0) > 0), [models]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((m) => modelName(m).toLowerCase().includes(q));
  }, [all, query]);

  return (
    <div className='flex min-w-0 flex-1 flex-col gap-2'>
      {/* ФОРМА ТЕЛА — набор, а не свободный ввод. Строка на проводе означает, что СЛОВАРЬ БУДЕТ
          ПЕРЕПИСАН, а не что его нет: набранное руками слово уехало бы в замороженный прогон и не
          сошлось бы ни с чем никогда. Повторное нажатие снимает выбор — «не сказано» тоже ответ, и
          контракт читает его как «генератор выбирает сам». */}
      <ChipRow>
        {BODY_TYPES.map((value) => (
          <Chip
            key={value}
            selected={bodyType === value}
            pressed={bodyType === value}
            onClick={disabled ? undefined : () => onBodyType(bodyType === value ? '' : value)}
            title={
              bodyType === value
                ? 'press again to say nothing about the build — the generator then picks'
                : `ask for a ${value} build`
            }
          >
            {value}
          </Chip>
        ))}
      </ChipRow>

      {all.length > FILTER_FROM && (
        <div className='w-[200px]'>
          <Input
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            placeholder='find a model'
            disabled={disabled}
          />
        </div>
      )}

      {loading ? (
        <Text size='micro' variant='inactive' component='span'>
          loading the models…
        </Text>
      ) : !all.length ? (
        <Text size='micro' variant='inactive' component='span' className='normal-case'>
          This admin holds no fit models yet. Add them under MODELS, or say the build alone — a
          turntable does not need a named person.
        </Text>
      ) : !shown.length ? (
        <Text size='micro' variant='inactive' component='span' className='normal-case'>
          No model here is called “{query.trim()}”.
        </Text>
      ) : (
        <div className={`${GALLERY_MAX_HEIGHT} overflow-y-auto`}>
          <Tiles min={TILE_MIN}>
            {shown.map((model) => {
              const id = model.id ?? 0;
              const chosen = id === modelId;
              const thumb = modelThumb(model);
              const facts = modelFacts(model, sizeName);
              return (
                <Tile
                  key={id}
                  selected={chosen}
                  pressed={chosen}
                  title={modelCaption(model, sizeName)}
                  onClick={disabled ? undefined : () => onModel(chosen ? 0 : id)}
                  media={
                    thumb ? (
                      <img
                        src={thumb}
                        alt=''
                        loading='lazy'
                        className='aspect-[3/4] w-full border border-borderColor object-cover'
                      />
                    ) : (
                      // `w-full` СКАЗАН ЯВНО: `Placeholder` задаёт только пропорцию, и без ширины
                      // он схлопывался в квадратик посреди плитки — кадр без снимка обязан занимать
                      // место снимка, иначе ряд плиток разъезжается по высоте.
                      <Placeholder aspect='3/4' label='no photo' className='w-full' />
                    )
                  }
                >
                  {/* `w-full` НЕСУЩЕЕ — см. шапку файла: без него подпись ложится поверх соседней
                      карточки, а `truncate` при этом молчит. */}
                  <Text
                    size='micro'
                    component='p'
                    className='mt-1 w-full min-w-0 truncate font-bold uppercase'
                  >
                    {modelName(model)}
                  </Text>
                  <Text
                    size='micro'
                    variant='label'
                    component='p'
                    className='w-full min-w-0 truncate'
                  >
                    {facts || '—'}
                  </Text>
                </Tile>
              );
            })}
          </Tiles>
        </div>
      )}

      {/* ЧТО ИЗ ЭТОГО УПРАВЛЯЕТ КАРТИНКОЙ, А ЧТО ТОЛЬКО ЗАПИСЫВАЕТСЯ — сказано под самим органом, а
          не в модалке «what the model gets»: человек читает это, когда ВЫБИРАЕТ, а не когда
          проверяет. Орган, который делает не то, что кажется, хуже отсутствующего. */}
      <Text size='micro' variant='label' component='p' className='normal-case'>
        Who it is, what shape it has, or both. The build travels to the generator as a word; the
        model is recorded on the run, and nothing about her reaches the generator — press a chosen
        one again to take the choice back.
      </Text>
    </div>
  );
}
