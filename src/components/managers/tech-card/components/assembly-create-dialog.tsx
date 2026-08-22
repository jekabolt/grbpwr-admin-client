import { common_TechCardOperationType } from 'api/proto-http/admin';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Chip, ChipRow } from 'ui/components/chip';
import { Combobox, type ComboboxGroup } from 'ui/components/combobox';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import Select from 'ui/components/select';
import Text from 'ui/components/text';

import { suggestUnitCode } from './assembly-suggest';
import { machineTypeOptionsFor, pressEquipmentOptions } from './equipment-options';
import {
  STEP_DISCRIMINATORS,
  stepDiscriminatorUnset,
  stepEnumOptions,
  zoneOptions,
} from './operation-options';
// ПИКЕР ВИДА СТОИТ В ДВУХ МЕСТАХ, И ЭТО НЕ ДУБЛИРОВАНИЕ. Владелец открыл СУЩЕСТВУЮЩИЙ шаг и не
// нашёл там топстич — пикер только на создании жалобу не закрывает. Модуль один, вызывающих мест
// два, список строк собирает один `kindPickerItems`: свой список здесь разошёлся бы с редактором
// на первом же добавленном виде, и разошёлся бы молча.
import { KIND_BY_WORK_TOKEN, kindWrites } from './operation-kinds';
import { groupWorks, machineTokenToEnum, searchWorks, workWrites } from './operation-work';
import { useOperationWorkCatalog } from './useOperationWorkCatalog';

// Диалог создания операции из схемы.
//
// ЕГО ЕДИНСТВЕННАЯ ЗАДАЧА — СОБРАТЬ ВАЛИДНЫЙ МИНИМУМ. До Ф7 «сшить» и «+ операция» создавали шаг
// из `emptyOperation`, у которого тип и зона стоят в UNKNOWN, — то есть заведомо невалидный:
// сервер обе требует, и zod требует тоже. Технолог получал на рельсе строку с «!» и шёл её
// дозаполнять, а жест, который должен был закончиться результатом, заканчивался долгом.
//
// ЭТО НЕ ВТОРОЙ РЕДАКТОР ШАГА. SMV, шов, отстрочка, настройки ВТО здесь не собираются: после
// создания открывается полный редактор, и место всему остальному там. Граница проходит ровно по
// валидности — что нужно, чтобы шаг существовал законно, спрашивается тут; что описывает шаг
// подробнее — там.
//
// НИКАКИХ ДЕФОЛТОВ В ТИП И ЗОНУ. Пустой выбор и явный ответ: подставленный «machine» прошёл бы все
// проверки и уехал на печать как утверждение, которого никто не делал. Это та же философия, по
// которой `emptyOperation` перестал подставлять пресеты.

export type CreatePrefill = {
  /** Входы, назначенные жестом: выбор на полотне или пара «тащили → бросили». */
  inputKeys: string[];
  /** Цель жеста — живой узел: значит предлагается ПОГЛОЩЕНИЕ, и оно предвыбрано. */
  absorbInto?: string;
  /**
   * Чего хотел жест. «Обработка» и «сшить» приходят с разных кнопок, и угадывать намерение по
   * числу входов значило бы переигрывать выбор автора: два входа бывают и у обработки.
   */
  intent?: 'unit' | 'process';
  /**
   * ПОЗИЦИЯ В ПОСЛЕДОВАТЕЛЬНОСТИ, на которую жест метил. Пусто — «в конец листа», как было всегда.
   *
   * Число это меняет и то, ЧТО диалог имеет право предлагать: входы берутся из фронтира ПЕРЕД
   * шагом `at`, а не из конечного. Деталь, свободная в конце, на позиции 4 может быть ещё не
   * произведена или уже съедена — конечный фронтир предложил бы заведомо неверный состав.
   */
  at?: number;
  /**
   * ДЕТАЛЬ, НА КОТОРОЙ ЖЕСТ ОБЕЩАЛ ПОКАЗАТЬ ШАГ. Пусто — жест ничего про деталь не обещал.
   *
   * Отдельное поле, а не вывод из `inputKeys`: обещание даёт ОРГАН («＋ operation» на плитке
   * детали), и после того как состав в диалоге переиграли, состав уже не помнит, с чего жест
   * начинался. Ровно та же причина, по которой рядом живёт `intoUnit`.
   */
  ontoPiece?: string;
  /**
   * УЗЕЛ, В КОТОРЫЙ ЖЕСТ ОБЕЩАЛ ПОПАСТЬ. Принадлежность шага узлу — ВЫЧИСЛЯЕМАЯ ПРОЕКЦИЯ (её
   * выводит `assembly-blocks.ts` из входов), в данных её нет, и «вставить операцию в узел» прямым
   * действием невыразимо. Значит обещание жеста обязано ехать сюда отдельным полем: только так
   * диалог может сказать словами, что набранный состав его больше не держит.
   */
  intoUnit?: string;
};

