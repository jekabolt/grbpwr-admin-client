import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import Text from 'ui/components/text';

import { kindDef } from './kinds';
import { AnnotationStyleRow } from './style-row';

// РЕДАКТОР ВЫНОСКИ (режим плашки) — текст, детали, оформление, удаление.
//
// ТЕКСТ ВСЕГДА ЧЁРНЫМ ПО БЕЛОМУ, независимо от цвета указания. Цветной текст в девять пикселей
// нечитаем, цветная рамка вокруг плашки — шум, а боковая цветная кромка запрещена системой.
// Принадлежность плашки читается ПО ЛИДЕРУ, который в неё упирается, и по самой фигуре: правило
// одно — «цвет красит геометрию, никогда текст и номер».
//
// ПОЛЕ МНОГОСТРОЧНОЕ. Указание вроде «настрочить отделочной 6 мм, закрепки в начале и конце» в одну
// строку не помещается, а Enter в однострочном поле раньше закрывал редактор — то есть перенос
// строки был физически невыразим. Теперь Enter переносит; закрывают Esc и ⌘Enter.
//
// ВЫСОТА У РЕДАКТОРА ФИКСИРОВАННАЯ, И ЭТО НЕСУЩЕЕ РЕШЕНИЕ, А НЕ ОФОРМЛЕНИЕ.
//
// Он растягивался под длину подписи (поле росло до 160px) и появлялся/исчезал по выбору. Стоит он
// в нормальном потоке НАД рядом кадров — значит каждый клик по выноске двигал все картинки вниз, а
// клик по соседней с более длинным текстом двигал их ещё раз. Это и есть «экран дёргается, когда
// нажимаешь на колаут»: незапрошенный layout-motion. Лечится он не транзишном (анимированный сдвиг
// остаётся сдвигом), а тем, что редактор перестаёт участвовать в потоке переменной высотой.
//
// Отсюда: шапка фиксированной высоты (личность выноски слева, действия справа) плюс прокручиваемая
// середина. Ряды полей НЕ прореживаются и не прячутся за «ещё» — плотность здесь функция: технолог
// правит текст, детали, размер и оформление одним заходом.
//
// ДЕЙСТВИЯ — КНОПКИ, А НЕ ПУНКТИРНЫЕ ЧИПЫ. Пунктирный чип в этой системе означает «добавить»
// (добавить деталь, добавить кадр), и «delete» в костюме добавления — одна из причин, по которым
// меню читалось непонятным. Заодно они переехали в шапку: ряд действий, стоявший ПОСЛЕ полей,
// приходилось искать под скроллом.

/**
 * Высота полосы редактора, px. Экспортируется, потому что её обязан знать тот, кто РЕЗЕРВИРУЕТ под
 * неё место (`FocusedAnnotator`): резерв и содержимое, разъехавшись на пиксель, вернули бы то самое
 * дёрганье, ради которого резерв и заведён.
 */
export const ANNOTATION_EDITOR_H = 148;

/**
 * Потолок роста поля подписи, px — примерно две видимые строки. Дальше поле скроллит само.
 *
 * Прежние 160px внутри полосы фиксированной высоты означали бы, что при длинной подписи ряд
 * оформления и ряд деталей всегда за нижним краем: одно поле выталкивало бы все остальные.
 */
const TEXT_MAX_H = 42;