export type CreateResult = {
  inputKeys: string[];
  operationType: string;
  zone: string;
  machineType?: string;
  pressEquipment?: string;
  /**
   * ОБЯЗАТЕЛЬНЫЙ ВОПРОС ГЛАГОЛА — ПАРОЙ «ПОЛЕ + ЗНАЧЕНИЕ», а не шестью необязательными ключами.
   * Дискриминатор у глагола ровно один, и какой именно — знает `STEP_DISCRIMINATORS`; шесть
   * полей в этом типе означали бы шестой список, который надо держать в согласии с таблицей.
   */
  discriminatorField?: string;
  discriminatorValue?: string;
  /**
   * ОСТАЛЬНОЕ, ЧТО ПРОСТАВИЛ ПУНКТ ПИКЕРА, — плоской картой «имя поля строки формы → значение».
   * Сегодня это класс шва у отстрочки, завтра — ВТО-подглагол. Плоской, а не типизированной, по
   * той же причине, что и в `operation-kinds`: имени, которого в строке формы ЕЩЁ нет, писатель
   * обязан уметь молча не заметить.
   */
  kindWrites?: Record<string, string>;
  /** Пусто = обработка: шаг ничего не собирает, входы остаются на столе. */
  outputUnitKey: string;
  outputUnitName: string;
};

const UNKNOWN_TYPE = 'TECH_CARD_OPERATION_TYPE_UNKNOWN';
const UNKNOWN_ZONE = 'TECH_CARD_GARMENT_ZONE_UNKNOWN';
const UNKNOWN_MACHINE = 'TECH_CARD_MACHINE_TYPE_UNKNOWN';
const UNKNOWN_PRESS = 'TECH_CARD_PRESS_EQUIPMENT_UNKNOWN';

const PRESS_TYPES = new Set([
  'TECH_CARD_OPERATION_TYPE_PRESS',
  'TECH_CARD_OPERATION_TYPE_PRESS_OPEN',
  'TECH_CARD_OPERATION_TYPE_FUSING',
]);