export function AnnotationEditor({
  kind,
  number,
  text,
  color,
  dashed,
  filled,
  pieceKeys,
  pieceLabel,
  onText,
  onColor,
  onDashed,
  onFilled,
  onPieces,
  onRemove,
  onClose,
  renderPiecePicker,
  extra,
  onDemote,
  sameKey = (a, b) => a === b,
  style = true,
  maxLength = 500,
  anchors,
  heading,
}: {
  kind: string;
  /** Номер выноски, которым её адресуют снаружи. Не задан — в шапке его нет. */
  number?: number;
  /**
   * Где стоит правимая выноска, словами владельца («picture 2»).
   *
   * Нужен там, где кадров на листе несколько, а редактор один и живёт НЕ под своим кадром: без
   * него правишь текст, не видя, к какой из пяти картинок он приколот, — и узнаёшь это, только
   * найдя подсвеченный пин глазами.
   */
  heading?: string;
  text: string;
  color: string;
  dashed: boolean;
  filled: boolean;
  pieceKeys: string[];
  pieceLabel?: (lineKey: string) => string | undefined;
  onText: (v: string) => void;
  onColor: (v: string) => void;
  onDashed: (v: boolean) => void;
  onFilled: (v: boolean) => void;
  onPieces: (keys: string[]) => void;
  onRemove: () => void;
  onClose: () => void;
  /** Пикер детали с силуэтами. Отсутствует — строки деталей нет вовсе (печать, архив). */
  renderPiecePicker?: (opts: { selected: string[]; onPick: (lineKey: string) => void }) => ReactNode;
  /**
   * Поля, которые есть только у ЭТОГО владельца. У карточного указания это привязка размера
   * («14 × 16»), которую печатает тех-пак; у снимка шага её нет.
   *
   * СЛОТ, А НЕ ВТОРОЙ РЕДАКТОР: форма правки одна на все экраны, и различие в одном поле не повод
   * разводить их — разведённые, они разойдутся и во всём остальном, как уже разошлись однажды.
   */
  extra?: ReactNode;
  /**
   * Разжаловать фигуру обратно в нумерованную точку. Отсутствует — чипа нет.
   *
   * Нужен там, где номер выноски АДРЕСУЕТ её снаружи: удалить и поставить заново означало бы новый
   * номер и повисшие ссылки. У выноски снимка шага номера-адреса нет, и разжаловать её незачем —
   * проще стереть.
   */
  onDemote?: () => void;
  /**
   * Совпадают ли два ключа детали. По умолчанию — точное равенство: у выноски снимка шага это
   * ULID, и «почти равно» там не бывает.
   *
   * Эскиз хранит ИМЕНА, и имя из эпохи свободного текста отличается от каталожного регистром —
   * точное сравнение давало бы два чипа на одну деталь и «клик по выбранной добавляет вторую».
   */
  sameKey?: (a: string, b: string) => boolean;
  /**
   * Показывать ряд оформления. Выключается там, где владельцу негде хранить цвет: ряд свотчей,
   * который ничего не пишет, хуже отсутствующего — он обещает, что нажатие что-то изменит.
   */
  style?: boolean;
  /**
   * Потолок длины записки. ЗАДАЁТ ВЛАДЕЛЕЦ, потому что он же владеет ВТОРЫМ полем на ту же
   * запись: у примерки текст правится и здесь, и в списке заметок, и разные потолки означали, что
   * набранная в списке заметка здесь не дописывается — браузер отказывает во вставке МОЛЧА.
   * Умолчание — прежние 500: у карточного указания второго поля нет, и менять ей потолок незачем.
   */
  maxLength?: number;
  /**
   * Сколько якорей у фигуры НА САМОМ ДЕЛЕ. Не задан — подсказка про ручки решается по реестру, как
   * и раньше (поведение карточных поверхностей не меняется).
   *
   * Нужен потому, что «у вида есть ручки» и «у ЭТОЙ фигуры есть за что взяться» — разные вещи: у
   * пина примерки якорей нет вовсе (его единственная точка живёт в маркере), и подсказка обещала
   * ручки, которых не появится ни при каком клике.
   */
  anchors?: number;
}) {
  const d = kindDef(kind);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Поле растёт под текст до потолка, дальше скроллит: фиксированная одна строка прячет вторую, а
  // рост без потолка выталкивал бы из полосы всё остальное.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, TEXT_MAX_H)}px`;
  }, [text]);

  return (
    <div
      className='flex min-h-0 flex-col gap-1 border border-borderColor p-1.5'
      style={{ height: ANNOTATION_EDITOR_H }}
    >
      {/* ШАПКА — ЧТО ПРАВИШЬ И ЧЕМ ЗАКОНЧИТЬ. Ровно две вещи, и обе на месте при любой длине
          подписи: она не прокручивается вместе с полями. */}
      <div className='flex shrink-0 items-center gap-1.5'>
        <Text size='micro' variant='label' component='span' className='shrink-0 uppercase'>
          {d.label}
          {number ? ` · ${number}` : ''}
        </Text>
        {heading && (
          <Text size='micro' variant='label' component='span' className='min-w-0 truncate uppercase'>
            {heading}
          </Text>
        )}
        <span className='ml-auto flex shrink-0 items-center gap-1'>
          <Button
            type='button'
            variant='secondary'
            size='xs'
            onClick={onRemove}
            title='delete this callout'
          >
            delete
          </Button>
          {onDemote && (
            <Button
              type='button'
              variant='secondary'
              size='xs'
              onClick={onDemote}
              title='drop the shape, keep the numbered point'
            >
              make it a point
            </Button>
          )}
          <Button
            type='button'
            variant='secondary'
            size='xs'
            onClick={onClose}
            title='close the editor (Esc or ⌘Enter)'
          >
            done
          </Button>
        </span>
      </div>

      {/* СЕРЕДИНА — единственное, что прокручивается. */}
      <div className='flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto'>
        <textarea
          ref={ref}
          rows={1}
          value={text}
          onChange={(e) => onText(e.target.value)}
          onKeyDown={(e) => {
            // Enter ПЕРЕНОСИТ. Закрывают Esc (как записку эскиза) и ⌘Enter — привычка «отправить».
            if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }
          }}
          placeholder={d.key === 'dim' ? 'a value with units — “6 mm”' : 'what to do here'}
          maxLength={maxLength}
          className='w-full shrink-0 resize-none border border-borderColor bg-bgColor px-1 py-px text-micro leading-snug text-textColor focus:border-textColor focus:outline-none'
        />

        {/* ДЕТАЛИ КРОЯ, О КОТОРЫХ УКАЗАНИЕ — СПИСОК, а не одна. Узел законно собирает несколько
            деталей сразу: «втачать рукав в пройму» это и рукав, и полочка, и спинка, и выбирать из
            них главную у шва не у кого. Ссылка советующая: деталь могли удалить на вкладке
            выкроек, и тогда чип честно говорит «деталь удалена» — молча спрятать связь нельзя,
            иначе она висит в данных вечно, потому что перевыбрать её никто не догадается. */}
        {renderPiecePicker && (
          <div className='flex shrink-0 flex-wrap items-center gap-1'>
            <Text size='micro' variant='label' component='span' className='shrink-0 uppercase'>
              pieces:
            </Text>
            <ChipRow>
              {pieceKeys.map((k) => {
                const name = pieceLabel?.(k);
                return (
                  <Chip
                    key={k}
                    tone={name ? 'default' : 'error'}
                    title={
                      name ? 'remove the piece from the callout' : 'no piece with this key any more'
                    }
                    onRemove={() => onPieces(pieceKeys.filter((x) => !sameKey(x, k)))}
                  >
                    {/* ИМЯ ВИДНО ДАЖЕ У НЕИЗВЕСТНОЙ ДЕТАЛИ: без него не понять, что именно было
                        привязано, и восстановить связь можно только угадав. */}
                    {name ?? `${k} — not among the pieces`}
                  </Chip>
                );
              })}
              {renderPiecePicker({
                // ПИКЕР ЗНАЕТ ПРО УЖЕ ВЫБРАННЫЕ. Без этого список не помечает добавленные детали, а
                // клик по такой их СНИМАЕТ — то есть выбор ведёт себя противоположно тому, что
                // показано, и понять это можно только попробовав.
                selected: pieceKeys,
                onPick: (lineKey) => {
                  if (!lineKey) return;
                  onPieces(
                    pieceKeys.some((x) => sameKey(x, lineKey))
                      ? pieceKeys.filter((x) => !sameKey(x, lineKey))
                      : [...pieceKeys, lineKey],
                  );
              },
            })}
            </ChipRow>
          </div>
        )}

        {extra && <div className='shrink-0'>{extra}</div>}

        {style && (
          <div className='shrink-0'>
            <AnnotationStyleRow
              kind={kind}
              color={color}
              dashed={dashed}
              filled={filled}
              onColor={onColor}
              onDashed={onDashed}
              onFilled={onFilled}
            />
          </div>
        )}

        {/* ПОДСКАЗКА ПРО РУЧКИ — ТОЛЬКО КОГДА ЯКОРЯ ЕСТЬ. `d.handles` отвечает на вопрос «правится
            ли ВИД ручками», а не «есть ли у ЭТОЙ фигуры хоть одна точка». У пина примерки якорей
            нет по построению, и на кадре не появляется ни одной ручки — подсказка обещала жест,
            которого нет. Владелец, который про свои якоря молчит, получает прежнее поведение.
            СТОИТ ПОСЛЕДНЕЙ, А НЕ В РЯДУ ДЕЙСТВИЙ: это знание о кадре, а не кнопка. */}
        {d.handles && (anchors ?? 1) > 0 && (
          <Text size='nano' variant='label' component='span' className='shrink-0'>
            points are edited by the handles on the frame; click a handle and press Delete to drop
            the point
          </Text>
        )}
      </div>
    </div>
  );
}