export function AssemblyCreateDialog({
  prefill,
  onClose,
  onCreate,
  frontier,
  unitKeys,
  pieceKeys,
  labelOf,
  unitOfPlanned,
  pieceOfPlanned,
  onCloseAutoFocus,
}: {
  prefill: CreatePrefill | null;
  onClose: () => void;
  onCreate: (r: CreateResult) => void;
  /**
   * Что лежит на столе ТАМ, КУДА МЕТИТ ЖЕСТ, — из чего вообще можно брать входы. Для жеста без
   * позиции это конец последовательности, для вставки — фронтир перед шагом `at`. Считает это
   * вызыватель: фронтир знает движок, а движок живёт у него.
   */
  frontier: string[];
  /** Ключи существующих узлов — для правила 6 и для варианта «дособрать». */
  unitKeys: Set<string>;
  /** Ключи деталей — второе полукольцо того же пространства имён. */
  pieceKeys: Set<string>;
  /** Человеческое имя ноды: имя детали или код узла. */
  labelOf: (key: string) => string;
  /**
   * В КАКОЙ УЗЕЛ ПОПАДЁТ ШАГ С ТАКИМ СОСТАВОМ, если создать его прямо сейчас. Пусто — «вне узлов».
   *
   * СЧИТАЕТ ЭТО ДВИЖОК, А НЕ ПЕРЕСКАЗ ДВИЖКА: вызыватель прогоняет `assemblySweep` +
   * `assemblyBlocks` по последовательности с ВСТАВЛЕННЫМ кандидатом и читает готовую атрибуцию.
   * Правило «блок решает первый вход, ведущий к узлу» переписанное здесь второй раз, разошлось бы
   * с оригиналом молча — а цена расхождения ровно та, ради которой предупреждение и заведено:
   * человек читает «попадёт в COLLAR» и получает шаг в хвосте «вне узлов».
   */
  unitOfPlanned?: (draft: { inputKeys: string[]; outputUnitKey: string }) => string;
  /**
   * НА ЧЬЕЙ ПЛИТКЕ ПОЯВИТСЯ ШАГ С ТАКИМ СОСТАВОМ. Пусто — ни на чьей.
   *
   * Считает это ТО ЖЕ ПРАВИЛО, по которому строка на плитке рисуется (`processedPieceOf` в
   * `assembly-layout.ts`), а не пересказ правила: раньше диалог спрашивал вопрос СЛАБЕЕ дела —
   * «остался ли этот вход в составе», — и молчал в двух случаях из трёх, когда обещание жеста
   * уже не держалось.
   */
  pieceOfPlanned?: (draft: { inputKeys: string[]; outputUnitKey: string }) => string;
  /**
   * Куда вернуть фокус, когда диалог закрылся. Нужен ФУЛСКРИНУ: его роутер клавиш — обработчик на
   * контенте оверлея, и фокус, упавший в `body`, гасит ⌘Z, ⌘F, ⌘A и все глаголы до первого клика
   * внутри. В инлайне роутера нет, проп не передаётся, поведение прежнее.
   */
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const [inputs, setInputs] = useState<string[]>([]);
  // Начальное значение — UNKNOWN-сентинел словаря, а не пустая строка: именно он и означает
  // «не выбрано» во всём остальном редакторе, и именно он рисуется плейсхолдером.
  const [operationType, setOperationType] = useState(UNKNOWN_TYPE);
  const [zone, setZone] = useState(UNKNOWN_ZONE);
  const [machineType, setMachineType] = useState(UNKNOWN_MACHINE);
  const [pressEquipment, setPressEquipment] = useState(UNKNOWN_PRESS);
  // Ответ на обязательный вопрос глагола. Пусто — пока глагол его не задаёт: селекта на экране
  // нет вовсе, и хранить в нём нечего.
  const [discriminator, setDiscriminator] = useState('');
  // ВИД — ТО, ЧТО ВЫБИРАЕТ ЧЕЛОВЕК; глагол, машинка и дискриминатор ниже — то, что из него следует.
  // Состояния три, а не одно, потому что диалог по-прежнему обязан уметь ДОСПРОСИТЬ то, чего вид
  // не назвал (пресс у «press flat», метод у печати), и валидируется именно набранный минимум.
  const [workToken, setWorkToken] = useState('');
  const [kindExtraWrites, setKindExtraWrites] = useState<Record<string, string>>({});
  const [produces, setProduces] = useState<'process' | 'unit' | 'absorb'>('process');
  const [unitKey, setUnitKey] = useState('');
  const [unitKeyTouched, setUnitKeyTouched] = useState(false);
  const [unitName, setUnitName] = useState('');

  const open = prefill !== null;

  // Каждое открытие — чистый лист: диалог собирает ОДИН жест, и донашивать за предыдущим он не
  // должен. Результат предвыбирается по жесту: бросили на живой узел — значит «дособрать».
  useEffect(() => {
    if (!prefill) return;
    setInputs(prefill.inputKeys);
    setOperationType(UNKNOWN_TYPE);
    setZone(UNKNOWN_ZONE);
    setMachineType(UNKNOWN_MACHINE);
    setPressEquipment(UNKNOWN_PRESS);
    setDiscriminator('');
    setWorkToken('');
    setKindExtraWrites({});
    setProduces(
      prefill.absorbInto
        ? 'absorb'
        : prefill.intent === 'process'
          ? 'process'
          : prefill.intent === 'unit' || prefill.inputKeys.length >= 2
            ? 'unit'
            : 'process',
    );
    setUnitKey('');
    setUnitKeyTouched(false);
    setUnitName('');
  }, [prefill]);

  /**
   * ЗАНЯТОСТЬ КОДА СПРАШИВАЕТСЯ ТОЖДЕСТВОМ ПРОВОДА, А НЕ БАЙТАМИ ФОРМЫ. Тот же род, что чинился
   * в `assembly-rename.ts` (коммит `16524469`), и тот же довод: подрезка — не вежливость к набору,
   * а то, чем ключ СТАНЕТ. На провод уезжают подрезанными обе стороны — ключ детали
   * (`p.lineKey?.trim() || ulid()`) и код узла (`outputUnitKey.trim()`), `schema.ts`, — а
   * пространство имён у них общее (правило 6).
   *
   * Поле хранит НАБРАННОЕ как есть, и восстановленный черновик несёт его же, поэтому деталь
   * « BODY » живёт в форме сколько угодно. Сырое сравнение её не узнавало: диалог разрешал узел
   * «BODY», клиентский граф соглашался (он тоже считает по сырым ключам), а сервер отвергал
   * сохранение — и невидимые пробелы в ключе чужой детали человек не нашёл бы никогда.
   *
   * РЕГИСТР НЕ НОРМАЛИЗУЕТСЯ: колонка объявлена `COLLATE utf8mb4_bin`, «SHELL» и «Shell» — два
   * разных узла, и подрезка их ничем не сближает.
   */
  const wireKeys = (keys: Iterable<string>) => {
    const out = new Set<string>();
    for (const k of keys) {
      const t = k.trim();
      if (t) out.add(t);
    }
    return out;
  };
  const piecesOnWire = useMemo(() => wireKeys(pieceKeys), [pieceKeys]);
  const unitsOnWire = useMemo(() => wireKeys(unitKeys), [unitKeys]);

  const taken = useMemo(() => {
    const s = new Set<string>(piecesOnWire);
    for (const k of unitsOnWire) s.add(k);
    return s;
  }, [piecesOnWire, unitsOnWire]);

  // Код предлагается от ЗОНЫ и переигрывается, пока автор его не тронул руками: зона выбирается
  // раньше, и код, застывший на «UNIT» после выбора зоны, был бы предложением мимо.
  useEffect(() => {
    if (!open || produces !== 'unit' || unitKeyTouched) return;
    setUnitKey(suggestUnitCode(zone, taken));
  }, [open, produces, zone, taken, unitKeyTouched]);

  const distinct = useMemo(() => Array.from(new Set(inputs)), [inputs]);
  const canBeUnit = distinct.length >= 2;
  const absorbInto = prefill?.absorbInto ?? '';

  // Правило 6 и «второй производитель» — те же отказы, что в открытом шаге, теми же словами.
  const codeProblem = (() => {
    if (produces !== 'unit') return '';
    const code = unitKey.trim();
    if (!code) return 'a unit needs a code — that is what every other step calls it by';
    if (piecesOnWire.has(code)) return `the key “${code}” is taken by a piece — pieces and units share one namespace`;
    if (unitsOnWire.has(code)) return `unit “${code}” already exists — a second producer of the same unit is impossible`;
    if (new TextEncoder().encode(code).length > 64) return "the code is longer than 64 bytes — that won't fit the column";
    return '';
  })();

  // Машинку ДОСПРАШИВАЕТ только тот вид, чей якорь не машинка (отстрочка): у остальных машинных
  // видов машинка и ЕСТЬ вид, и второй вопрос про неё был бы вопросом о том, что уже отвечено.
  const needsMachine = operationType === 'TECH_CARD_OPERATION_TYPE_MACHINE';
  const needsPress = PRESS_TYPES.has(operationType);
  /**
   * ОБЯЗАТЕЛЬНЫЙ ВОПРОС ГЛАГОЛА — ТРЕТЬЯ ОСЬ, РОВНО ТАКАЯ ЖЕ, КАК МАШИНКА И ПРЕСС ВЫШЕ.
   *
   * У шести глаголов волны 0324 есть поле, без которого сервер отвергает шаг БЕЗУСЛОВНО. Диалог,
   * который его не спрашивает, обещает валидный минимум и выдаёт шаг с `*_UNKNOWN` в требуемом
   * поле — то есть ровно тот долг, ради отмены которого он и заведён. Таблица берётся общая: свой
   * список «у каких глаголов есть дискриминатор» разошёлся бы с редактором на седьмом глаголе.
   */
  const stepDiscriminator = STEP_DISCRIMINATORS[operationType as common_TechCardOperationType];
  // Слово, которым поле названо человеку, — то же самое, каким подписан контрол в открытом
  // редакторе, но без звёздочки: «*» там значит «обязательное», а здесь обязательно ВСЁ, что
  // диалог спрашивает. Имя поля на проводе живёт рядом, в `stepDiscriminator.field`.
  const discriminatorWord = stepDiscriminator ? stepDiscriminator.label.replace(/\s*\*$/, '') : '';

  const { catalog: workCatalog, live: catalogLive } = useOperationWorkCatalog();
  const work = workToken ? workCatalog.byToken.get(workToken) : undefined;
  const filterWorks = useCallback(
    (query: string): ComboboxGroup[] =>
      groupWorks(searchWorks(workCatalog, query)).map((g) => ({
        key: g.key,
        label: g.label,
        options: g.items.map((w) => ({ value: w.token, label: w.label })),
      })),
    [workCatalog],
  );

  /**
   * ВЫБОР РАБОТЫ ПРОСТАВЛЯЕТ ОБЕ ОСИ И ДИСКРИМИНАТОР, где работа на него отвечает, — И САМУ
   * РАБОТУ: токен уезжает в строку шага вместе с остальным, через `kindWrites` результата.
   * Отдельного поля в результате диалога у него нет НАМЕРЕННО: `insertFilledStep` уже отбрасывает
   * имена, которых нет в `emptyOperation`, и второй путь записи прошёл бы мимо этого щита.
   *
   * СМЕНА РАБОТЫ СБРАСЫВАЕТ ОТВЕТ ДИСКРИМИНАТОРА, И ЭТО НЕ ПРИБОРКА. Словари у шести
   * дискриминаторов разные: оставленный от предыдущего выбора токен — значение ЧУЖОГО enum, и
   * сервер отвергает его по имени поля.
   */
  const pickWork = (token: string) => {
    const item = workCatalog.byToken.get(token);
    if (!item) return;
    setWorkToken(token);
    const k = KIND_BY_WORK_TOKEN.get(token);
    // Машинка здесь ставится ДЕФОЛТОМ РАБОТЫ, а не парком: парк живёт в форме карточки, а диалог
    // формы не видит вовсе. Единственный подходящий профиль подставит редактор шага, куда диалог
    // и приводит сразу после создания.
    const w = workWrites(item, k, '', '', kindWrites);
    const verb = w.operationType ?? UNKNOWN_TYPE;
    setOperationType(verb);
    setMachineType(w.machineType ?? UNKNOWN_MACHINE);
    setPressEquipment(w.pressEquipment ?? UNKNOWN_PRESS);
    const d = STEP_DISCRIMINATORS[verb as common_TechCardOperationType];
    setDiscriminator(d ? (w[d.field] ?? stepDiscriminatorUnset(d.labels)) : '');
    // Всё, о чём диалог не спрашивает отдельным контролом, едет в результат как есть — вместе с
    // самой работой.
    const rest: Record<string, string> = { ...w, work: token };
    delete rest.operationType;
    delete rest.machineType;
    delete rest.pressEquipment;
    if (d) delete rest[d.field];
    setKindExtraWrites(rest);
  };

  const problem = (() => {
    if (distinct.length === 0) return 'a step must have at least one input';
    // ВХОД ОБЯЗАН ЛЕЖАТЬ НА СТОЛЕ (правило 1). Прийти сюда мёртвый ключ может: выбор на полотне
    // переживает соседний жест, который эту деталь съел, и «обработка · 1» по ней родила бы шаг,
    // который движок и сервер отвергнут. Диалог, обещающий валидный шаг, обязан это ловить.
    const dead = distinct.find((k) => !frontier.includes(k));
    if (dead) return `“${dead}” is no longer on the table — it can't be taken as an input`;
    // Поглощение теряет смысл, если поглощаемый узел сняли из входов: получился бы ВТОРОЙ
    // производитель живого узла, а не его дособирание.
    if (produces === 'absorb') {
      if (!distinct.includes(absorbInto)) {
        return `unit ${absorbInto} has been removed from the inputs — you can only add to what the step takes`;
      }
      // Поглощение — тоже сборка узла, и правило 3 на него распространяется: `GARMENT → GARMENT`
      // не дособирает ничего, движок отвечает too-few-inputs.
      if (distinct.length < 2) {
        return `there is nothing to add to ${absorbInto} with — take at least one more input into the step`;
      }
    }
    if (!work) return 'pick what kind of step this is';
    if (!zone || zone === UNKNOWN_ZONE) return 'pick a zone — “other” is a legitimate answer';
    if (needsMachine && (!machineType || machineType === UNKNOWN_MACHINE)) return 'pick a machine';
    if (needsPress && (!pressEquipment || pressEquipment === UNKNOWN_PRESS)) return 'pick the pressing equipment';
    if (
      stepDiscriminator &&
      (!discriminator || discriminator === stepDiscriminatorUnset(stepDiscriminator.labels))
    ) {
      return `pick “${discriminatorWord}” — without it the step cannot be saved`;
    }
    if (produces === 'unit' && !canBeUnit) {
      return 'a unit made of a single input is processing, not a unit: take at least two inputs';
    }
    return codeProblem;
  })();

  // РЕЗУЛЬТАТ ЖЕСТА, СОБРАННЫЙ ОДИН РАЗ. Его же читает и предупреждение о принадлежности, и
  // отправка: два сборщика одной строки разошлись бы ровно там, где предупреждение обещает одно,
  // а уезжает другое.
  const draft = {
    inputKeys: distinct,
    outputUnitKey: produces === 'absorb' ? absorbInto : produces === 'unit' ? unitKey.trim() : '',
    outputUnitName: produces === 'unit' ? unitName.trim() : '',
  };

  /**
   * ОБЕЩАНИЕ ЖЕСТА ПРОТИВ НАБРАННОГО СОСТАВА.
   *
   * Точка вставки внутри узла обещает шаг ИМЕННО В ЭТОМ УЗЛЕ, но принадлежность выводится из
   * входов: снял ключ узла из состава — и шаг уедет в хвост «вне узлов» или в чужой блок. Молчать
   * об этом нельзя, запрещать тоже: состав меняют осознанно, и «обработка соседней детали отсюда»
   * — законное намерение. Поэтому слова, а не блокировка.
   */
  // ПУСТОЙ СОСТАВ СУДИТСЯ НАРАВНЕ С ЛЮБЫМ ДРУГИМ, и это не мелочь: снятие ключа узла из входов —
  // и есть тот жест, ради которого предупреждение заведено, а у вставки внутрь узла ключ часто
  // единственный вход. Промолчи здесь — и человек, снявший его, увидит только «шагу нужен хотя бы
  // один вход», то есть узнает, что чего-то не хватает, но не узнает, что именно он потерял.
  const judged = !!prefill?.intoUnit && !!unitOfPlanned;
  const lands = judged ? unitOfPlanned!(draft) : '';
  const holds = judged ? lands === prefill!.intoUnit : true;
  /**
   * ОБЕЩАНИЕ ПРО ДЕТАЛЬ — СВОИМ ВОПРОСОМ, А НЕ ЧЕРЕЗ ОРГАН УЗЛА. `unitOfPlanned` отвечает КЛЮЧОМ
   * УЗЛА: у детали его нет вовсе (свободная деталь ни в каком узле не лежит), и спроси мы про неё
   * тем же органом — предупреждение горело бы ВСЕГДА, то есть перестало бы что-либо значить.
   *
   * ВОПРОС ЗАДАЁТСЯ РОВНО ТОТ, ПО КОТОРОМУ СТРОКА РИСУЕТСЯ, и берётся он оттуда, где живёт, —
   * `pieceOfPlanned` зовёт `processedPieceOf` из `assembly-layout.ts`, ту же функцию, которой
   * раскладка решает, какие строки растит плитка.
   *
   * ЧТО БЫЛО НЕ ТАК. Здесь стояло `distinct.includes(ontoPiece)` — «остался ли этот вход в
   * составе», условие СЛАБЕЕ дела. Строка появляется на плитке только у шага, у которого вход
   * один различный и это та самая деталь, и который ничего не собирает. Значит щит молчал в двух
   * случаях из трёх (замерено): добавили второй вход — шаг уезжает в хвост, на плитке его нет;
   * переключили результат на новый узел — деталь съедена, строка уходит в блок узла. Обещание
   * жеста («строка появится на ЭТОЙ плитке») переставало держаться молча.
   *
   * ПРИЧИНА НАЗЫВАЕТСЯ, А НЕ ТОЛЬКО ФАКТ: три разных дела читаются одинаково плохо под одной
   * фразой «it no longer takes it», а последняя из них была бы вдобавок неправдой — деталь шаг
   * по-прежнему берёт.
   */
  const ontoPiece = prefill?.ontoPiece ?? '';
  const pieceJudged = !!ontoPiece && !!pieceOfPlanned;
  const pieceLands = pieceJudged ? pieceOfPlanned!(draft) : '';
  const keepsPiece = !pieceJudged || pieceLands === ontoPiece;
  const pieceProblem = (() => {
    if (keepsPiece) return '';
    // ДЕТАЛЬ НАЗЫВАЕТСЯ ТЕМ ЖЕ ИМЕНЕМ, ЧТО И ВЕЗДЕ ВОКРУГ. `ontoPiece` — это `lineKey`, а он у
    // детали ULID (`schema.ts`: `p.lineKey?.trim() || ulid()`), и напечатанный сырым он называет
    // деталь строкой, которой нет ни на плитке, с которой нажали (там `pieceNameOf`), ни в чипе
    // состава двумя строками выше (там `labelOf`). Предупреждение, называющее предмет именем, не
    // встречающимся на экране, не выполняет своей работы: человек не может сопоставить его ни с
    // чем. Имя берётся тем же органом, что и чип, — иначе они разошлись бы снова.
    const onto = `◌ this step will not appear on ▣ ${labelOf(ontoPiece)}`;
    if (!distinct.includes(ontoPiece)) return `${onto} — it no longer takes it`;
    if (draft.outputUnitKey) {
      return `${onto} — it assembles ▣ ${draft.outputUnitKey}, and that is a row of the unit`;
    }
    return `${onto} — a step on more than one piece belongs to none of them`;
  })();

  const belongProblem = holds
    ? ''
    : lands
      ? `◌ this step will not belong to ▣ ${prefill!.intoUnit} — it lands in ▣ ${lands}`
      : `◌ this step will not belong to ▣ ${prefill!.intoUnit} — nothing it takes leads there`;

  const submit = () => {
    if (problem) return;
    onCreate({
      ...draft,
      operationType,
      zone,
      machineType: needsMachine ? machineType : undefined,
      pressEquipment: needsPress ? pressEquipment : undefined,
      // Пара едет только с тем глаголом, у которого дискриминатор есть: у остальных поле в строке
      // остаётся тем, чем его завёл `emptyOperation`, и шаг не несёт ответа на незаданный вопрос.
      discriminatorField: stepDiscriminator?.field,
      discriminatorValue: stepDiscriminator ? discriminator : undefined,
      kindWrites: kindExtraWrites,
    });
  };

  // Кандидаты в дополнительные входы — только фронт: вход не на столе движок отвергнет, и
  // показывать такую строку значило бы предлагать заведомый отказ.
  const addable = frontier.filter((k) => !distinct.includes(k));

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      onConfirm={submit}
      onCancel={onClose}
      title='new operation'
      confirmLabel='create'
      cancelLabel='cancel'
      confirmDisabled={problem !== ''}
      closeOnConfirm={false}
      // ФОКУС ВОЗВРАЩАЕТСЯ ЭКРАНУ ПРЯМО ЗДЕСЬ, а не эффектом вызывателя по следующему кадру.
      // Radix на закрытии делает `preventDefault()` и метит фокус на триггер — а триггера нет,
      // диалог открывается состоянием. Восстановление подавлено и ничем не заменено: фокус падает
      // в `body`, и весь клавиатурный роутер фулскрина умирает до первого клика внутри.
      // Вызыватель умеет то же самое эффектом, но эффект бежит РАНЬШЕ, чем `Presence` снимает
      // портал: на тот момент кнопка «cancel» ещё жива и держит фокус, и возврат приходится
      // откладывать на кадр. Здесь такта ждать не надо — Radix зовёт это ровно тогда, когда сам
      // готов отдать фокус.
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <div className='flex flex-col gap-2.5'>
        {/* ГДЕ ШАГ ОКАЖЕТСЯ — ПЕРВОЙ СТРОКОЙ, потому что это рамка для всего остального. Без неё
            диалог вставки неотличим от диалога дописывания в конец: те же поля, то же «create», а
            результат в другом месте листа. Номер экранный, `(at + 1) * 10`, как везде; про переезд
            номеров следующих шагов говорит баннер `StepNumberDrift`, и второго здесь не будет. */}
        {prefill?.at !== undefined && (
          <div>
            <GroupLabel>position</GroupLabel>
            {/* «ВНУТРИ ▣ COLLAR» ГОВОРИТСЯ, ПОКА ЭТО ПРАВДА. Оставь его стоять рядом с
                предупреждением — и диалог сообщал бы обе новости сразу, а верна из них одна. */}
            <Text size='micro' variant='label'>
              {prefill.intoUnit && holds
                ? `step ${(prefill.at + 1) * 10}, inside ▣ ${prefill.intoUnit}`
                : `step ${(prefill.at + 1) * 10}`}
            </Text>
            {/* ЧЕРНИЛАМИ, А НЕ СЕРЫМ, И БЕЗ КРАСНОГО: красный занят ошибкой, а это не ошибка —
                это расхождение жеста с набранным составом, и различается оно глифом «◌» (тем же,
                каким рельс подписывает «вне узлов») и словами. */}
            {belongProblem && <Text size='micro'>{belongProblem}</Text>}
          </div>
        )}
        <div>
          <GroupLabel>inputs</GroupLabel>
          <ChipRow>
            {distinct.length === 0 && (
              <Text size='micro' variant='label' component='span'>
                no inputs — take at least one
              </Text>
            )}
            {distinct.map((k) => (
              <Chip key={k} onClick={() => setInputs((cur) => cur.filter((x) => x !== k))} title='remove the input'>
                {labelOf(k)} ✕
              </Chip>
            ))}
          </ChipRow>
          {addable.length > 0 && (
            <ChipRow className='mt-1'>
              <Text size='micro' variant='label' component='span' className='uppercase'>
                add:
              </Text>
              {addable.map((k) => (
                <Chip key={k} dashed onClick={() => setInputs((cur) => [...cur, k])} title='take as an input'>
                  {labelOf(k)}
                </Chip>
              ))}
            </ChipRow>
          )}
          {/* ПОД САМИМ СОСТАВОМ, А НЕ В «POSITION»: жест по детали позиции не несёт вовсе, и
              предупреждение обязано стоять там, где сделано действие, его вызвавшее. Чернилами и
              тем же глифом «◌», что у предупреждения про узел, — это одна новость двух родов, и
              читаться она обязана одинаково. Не запрет: убрать деталь из состава — законное
              намерение, ошибкой это не является. */}
          {pieceProblem && (
            <Text size='micro' className='mt-1'>
              {pieceProblem}
            </Text>
          )}
        </div>

        <div>
          <GroupLabel>result</GroupLabel>
          <ChipRow>
            <Chip
              dashed={produces !== 'process'}
              onClick={() => setProduces('process')}
              title='the step assembles nothing — the inputs stay available to the next steps'
            >
              processing
            </Chip>
            <Chip
              dashed={produces !== 'unit'}
              onClick={() => setProduces('unit')}
              title={canBeUnit ? 'assemble a new unit' : 'a unit needs at least two inputs'}
            >
              ▣ new unit
            </Chip>
            {absorbInto && (
              <Chip
                dashed={produces !== 'absorb'}
                onClick={() => setProduces('absorb')}
                title='add to an existing unit — it keeps its own code'
              >
                add to ▣ {absorbInto}
              </Chip>
            )}
          </ChipRow>
          {produces === 'unit' && (
            <div className='mt-1 flex flex-col gap-1'>
              <Input
                name='assemblyUnitKey'
                value={unitKey}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setUnitKeyTouched(true);
                  setUnitKey(e.target.value);
                }}
                placeholder='unit code'
                maxLength={64}
              />
              <Input
                name='assemblyUnitName'
                value={unitName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUnitName(e.target.value)}
                placeholder='unit name — optional, but it is what people read in print'
                maxLength={255}
              />
            </div>
          )}
        </div>

        <div className='flex flex-col gap-1'>
          <GroupLabel>what and where</GroupLabel>
          {/* ВИД ВМЕСТО ГЛАГОЛА. Раньше здесь стоял селект `operation_type`, и он спрашивал ось, а
              не работу: «machine» не инструкция, а «topstitch» в списке не было вовсе. Теперь
              спрашивается ОДНО слово, а обе оси проставляются из него; доспрашивается только то,
              на что вид не отвечает. Сентинелы («ещё», шапка семейства) выбором не являются —
              значение остаётся прежним, и промах ничего не стоит. */}
          <Combobox
            name='assemblyOperationWork'
            placeholder='what kind of step'
            searchPlaceholder='type the work — «моско», topstitch…'
            valueLabel={work?.label ?? ''}
            filter={filterWorks}
            onSelect={pickWork}
            footer={
              catalogLive ? undefined : (
                <Text size='micro' variant='label' component='span' data-work-fallback='1'>
                  offline list — the catalogue did not load, so search is English-only
                </Text>
              )
            }
          />
          <Select
            name='assemblyZone'
            value={zone}
            onValueChange={setZone}
            items={zoneOptions}
            fullWidth
          />
          {/* «НА ЧЁМ» — только у вида, чей якорь не машинка, и списком, суженным этим видом.
              У остальных машинных видов машинка и ЕСТЬ вид: спрашивать её второй раз значило бы
              разрешить ответ, противоречащий уже сделанному выбору. */}
          {needsMachine && work?.machineMode === 'ask' && (
            <Select
              name='assemblyMachineType'
              placeholder='on what'
              value={machineType}
              onValueChange={setMachineType}
              items={machineTypeOptionsFor(machineType).filter((o) => {
                // Список допустимых — ИЗ КАТАЛОГА, а не из пункта бандла: у работы, которой этот
                // бандл не знает, суженного списка в бандле нет вовсе, а вопрос всё равно задан.
                const allowed = work.machines.map(machineTokenToEnum);
                return allowed.includes(o.value) || o.value === machineType;
              })}
              fullWidth
            />
          )}
          {/* Оборудование ВТО спрашивается ВСЕГДА, а вид его лишь ПРЕДЗАПОЛНЯЕТ: «press flat»
              делают и утюгом, и прессом — это разные инструкции цеху, — а «steam» и «fuse»
              называют своё сами. Гасить контрол после предзаполнения нельзя: тогда подставленное
              значение стало бы неоспоримым, а оно всего лишь вероятное. */}
          {needsPress && (
            <Select
              name='assemblyPressEquipment'
              value={pressEquipment}
              onValueChange={setPressEquipment}
              items={pressEquipmentOptions}
              fullWidth
            />
          )}
          {/* ЧЕТВЁРТЫЙ УСЛОВНЫЙ СЕЛЕКТ — той же формы, что машинка и пресс, и по тому же доводу:
              без него шаг рождается заведомо несохраняемым. Плейсхолдер называет ПОЛЕ («— print
              method —»), как и соседи («— machine —», «— zone —»), а не задаёт вопрос: подписи над
              контролом здесь нет, и вопрос «— method —» повис бы без предмета. У глагола такой
              вопрос ровно один, поэтому лишний селект в диалоге всегда не больше одного. */}
          {stepDiscriminator && (
            <Select
              name='assemblyStepDiscriminator'
              value={discriminator}
              onValueChange={setDiscriminator}
              items={stepEnumOptions(
                stepDiscriminator.labels,
                `— ${discriminatorWord} —`,
                discriminator,
              )}
              fullWidth
            />
          )}
        </div>

        {/* Причина названа словом, а не задизейбленной кнопкой без объяснения: «создать» гаснет и
            тут же сообщает, чего именно не хватает. */}
        {problem && (
          <Text size='micro' variant='label'>
            {problem}
          </Text>
        )}
      </div>
    </ConfirmationModal>
  );
}
